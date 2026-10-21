import uuid
from pathlib import Path

from django.conf import settings
from django.db import models


def post_media_upload_to(instance, filename):
    return f'posts/{instance.author_id}/{uuid.uuid4().hex}{Path(filename).suffix.lower()}'


class Post(models.Model):
    class MediaKind(models.TextChoices):
        IMAGE = 'image', 'Image'
        VIDEO = 'video', 'Video'

    author = models.ForeignKey(settings.AUTH_USER_MODEL, on_delete=models.CASCADE, related_name='posts')
    body = models.TextField(max_length=5000)
    media = models.FileField(upload_to=post_media_upload_to, blank=True)
    media_kind = models.CharField(max_length=10, choices=MediaKind.choices, blank=True)
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        ordering = ['-created_at']

    def __str__(self):
        return f'Post by {self.author} at {self.created_at:%Y-%m-%d %H:%M}'
