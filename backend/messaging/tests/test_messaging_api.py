from django.contrib.auth import get_user_model
from django.test import TestCase
from rest_framework.test import APIClient

from artist_posts.models import Post as ArtistPost
from connections.models import Connection
from production_posts.models import Post as ProductionPost
from productions.models import ProductionProfile

User = get_user_model()


class MessagingApiTests(TestCase):
    def setUp(self):
        self.asha = User.objects.create_user(email='asha@example.com', first_name='Asha', last_name='Rao', password='StrongPass123!')
        self.ravi = User.objects.create_user(email='ravi@example.com', first_name='Ravi', last_name='K', password='StrongPass123!')
        self.eve = User.objects.create_user(email='eve@example.com', first_name='Eve', last_name='X', password='StrongPass123!')
        Connection.objects.create(from_user=self.asha, to_user=self.ravi, status=Connection.Status.ACCEPTED)

    def client_for(self, user):
        client = APIClient()
        client.force_authenticate(user)
        return client

    def start(self, client, user):
        return client.post('/api/v1/messages/conversations/', {'user_id': user.id}, format='json')

    def test_one_conversation_per_pair_and_unread_flow(self):
        asha, ravi = self.client_for(self.asha), self.client_for(self.ravi)
        first = self.start(asha, self.ravi)
        self.assertEqual(first.status_code, 201)
        conversation_id = first.data['data']['id']
        self.assertEqual(self.start(ravi, self.asha).data['data']['id'], conversation_id)  # same chat from either side
        self.assertEqual(self.start(asha, self.asha).status_code, 400)
        self.assertEqual(asha.post('/api/v1/messages/conversations/', {'user_id': 'abc'}, format='json').status_code, 404)

        url = f'/api/v1/messages/conversations/{conversation_id}/messages/'
        self.assertEqual(asha.post(url, {'body': '   '}, format='json').status_code, 400)
        sent = asha.post(url, {'body': 'Hi Ravi!'}, format='json').data['data']
        self.assertTrue(sent['is_mine'])

        self.assertEqual(ravi.get('/api/v1/messages/unread-count/').data['data']['unread'], 1)
        listed = ravi.get('/api/v1/messages/conversations/').data['data']['conversations']
        self.assertEqual((listed[0]['other']['name'], listed[0]['unread_count']), ('Asha Rao', 1))
        self.assertEqual(listed[0]['last_message']['body'], 'Hi Ravi!')
        self.assertNotIn('email', listed[0]['other'])

        thread = ravi.get(url).data['data']['messages']
        self.assertEqual(([m['body'] for m in thread], thread[0]['is_mine']), (['Hi Ravi!'], False))
        self.assertEqual(ravi.get('/api/v1/messages/unread-count/').data['data']['unread'], 0)  # reading marks read

        reply = ravi.post(url, {'body': 'Hey!'}, format='json').data['data']
        self.assertEqual([m['body'] for m in asha.get(f'{url}?after={sent["id"]}').data['data']['messages']], ['Hey!'])
        self.assertEqual(asha.get(f'{url}?after={reply["id"]}').data['data']['messages'], [])

        # outsiders cannot read or post into someone else's chat
        eve = self.client_for(self.eve)
        self.assertEqual(eve.get(url).status_code, 404)
        self.assertEqual(eve.post(url, {'body': 'sneaky'}, format='json').status_code, 404)

    def test_share_posts_into_chat(self):
        asha = self.client_for(self.asha)
        url = f'/api/v1/messages/conversations/{self.start(asha, self.ravi).data["data"]["id"]}/messages/'
        artist_post = ArtistPost.objects.create(author=self.ravi, body='Gig tonight at 8')
        production = ProductionProfile.objects.create(owner=self.eve, kind='house', name='Eve Films')
        production_post = ProductionPost.objects.create(production=production, body='Auditions open')

        shared = asha.post(url, {'shared_artist_post_id': artist_post.id}, format='json').data['data']['shared']
        self.assertEqual((shared['kind'], shared['author_name'], shared['url']), ('artist', 'Ravi K', f'/posts/{artist_post.id}'))
        shared = asha.post(url, {'body': 'Look', 'shared_production_post_id': production_post.id}, format='json').data['data']['shared']
        self.assertEqual((shared['author_name'], shared['url']), ('Eve Films', f'/productions/{production.id}#post-{production_post.id}'))
        self.assertEqual(asha.post(url, {'shared_artist_post_id': 999999}, format='json').status_code, 400)

        artist_post.delete()  # the message stays, its preview goes
        messages = asha.get(url).data['data']['messages']
        self.assertEqual((len(messages), messages[0]['shared']), (2, None))

    def test_only_connected_users_can_message(self):
        asha, eve = self.client_for(self.asha), self.client_for(self.eve)
        response = self.start(asha, self.eve)
        self.assertEqual((response.status_code, response.data['code']), (403, 'not_connected'))
        eve.post(f'/api/v1/users/{self.asha.id}/connect/')
        self.assertEqual(self.start(asha, self.eve).status_code, 403)  # a pending request is not enough
        asha.post(f'/api/v1/users/{self.eve.id}/connect/')  # accepting
        conversation = self.start(asha, self.eve).data['data']
        self.assertTrue(conversation['can_message'])
        url = f'/api/v1/messages/conversations/{conversation["id"]}/messages/'
        self.assertEqual(asha.post(url, {'body': 'Hi'}, format='json').status_code, 201)

        eve.delete(f'/api/v1/users/{self.asha.id}/connect/')  # disconnected: history stays, sending stops
        self.assertEqual(asha.post(url, {'body': 'Still there?'}, format='json').status_code, 403)
        self.assertEqual([m['body'] for m in asha.get(url).data['data']['messages']], ['Hi'])
        listed = asha.get('/api/v1/messages/conversations/').data['data']['conversations']
        self.assertFalse(next(item for item in listed if item['id'] == conversation['id'])['can_message'])
