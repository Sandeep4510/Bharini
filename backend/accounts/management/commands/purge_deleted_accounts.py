from django.core.management.base import BaseCommand

from accounts.deletion import purge_expired


class Command(BaseCommand):
    help = 'Permanently delete accounts whose 90-day deletion grace period has ended. Run daily.'

    def handle(self, *args, **options):
        self.stdout.write(f'Purged {purge_expired()} account(s).')
