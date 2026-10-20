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

    User = get_user_model()
    deleted_count, _ = User.objects.filter(email__iexact=email).delete()

    if deleted_count:
        print(f'Deleted {deleted_count} user(s) with email: {email}')
    else:
        print(f'No user found with email: {email}')

    return 0


if __name__ == '__main__':
    raise SystemExit(main())
