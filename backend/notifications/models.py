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

    KINDS = ('messages', 'connections', 'follows', 'casting', 'likes', 'comments')

    user = models.OneToOneField(settings.AUTH_USER_MODEL, on_delete=models.CASCADE, related_name='notification_settings')
    messages = models.BooleanField(default=True)
    connections = models.BooleanField(default=True)
    follows = models.BooleanField(default=True)
    casting = models.BooleanField(default=True)
    likes = models.BooleanField(default=True)
    comments = models.BooleanField(default=True)


class Notification(models.Model):
    """One entry in a user's in-app notification list. Messages are not listed: chats have their own unread badge."""

    recipient = models.ForeignKey(settings.AUTH_USER_MODEL, on_delete=models.CASCADE, related_name='notifications')
    # who did it; empty for system events like a casting call near you
    actor = models.ForeignKey(settings.AUTH_USER_MODEL, on_delete=models.CASCADE, null=True, blank=True, related_name='+')
    kind = models.CharField(max_length=20)
    title = models.CharField(max_length=200)
    body = models.CharField(max_length=200, blank=True)
    data = models.JSONField(default=dict)  # same routing data as the push, e.g. post_id or user_id
    read_at = models.DateTimeField(null=True, blank=True)
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        indexes = [models.Index(fields=['recipient', '-created_at'])]
        ordering = ['-created_at']

    def __str__(self):
        return f'{self.kind} for {self.recipient}'
