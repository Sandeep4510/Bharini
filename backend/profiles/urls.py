from django.urls import path

from .views import (
    ArtistDirectoryAPIView,
    DocumentAPIView,
    DocumentsAPIView,
    LanguagesAPIView,
    MediaSlotAPIView,
    PhotoAPIView,
    ProfileAPIView,
    ProfileOptionsAPIView,
    SendAltEmailPinAPIView,
    UsernameCheckAPIView,
    VerifyAltEmailPinAPIView,
)

urlpatterns = [
    path('', ProfileAPIView.as_view(), name='profile'),
    path('directory/', ArtistDirectoryAPIView.as_view(), name='profile-directory'),
    path('options/', ProfileOptionsAPIView.as_view(), name='profile-options'),
    path('username-check/', UsernameCheckAPIView.as_view(), name='profile-username-check'),
    path('documents/', DocumentsAPIView.as_view(), name='profile-documents'),
    path('documents/<int:document_id>/', DocumentAPIView.as_view(), name='profile-document'),
    path('languages/', LanguagesAPIView.as_view(), name='profile-languages'),
    path('photos/<str:slot>/', PhotoAPIView.as_view(), name='profile-photo'),
    path('media/<str:discipline>/<str:slot_key>/', MediaSlotAPIView.as_view(), name='profile-media'),
    path('alt-email/send-pin/', SendAltEmailPinAPIView.as_view(), name='profile-alt-email-send-pin'),
    path('alt-email/verify/', VerifyAltEmailPinAPIView.as_view(), name='profile-alt-email-verify'),
]
