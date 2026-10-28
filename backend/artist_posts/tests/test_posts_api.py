import shutil
import tempfile
from io import BytesIO

from django.contrib.auth import get_user_model
from django.core.files.uploadedfile import SimpleUploadedFile
from django.test import TestCase, override_settings
from PIL import Image
from rest_framework.test import APIClient

from artist_posts.models import Follow, Post

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
        self.assertTrue(posts[0]['author_followed'])
        self.assertFalse(next(post for post in posts if post['id'] == ravi_post)['author_followed'])
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
        self.assertIsNone(data['portfolio'])  # not an artist

        from profiles.models import ArtistProfile
        ArtistProfile.objects.create(user=self.ravi, disciplines=['singer'], phone='+919876543210', bio='Playback')
        data = self.client.get(f'/api/v1/users/{self.ravi.id}/').data['data']
        self.assertEqual(data['portfolio']['media_slots'][0]['discipline'], 'singer')
        self.assertIsNone(data['portfolio']['photos'])  # singers are not cast on their look
        self.assertTrue({'phone', 'alt_email', 'date_of_birth'}.isdisjoint(data['portfolio']))
        self.studio.is_active = False
        self.studio.save()
        self.assertEqual(self.client.get(f'/api/v1/users/{self.studio.id}/').status_code, 404)


class FollowerSearchTests(TestCase):
    def test_search_only_my_followers_by_name(self):
        me = User.objects.create_user(email='me@example.com', first_name='Me', last_name='Self', password='StrongPass123!')
        asha = User.objects.create_user(email='a@example.com', first_name='Asha', last_name='Rao', password='StrongPass123!')
        ravi = User.objects.create_user(email='r@example.com', first_name='Ravi', last_name='Rao', password='StrongPass123!')
        User.objects.create_user(email='x@example.com', first_name='Asha', last_name='Stranger', password='StrongPass123!')
        for fan in (asha, ravi):
            Follow.objects.create(follower=fan, followee=me)
        Follow.objects.create(follower=me, followee=User.objects.get(email='x@example.com'))  # I follow her; she does not follow me

        client = APIClient()
        client.force_authenticate(me)
        names = lambda q: [f['name'] for f in client.get('/api/v1/users/me/followers/', {'q': q}).data['data']['followers']]
        self.assertEqual(names(''), ['Asha Rao', 'Ravi Rao'])
        self.assertEqual(names('asha'), ['Asha Rao'])
        self.assertEqual(names('rao ravi'), ['Ravi Rao'])
        self.assertEqual(names('nobody'), [])


class PeopleSearchAndFollowListTests(TestCase):
    def test_search_people_and_list_followers(self):
        me = User.objects.create_user(email='me@example.com', first_name='Meera', last_name='S', password='StrongPass123!')
        ravi = User.objects.create_user(email='r@example.com', first_name='Ravi', last_name='Kumar', password='StrongPass123!')
        User.objects.create_user(email='g@example.com', first_name='Ravi', last_name='Gone', password='StrongPass123!', is_active=False)
        Follow.objects.create(follower=ravi, followee=me)
        client = APIClient()
        client.force_authenticate(me)

        names = lambda q: [p['name'] for p in client.get('/api/v1/users/search/', {'q': q}).data['data']['results']]
        self.assertEqual(names('ravi'), ['Ravi Kumar'])  # inactive accounts hidden
        self.assertEqual(names('meera'), [])  # not yourself
        self.assertEqual(names(''), [])

        followers = client.get(f'/api/v1/users/{me.id}/followers/').data['data']['people']
        self.assertEqual([p['name'] for p in followers], ['Ravi Kumar'])
        self.assertNotIn('email', followers[0])
        following = client.get(f'/api/v1/users/{ravi.id}/following/').data['data']['people']
        self.assertEqual([p['name'] for p in following], ['Meera S'])


class PostValidationAndAccessTests(TestCase):
    def setUp(self):
        self.asha = User.objects.create_user(email='asha@example.com', first_name='Asha', last_name='Rao', password='StrongPass123!')
        self.ravi = User.objects.create_user(email='ravi@example.com', first_name='Ravi', last_name='K', password='StrongPass123!')
        self.client = APIClient()
        self.client.force_authenticate(self.asha)

    def client_for(self, user):
        client = APIClient()
        client.force_authenticate(user)
        return client

    def test_every_endpoint_requires_login(self):
        anonymous = APIClient()
        self.assertEqual(anonymous.get('/api/v1/posts/').status_code, 401)
        self.assertEqual(anonymous.post('/api/v1/posts/', {'body': 'x'}, format='json').status_code, 401)
        self.assertEqual(anonymous.get('/api/v1/users/search/', {'q': 'asha'}).status_code, 401)
        self.assertEqual(anonymous.get(f'/api/v1/users/{self.asha.id}/').status_code, 401)

    def test_body_and_comment_length_limits(self):
        self.assertEqual(self.client.post('/api/v1/posts/', {'body': 'x' * 5001}, format='json').status_code, 400)
        post_id = self.client.post('/api/v1/posts/', {'body': 'Hello'}, format='json').data['data']['id']
        response = self.client.post(f'/api/v1/posts/{post_id}/comments/', {'body': 'x' * 1001}, format='json')
        self.assertEqual(response.status_code, 400)
        self.assertEqual(response.data['code'], 'validation_error')

    def test_video_post_is_accepted_and_bad_image_is_rejected(self):
        clip = SimpleUploadedFile('clip.mp4', b'\x00\x00\x00\x18ftypmp42' + b'0' * 100, content_type='video/mp4')
        response = self.client.post('/api/v1/posts/', {'body': 'Reel', 'media': clip}, format='multipart')
        self.assertEqual(response.status_code, 201, response.data)
        self.assertEqual(response.data['data']['media_kind'], 'video')

        fake = SimpleUploadedFile('photo.jpg', b'not an image', content_type='image/jpeg')
        response = self.client.post('/api/v1/posts/', {'body': 'x', 'media': fake}, format='multipart')
        self.assertEqual(response.status_code, 400)
        self.assertIn('media', response.data['field_errors'])

    def test_replacing_media_deletes_the_old_file(self):
        output = BytesIO()
        Image.new('RGB', (50, 50)).save(output, format='PNG')
        first = SimpleUploadedFile('a.png', output.getvalue(), content_type='image/png')
        post_id = self.client.post('/api/v1/posts/', {'body': 'One', 'media': first}, format='multipart').data['data']['id']
        old_name = Post.objects.get(pk=post_id).media.name

        second = SimpleUploadedFile('b.png', output.getvalue(), content_type='image/png')
        response = self.client.patch(f'/api/v1/posts/{post_id}/', {'media': second}, format='multipart')
        self.assertEqual(response.status_code, 200, response.data)
        post = Post.objects.get(pk=post_id)
        self.assertNotEqual(post.media.name, old_name)
        self.assertFalse(post.media.storage.exists(old_name))

    def test_inactive_authors_disappear_from_everything(self):
        post_id = self.client_for(self.ravi).post('/api/v1/posts/', {'body': 'Gone soon'}, format='json').data['data']['id']
        self.ravi.is_active = False
        self.ravi.save()

        self.assertNotIn(post_id, [p['id'] for p in self.client.get('/api/v1/posts/').data['data']['posts']])
        self.assertEqual(self.client.get(f'/api/v1/posts/{post_id}/').status_code, 404)
        self.assertEqual(self.client.post(f'/api/v1/posts/{post_id}/like/').status_code, 404)
        self.assertEqual(self.client.post(f'/api/v1/posts/{post_id}/comments/', {'body': 'hi'}, format='json').status_code, 404)
        self.assertEqual(self.client.get(f'/api/v1/posts/{post_id}/comments/').status_code, 404)
        self.assertEqual(self.client.get(f'/api/v1/users/{self.ravi.id}/').status_code, 404)

    def test_any_signed_in_user_can_read_a_post_but_not_edit_it(self):
        post_id = self.client_for(self.ravi).post('/api/v1/posts/', {'body': 'Shared link'}, format='json').data['data']['id']
        response = self.client.get(f'/api/v1/posts/{post_id}/')
        self.assertEqual(response.status_code, 200)
        self.assertFalse(response.data['data']['is_mine'])
        self.assertEqual(self.client.patch(f'/api/v1/posts/{post_id}/', {'body': 'x'}, format='json').status_code, 404)

    def test_follow_rules(self):
        self.assertEqual(self.client.post(f'/api/v1/users/{self.asha.id}/follow/').data['code'], 'cannot_follow_self')
        self.ravi.is_active = False
        self.ravi.save()
        self.assertEqual(self.client.post(f'/api/v1/users/{self.ravi.id}/follow/').status_code, 404)
        self.assertEqual(self.client.get(f'/api/v1/users/{self.ravi.id}/followers/').status_code, 404)

    def test_comment_delete_on_another_post_is_not_found(self):
        post_id = self.client_for(self.ravi).post('/api/v1/posts/', {'body': 'One'}, format='json').data['data']['id']
        other_id = self.client.post('/api/v1/posts/', {'body': 'Two'}, format='json').data['data']['id']
        comment_id = self.client.post(f'/api/v1/posts/{post_id}/comments/', {'body': 'Nice'}, format='json').data['data']['id']
        response = self.client.delete(f'/api/v1/posts/{other_id}/comments/{comment_id}/')
        self.assertEqual(response.status_code, 404)
        self.assertEqual(response.data['code'], 'not_found')
