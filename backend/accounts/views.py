import hashlib
import secrets
from datetime import datetime, timezone as dt_timezone
from uuid import UUID

from allauth.socialaccount.providers import registry
from django.conf import settings
from django.contrib.auth import get_user_model, logout
from django.contrib.auth.tokens import default_token_generator
from django.core.cache import cache
from django.db import transaction
from django.shortcuts import redirect
from django.utils import timezone
from django.utils.encoding import force_bytes, force_str
from django.utils.http import urlsafe_base64_decode, urlsafe_base64_encode
from rest_framework import status
from rest_framework.permissions import AllowAny, IsAuthenticated
from rest_framework.throttling import ScopedRateThrottle
from rest_framework.views import APIView
from rest_framework_simplejwt.tokens import RefreshToken, TokenError, UntypedToken

from .mail import send_mail_in_background
from .models import RefreshSession
from .responses import error_response, ok_response
from .social import SIGNUP_ROLES, SOCIAL_ROLE_SESSION_KEY
from .serializers import (
    CookieTokenRefreshSerializer,
    LoginSerializer,
    PasswordResetConfirmSerializer,
    PasswordResetRequestSerializer,
    RefreshSessionSerializer,
    SocialExchangeSerializer,
    UserRegistrationSerializer,
    UserSerializer,
    VerifyEmailSerializer,
)

User = get_user_model()


def hash_jti(jti):
    return hashlib.sha256(jti.encode('utf-8')).hexdigest()


def refresh_expiry(refresh_token):
    return datetime.fromtimestamp(refresh_token['exp'], tz=dt_timezone.utc)


def get_request_ip(request):
    forwarded_for = request.META.get('HTTP_X_FORWARDED_FOR', '')
    if forwarded_for:
        return forwarded_for.split(',')[0].strip()
    return request.META.get('REMOTE_ADDR')


def set_refresh_cookie(response, refresh_token):
    max_age = int(settings.SIMPLE_JWT['REFRESH_TOKEN_LIFETIME'].total_seconds())
    response.set_cookie(
        key=settings.AUTH_REFRESH_COOKIE_NAME,
        value=refresh_token,
        httponly=True,
        secure=settings.AUTH_COOKIE_SECURE,
        samesite=settings.AUTH_COOKIE_SAMESITE,
        max_age=max_age,
        path=settings.AUTH_REFRESH_COOKIE_PATH,
    )
    return response


def clear_refresh_cookie(response):
    response.delete_cookie(
        settings.AUTH_REFRESH_COOKIE_NAME,
        path=settings.AUTH_REFRESH_COOKIE_PATH,
        samesite=settings.AUTH_COOKIE_SAMESITE,
    )


def create_refresh_session(user, refresh_token, request, family_id=None, replaced_session=None):
    session, _ = RefreshSession.objects.update_or_create(
        jti_hash=hash_jti(refresh_token['jti']),
        defaults={
            'user': user,
            'family_id': family_id or uuid_from_str(refresh_token['jti']),
            'device_label': request.headers.get('X-Device-Label', ''),
            'user_agent': request.META.get('HTTP_USER_AGENT', '')[:255],
            'ip_address': get_request_ip(request),
            'last_used_at': timezone.now(),
            'expires_at': refresh_expiry(refresh_token),
        },
    )
    if replaced_session:
        replaced_session.revoked_at = timezone.now()
        replaced_session.revoked_reason = 'rotated'
        replaced_session.replaced_by = session
        replaced_session.save(update_fields=['revoked_at', 'revoked_reason', 'replaced_by'])
    return session


def uuid_from_str(value):
    return UUID(hashlib.md5(value.encode('utf-8')).hexdigest())


def token_pair_for_user(user):
    refresh = RefreshToken.for_user(user)
    return refresh.access_token, refresh


class RegisterAPIView(APIView):
    permission_classes = [AllowAny]
    throttle_classes = [ScopedRateThrottle]
    throttle_scope = 'auth_register'

    def post(self, request, *args, **kwargs):
        serializer = UserRegistrationSerializer(data=request.data)
        if not serializer.is_valid():
            message = 'Please fix the highlighted fields.'
            email_errors = serializer.errors.get('email')
            if email_errors and any('already exists' in str(error).lower() for error in email_errors):
                message = 'This email is already registered. Please sign in.'
            return error_response(
                request,
                code='validation_error',
                message=message,
                status_code=status.HTTP_400_BAD_REQUEST,
                field_errors=serializer.errors,
            )

        with transaction.atomic():
            user = serializer.save()
            access_token, refresh_token = token_pair_for_user(user)
            create_refresh_session(user, refresh_token, request)

        uid = urlsafe_base64_encode(force_bytes(user.pk))
        token = default_token_generator.make_token(user)
        verification_link = f"{settings.FRONTEND_URL}/auth/verify-email?uid={uid}&token={token}"
        send_mail_in_background(
            subject='Verify your Bharini account',
            message=(
                f"Hi {user.first_name or user.email},\n\n"
                f"Please verify your email by visiting: {verification_link}\n\n"
                'If you did not create this account, you can ignore this email.'
            ),
            recipient=user.email,
        )

        response = ok_response(
            request,
            message='User registered successfully. Please verify your email.',
            data={
                'user': UserSerializer(user).data,
                'tokens': {'access': str(access_token), 'refresh': str(refresh_token)},
            },
            status_code=status.HTTP_201_CREATED,
        )
        return set_refresh_cookie(response, str(refresh_token))


class LoginAPIView(APIView):
    permission_classes = [AllowAny]
    throttle_classes = [ScopedRateThrottle]
    throttle_scope = 'auth_login'

    def post(self, request, *args, **kwargs):
        serializer = LoginSerializer(data=request.data, context={'request': request})
        if not serializer.is_valid():
            return error_response(
                request,
                code='invalid_credentials',
                message='Login failed.',
                status_code=status.HTTP_400_BAD_REQUEST,
                field_errors=serializer.errors,
            )

        return login_response(request, serializer.validated_data['user'])


def login_response(request, user):
    access_token, refresh_token = token_pair_for_user(user)
    create_refresh_session(user, refresh_token, request)

    response = ok_response(
        request,
        message='Login successful.',
        data={
            'user': UserSerializer(user).data,
            'tokens': {'access': str(access_token), 'refresh': str(refresh_token)},
        },
    )
    return set_refresh_cookie(response, str(refresh_token))


SOCIAL_PROVIDERS = ('google',)
SOCIAL_CODE_LIFETIME_SECONDS = 60


def social_code_key(code):
    return f'social-login:{code}'


def social_start(request, provider):
    """Remember the role picked on the register page, then hand over to allauth's provider login."""
    if provider not in SOCIAL_PROVIDERS:
        return redirect(f'{settings.FRONTEND_URL}/auth/login?social_error=unknown_provider')
    if not settings.SOCIALACCOUNT_PROVIDERS[provider]['APPS']:
        return redirect(f'{settings.FRONTEND_URL}/auth/login?social_error=not_configured')
    role = request.GET.get('role')
    if role in SIGNUP_ROLES:
        request.session[SOCIAL_ROLE_SESSION_KEY] = role
    return redirect(f'/accounts/{provider}/login/')


def social_complete(request):
    """allauth lands here (LOGIN_REDIRECT_URL) with a Django session; swap it for a one-time code."""
    if not request.user.is_authenticated:
        return redirect(f'{settings.FRONTEND_URL}/auth/login?social_error=unknown')
    code = secrets.token_urlsafe(32)
    # shortcut: default cache is per-process memory; use a shared cache (Redis) once Django runs multiple workers
    cache.set(social_code_key(code), request.user.pk, SOCIAL_CODE_LIFETIME_SECONDS)
    logout(request)  # the frontend uses JWTs, not this session
    return redirect(f'{settings.FRONTEND_URL}/auth/social?code={code}')


class SocialExchangeAPIView(APIView):
    permission_classes = [AllowAny]
    throttle_classes = [ScopedRateThrottle]
    throttle_scope = 'auth_login'

    def post(self, request, *args, **kwargs):
        serializer = SocialExchangeSerializer(data=request.data)
        user_id = cache.get(social_code_key(serializer.validated_data['code'])) if serializer.is_valid() else None
        if user_id is not None:
            cache.delete(social_code_key(serializer.validated_data['code']))
        user = User.objects.filter(pk=user_id, is_active=True).first() if user_id else None
        if not user:
            return error_response(
                request,
                code='invalid_social_code',
                message='Sign-in link expired. Please try again.',
                status_code=status.HTTP_400_BAD_REQUEST,
            )
        return login_response(request, user)


class RefreshTokenAPIView(APIView):
    permission_classes = [AllowAny]
    throttle_classes = [ScopedRateThrottle]
    throttle_scope = 'auth_refresh'

    def post(self, request, *args, **kwargs):
        refresh_from_request = request.data.get('refresh') or request.COOKIES.get(settings.AUTH_REFRESH_COOKIE_NAME)
        serializer = CookieTokenRefreshSerializer(data={'refresh': refresh_from_request}, context={'request': request})
        if not serializer.is_valid():
            return error_response(
                request,
                code='invalid_refresh_token',
                message='Refresh token is invalid.',
                status_code=status.HTTP_401_UNAUTHORIZED,
                field_errors=serializer.errors,
            )

        old_jti = UntypedToken(refresh_from_request)['jti']
        try:
            old_session = RefreshSession.objects.select_related('user').get(jti_hash=hash_jti(old_jti))
        except RefreshSession.DoesNotExist:
            return error_response(
                request,
                code='invalid_refresh_session',
                message='Refresh session not found.',
                status_code=status.HTTP_401_UNAUTHORIZED,
            )

        if old_session.revoked_at or old_session.expires_at <= timezone.now():
            return error_response(
                request,
                code='revoked_refresh_session',
                message='Refresh session has been revoked.',
                status_code=status.HTTP_401_UNAUTHORIZED,
            )

        access_token = serializer.validated_data['access']
        next_refresh = serializer.validated_data.get('refresh')
        payload = {'access': access_token}

        if next_refresh:
            new_refresh_token = RefreshToken(next_refresh)
            create_refresh_session(
                old_session.user,
                new_refresh_token,
                request,
                family_id=old_session.family_id,
                replaced_session=old_session,
            )
            payload['refresh'] = next_refresh
        else:
            old_session.last_used_at = timezone.now()
            old_session.save(update_fields=['last_used_at'])

        response = ok_response(request, message='Token refreshed successfully.', data=payload)
        if next_refresh:
            set_refresh_cookie(response, next_refresh)
        return response


class LogoutAPIView(APIView):
    permission_classes = [AllowAny]
    throttle_classes = [ScopedRateThrottle]
    throttle_scope = 'auth_logout'

    def post(self, request, *args, **kwargs):
        refresh_token = request.data.get('refresh') or request.COOKIES.get(settings.AUTH_REFRESH_COOKIE_NAME)
        if not refresh_token:
            return error_response(
                request,
                code='missing_refresh_token',
                message='Refresh token is required.',
                status_code=status.HTTP_400_BAD_REQUEST,
            )

        try:
            token = RefreshToken(refresh_token)
            session = RefreshSession.objects.filter(jti_hash=hash_jti(token['jti'])).first()
            if session and not session.revoked_at:
                session.revoked_at = timezone.now()
                session.revoked_reason = 'logout'
                session.save(update_fields=['revoked_at', 'revoked_reason'])
            token.blacklist()
        except TokenError:
            return error_response(
                request,
                code='invalid_refresh_token',
                message='Refresh token is invalid.',
                status_code=status.HTTP_401_UNAUTHORIZED,
            )

        response = ok_response(request, message='Logged out successfully.')
        clear_refresh_cookie(response)
        return response


class VerifyEmailAPIView(APIView):
    permission_classes = [AllowAny]
    throttle_classes = [ScopedRateThrottle]
    throttle_scope = 'auth_verify'

    def post(self, request, *args, **kwargs):
        serializer = VerifyEmailSerializer(data=request.data)
        if not serializer.is_valid():
            return error_response(
                request,
                code='invalid_verification_token',
                message='Verification failed.',
                status_code=status.HTTP_400_BAD_REQUEST,
                field_errors=serializer.errors,
            )

        user = serializer.validated_data['user']
        if user.is_verified:
            return ok_response(request, message='Email is already verified.')

        user.is_verified = True
        user.email_verified_at = timezone.now()
        user.save(update_fields=['is_verified', 'email_verified_at'])
        return ok_response(request, message='Email verified successfully.')


class PasswordResetRequestAPIView(APIView):
    permission_classes = [AllowAny]
    throttle_classes = [ScopedRateThrottle]
    throttle_scope = 'auth_password_reset'

    def post(self, request, *args, **kwargs):
        serializer = PasswordResetRequestSerializer(data=request.data)
        if not serializer.is_valid():
            return error_response(
                request,
                code='validation_error',
                message='Invalid password reset request.',
                status_code=status.HTTP_400_BAD_REQUEST,
                field_errors=serializer.errors,
            )

        email = serializer.validated_data['email']
        user = User.objects.filter(email__iexact=email).first()
        if not user:
            return error_response(
                request,
                code='account_not_found',
                message='No Bharini account uses this email. Check it, or create an account.',
                status_code=status.HTTP_404_NOT_FOUND,
                field_errors={'email': ['No account found with this email.']},
            )
        if not user.has_usable_password():
            # registry lookup, not account.get_provider(): that one needs the provider's app keys configured
            providers = sorted({registry.get_class(account.provider).name for account in user.socialaccount_set.all()})
            return error_response(
                request,
                code='social_account',
                message=f"This account signs in with {' / '.join(providers) or 'a social login'}. Use that button on the login page.",
                status_code=status.HTTP_400_BAD_REQUEST,
            )
        uid = urlsafe_base64_encode(force_bytes(user.pk))
        token = default_token_generator.make_token(user)
        reset_link = f"{settings.FRONTEND_URL}/auth/reset-password?uid={uid}&token={token}"
        send_mail_in_background(
            subject='Reset your Bharini password',
            message=(
                f"Hi {user.first_name or user.email},\n\n"
                f"Use the following link to reset your password: {reset_link}\n\n"
                'If you did not request this reset, ignore this message.'
            ),
            recipient=user.email,
        )

        return ok_response(request, message=f'Password reset link sent to {user.email}.')


class PasswordResetConfirmAPIView(APIView):
    permission_classes = [AllowAny]
    throttle_classes = [ScopedRateThrottle]
    throttle_scope = 'auth_password_reset'

    def post(self, request, *args, **kwargs):
        serializer = PasswordResetConfirmSerializer(data=request.data)
        if not serializer.is_valid():
            return error_response(
                request,
                code='validation_error',
                message='Invalid password reset payload.',
                status_code=status.HTTP_400_BAD_REQUEST,
                field_errors=serializer.errors,
            )

        try:
            user_id = force_str(urlsafe_base64_decode(serializer.validated_data['uid']))
            user = User.objects.get(pk=user_id)
        except (TypeError, ValueError, OverflowError, User.DoesNotExist):
            return error_response(
                request,
                code='invalid_reset_link',
                message='Invalid or expired reset link.',
                status_code=status.HTTP_400_BAD_REQUEST,
            )

        if not default_token_generator.check_token(user, serializer.validated_data['token']):
            return error_response(
                request,
                code='invalid_reset_link',
                message='Invalid or expired reset link.',
                status_code=status.HTTP_400_BAD_REQUEST,
            )

        user.set_password(serializer.validated_data['password'])
        user.save(update_fields=['password'])
        return ok_response(request, message='Password reset successful.')


class MeAPIView(APIView):
    permission_classes = [IsAuthenticated]

    def get(self, request, *args, **kwargs):
        return ok_response(request, message='Current user profile.', data=UserSerializer(request.user).data)


class SessionListAPIView(APIView):
    permission_classes = [IsAuthenticated]

    def get(self, request, *args, **kwargs):
        sessions = RefreshSession.objects.filter(user=request.user).order_by('-last_used_at')
        serializer = RefreshSessionSerializer(sessions, many=True)
        return ok_response(request, message='Sessions retrieved.', data={'sessions': serializer.data})


class SessionRevokeAPIView(APIView):
    permission_classes = [IsAuthenticated]

    def post(self, request, session_id, *args, **kwargs):
        session = RefreshSession.objects.filter(user=request.user, public_id=session_id).first()
        if not session:
            return error_response(
                request,
                code='session_not_found',
                message='Session not found.',
                status_code=status.HTTP_404_NOT_FOUND,
            )

        if not session.revoked_at:
            session.revoked_at = timezone.now()
            session.revoked_reason = 'user_revoked'
            session.save(update_fields=['revoked_at', 'revoked_reason'])

        return ok_response(request, message='Session revoked successfully.')
