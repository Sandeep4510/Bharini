from django.conf import settings
from django.contrib.auth import get_user_model, password_validation
from django.contrib.auth.tokens import default_token_generator
from django.core.mail import send_mail
from django.utils.encoding import force_bytes, force_str
from django.utils.http import urlsafe_base64_decode, urlsafe_base64_encode
from rest_framework import status
from rest_framework.permissions import AllowAny, IsAuthenticated
from rest_framework.response import Response
from rest_framework.views import APIView
from rest_framework_simplejwt.tokens import RefreshToken, TokenError

from .serializers import (
    CookieTokenRefreshSerializer,
    LoginSerializer,
    PasswordResetConfirmSerializer,
    PasswordResetRequestSerializer,
    UserRegistrationSerializer,
    UserSerializer,
    VerifyEmailSerializer,
)

User = get_user_model()


def build_token_pair(user):
    refresh = RefreshToken.for_user(user)
    return str(refresh.access_token), str(refresh)


def set_refresh_cookie(response, refresh_token):
    max_age = settings.SIMPLE_JWT['REFRESH_TOKEN_LIFETIME'].total_seconds()
    response.set_cookie(
        key='refresh_token',
        value=refresh_token,
        httponly=True,
        secure=not settings.DEBUG,
        samesite='Lax',
        max_age=int(max_age),
    )
    return response


class RegisterAPIView(APIView):
    permission_classes = [AllowAny]

    def post(self, request, *args, **kwargs):
        serializer = UserRegistrationSerializer(data=request.data)
        if not serializer.is_valid():
            return Response(serializer.errors, status=status.HTTP_400_BAD_REQUEST)

        user = serializer.save()
        access_token, refresh_token = build_token_pair(user)

        uid = urlsafe_base64_encode(force_bytes(user.pk))
        token = default_token_generator.make_token(user)
        verification_link = f"{getattr(settings, 'FRONTEND_URL', 'http://localhost:3000')}/verify-email?uid={uid}&token={token}"
        send_mail(
            subject='Verify your Bharini account',
            message=(
                f"Hi {user.first_name or user.email},\n\n"
                f"Please verify your email by visiting: {verification_link}\n\n"
                'If you did not create this account, you can ignore this email.'
            ),
            from_email=getattr(settings, 'DEFAULT_FROM_EMAIL', 'noreply@bharini.local'),
            recipient_list=[user.email],
            fail_silently=False,
        )

        response = Response(
            {
                'message': 'User registered successfully. Please verify your email to complete onboarding.',
                'user': UserSerializer(user).data,
                'tokens': {'access': access_token, 'refresh': refresh_token},
            },
            status=status.HTTP_201_CREATED,
        )
        return set_refresh_cookie(response, refresh_token)


class LoginAPIView(APIView):
    permission_classes = [AllowAny]

    def post(self, request, *args, **kwargs):
        serializer = LoginSerializer(data=request.data, context={'request': request})
        if not serializer.is_valid():
            return Response(serializer.errors, status=status.HTTP_400_BAD_REQUEST)

        user = serializer.validated_data['user']
        access_token, refresh_token = build_token_pair(user)
        response = Response(
            {
                'message': 'Login successful.',
                'user': UserSerializer(user).data,
                'tokens': {'access': access_token, 'refresh': refresh_token},
            },
            status=status.HTTP_200_OK,
        )
        return set_refresh_cookie(response, refresh_token)


class RefreshTokenAPIView(APIView):
    permission_classes = [AllowAny]

    def post(self, request, *args, **kwargs):
        refresh_token = request.data.get('refresh') or request.COOKIES.get('refresh_token')
        serializer = CookieTokenRefreshSerializer(data={'refresh': refresh_token}, context={'request': request})
        if not serializer.is_valid():
            return Response(serializer.errors, status=status.HTTP_400_BAD_REQUEST)

        data = serializer.validated_data
        response = Response({'access': data['access'], 'refresh': data.get('refresh')}, status=status.HTTP_200_OK)
        if data.get('refresh'):
            return set_refresh_cookie(response, data['refresh'])
        return response


class LogoutAPIView(APIView):
    permission_classes = [AllowAny]

    def post(self, request, *args, **kwargs):
        refresh_token = request.data.get('refresh') or request.COOKIES.get('refresh_token')
        if not refresh_token:
            return Response({'detail': 'Refresh token is required.'}, status=status.HTTP_400_BAD_REQUEST)

        try:
            token = RefreshToken(refresh_token)
            token.blacklist()
        except TokenError:
            pass

        response = Response({'message': 'Logged out successfully.'}, status=status.HTTP_200_OK)
        response.delete_cookie('refresh_token')
        return response


class VerifyEmailAPIView(APIView):
    permission_classes = [AllowAny]

    def post(self, request, *args, **kwargs):
        serializer = VerifyEmailSerializer(data=request.data)
        if not serializer.is_valid():
            return Response(serializer.errors, status=status.HTTP_400_BAD_REQUEST)

        user = serializer.validated_data['user']
        if user.is_verified:
            return Response({'message': 'This email is already verified.'}, status=status.HTTP_200_OK)

        user.is_verified = True
        user.save(update_fields=['is_verified'])
        return Response({'message': 'Email verified successfully.'}, status=status.HTTP_200_OK)


class PasswordResetRequestAPIView(APIView):
    permission_classes = [AllowAny]

    def post(self, request, *args, **kwargs):
        serializer = PasswordResetRequestSerializer(data=request.data)
        if not serializer.is_valid():
            return Response(serializer.errors, status=status.HTTP_400_BAD_REQUEST)

        email = serializer.validated_data['email']
        user = User.objects.filter(email=email).first()
        if user:
            uid = urlsafe_base64_encode(force_bytes(user.pk))
            token = default_token_generator.make_token(user)
            reset_link = f"{getattr(settings, 'FRONTEND_URL', 'http://localhost:3000')}/reset-password?uid={uid}&token={token}"
            send_mail(
                subject='Reset your Bharini password',
                message=(
                    f"Hi {user.first_name or user.email},\n\n"
                    f"Use the following link to reset your password: {reset_link}\n\n"
                    'If you did not request this reset, ignore this message.'
                ),
                from_email=getattr(settings, 'DEFAULT_FROM_EMAIL', 'noreply@bharini.local'),
                recipient_list=[user.email],
                fail_silently=False,
            )

        return Response(
            {'message': 'If the account exists, a password reset link has been sent.'},
            status=status.HTTP_200_OK,
        )


class PasswordResetConfirmAPIView(APIView):
    permission_classes = [AllowAny]

    def post(self, request, *args, **kwargs):
        serializer = PasswordResetConfirmSerializer(data=request.data)
        if not serializer.is_valid():
            return Response(serializer.errors, status=status.HTTP_400_BAD_REQUEST)

        try:
            user_id = force_str(urlsafe_base64_decode(serializer.validated_data['uid']))
            user = User.objects.get(pk=user_id)
        except (TypeError, ValueError, OverflowError, User.DoesNotExist):
            return Response({'detail': 'Invalid or expired reset link.'}, status=status.HTTP_400_BAD_REQUEST)

        if not default_token_generator.check_token(user, serializer.validated_data['token']):
            return Response({'detail': 'Invalid or expired reset link.'}, status=status.HTTP_400_BAD_REQUEST)

        user.set_password(serializer.validated_data['password'])
        user.save(update_fields=['password'])
        return Response({'message': 'Password reset successful.'}, status=status.HTTP_200_OK)


class MeAPIView(APIView):
    permission_classes = [IsAuthenticated]

    def get(self, request, *args, **kwargs):
        return Response(UserSerializer(request.user).data, status=status.HTTP_200_OK)
