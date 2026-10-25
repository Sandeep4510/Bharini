import re
import uuid
from pathlib import Path

from django.conf import settings
from django.db import models

HASHTAG_PATTERN = re.compile(r'#([^\s#.,!?;:]+)')


def casting_image_upload_to(instance, filename):
    return f'casting/{uuid.uuid4().hex}{Path(filename).suffix.lower()}'


class Post(models.Model):
    class Type(models.TextChoices):
        UPDATE = 'update', 'Update'
        CASTING_CALL = 'casting_call', 'Casting call'

    production = models.ForeignKey(
        'productions.ProductionProfile',
        on_delete=models.CASCADE,
        related_name='posts',
    )
    post_type = models.CharField(max_length=20, choices=Type.choices, default=Type.UPDATE)
    body = models.TextField(blank=True)
    image = models.ImageField(upload_to=casting_image_upload_to, blank=True)
    hashtags = models.JSONField(default=list, blank=True)
    share_count = models.PositiveIntegerField(default=0)
    created_at = models.DateTimeField(auto_now_add=True, db_index=True)

    class Meta:
        ordering = ['-created_at']

    def save(self, *args, **kwargs):
        self.hashtags = list(dict.fromkeys(tag.lower() for tag in HASHTAG_PATTERN.findall(self.body)))
        super().save(*args, **kwargs)


class CastingCall(models.Model):
    class Gender(models.TextChoices):
        ANY = 'any', 'Any'
        MALE = 'male', 'Male'
        FEMALE = 'female', 'Female'
        OTHER = 'other', 'Other'

    class Complexion(models.TextChoices):
        ANY = 'any', 'Any'
        FAIR = 'fair', 'Fair'
        WHEATISH = 'wheatish', 'Wheatish'
        MEDIUM = 'medium', 'Medium'
        DUSKY = 'dusky', 'Dusky'
        DARK = 'dark', 'Dark'

    post = models.OneToOneField(Post, on_delete=models.CASCADE, related_name='casting')
    age_min = models.PositiveSmallIntegerField()
    age_max = models.PositiveSmallIntegerField()
    gender = models.CharField(max_length=10, choices=Gender.choices, default=Gender.ANY)
    complexion = models.CharField(max_length=10, choices=Complexion.choices, default=Complexion.ANY)
    languages = models.CharField(max_length=200)
    location = models.CharField(max_length=200)
    approx_pay = models.CharField(max_length=200)


class PostLike(models.Model):
    post = models.ForeignKey(Post, on_delete=models.CASCADE, related_name='likes')
    user = models.ForeignKey(settings.AUTH_USER_MODEL, on_delete=models.CASCADE, related_name='production_post_likes')
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        constraints = [
            models.UniqueConstraint(fields=['post', 'user'], name='unique_production_post_like'),
        ]


class PostComment(models.Model):
    post = models.ForeignKey(Post, on_delete=models.CASCADE, related_name='comments')
    author = models.ForeignKey(settings.AUTH_USER_MODEL, on_delete=models.CASCADE, related_name='production_post_comments')
    body = models.CharField(max_length=500)
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        ordering = ['created_at']
