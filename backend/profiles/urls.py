from django.urls import path

from .views import (
    LanguagesAPIView,
    MediaSlotAPIView,
    PhotoAPIView,
    ProfileAPIView,
    ProfileOptionsAPIView,
    SendAltEmailPinAPIView,
    VerifyAltEmailPinAPIView,
)

urlpatterns = [
    path('', ProfileAPIView.as_view(), name='profile'),
    path('options/', ProfileOptionsAPIView.as_view(), name='profile-options'),
    path('languages/', LanguagesAPIView.as_view(), name='profile-languages'),
    path('photos/<str:slot>/', PhotoAPIView.as_view(), name='profile-photo'),
    path('media/<str:discipline>/<str:slot_key>/', MediaSlotAPIView.as_view(), name='profile-media'),
    path('alt-email/send-pin/', SendAltEmailPinAPIView.as_view(), name='profile-alt-email-send-pin'),
    path('alt-email/verify/', VerifyAltEmailPinAPIView.as_view(), name='profile-alt-email-verify'),
]
