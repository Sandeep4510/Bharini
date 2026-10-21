import logging
import threading

from django.conf import settings
from django.core.mail import send_mail

logger = logging.getLogger(__name__)


def _send(subject, message, recipient):
    try:
        send_mail(subject, message, settings.DEFAULT_FROM_EMAIL, [recipient], fail_silently=False)
    except Exception:
        logger.exception('Sending "%s" to %s failed', subject, recipient)


def send_mail_in_background(subject, message, recipient):
    """SMTP login takes ~10 s, so never make the request wait for it.

    shortcut: a failed send is only logged and the thread dies with the process; move to Cloud Tasks for retries.
    """
    threading.Thread(target=_send, args=(subject, message, recipient), daemon=True).start()
