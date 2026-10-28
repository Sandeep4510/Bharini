from django.contrib.auth import get_user_model
from django.test import TestCase
from rest_framework.test import APIClient

User = get_user_model()


class ConnectionApiTests(TestCase):
    def setUp(self):
        self.asha = User.objects.create_user(email='asha@example.com', first_name='Asha', last_name='Rao', password='StrongPass123!')
        self.ravi = User.objects.create_user(email='ravi@example.com', first_name='Ravi', last_name='K', password='StrongPass123!')

    def client_for(self, user):
        client = APIClient()
        client.force_authenticate(user)
        return client

    def status_seen_by(self, client, user):
        return client.get(f'/api/v1/users/{user.id}/').data['data']['connection']

    def test_request_accept_and_remove(self):
        asha, ravi = self.client_for(self.asha), self.client_for(self.ravi)
        self.assertEqual(self.status_seen_by(asha, self.ravi), 'none')
        self.assertEqual(asha.post(f'/api/v1/users/{self.ravi.id}/connect/').data['data']['connection'], 'pending_sent')
        asha.post(f'/api/v1/users/{self.ravi.id}/connect/')  # repeat is harmless
        self.assertEqual(self.status_seen_by(ravi, self.asha), 'pending_received')

        requests = ravi.get('/api/v1/users/me/connection-requests/').data['data']['requests']
        self.assertEqual([item['name'] for item in requests], ['Asha Rao'])
        self.assertEqual(asha.get('/api/v1/users/me/connection-requests/').data['data']['requests'], [])

        self.assertEqual(ravi.post(f'/api/v1/users/{self.asha.id}/connect/').data['data']['connection'], 'connected')
        self.assertEqual(self.status_seen_by(asha, self.ravi), 'connected')
        names = lambda q: [p['name'] for p in asha.get('/api/v1/users/me/connections/', {'q': q}).data['data']['connections']]
        self.assertEqual((names(''), names('ravi'), names('zzz')), (['Ravi K'], ['Ravi K'], []))
        self.assertEqual(ravi.get('/api/v1/users/me/connection-requests/').data['data']['requests'], [])

        # connecting does not follow, and follows stay when the connection goes
        self.assertEqual(asha.get(f'/api/v1/users/{self.ravi.id}/').data['data']['follower_count'], 0)
        asha.post(f'/api/v1/users/{self.ravi.id}/follow/')
        self.assertEqual(asha.delete(f'/api/v1/users/{self.ravi.id}/connect/').data['data']['connection'], 'none')
        self.assertTrue(asha.get(f'/api/v1/users/{self.ravi.id}/').data['data']['is_following'])

    def test_decline_and_self(self):
        asha, ravi = self.client_for(self.asha), self.client_for(self.ravi)
        asha.post(f'/api/v1/users/{self.ravi.id}/connect/')
        self.assertEqual(ravi.delete(f'/api/v1/users/{self.asha.id}/connect/').data['data']['connection'], 'none')
        self.assertEqual(self.status_seen_by(asha, self.ravi), 'none')
        self.assertEqual(asha.post(f'/api/v1/users/{self.asha.id}/connect/').status_code, 400)
        self.assertEqual(asha.post('/api/v1/users/999999/connect/').status_code, 404)


class ConnectionEdgeTests(TestCase):
    def setUp(self):
        self.asha = User.objects.create_user(email='asha@example.com', first_name='Asha', last_name='Rao', password='StrongPass123!')
        self.ravi = User.objects.create_user(email='ravi@example.com', first_name='Ravi', last_name='K', password='StrongPass123!')
        self.mia = User.objects.create_user(email='mia@example.com', first_name='Mia', last_name='Rao', password='StrongPass123!')

    def client_for(self, user):
        client = APIClient()
        client.force_authenticate(user)
        return client

    def test_anonymous_is_rejected(self):
        client = APIClient()
        self.assertEqual(client.post(f'/api/v1/users/{self.ravi.id}/connect/').status_code, 401)
        self.assertEqual(client.get('/api/v1/users/me/connections/').status_code, 401)
        self.assertEqual(client.get('/api/v1/users/me/connection-requests/').status_code, 401)

    def test_requests_list_newest_first_with_time(self):
        asha, ravi, mia = self.client_for(self.asha), self.client_for(self.ravi), self.client_for(self.mia)
        asha.post(f'/api/v1/users/{self.ravi.id}/connect/')
        mia.post(f'/api/v1/users/{self.ravi.id}/connect/')
        requests = ravi.get('/api/v1/users/me/connection-requests/').data['data']['requests']
        self.assertEqual([item['name'] for item in requests], ['Mia Rao', 'Asha Rao'])
        self.assertIn('requested_at', requests[0])

    def test_cancel_removes_request_from_receiver(self):
        asha, ravi = self.client_for(self.asha), self.client_for(self.ravi)
        asha.post(f'/api/v1/users/{self.ravi.id}/connect/')
        self.assertEqual(asha.delete(f'/api/v1/users/{self.ravi.id}/connect/').data['data']['connection'], 'none')
        self.assertEqual(ravi.get('/api/v1/users/me/connection-requests/').data['data']['requests'], [])
        self.assertEqual(asha.delete(f'/api/v1/users/{self.ravi.id}/connect/').status_code, 200)  # removing nothing is fine

    def test_connected_stays_connected_on_repeat_connect(self):
        asha, ravi = self.client_for(self.asha), self.client_for(self.ravi)
        asha.post(f'/api/v1/users/{self.ravi.id}/connect/')
        ravi.post(f'/api/v1/users/{self.asha.id}/connect/')
        self.assertEqual(asha.post(f'/api/v1/users/{self.ravi.id}/connect/').data['data']['connection'], 'connected')
        self.assertEqual(ravi.post(f'/api/v1/users/{self.asha.id}/connect/').data['data']['connection'], 'connected')

    def test_deactivated_users_are_hidden(self):
        asha, ravi = self.client_for(self.asha), self.client_for(self.ravi)
        asha.post(f'/api/v1/users/{self.ravi.id}/connect/')
        self.ravi.is_active = False
        self.ravi.save(update_fields=['is_active'])
        self.assertEqual(asha.post(f'/api/v1/users/{self.ravi.id}/connect/').status_code, 404)
        self.assertEqual(asha.get('/api/v1/users/me/connections/').data['data']['connections'], [])

        self.mia.is_active = False
        self.mia.save(update_fields=['is_active'])
        self.assertEqual(asha.post(f'/api/v1/users/{self.mia.id}/connect/').status_code, 404)

    def test_requests_from_deactivated_senders_are_hidden(self):
        asha, ravi = self.client_for(self.asha), self.client_for(self.ravi)
        asha.post(f'/api/v1/users/{self.ravi.id}/connect/')
        self.asha.is_active = False
        self.asha.save(update_fields=['is_active'])
        self.assertEqual(ravi.get('/api/v1/users/me/connection-requests/').data['data']['requests'], [])

    def test_connection_search_needs_every_word(self):
        asha, ravi, mia = self.client_for(self.asha), self.client_for(self.ravi), self.client_for(self.mia)
        for other in (self.ravi, self.mia):
            asha.post(f'/api/v1/users/{other.id}/connect/')
            self.client_for(other).post(f'/api/v1/users/{self.asha.id}/connect/')
        names = lambda q: [p['name'] for p in asha.get('/api/v1/users/me/connections/', {'q': q}).data['data']['connections']]
        self.assertEqual(names('mia rao'), ['Mia Rao'])
        self.assertEqual(names('rao'), ['Mia Rao'])  # ravi K does not match "rao"
        self.assertEqual(names('mia ravi'), [])


class BlockTests(TestCase):
    def setUp(self):
        self.asha = User.objects.create_user(email='asha@example.com', first_name='Asha', last_name='Rao', password='StrongPass123!')
        self.ravi = User.objects.create_user(email='ravi@example.com', first_name='Ravi', last_name='K', password='StrongPass123!')
        self.asha_client, self.ravi_client = APIClient(), APIClient()
        self.asha_client.force_authenticate(self.asha)
        self.ravi_client.force_authenticate(self.ravi)

    def test_block_hides_posts_chats_and_profile_both_ways(self):
        asha, ravi = self.asha_client, self.ravi_client
        asha.post(f'/api/v1/users/{self.ravi.id}/connect/')
        ravi.post(f'/api/v1/users/{self.asha.id}/connect/')
        asha.post(f'/api/v1/users/{self.ravi.id}/follow/')
        ravi.post('/api/v1/posts/', {'body': 'ravi post'})
        conversation = asha.post('/api/v1/messages/conversations/', {'user_id': self.ravi.id}, format='json').data['data']
        ravi.post(f'/api/v1/messages/conversations/{conversation["id"]}/messages/', {'body': 'hi'}, format='json')
        self.assertEqual(asha.get('/api/v1/messages/unread-count/').data['data']['unread'], 1)

        self.assertEqual(asha.post(f'/api/v1/users/{self.ravi.id}/block/').data['data']['is_blocked'], True)

        bodies = lambda client: [post['body'] for post in client.get('/api/v1/posts/').data['data']['posts']]
        self.assertNotIn('ravi post', bodies(asha))
        self.assertEqual(asha.get('/api/v1/messages/conversations/').data['data']['conversations'], [])
        self.assertEqual(asha.get('/api/v1/messages/unread-count/').data['data']['unread'], 0)
        self.assertEqual(asha.get(f'/api/v1/messages/conversations/{conversation["id"]}/messages/').status_code, 404)
        self.assertEqual(ravi.get('/api/v1/messages/conversations/').data['data']['conversations'], [])
        self.assertEqual(asha.get('/api/v1/users/search/', {'q': 'ravi'}).data['data']['results'], [])

        # the blocker sees who they blocked (to unblock); the blocked person sees nothing
        profile = asha.get(f'/api/v1/users/{self.ravi.id}/').data['data']
        self.assertEqual((profile['is_blocked'], profile['connection'], profile['is_following'], profile['posts']), (True, 'none', False, []))
        self.assertEqual(ravi.get(f'/api/v1/users/{self.asha.id}/').status_code, 404)
        self.assertEqual(ravi.post(f'/api/v1/users/{self.asha.id}/connect/').status_code, 404)
        self.assertEqual(ravi.post('/api/v1/messages/conversations/', {'user_id': self.asha.id}, format='json').status_code, 404)
        self.assertEqual([p['name'] for p in asha.get('/api/v1/users/me/blocked/').data['data']['blocked']], ['Ravi K'])

        self.assertEqual(asha.delete(f'/api/v1/users/{self.ravi.id}/block/').data['data']['is_blocked'], False)
        self.assertIn('ravi post', bodies(asha))
        self.assertEqual(asha.get('/api/v1/users/me/blocked/').data['data']['blocked'], [])

    def test_cannot_block_self(self):
        self.assertEqual(self.asha_client.post(f'/api/v1/users/{self.asha.id}/block/').status_code, 400)
        self.assertEqual(self.asha_client.post('/api/v1/users/999999/block/').status_code, 404)
