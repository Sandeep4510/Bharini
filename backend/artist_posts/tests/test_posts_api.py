import shutil
import tempfile
from io import BytesIO

from django.contrib.auth import get_user_model
from django.core.files.uploadedfile import SimpleUploadedFile
from django.test import TestCase, override_settings
from PIL import Image
from rest_framework.test import APIClient

User = get_user_model()
MEDIA_ROOT = tempfile.mkdtemp()


@override_settings(MEDIA_ROOT=MEDIA_ROOT)
class PostApiTests(TestCase):
    @classmethod
    def tearDownClass(cls):
        super().tearDownClass()
        shutil.rmtree(MEDIA_ROOT, ignore_errors=True)

    def setUp(self):
        self.client = APIClient()
        self.user = User.objects.create_user(email='poster@example.com', first_name='Asha', last_name='Rao', password='StrongPass123!')
        self.client.force_authenticate(self.user)

    def test_create_text_and_image_posts(self):
        self.assertEqual(self.client.post('/api/v1/posts/', {'body': '   '}, format='json').status_code, 400)

        response = self.client.post('/api/v1/posts/', {'body': 'First audition done!'}, format='json')
        self.assertEqual(response.status_code, 201, response.data)

        output = BytesIO()
        Image.new('RGB', (50, 50)).save(output, format='PNG')
        image = SimpleUploadedFile('set.png', output.getvalue(), content_type='image/png')
        response = self.client.post('/api/v1/posts/', {'body': 'On set', 'media': image}, format='multipart')
        self.assertEqual(response.status_code, 201, response.data)
        self.assertEqual(response.data['data']['media_kind'], 'image')

        bad = SimpleUploadedFile('virus.exe', b'MZ', content_type='application/octet-stream')
        response = self.client.post('/api/v1/posts/', {'body': 'x', 'media': bad}, format='multipart')
        self.assertEqual(response.status_code, 400)

        posts = self.client.get('/api/v1/posts/').data['data']['posts']
        self.assertEqual([post['body'] for post in posts][:2], ['On set', 'First audition done!'])

    def test_only_the_author_can_edit_and_delete(self):
        output = BytesIO()
        Image.new('RGB', (50, 50)).save(output, format='PNG')
        image = SimpleUploadedFile('set.png', output.getvalue(), content_type='image/png')
        post_id = self.client.post('/api/v1/posts/', {'body': 'Draft', 'media': image}, format='multipart').data['data']['id']

        stranger = User.objects.create_user(email='other@example.com', first_name='O', last_name='P', password='StrongPass123!')
        other = APIClient()
        other.force_authenticate(stranger)
        self.assertEqual(other.patch(f'/api/v1/posts/{post_id}/', {'body': 'hacked'}, format='json').status_code, 404)
        self.assertEqual(other.delete(f'/api/v1/posts/{post_id}/').status_code, 404)

        self.assertEqual(self.client.patch(f'/api/v1/posts/{post_id}/', {'body': ' '}, format='json').status_code, 400)
        response = self.client.patch(f'/api/v1/posts/{post_id}/', {'body': 'Final', 'remove_media': 'true'}, format='multipart')
        self.assertEqual(response.status_code, 200, response.data)
        self.assertEqual(response.data['data']['body'], 'Final')
        self.assertIsNone(response.data['data']['media'])

        self.assertEqual(self.client.delete(f'/api/v1/posts/{post_id}/').status_code, 200)
        self.assertNotIn(post_id, [post['id'] for post in self.client.get('/api/v1/posts/').data['data']['posts']])


class SocialApiTests(TestCase):
    def setUp(self):
        self.asha = User.objects.create_user(email='asha@example.com', first_name='Asha', last_name='Rao', password='StrongPass123!')
        self.studio = User.objects.create_user(
            email='studio@example.com', first_name='Big', last_name='Studio', password='StrongPass123!', role='production_house',
        )
        self.ravi = User.objects.create_user(email='ravi@example.com', first_name='Ravi', last_name='K', password='StrongPass123!')
        self.client = APIClient()
        self.client.force_authenticate(self.asha)

    def client_for(self, user):
        client = APIClient()
        client.force_authenticate(user)
        return client

    def test_feed_puts_followed_accounts_first(self):
        studio_post = self.client_for(self.studio).post('/api/v1/posts/', {'body': 'Casting call'}, format='json').data['data']['id']
        ravi_post = self.client_for(self.ravi).post('/api/v1/posts/', {'body': 'New song'}, format='json').data['data']['id']

        ids = [post['id'] for post in self.client.get('/api/v1/posts/').data['data']['posts']]
        self.assertLess(ids.index(ravi_post), ids.index(studio_post))  # nobody followed: newest first

        response = self.client.post(f'/api/v1/users/{self.studio.id}/follow/')
        self.assertEqual(response.data['data'], {'is_following': True, 'follower_count': 1})
        self.client.post(f'/api/v1/users/{self.studio.id}/follow/')  # repeat is harmless
        posts = self.client.get('/api/v1/posts/').data['data']['posts']
        self.assertEqual(posts[0]['id'], studio_post)
        self.assertEqual(posts[0]['author']['name'], 'Big Studio')
        self.assertNotIn('email', posts[0]['author'])

        self.assertEqual(self.client.post(f'/api/v1/users/{self.asha.id}/follow/').status_code, 400)
        self.assertEqual(self.client.post('/api/v1/users/999999/follow/').status_code, 404)
        response = self.client.delete(f'/api/v1/users/{self.studio.id}/follow/')
        self.assertEqual(response.data['data'], {'is_following': False, 'follower_count': 0})

    def test_like_comment_and_delete_rules(self):
        post_id = self.client_for(self.ravi).post('/api/v1/posts/', {'body': 'Gig tonight'}, format='json').data['data']['id']

        self.assertEqual(self.client.post(f'/api/v1/posts/{post_id}/like/').data['data'], {'liked': True, 'like_count': 1})
        self.client.post(f'/api/v1/posts/{post_id}/like/')
        post = self.client.get(f'/api/v1/posts/{post_id}/').data['data']
        self.assertEqual((post['like_count'], post['liked'], post['is_mine']), (1, True, False))
        self.assertEqual(self.client.delete(f'/api/v1/posts/{post_id}/like/').data['data'], {'liked': False, 'like_count': 0})

        self.assertEqual(self.client.post(f'/api/v1/posts/{post_id}/comments/', {'body': '  '}, format='json').status_code, 400)
        comment = self.client.post(f'/api/v1/posts/{post_id}/comments/', {'body': 'Break a leg!'}, format='json').data['data']
        self.assertTrue(comment['can_delete'])
        studio = self.client_for(self.studio)
        self.assertFalse(studio.get(f'/api/v1/posts/{post_id}/comments/').data['data']['comments'][0]['can_delete'])
        self.assertEqual(studio.delete(f'/api/v1/posts/{post_id}/comments/{comment["id"]}/').status_code, 404)
        self.assertEqual(self.client.get(f'/api/v1/posts/{post_id}/').data['data']['comment_count'], 1)
        # the post owner can remove comments on their post
        self.assertEqual(self.client_for(self.ravi).delete(f'/api/v1/posts/{post_id}/comments/{comment["id"]}/').status_code, 200)
        self.assertEqual(self.client.get(f'/api/v1/posts/{post_id}/comments/').data['data']['comments'], [])

    def test_public_profile_hides_private_fields(self):
        self.client_for(self.studio).post('/api/v1/posts/', {'body': 'Auditions open'}, format='json')
        self.client_for(self.ravi).post(f'/api/v1/users/{self.studio.id}/follow/')
        data = self.client.get(f'/api/v1/users/{self.studio.id}/').data['data']
        self.assertEqual((data['name'], data['role'], data['follower_count'], data['is_me']), ('Big Studio', 'production_house', 1, False))
        self.assertEqual([post['body'] for post in data['posts']], ['Auditions open'])
        self.assertTrue({'email', 'phone', 'date_of_birth'}.isdisjoint(data))
        self.studio.is_active = False
        self.studio.save()
        self.assertEqual(self.client.get(f'/api/v1/users/{self.studio.id}/').status_code, 404)
