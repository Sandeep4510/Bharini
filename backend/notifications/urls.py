from django.urls import path

from .views import DevicesAPIView, SettingsAPIView

urlpatterns = [
    path('devices/', DevicesAPIView.as_view(), name='push-devices'),
    path('settings/', SettingsAPIView.as_view(), name='notification-settings'),
]
