"""Account deletion: a 90-day grace period, restore by email link, then a permanent purge."""
from datetime import timedelta

from django.conf import settings
from django.contrib.auth.tokens import PasswordResetTokenGenerator
from django.db import transaction
from django.db.models import FileField
from django.db.models.deletion import Collector
from django.utils import timezone
from django.utils.encoding import force_bytes
from django.utils.http import urlsafe_base64_encode

from .mail import send_mail_in_background
from .models import RefreshSession, User

DELETION_GRACE = timedelta(days=90)


class RestoreTokenGenerator(PasswordResetTokenGenerator):
    # own salt so a restore link can't be used as a password-reset link, and the request time so it dies once restored
    key_salt = 'accounts.deletion.RestoreTokenGenerator'

    def _make_hash_value(self, user, timestamp):
        return f'{super()._make_hash_value(user, timestamp)}{user.deletion_requested_at}'


restore_token_generator = RestoreTokenGenerator()


def restorable(users):
    """Accounts deleted less than DELETION_GRACE ago."""
    return users.filter(is_active=False, deletion_requested_at__gt=timezone.now() - DELETION_GRACE)


def request_deletion(user):
    """Hide the account now (is_active=False hides it everywhere) and sign out every device."""
    now = timezone.now()
    user.is_active = False
    user.deletion_requested_at = now
    user.save(update_fields=['is_active', 'deletion_requested_at'])
    RefreshSession.objects.filter(user=user, revoked_at__isnull=True).update(revoked_at=now, revoked_reason='account_deleted')


def send_restore_link(user):
    uid = urlsafe_base64_encode(force_bytes(user.pk))
    token = restore_token_generator.make_token(user)
    link = f'{settings.FRONTEND_URL}/auth/restore-account?uid={uid}&token={token}'
    purge_on = (user.deletion_requested_at + DELETION_GRACE).date()
    send_mail_in_background(
        subject='Restore your Bharini account',
        message=(
            f'Hi {user.first_name or user.email},\n\n'
            f'Your Bharini account is scheduled for permanent deletion on {purge_on:%d %B %Y}.\n'
            f'To keep it, confirm here: {link}\n\n'
            'If you did not try to sign in, ignore this email and the account will be deleted on that date.'
        ),
        recipient=user.email,
    )


def restore(user):
    user.is_active = True
    user.deletion_requested_at = None
    user.save(update_fields=['is_active', 'deletion_requested_at'])


def purge(user):
    """Delete the user, every row that cascades from them, and the uploaded files those rows point to."""
    collector = Collector(using='default')
    collector.collect([user])
    # rows Django can delete without loading sit in fast_deletes as querysets, not in data
    groups = [*collector.data.items(), *((queryset.model, queryset) for queryset in collector.fast_deletes)]
    files = [
        getattr(obj, field.name)
        for model, objects in groups
        for field in model._meta.concrete_fields if isinstance(field, FileField)
        for obj in objects
    ]
    with transaction.atomic():
        user.delete()
    for file in files:
        if file:
            file.storage.delete(file.name)


def purge_expired():
    expired = User.objects.filter(is_active=False, deletion_requested_at__lte=timezone.now() - DELETION_GRACE)
    count = 0
    for user in expired.iterator():
        purge(user)
        count += 1
    return count
