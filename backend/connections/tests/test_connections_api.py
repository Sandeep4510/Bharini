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
