import json
from io import BytesIO

from django.contrib.auth import get_user_model
from django.core.files.uploadedfile import SimpleUploadedFile
from PIL import Image
from rest_framework.test import APITestCase

from productions.models import ProductionProfile

User = get_user_model()


class PostAPITests(APITestCase):
    def setUp(self):
        self.owner = User.objects.create_user('owner@example.com', 'StrongPass123!', first_name='Ravi', last_name='Kumar', role='production_house')
        self.artist = User.objects.create_user('artist@example.com', 'StrongPass123!', first_name='Asha', last_name='Rao', role='artist')
        self.profile = ProductionProfile.objects.create(owner=self.owner, name='Kumar Films', kind='house')
        self.client.force_authenticate(self.owner)

    def casting_payload(self, body='Casting for a new serial #Casting #Tamil', **overrides):
        casting = {
            'age_min': 20, 'age_max': 30, 'gender': 'female',
            'languages': 'Hindi, Tamil', 'location': 'Chennai', 'approx_pay': '50k per day',
        }
        casting.update(overrides)
        return {'post_type': 'casting_call', 'body': body, 'casting': casting}

    def test_update_posts_are_rejected(self):
        response = self.client.post('/api/v1/feed/', {'post_type': 'update', 'body': 'Hello'}, format='json')
        self.assertEqual(response.status_code, 400)
        self.assertIn('post_type', str(response.json()))

    def test_only_production_owner_can_post(self):
        self.client.force_authenticate(self.artist)
        response = self.client.post('/api/v1/feed/', self.casting_payload(), format='json')
        self.assertEqual(response.status_code, 403)

    def test_casting_post_requires_valid_details(self):
        payload = self.casting_payload()
        del payload['casting']
        self.assertEqual(self.client.post('/api/v1/feed/', payload, format='json').status_code, 400)

        invalid = self.casting_payload(age_min=40, age_max=20)
        self.assertEqual(self.client.post('/api/v1/feed/', invalid, format='json').status_code, 400)

    def test_casting_post_saves_hashtags_and_details(self):
        response = self.client.post('/api/v1/feed/', self.casting_payload(), format='json')
        self.assertEqual(response.status_code, 201)
        data = response.json()['data']
        self.assertEqual(data['hashtags'], ['casting', 'tamil'])
        self.assertEqual(data['casting']['location'], 'Chennai')
        self.assertEqual(data['production']['name'], 'Kumar Films')

    def test_like_is_idempotent_and_can_be_removed(self):
        post = self.client.post('/api/v1/feed/', self.casting_payload(body='Shooting started'), format='json').json()['data']
        url = f"/api/v1/feed/{post['id']}/like/"

        self.client.force_authenticate(self.artist)
        self.client.post(url)
        self.assertEqual(self.client.post(url).json()['data']['like_count'], 1)

        feed = self.client.get('/api/v1/feed/').json()['data']['results'][0]
        self.assertTrue(feed['is_liked'])

        self.assertEqual(self.client.delete(url).json()['data']['like_count'], 0)

    def test_share_and_comments(self):
        post = self.client.post('/api/v1/feed/', self.casting_payload(body='Teaser out'), format='json').json()['data']
        self.client.force_authenticate(self.artist)
        self.assertEqual(self.client.post(f"/api/v1/feed/{post['id']}/share/").json()['data']['share_count'], 1)

        comment_url = f"/api/v1/feed/{post['id']}/comments/"
        self.assertEqual(self.client.post(comment_url, {'body': 'Great!'}, format='json').status_code, 201)
        comments = self.client.get(comment_url).json()['data']['results']
        self.assertEqual(comments[0]['body'], 'Great!')
        self.assertEqual(comments[0]['author_name'], 'Asha Rao')

    def test_production_posts_are_filtered_by_profile(self):
        other_owner = User.objects.create_user('other@example.com', 'StrongPass123!', first_name='Vi', last_name='Ram', role='production_house')
        other_profile = ProductionProfile.objects.create(owner=other_owner, name='Ram Media', kind='individual')
        self.client.post('/api/v1/feed/', self.casting_payload(body='Ours'), format='json')
        self.client.force_authenticate(other_owner)
        self.client.post('/api/v1/feed/', self.casting_payload(body='Theirs'), format='json')

        results = self.client.get(f'/api/v1/productions/{self.profile.pk}/posts/').json()['data']['results']
        self.assertEqual([post['body'] for post in results], ['Ours'])
        self.assertEqual(self.client.get(f'/api/v1/productions/{other_profile.pk}/posts/').json()['data']['results'][0]['body'], 'Theirs')

    def test_casting_call_accepts_image_upload(self):
        buffer = BytesIO()
        Image.new('RGB', (40, 40), 'red').save(buffer, format='PNG')
        upload = SimpleUploadedFile('poster.png', buffer.getvalue(), content_type='image/png')
        payload = self.casting_payload()
        form = {'post_type': 'casting_call', 'body': 'Poster call', 'image': upload, 'casting': json.dumps(payload['casting'])}

        response = self.client.post('/api/v1/feed/', form, format='multipart')

        self.assertEqual(response.status_code, 201)
        data = response.json()['data']
        self.assertTrue(data['image'].endswith('.jpg'))
        self.assertEqual(data['casting']['location'], 'Chennai')

    def test_casting_call_rejects_non_image_upload(self):
        upload = SimpleUploadedFile('notes.txt', b'not a picture', content_type='text/plain')
        form = {'post_type': 'casting_call', 'body': 'Poster call', 'image': upload, 'casting': json.dumps(self.casting_payload()['casting'])}

        response = self.client.post('/api/v1/feed/', form, format='multipart')

        self.assertEqual(response.status_code, 400)
        self.assertIn('image', str(response.json()))
