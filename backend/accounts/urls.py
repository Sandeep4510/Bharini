from django.urls import path

from .views import (
    LoginAPIView,
    LogoutAPIView,
    MeAPIView,
    PasswordResetConfirmAPIView,
    PasswordResetRequestAPIView,
    RefreshTokenAPIView,
    RegisterAPIView,
    SessionListAPIView,
    SessionRevokeAPIView,
    SocialExchangeAPIView,
    VerifyEmailAPIView,
    social_complete,
    social_start,
)

urlpatterns = [
    path('register/', RegisterAPIView.as_view(), name='auth-register'),
    path('login/', LoginAPIView.as_view(), name='auth-login'),
    path('refresh/', RefreshTokenAPIView.as_view(), name='auth-refresh'),
    path('logout/', LogoutAPIView.as_view(), name='auth-logout'),
    path('verify-email/', VerifyEmailAPIView.as_view(), name='auth-verify-email'),
    path('verify/', VerifyEmailAPIView.as_view(), name='auth-verify'),
    path('password/reset/', PasswordResetRequestAPIView.as_view(), name='auth-password-reset-request'),
    path('password/reset/confirm/', PasswordResetConfirmAPIView.as_view(), name='auth-password-reset-confirm'),
    path('social/<str:provider>/start/', social_start, name='auth-social-start'),
    path('social/complete/', social_complete, name='auth-social-complete'),
    path('social/exchange/', SocialExchangeAPIView.as_view(), name='auth-social-exchange'),
    path('me/', MeAPIView.as_view(), name='auth-me'),
    path('sessions/', SessionListAPIView.as_view(), name='auth-sessions'),
    path('sessions/<uuid:session_id>/revoke/', SessionRevokeAPIView.as_view(), name='auth-session-revoke'),
]
