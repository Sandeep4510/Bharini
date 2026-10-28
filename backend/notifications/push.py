"""Sends push notifications through Expo's push service, which forwards to FCM (Android) and APNs (iOS)."""
import json
import logging
import os
import threading
import urllib.error
import urllib.request

from django.db import transaction

from .models import NotificationSettings, PushDevice

logger = logging.getLogger(__name__)

EXPO_PUSH_URL = 'https://exp.host/--/api/v2/push/send'
BATCH_SIZE = 100  # Expo's limit per request
ANDROID_CHANNEL = 'default'  # created by the app at start-up; Android drops pushes for unknown channels


def _post(messages):
    headers = {'Content-Type': 'application/json', 'Accept': 'application/json'}
    access_token = os.getenv('EXPO_ACCESS_TOKEN')  # only needed once "enhanced push security" is on in the Expo dashboard
    if access_token:
        headers['Authorization'] = f'Bearer {access_token}'
    request = urllib.request.Request(EXPO_PUSH_URL, data=json.dumps(messages).encode(), headers=headers, method='POST')
    with urllib.request.urlopen(request, timeout=15) as response:
        return json.loads(response.read() or b'{}')


def send_now(messages):
    """POST in batches; forget tokens Expo reports as dead (app uninstalled, token rotated)."""
    dead = []
    for start in range(0, len(messages), BATCH_SIZE):
        batch = messages[start:start + BATCH_SIZE]
        try:
            tickets = _post(batch).get('data', [])
        except (urllib.error.URLError, TimeoutError, ValueError):
            logger.exception('Push request to Expo failed')
            continue
        for message, ticket in zip(batch, tickets):
            if ticket.get('status') != 'error':
                continue
            if ticket.get('details', {}).get('error') == 'DeviceNotRegistered':
                dead.append(message['to'])
            else:
                logger.warning('Push to %s failed: %s', message['to'], ticket.get('message'))
    if dead:
        PushDevice.objects.filter(token__in=dead).delete()


def _send_in_background(messages):
    # shortcut: a failed push is only logged and the thread dies with the process; move to a task queue for retries
    threading.Thread(target=send_now, args=(messages,), daemon=True).start()


def notify(users, kind, title, body, data):
    """Push to every phone of `users` who keep `kind` switched on. Sent only once the current transaction commits."""
    user_ids = {user.pk for user in users}
    muted = set(NotificationSettings.objects.filter(user_id__in=user_ids, **{kind: False}).values_list('user_id', flat=True))
    tokens = list(PushDevice.objects.filter(user_id__in=user_ids - muted).values_list('token', flat=True))
    if not tokens:
        return
    messages = [
        {
            'to': token,
            'title': title,
            'body': body[:200],
            'data': {'kind': kind, **data},
            'sound': 'default',
            'channelId': ANDROID_CHANNEL,
        }
        for token in tokens
    ]
    transaction.on_commit(lambda: _send_in_background(messages))
