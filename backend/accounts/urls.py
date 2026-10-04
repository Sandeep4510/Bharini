from django.urls import path

from .views import (
    LoginAPIView,
    LogoutAPIView,
    MeAPIView,
    PasswordResetConfirmAPIView,
    PasswordResetRequestAPIView,
    RefreshTokenAPIView,
    RegisterAPIView,
    VerifyEmailAPIView,
)

urlpatterns = [
    path('register/', RegisterAPIView.as_view(), name='auth-register'),
    path('login/', LoginAPIView.as_view(), name='auth-login'),
    path('refresh/', RefreshTokenAPIView.as_view(), name='auth-refresh'),
    path('logout/', LogoutAPIView.as_view(), name='auth-logout'),
    path('verify-email/', VerifyEmailAPIView.as_view(), name='auth-verify-email'),
    path('password/reset/', PasswordResetRequestAPIView.as_view(), name='auth-password-reset-request'),
    path('password/reset/confirm/', PasswordResetConfirmAPIView.as_view(), name='auth-password-reset-confirm'),
    path('me/', MeAPIView.as_view(), name='auth-me'),
]
