import shutil
import tempfile

from django.contrib.auth import get_user_model
from django.core.files.uploadedfile import SimpleUploadedFile
from django.test import override_settings
from rest_framework.test import APITestCase

from productions.models import ProductionProfile

User = get_user_model()
MEDIA_ROOT = tempfile.mkdtemp()


@override_settings(MEDIA_ROOT=MEDIA_ROOT)
class ProductionProfileAPITests(APITestCase):
    @classmethod
    def tearDownClass(cls):
        super().tearDownClass()
        shutil.rmtree(MEDIA_ROOT, ignore_errors=True)

    def setUp(self):
        self.owner = User.objects.create_user('owner@example.com', 'StrongPass123!', first_name='Ravi', last_name='Kumar', role='production_house')
        self.other = User.objects.create_user('other@example.com', 'StrongPass123!', first_name='Asha', last_name='Rao', role='artist')
        self.client.force_authenticate(self.owner)

    def test_owner_creates_profile_once(self):
        payload = {'name': 'Kumar Films', 'kind': 'house'}
        created = self.client.post('/api/v1/productions/', payload, format='json')
        self.assertEqual(created.status_code, 201)
        self.assertTrue(created.json()['data']['is_owner'])

        again = self.client.post('/api/v1/productions/', payload, format='json')
        self.assertEqual(again.status_code, 400)
        self.assertEqual(ProductionProfile.objects.filter(owner=self.owner).count(), 1)

    def test_me_returns_404_without_profile(self):
        response = self.client.get('/api/v1/productions/me/')
        self.assertEqual(response.status_code, 200)
        self.assertIsNone(response.json()['data'])

    def test_only_owner_can_edit(self):
        profile = ProductionProfile.objects.create(owner=self.owner, name='Kumar Films', kind='house')
        url = f'/api/v1/productions/{profile.pk}/'

        self.client.force_authenticate(self.other)
        self.assertEqual(self.client.patch(url, {'name': 'Hijacked'}, format='json').status_code, 403)

        self.client.force_authenticate(self.owner)
        response = self.client.patch(url, {'name': 'Kumar Studios'}, format='json')
        self.assertEqual(response.status_code, 200)
        profile.refresh_from_db()
        self.assertEqual(profile.name, 'Kumar Studios')

    def test_profile_picture_must_be_an_image(self):
        fake = SimpleUploadedFile('avatar.png', b'not an image', content_type='image/png')
        response = self.client.post('/api/v1/productions/', {'name': 'X', 'kind': 'individual', 'profile_picture': fake}, format='multipart')
        self.assertEqual(response.status_code, 400)
        self.assertIn('profile_picture', response.json())


class ProductionFollowCountsTests(APITestCase):
    def test_production_page_shows_owner_follow_counts(self):
        owner = User.objects.create_user('house@example.com', 'StrongPass123!', first_name='K', last_name='F', role='production_house')
        fan = User.objects.create_user('fan@example.com', 'StrongPass123!', first_name='A', last_name='R', role='artist')
        production = ProductionProfile.objects.create(owner=owner, kind='house', name='Kumar Films')
        self.client.force_authenticate(fan)
        data = self.client.get(f'/api/v1/productions/{production.id}/').data['data']
        self.assertEqual((data['owner_id'], data['follower_count'], data['is_following']), (owner.id, 0, False))
        self.client.post(f'/api/v1/users/{owner.id}/follow/')
        data = self.client.get(f'/api/v1/productions/{production.id}/').data['data']
        self.assertEqual((data['follower_count'], data['following_count'], data['is_following']), (1, 0, True))
