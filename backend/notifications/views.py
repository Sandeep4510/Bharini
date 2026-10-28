from rest_framework import status
from rest_framework.views import APIView

from accounts.responses import error_response, ok_response

from .models import NotificationSettings, PushDevice


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
