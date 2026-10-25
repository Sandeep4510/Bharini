#!/usr/bin/env python

import os
import sys

import django


def main() -> int:
    if len(sys.argv) != 2:
        print('Usage: python delete_user_by_email.py "sandeepmoji1@gmail.com"')
        return 1

    email = sys.argv[1].strip()
    if not email:
        print('Email cannot be empty.')
        return 1

    os.environ.setdefault('DJANGO_SETTINGS_MODULE', 'bharini.settings')
    django.setup()

    from django.contrib.auth import get_user_model
    from django.apps import apps

    User = get_user_model()
    user = User.objects.filter(email__iexact=email).first()
    if not user:
        print(f'No user found with email: {email}')
        return 0

    # Clean up direct child records first so FK constraints do not block the delete.
    app_models = apps.app_configs

    try:
        from accounts.models import RefreshSession
        RefreshSession.objects.filter(user=user).delete()
    except Exception:
        pass

    try:
        from token_blacklist.models import OutstandingToken
        OutstandingToken.objects.filter(user=user).delete()
    except Exception:
        pass

    try:
        from allauth.account.models import EmailAddress
        EmailAddress.objects.filter(user=user).delete()
    except Exception:
        pass

    try:
        from allauth.socialaccount.models import SocialAccount
        SocialAccount.objects.filter(user=user).delete()
    except Exception:
        pass

    try:
        from django.contrib.admin.models import LogEntry
        LogEntry.objects.filter(user=user).delete()
    except Exception:
        pass

    try:
        from profiles.models import ArtistProfile, ProfileLanguage, PortfolioMedia, ProfileDocument
        ArtistProfile.objects.filter(user=user).delete()
    except Exception:
        pass

    try:
        from productions.models import ProductionProfile
        ProductionProfile.objects.filter(owner=user).delete()
    except Exception:
        pass

    try:
        from artist_posts.models import Post
        Post.objects.filter(author=user).delete()
    except Exception:
        pass

    try:
        from production_posts.models import PostComment, PostLike
        PostComment.objects.filter(author=user).delete()
        PostLike.objects.filter(user=user).delete()
    except Exception:
        pass

    deleted_count, _ = User.objects.filter(pk=user.pk).delete()
    if deleted_count:
        print(f'Deleted user with email: {email}')
    else:
        print(f'Failed to delete user with email: {email}')
    return 0


if __name__ == '__main__':
    raise SystemExit(main())
