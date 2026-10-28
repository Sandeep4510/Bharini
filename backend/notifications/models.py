from django.conf import settings
from django.db import models


class PushDevice(models.Model):
    """A phone that receives push notifications, identified by its Expo push token."""

    class Platform(models.TextChoices):
        ANDROID = 'android', 'Android'
        IOS = 'ios', 'iOS'

    user = models.ForeignKey(settings.AUTH_USER_MODEL, on_delete=models.CASCADE, related_name='push_devices')
    # one row per phone; a phone that signs in to another account moves to that user
    token = models.CharField(max_length=255, unique=True)
    platform = models.CharField(max_length=10, choices=Platform.choices)
    created_at = models.DateTimeField(auto_now_add=True)
    last_seen_at = models.DateTimeField(auto_now=True)

    def __str__(self):
        return f'{self.platform} device of {self.user}'


class NotificationSettings(models.Model):
    """Which kinds of push a user wants. A missing row means everything is on."""

    KINDS = ('messages', 'connections', 'follows', 'casting')

    user = models.OneToOneField(settings.AUTH_USER_MODEL, on_delete=models.CASCADE, related_name='notification_settings')
    messages = models.BooleanField(default=True)
    connections = models.BooleanField(default=True)
    follows = models.BooleanField(default=True)
    casting = models.BooleanField(default=True)
