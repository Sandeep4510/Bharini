from django.utils import timezone
from rest_framework import status
from rest_framework.views import APIView

from accounts.responses import error_response, ok_response
from artist_posts.serializers import user_summary
from connections.models import blocked_ids

from .models import Notification, NotificationSettings, PushDevice

LIST_SIZE = 50


def settings_data(user):
    row = NotificationSettings.objects.filter(user=user).first()
    return {kind: getattr(row, kind) if row else True for kind in NotificationSettings.KINDS}


class DevicesAPIView(APIView):
    """POST registers this phone's Expo push token for the signed-in user; DELETE (on logout) removes it."""

    def post(self, request, *args, **kwargs):
        token = str(request.data.get('token', '')).strip()
        platform = request.data.get('platform')
        if not token.startswith('ExponentPushToken[') or platform not in PushDevice.Platform.values:
            return error_response(request, 'validation_error', 'Send an Expo push token and platform.', status.HTTP_400_BAD_REQUEST)
        PushDevice.objects.update_or_create(token=token, defaults={'user': request.user, 'platform': platform})
        return ok_response(request, message='Device registered.')

    def delete(self, request, *args, **kwargs):
        token = str(request.data.get('token', '')).strip()
        PushDevice.objects.filter(token=token, user=request.user).delete()
        return ok_response(request, message='Device removed.')


class SettingsAPIView(APIView):
    def get(self, request, *args, **kwargs):
        return ok_response(request, message='Notification settings.', data=settings_data(request.user))

    def patch(self, request, *args, **kwargs):
        changes = {kind: request.data[kind] for kind in NotificationSettings.KINDS if kind in request.data}
        if any(not isinstance(value, bool) for value in changes.values()):
            return error_response(request, 'validation_error', 'Settings must be true or false.', status.HTTP_400_BAD_REQUEST)
        NotificationSettings.objects.update_or_create(user=request.user, defaults=changes)
        return ok_response(request, message='Notification settings saved.', data=settings_data(request.user))


def visible(request):
    # blocked accounts stay hidden in both directions
    return Notification.objects.filter(recipient=request.user).exclude(actor__in=blocked_ids(request.user))


class NotificationListAPIView(APIView):
    def get(self, request, *args, **kwargs):
        # shortcut: newest LIST_SIZE only; page them if people need older ones
        items = visible(request).select_related('actor__artist_profile', 'actor__production_profile')[:LIST_SIZE]
        data = [
            {
                'id': item.id,
                'kind': item.kind,
                'title': item.title,
                'body': item.body,
                'data': item.data,
                'actor': user_summary(request, item.actor) if item.actor else None,
                'read': item.read_at is not None,
                'created_at': item.created_at,
            }
            for item in items
        ]
        return ok_response(request, message='Notifications.', data={'notifications': data})


class UnreadNotificationCountAPIView(APIView):
    def get(self, request, *args, **kwargs):
        return ok_response(request, message='Unread notifications.', data={'unread': visible(request).filter(read_at__isnull=True).count()})


class MarkNotificationsReadAPIView(APIView):
    def post(self, request, *args, **kwargs):
        Notification.objects.filter(recipient=request.user, read_at__isnull=True).update(read_at=timezone.now())
        return ok_response(request, message='Marked read.')
