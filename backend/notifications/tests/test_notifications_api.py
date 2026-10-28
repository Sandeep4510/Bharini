from unittest import mock

from django.contrib.auth import get_user_model
from django.test import TestCase
from rest_framework.test import APIClient

from connections.models import Connection
from notifications import push
from notifications.models import PushDevice
from production_posts.models import CastingCall, Post as CastingPost
from productions.models import ProductionProfile
from profiles.models import ArtistProfile

User = get_user_model()
TOKEN_A = 'ExponentPushToken[asha-phone]'
TOKEN_R = 'ExponentPushToken[ravi-phone]'


class PushTests(TestCase):
    def setUp(self):
        self.asha = User.objects.create_user(email='asha@example.com', first_name='Asha', last_name='Rao', password='StrongPass123!')
        self.ravi = User.objects.create_user(email='ravi@example.com', first_name='Ravi', last_name='K', password='StrongPass123!')
        self.sent = []
        patcher = mock.patch.object(push, '_send_in_background', side_effect=self.sent.extend)
        patcher.start()
        self.addCleanup(patcher.stop)

    def client_for(self, user):
        client = APIClient()
        client.force_authenticate(user)
        return client

    def register(self, user, token):
        return self.client_for(user).post('/api/v1/notifications/devices/', {'token': token, 'platform': 'android'}, format='json')

    def test_register_and_remove_device(self):
        self.assertEqual(self.register(self.asha, 'not-a-token').status_code, 400)
        self.assertEqual(self.register(self.asha, TOKEN_A).status_code, 200)
        self.register(self.ravi, TOKEN_A)  # the same phone signs in to another account
        self.assertEqual(PushDevice.objects.get(token=TOKEN_A).user, self.ravi)
        self.client_for(self.ravi).delete('/api/v1/notifications/devices/', {'token': TOKEN_A}, format='json')
        self.assertFalse(PushDevice.objects.exists())

    def test_message_pushes_to_the_other_person_unless_muted(self):
        Connection.objects.create(from_user=self.asha, to_user=self.ravi, status=Connection.Status.ACCEPTED)
        self.register(self.ravi, TOKEN_R)
        asha = self.client_for(self.asha)
        conversation = asha.post('/api/v1/messages/conversations/', {'user_id': self.ravi.id}, format='json').data['data']['id']
        url = f'/api/v1/messages/conversations/{conversation}/messages/'

        with self.captureOnCommitCallbacks(execute=True):
            asha.post(url, {'body': 'Audition at 5?'}, format='json')
        self.assertEqual(len(self.sent), 1)
        self.assertEqual((self.sent[0]['to'], self.sent[0]['title'], self.sent[0]['body']), (TOKEN_R, 'Asha Rao', 'Audition at 5?'))
        self.assertEqual(self.sent[0]['data'], {'kind': 'messages', 'conversation_id': conversation})

        settings = self.client_for(self.ravi).patch('/api/v1/notifications/settings/', {'messages': False}, format='json').data['data']
        self.assertEqual(settings, {'messages': False, 'connections': True, 'follows': True, 'casting': True})
        with self.captureOnCommitCallbacks(execute=True):
            asha.post(url, {'body': 'Hello?'}, format='json')
        self.assertEqual(len(self.sent), 1)  # muted
        self.assertEqual(self.client_for(self.ravi).patch('/api/v1/notifications/settings/', {'follows': 'yes'}, format='json').status_code, 400)

    def test_follow_and_connection_pushes(self):
        self.register(self.ravi, TOKEN_R)
        self.register(self.asha, TOKEN_A)
        with self.captureOnCommitCallbacks(execute=True):
            self.client_for(self.asha).post(f'/api/v1/users/{self.ravi.id}/follow/')
            self.client_for(self.asha).post(f'/api/v1/users/{self.ravi.id}/follow/')  # repeat: no second push
            self.client_for(self.asha).post(f'/api/v1/users/{self.ravi.id}/connect/')
            self.client_for(self.ravi).post(f'/api/v1/users/{self.asha.id}/connect/')  # accepts
        self.assertEqual(
            [(m['to'], m['title']) for m in self.sent],
            [(TOKEN_R, 'New follower'), (TOKEN_R, 'New connection request'), (TOKEN_A, 'Connection accepted')],
        )

    def test_casting_call_reaches_artists_in_that_city(self):
        ArtistProfile.objects.create(user=self.asha, disciplines=['actor'], location='Mangaluru, Karnataka')
        ArtistProfile.objects.create(user=self.ravi, disciplines=['actor'], location='Mumbai, Maharashtra')
        self.register(self.asha, TOKEN_A)
        self.register(self.ravi, TOKEN_R)
        owner = User.objects.create_user(email='studio@example.com', password='StrongPass123!', role='production_house')
        house = ProductionProfile.objects.create(owner=owner, kind='house', name='Studio', username='studio')
        post = CastingPost.objects.create(production=house, post_type='casting_call', body='Lead role')
        CastingCall.objects.create(post=post, age_min=18, age_max=30, languages='Tulu', location='Mangaluru', approx_pay='Paid')

        from production_posts.views import notify_local_artists
        with self.captureOnCommitCallbacks(execute=True):
            notify_local_artists(mock.Mock(user=owner), post)
        self.assertEqual([m['to'] for m in self.sent], [TOKEN_A])
        self.assertEqual(self.sent[0]['data'], {'kind': 'casting', 'post_id': post.id})

    def test_dead_tokens_are_forgotten(self):
        self.register(self.asha, TOKEN_A)
        tickets = {'data': [{'status': 'error', 'details': {'error': 'DeviceNotRegistered'}}]}
        with mock.patch.object(push, '_post', return_value=tickets):
            push.send_now([{'to': TOKEN_A, 'title': 't', 'body': 'b', 'data': {}}])
        self.assertFalse(PushDevice.objects.filter(token=TOKEN_A).exists())
