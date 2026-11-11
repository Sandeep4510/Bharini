from django.urls import path

from .views import DevicesAPIView, MarkNotificationsReadAPIView, NotificationListAPIView, SettingsAPIView, UnreadNotificationCountAPIView

urlpatterns = [
    path('devices/', DevicesAPIView.as_view(), name='push-devices'),
    path('settings/', SettingsAPIView.as_view(), name='notification-settings'),
    path('list/', NotificationListAPIView.as_view(), name='notification-list'),
    path('unread-count/', UnreadNotificationCountAPIView.as_view(), name='notification-unread-count'),
    path('read/', MarkNotificationsReadAPIView.as_view(), name='notification-read'),
]
