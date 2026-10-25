from django.conf import settings
from django.db import models


class Conversation(models.Model):
    """A 1:1 chat. The pair is stored lowest user id first, so each pair has exactly one row."""

    user_a = models.ForeignKey(settings.AUTH_USER_MODEL, on_delete=models.CASCADE, related_name='+')
    user_b = models.ForeignKey(settings.AUTH_USER_MODEL, on_delete=models.CASCADE, related_name='+')
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True, db_index=True)

    class Meta:
        constraints = [
            models.UniqueConstraint(fields=['user_a', 'user_b'], name='unique_conversation_pair'),
            models.CheckConstraint(condition=models.Q(user_a__lt=models.F('user_b')), name='conversation_pair_ordered'),
        ]

    @classmethod
    def between(cls, first, second):
        low, high = sorted((first, second), key=lambda user: user.id)
        return cls.objects.get_or_create(user_a=low, user_b=high)

    def other(self, user):
        return self.user_b if self.user_a_id == user.id else self.user_a


class Message(models.Model):
    conversation = models.ForeignKey(Conversation, on_delete=models.CASCADE, related_name='messages')
    sender = models.ForeignKey(settings.AUTH_USER_MODEL, on_delete=models.CASCADE, related_name='sent_messages')
    body = models.TextField(max_length=2000, blank=True)
    # deleting a shared post keeps the message and only drops its preview card
    shared_artist_post = models.ForeignKey('artist_posts.Post', null=True, blank=True, on_delete=models.SET_NULL, related_name='+')
    shared_production_post = models.ForeignKey('production_posts.Post', null=True, blank=True, on_delete=models.SET_NULL, related_name='+')
    created_at = models.DateTimeField(auto_now_add=True)
    read_at = models.DateTimeField(null=True, blank=True)

    class Meta:
        ordering = ['created_at', 'id']
        indexes = [models.Index(fields=['conversation', 'created_at'])]
