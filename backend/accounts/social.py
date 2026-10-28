"""Glue between django-allauth's Google login and our JWT auth."""
from django.conf import settings
from django.shortcuts import redirect
from django.utils import timezone

from allauth.core.exceptions import ImmediateHttpResponse
from allauth.socialaccount.adapter import DefaultSocialAccountAdapter

from .deletion import restorable, send_restore_link
from .models import User

SOCIAL_ROLE_SESSION_KEY = 'social_signup_role'
SIGNUP_ROLES = (User.Roles.ARTIST, User.Roles.PRODUCTION_HOUSE)


def mark_verified(user):
    if not user.is_verified:
        user.is_verified = True
        user.email_verified_at = timezone.now()


class SocialAccountAdapter(DefaultSocialAccountAdapter):
    def pre_social_login(self, request, sociallogin):
        deleted = restorable(User.objects.filter(pk=sociallogin.user.pk)).first() if sociallogin.user.pk else None
        if deleted:
            send_restore_link(deleted)
            raise ImmediateHttpResponse(redirect(f'{settings.FRONTEND_URL}/auth/login?social_error=pending_deletion'))
        # allauth only links an existing account by email when the provider verified that email
        if sociallogin.user.pk and not sociallogin.user.is_verified:
            mark_verified(sociallogin.user)
            sociallogin.user.save(update_fields=['is_verified', 'email_verified_at'])

    def populate_user(self, request, sociallogin, data):
        user = super().populate_user(request, sociallogin, data)
        role = request.session.get(SOCIAL_ROLE_SESSION_KEY)
        user.role = role if role in SIGNUP_ROLES else User.Roles.ARTIST
        user.role_confirmed = role in SIGNUP_ROLES
        user.terms_accepted_at = timezone.now()  # the Google button sits under "By continuing, you agree to the Terms"
        mark_verified(user)
        return user

    def on_authentication_error(self, request, provider, error=None, exception=None, extra_context=None):
        raise ImmediateHttpResponse(redirect(f'{settings.FRONTEND_URL}/auth/login?social_error={error or "unknown"}'))
