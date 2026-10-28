from django.contrib.auth import authenticate, get_user_model
from django.contrib.auth.password_validation import validate_password
from django.contrib.auth.tokens import default_token_generator
from django.core.exceptions import ValidationError as DjangoValidationError
from django.utils.encoding import force_str
from django.utils.http import urlsafe_base64_decode
from rest_framework import serializers
from rest_framework_simplejwt.serializers import TokenRefreshSerializer
from rest_framework_simplejwt.tokens import TokenError

from .models import RefreshSession
from .social import SIGNUP_ROLES

User = get_user_model()


class UserRegistrationSerializer(serializers.ModelSerializer):
    password = serializers.CharField(write_only=True, min_length=8)
    password_confirm = serializers.CharField(write_only=True, min_length=8)

    class Meta:
        model = User
        fields = ('email', 'first_name', 'last_name', 'role', 'password', 'password_confirm')
        extra_kwargs = {
            'email': {'required': True},
            'first_name': {'required': True},
            'last_name': {'required': True},
            'role': {'required': False},
        }

    def validate_email(self, value):
        if User.objects.filter(email__iexact=value).exists():
            raise serializers.ValidationError('An account with this email already exists. Please sign in.')
        return value

    def validate_role(self, value):
        if value not in SIGNUP_ROLES:
            raise serializers.ValidationError('Choose Artist or Production House.')
        return value

    def validate(self, attrs):
        if attrs.get('password') != attrs.get('password_confirm'):
            raise serializers.ValidationError({'password_confirm': 'Passwords do not match.'})
        try:
            validate_password(attrs['password'])
        except DjangoValidationError as exc:
            raise serializers.ValidationError({'password': list(exc.messages)}) from exc
        return attrs

    def create(self, validated_data):
        validated_data.pop('password_confirm', None)
        password = validated_data.pop('password')
        return User.objects.create_user(password=password, **validated_data)


class UserSerializer(serializers.ModelSerializer):
    onboarding_complete = serializers.SerializerMethodField()
    completion_percent = serializers.SerializerMethodField()
    username = serializers.SerializerMethodField()

    class Meta:
        model = User
        fields = (
            'id',
            'email',
            'username',
            'first_name',
            'last_name',
            'role',
            'is_verified',
            'email_verified_at',
            'date_joined',
            'onboarding_complete',
            'completion_percent',
            'role_confirmed',
        )
        read_only_fields = fields

    def get_onboarding_complete(self, obj):
        if obj.role != User.Roles.ARTIST:
            return True
        profile = getattr(obj, 'artist_profile', None)
        return bool(profile and profile.onboarding_complete)

    def get_username(self, obj):
        profile = getattr(obj, 'artist_profile', None) or getattr(obj, 'production_profile', None)
        return profile.username if profile else None

    def get_completion_percent(self, obj):
        profile = getattr(obj, 'artist_profile', None)
        return profile.completion_percent if profile else None


class LoginSerializer(serializers.Serializer):
    email = serializers.EmailField()
    password = serializers.CharField(write_only=True)

    def validate(self, attrs):
        email = attrs.get('email')
        password = attrs.get('password')
        user = authenticate(request=self.context.get('request'), username=email, password=password)

        if not user:
            raise serializers.ValidationError({'detail': 'Invalid email or password.'})
        if not user.is_active:
            raise serializers.ValidationError({'detail': 'This account is disabled.'})
        if not user.is_verified:
            raise serializers.ValidationError({'detail': 'Please verify your email before logging in.'})

        attrs['user'] = user
        return attrs


class VerifyEmailSerializer(serializers.Serializer):
    uid = serializers.CharField()
    token = serializers.CharField()

    def validate(self, attrs):
        try:
            user_id = force_str(urlsafe_base64_decode(attrs['uid']))
            user = User.objects.get(pk=user_id)
        except (TypeError, ValueError, OverflowError, User.DoesNotExist) as exc:
            raise serializers.ValidationError({'detail': 'Invalid verification link.'}) from exc

        if not default_token_generator.check_token(user, attrs['token']):
            raise serializers.ValidationError({'detail': 'Invalid or expired verification token.'})

        attrs['user'] = user
        return attrs


class PasswordResetRequestSerializer(serializers.Serializer):
    email = serializers.EmailField()


class SocialExchangeSerializer(serializers.Serializer):
    code = serializers.CharField(max_length=64)


class PasswordResetConfirmSerializer(serializers.Serializer):
    uid = serializers.CharField()
    token = serializers.CharField()
    password = serializers.CharField(write_only=True, min_length=8)
    password_confirm = serializers.CharField(write_only=True, min_length=8)

    def validate(self, attrs):
        if attrs.get('password') != attrs.get('password_confirm'):
            raise serializers.ValidationError({'password_confirm': 'Passwords do not match.'})
        try:
            validate_password(attrs['password'])
        except DjangoValidationError as exc:
            raise serializers.ValidationError({'password': list(exc.messages)}) from exc
        return attrs


class CookieTokenRefreshSerializer(TokenRefreshSerializer):
    def validate(self, attrs):
        refresh = attrs.get('refresh') or self.context.get('request').COOKIES.get('refresh_token')
        if not refresh:
            raise serializers.ValidationError({'refresh': 'This field is required.'})
        attrs['refresh'] = refresh
        try:
            return super().validate(attrs)
        except TokenError as exc:
            raise serializers.ValidationError({'refresh': str(exc)}) from exc


class RefreshSessionSerializer(serializers.ModelSerializer):
    id = serializers.UUIDField(source='public_id', read_only=True)
    is_active = serializers.BooleanField(read_only=True)

    class Meta:
        model = RefreshSession
        fields = (
            'id',
            'device_label',
            'user_agent',
            'ip_address',
            'created_at',
            'last_used_at',
            'expires_at',
            'revoked_at',
            'is_active',
        )
        read_only_fields = fields
