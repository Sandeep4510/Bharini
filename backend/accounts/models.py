import uuid

from django.contrib.auth.models import AbstractUser
from django.db import models
from django.utils import timezone

from .managers import UserManager


class User(AbstractUser):
    class Roles(models.TextChoices):
        ARTIST = 'artist', 'Artist'
        PRODUCTION_HOUSE = 'production_house', 'Production House'
        ADMIN = 'admin', 'Admin'

    username = None
    email = models.EmailField('email address', unique=True)
    role = models.CharField(
        max_length=20,
        choices=Roles.choices,
        default=Roles.ARTIST,
    )
    is_verified = models.BooleanField(default=False)
    email_verified_at = models.DateTimeField(null=True, blank=True)

    USERNAME_FIELD = 'email'
    REQUIRED_FIELDS = ['first_name', 'last_name']

    objects = UserManager()

    def __str__(self):
        return self.email


class RefreshSession(models.Model):
    public_id = models.UUIDField(default=uuid.uuid4, unique=True, editable=False)
    user = models.ForeignKey(User, on_delete=models.CASCADE, related_name='refresh_sessions')
    jti_hash = models.CharField(max_length=64, unique=True, db_index=True)
    family_id = models.UUIDField(default=uuid.uuid4, db_index=True)
    device_label = models.CharField(max_length=128, blank=True)
    user_agent = models.CharField(max_length=255, blank=True)
    ip_address = models.GenericIPAddressField(null=True, blank=True)
    created_at = models.DateTimeField(auto_now_add=True)
    last_used_at = models.DateTimeField(default=timezone.now)
    expires_at = models.DateTimeField()
    revoked_at = models.DateTimeField(null=True, blank=True)
    revoked_reason = models.CharField(max_length=64, blank=True)
    replaced_by = models.ForeignKey(
        'self',
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name='replaces',
    )

    class Meta:
        ordering = ['-last_used_at']
        indexes = [
            models.Index(fields=['user', 'revoked_at', 'expires_at']),
            models.Index(fields=['family_id', 'revoked_at']),
        ]

    @property
    def is_active(self):
        return self.revoked_at is None and self.expires_at > timezone.now()
