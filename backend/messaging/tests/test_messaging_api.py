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



class MessagingEdgeTests(TestCase):
    def setUp(self):
        self.asha = User.objects.create_user(email='asha@example.com', first_name='Asha', last_name='Rao', password='StrongPass123!')
        self.ravi = User.objects.create_user(email='ravi@example.com', first_name='Ravi', last_name='K', password='StrongPass123!')
        self.mia = User.objects.create_user(email='mia@example.com', first_name='Mia', last_name='Sen', password='StrongPass123!')
        Connection.objects.create(from_user=self.asha, to_user=self.ravi, status=Connection.Status.ACCEPTED)
        Connection.objects.create(from_user=self.asha, to_user=self.mia, status=Connection.Status.ACCEPTED)

    def client_for(self, user):
        client = APIClient()
        client.force_authenticate(user)
        return client

    def open_chat(self, client, other):
        return client.post('/api/v1/messages/conversations/', {'user_id': other.id}, format='json').data['data']['id']

    def thread_url(self, conversation_id):
        return f'/api/v1/messages/conversations/{conversation_id}/messages/'

    def test_each_listed_chat_shows_its_own_last_message_and_unread(self):
        asha, mia = self.client_for(self.asha), self.client_for(self.mia)
        ravi_url = self.thread_url(self.open_chat(asha, self.ravi))
        mia_url = self.thread_url(self.open_chat(asha, self.mia))
        asha.post(ravi_url, {'body': 'to ravi'}, format='json')
        asha.post(mia_url, {'body': 'to mia 1'}, format='json')
        asha.post(mia_url, {'body': 'to mia 2'}, format='json')
        mia.post(mia_url, {'body': 'reply from mia'}, format='json')

        listed = asha.get('/api/v1/messages/conversations/').data['data']['conversations']
        by_name = {item['other']['name']: item for item in listed}
        self.assertEqual(by_name['Ravi K']['last_message']['body'], 'to ravi')
        self.assertEqual(by_name['Mia Sen']['last_message']['body'], 'reply from mia')
        self.assertEqual(by_name['Mia Sen']['unread_count'], 1)
        self.assertEqual(by_name['Ravi K']['unread_count'], 0)
        self.assertEqual(listed[0]['other']['name'], 'Mia Sen')

    def test_deactivated_user_hides_their_chats(self):
        asha = self.client_for(self.asha)
        conversation_id = self.open_chat(asha, self.ravi)
        self.ravi.is_active = False
        self.ravi.save(update_fields=['is_active'])
        self.assertEqual(asha.get('/api/v1/messages/conversations/').data['data']['conversations'], [])
        self.assertEqual(asha.get(self.thread_url(conversation_id)).status_code, 404)

    def test_send_rules(self):
        asha, ravi = self.client_for(self.asha), self.client_for(self.ravi)
        url = self.thread_url(self.open_chat(asha, self.ravi))
        too_long = asha.post(url, {'body': 'x' * 2001}, format='json')
        self.assertEqual((too_long.status_code, too_long.data['field_errors']), (400, {'body': ['Keep messages under 2000 characters.']}))
        self.assertEqual(asha.post(url, {'body': 'x' * 2000}, format='json').status_code, 201)
        self.assertEqual(asha.post(url, {'shared_production_post_id': 999999}, format='json').status_code, 400)
        self.assertEqual(ravi.post(url, {'body': ' '}, format='json').status_code, 400)

    def test_unauthenticated_is_rejected(self):
        client = APIClient()
        self.assertEqual(client.get('/api/v1/messages/conversations/').status_code, 401)
        self.assertEqual(client.get('/api/v1/messages/unread-count/').status_code, 401)

    def test_sender_reading_own_thread_does_not_mark_read(self):
        asha, ravi = self.client_for(self.asha), self.client_for(self.ravi)
        url = self.thread_url(self.open_chat(asha, self.ravi))
        asha.post(url, {'body': 'hi'}, format='json')
        asha.get(url)
        self.assertEqual(ravi.get('/api/v1/messages/unread-count/').data['data']['unread'], 1)

    def test_polling_does_not_mark_unseen_messages_read(self):
        asha, ravi = self.client_for(self.asha), self.client_for(self.ravi)
        url = self.thread_url(self.open_chat(asha, self.ravi))
        first = asha.post(url, {'body': 'one'}, format='json').data['data']['id']
        asha.post(url, {'body': 'two'}, format='json')
        self.assertEqual(ravi.get(f'{url}?after={first}').data['data']['messages'][0]['body'], 'two')
        self.assertEqual(ravi.get('/api/v1/messages/unread-count/').data['data']['unread'], 2)
        ravi.get(url)
        self.assertEqual(ravi.get('/api/v1/messages/unread-count/').data['data']['unread'], 0)
