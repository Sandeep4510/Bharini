import json
from io import BytesIO

from django.contrib.auth import get_user_model
from django.core.files.uploadedfile import SimpleUploadedFile
from PIL import Image
from rest_framework.test import APITestCase

from production_posts.models import Post, PostComment, PostLike
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
        self.assertIn('post_type', response.json()['field_errors'])

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
        self.assertIn('image', response.json()['field_errors'])


class OpportunitiesTests(APITestCase):
    def test_casting_calls_in_my_city_come_first(self):
        from profiles.models import ArtistProfile
        from production_posts.models import CastingCall, Post as CastingPost

        owner = User.objects.create_user('studio@example.com', 'StrongPass123!', role='production_house')
        house = ProductionProfile.objects.create(owner=owner, kind='house', name='Studio')
        artist = User.objects.create_user('actor@example.com', 'StrongPass123!', role='artist')
        ArtistProfile.objects.create(user=artist, disciplines=['actor'], location='Mangaluru, Karnataka')

        def casting(body, location):
            post = CastingPost.objects.create(production=house, post_type='casting_call', body=body)
            CastingCall.objects.create(post=post, age_min=18, age_max=30, languages='Kannada', location=location, approx_pay='Paid')
            return post.id

        local = casting('Local role', 'Mangaluru')
        casting('Far role', 'Mumbai')  # newer, but not in my city
        CastingPost.objects.create(production=house, body='Just an update')  # not a casting call

        self.client.force_authenticate(artist)
        posts = self.client.get('/api/v1/feed/opportunities/').data['data']['posts']
        self.assertEqual([(p['body'], p['near_you']) for p in posts], [('Local role', True), ('Far role', False)])
        self.assertEqual(posts[0]['id'], local)


class PostValidationTests(APITestCase):
    def setUp(self):
        self.owner = User.objects.create_user('studio@example.com', 'StrongPass123!', role='production_house')
        self.profile = ProductionProfile.objects.create(owner=self.owner, name='Kumar Films', kind='house')
        self.client.force_authenticate(self.owner)

    def payload(self, body='Role open', **casting_overrides):
        casting = {'age_min': 20, 'age_max': 30, 'gender': 'any', 'languages': 'Hindi', 'location': 'Mumbai', 'approx_pay': 'Paid'}
        casting.update(casting_overrides)
        return {'post_type': 'casting_call', 'body': body, 'casting': casting}

    def post_with(self, data):
        return self.client.post('/api/v1/feed/', data, format='json')

    def test_feed_requires_login(self):
        self.client.force_authenticate(None)
        self.assertEqual(self.client.get('/api/v1/feed/').status_code, 401)
        self.assertEqual(self.client.post('/api/v1/feed/', self.payload(), format='json').status_code, 401)

    def test_body_is_required_and_capped_at_2000(self):
        self.assertEqual(self.post_with(self.payload(body='')).status_code, 400)
        self.assertEqual(self.post_with(self.payload(body='x' * 2001)).status_code, 400)
        self.assertEqual(self.post_with(self.payload(body='x' * 2000)).status_code, 201)

    def test_gender_must_be_a_known_choice(self):
        self.assertEqual(self.post_with(self.payload(gender='robot')).status_code, 400)

    def test_required_casting_fields_are_enforced(self):
        for field in ['age_min', 'age_max', 'languages', 'location', 'approx_pay']:
            data = self.payload()
            del data['casting'][field]
            self.assertEqual(self.post_with(data).status_code, 400, field)

    def test_ages_must_be_non_negative_and_equal_bounds_are_allowed(self):
        self.assertEqual(self.post_with(self.payload(age_min=-1)).status_code, 400)
        self.assertEqual(self.post_with(self.payload(age_min=25, age_max=25)).status_code, 201)

    def test_error_names_the_casting_key_when_details_are_missing(self):
        data = self.payload()
        del data['casting']
        response = self.post_with(data)
        self.assertEqual(response.status_code, 400)
        self.assertIn('casting', response.json()['field_errors'])

    def test_hashtags_are_lowercased_deduplicated_and_in_order(self):
        data = self.post_with(self.payload(body='#Tamil #tamil #Hindi, #TAMIL and #hindi!')).json()['data']
        self.assertEqual(data['hashtags'], ['tamil', 'hindi'])

    def test_multipart_casting_must_be_valid_json(self):
        response = self.client.post('/api/v1/feed/', {'post_type': 'casting_call', 'body': 'x', 'casting': '{not json'}, format='multipart')
        self.assertEqual(response.status_code, 400)
        self.assertIn('casting', response.json()['field_errors'])

    def test_multipart_casting_must_be_an_object(self):
        for raw in ['[1, 2]', 'null', '"text"', '42']:
            response = self.client.post('/api/v1/feed/', {'post_type': 'casting_call', 'body': 'x', 'casting': raw}, format='multipart')
            self.assertEqual(response.status_code, 400, raw)

    def test_new_post_starts_with_zero_counts_and_is_not_liked(self):
        data = self.post_with(self.payload()).json()['data']
        self.assertEqual((data['like_count'], data['comment_count'], data['share_count'], data['is_liked']), (0, 0, 0, False))
        self.assertEqual(data['production']['id'], self.profile.id)
        self.assertEqual(data['production']['kind'], 'house')

    def test_client_cannot_set_share_count_or_hashtags(self):
        data = self.payload(body='#real')
        data.update({'share_count': 99, 'hashtags': ['fake']})
        response = self.post_with(data).json()['data']
        self.assertEqual((response['share_count'], response['hashtags']), (0, ['real']))

    def test_casting_call_without_image_has_null_image(self):
        self.assertIsNone(self.post_with(self.payload()).json()['data']['image'])

    def test_image_must_be_a_real_image_when_sent_as_json_string(self):
        upload = SimpleUploadedFile('notes.txt', b'nope', content_type='text/plain')
        form = {'post_type': 'casting_call', 'body': 'x', 'image': upload, 'casting': json.dumps(self.payload()['casting'])}
        self.assertEqual(self.client.post('/api/v1/feed/', form, format='multipart').status_code, 400)

    def test_post_list_and_detail_counts_reflect_engagement(self):
        post_id = self.post_with(self.payload()).json()['data']['id']
        other = User.objects.create_user('fan@example.com', 'StrongPass123!', role='artist')
        PostLike.objects.create(post_id=post_id, user=other)
        PostComment.objects.create(post_id=post_id, author=other, body='Yes')
        self.client.post(f'/api/v1/feed/{post_id}/share/')
        feed = self.client.get('/api/v1/feed/').json()['data']['results']
        self.assertEqual((feed[0]['like_count'], feed[0]['comment_count'], feed[0]['share_count']), (1, 1, 1))


class PostFeedPaginationTests(APITestCase):
    def setUp(self):
        self.owner = User.objects.create_user('pager@example.com', 'StrongPass123!', role='production_house')
        self.profile = ProductionProfile.objects.create(owner=self.owner, name='Pager Films', kind='house')
        self.client.force_authenticate(self.owner)

    def make_posts(self, count):
        for index in range(count):
            Post.objects.create(production=self.profile, post_type=Post.Type.CASTING_CALL, body=f'Role {index}')

    def test_feed_is_newest_first_and_pages_of_20(self):
        self.make_posts(21)
        first = self.client.get('/api/v1/feed/').json()['data']
        self.assertEqual(len(first['results']), 20)
        self.assertEqual(first['results'][0]['body'], 'Role 20')
        self.assertIsNotNone(first['next'])
        second = self.client.get(first['next']).json()['data']
        self.assertEqual([p['body'] for p in second['results']], ['Role 0'])
        self.assertIsNone(second['next'])

    def test_feed_has_no_duplicates_across_pages(self):
        self.make_posts(45)
        seen = []
        url = '/api/v1/feed/'
        while url:
            page = self.client.get(url).json()['data']
            seen += [p['id'] for p in page['results']]
            url = page['next']
        self.assertEqual(len(seen), 45)
        self.assertEqual(len(set(seen)), 45)

    def test_production_feed_only_pages_its_own_posts(self):
        self.make_posts(3)
        other = ProductionProfile.objects.create(owner=User.objects.create_user('o@example.com', 'StrongPass123!', role='production_house'), name='Other', kind='house')
        Post.objects.create(production=other, post_type=Post.Type.CASTING_CALL, body='Elsewhere')
        data = self.client.get(f'/api/v1/productions/{self.profile.pk}/posts/').json()['data']
        self.assertEqual(len(data['results']), 3)
        self.assertTrue(all(p['production']['id'] == self.profile.id for p in data['results']))

    def test_production_posts_unknown_profile_is_404(self):
        response = self.client.get('/api/v1/productions/999999/posts/')
        self.assertEqual((response.status_code, response.json()['code']), (404, 'not_found'))

    def test_deleting_production_removes_its_posts(self):
        self.make_posts(2)
        self.profile.delete()
        self.assertFalse(Post.objects.exists())


class PostEngagementTests(APITestCase):
    def setUp(self):
        self.owner = User.objects.create_user('host@example.com', 'StrongPass123!', role='production_house')
        self.fan = User.objects.create_user('fanatic@example.com', 'StrongPass123!', first_name='Ira', last_name='Shah', role='artist')
        self.profile = ProductionProfile.objects.create(owner=self.owner, name='Host Films', kind='house')
        self.post = Post.objects.create(production=self.profile, post_type=Post.Type.CASTING_CALL, body='Open call')
        self.client.force_authenticate(self.fan)

    def test_engagement_endpoints_require_login(self):
        self.client.force_authenticate(None)
        self.assertEqual(self.client.post(f'/api/v1/feed/{self.post.id}/like/').status_code, 401)
        self.assertEqual(self.client.post(f'/api/v1/feed/{self.post.id}/share/').status_code, 401)
        self.assertEqual(self.client.post(f'/api/v1/feed/{self.post.id}/comments/', {'body': 'x'}, format='json').status_code, 401)
        self.assertEqual(self.client.get(f'/api/v1/feed/{self.post.id}/comments/').status_code, 401)

    def test_like_on_unknown_post_is_404(self):
        self.assertEqual(self.client.post('/api/v1/feed/999999/like/').json()['code'], 'not_found')
        self.assertEqual(self.client.delete('/api/v1/feed/999999/like/').status_code, 404)

    def test_unlike_without_a_like_is_harmless(self):
        response = self.client.delete(f'/api/v1/feed/{self.post.id}/like/')
        self.assertEqual(response.status_code, 200)
        self.assertEqual(response.json()['data'], {'like_count': 0, 'is_liked': False})

    def test_likes_count_each_user_once(self):
        self.client.post(f'/api/v1/feed/{self.post.id}/like/')
        self.client.post(f'/api/v1/feed/{self.post.id}/like/')
        other = User.objects.create_user('second@example.com', 'StrongPass123!', role='artist')
        self.client.force_authenticate(other)
        self.assertEqual(self.client.post(f'/api/v1/feed/{self.post.id}/like/').json()['data']['like_count'], 2)
        self.assertEqual(Post.objects.get(pk=self.post.pk).likes.count(), 2)

    def test_is_liked_is_per_viewer(self):
        self.client.post(f'/api/v1/feed/{self.post.id}/like/')
        self.assertTrue(self.client.get(f'/api/v1/productions/{self.profile.pk}/posts/').json()['data']['results'][0]['is_liked'])
        self.client.force_authenticate(self.owner)
        self.assertFalse(self.client.get(f'/api/v1/productions/{self.profile.pk}/posts/').json()['data']['results'][0]['is_liked'])

    def test_share_count_increments_on_every_call(self):
        self.client.post(f'/api/v1/feed/{self.post.id}/share/')
        self.assertEqual(self.client.post(f'/api/v1/feed/{self.post.id}/share/').json()['data']['share_count'], 2)

    def test_share_on_unknown_post_is_404(self):
        self.assertEqual(self.client.post('/api/v1/feed/999999/share/').status_code, 404)

    def test_comment_length_and_presence_are_validated(self):
        url = f'/api/v1/feed/{self.post.id}/comments/'
        response = self.client.post(url, {'body': ''}, format='json')
        self.assertEqual((response.status_code, response.json()['code']), (400, 'validation_error'))
        self.assertEqual(self.client.post(url, {'body': 'x' * 501}, format='json').status_code, 400)
        self.assertEqual(self.client.post(url, {'body': 'x' * 500}, format='json').status_code, 201)

    def test_comment_on_unknown_post_is_404(self):
        self.assertEqual(self.client.post('/api/v1/feed/999999/comments/', {'body': 'hi'}, format='json').status_code, 404)
        self.assertEqual(self.client.get('/api/v1/feed/999999/comments/').status_code, 404)

    def test_comments_are_oldest_first_and_show_author_name(self):
        url = f'/api/v1/feed/{self.post.id}/comments/'
        self.client.post(url, {'body': 'First'}, format='json')
        self.client.post(url, {'body': 'Second'}, format='json')
        results = self.client.get(url).json()['data']['results']
        self.assertEqual([c['body'] for c in results], ['First', 'Second'])
        self.assertEqual(results[0]['author_name'], 'Ira Shah')
        self.assertEqual(set(results[0]), {'id', 'body', 'author_name', 'created_at'})

    def test_comments_page_at_50(self):
        for index in range(51):
            PostComment.objects.create(post=self.post, author=self.fan, body=f'c{index}')
        url = f'/api/v1/feed/{self.post.id}/comments/'
        first = self.client.get(url).json()['data']
        self.assertEqual(len(first['results']), 50)
        self.assertEqual(len(self.client.get(first['next']).json()['data']['results']), 1)


class OpportunitiesEdgeTests(APITestCase):
    def setUp(self):
        self.owner = User.objects.create_user('casting@example.com', 'StrongPass123!', role='production_house')
        self.house = ProductionProfile.objects.create(owner=self.owner, name='Casting House', kind='house')

    def add_call(self, body, location='Mumbai'):
        from production_posts.models import CastingCall
        post = Post.objects.create(production=self.house, post_type=Post.Type.CASTING_CALL, body=body)
        CastingCall.objects.create(post=post, age_min=18, age_max=30, languages='Hindi', location=location, approx_pay='Paid')
        return post

    def test_opportunities_require_login(self):
        self.assertEqual(self.client.get('/api/v1/feed/opportunities/').status_code, 401)

    def test_without_artist_location_everything_is_newest_first_and_not_near(self):
        self.add_call('Old')
        self.add_call('New')
        artist = User.objects.create_user('noloc@example.com', 'StrongPass123!', role='artist')
        self.client.force_authenticate(artist)
        posts = self.client.get('/api/v1/feed/opportunities/').json()['data']['posts']
        self.assertEqual([(p['body'], p['near_you']) for p in posts], [('New', False), ('Old', False)])

    def test_list_is_capped_at_20(self):
        for index in range(25):
            self.add_call(f'Call {index}')
        artist = User.objects.create_user('busy@example.com', 'StrongPass123!', role='artist')
        self.client.force_authenticate(artist)
        self.assertEqual(len(self.client.get('/api/v1/feed/opportunities/').json()['data']['posts']), 20)

    def test_city_match_ignores_case_and_text_after_comma(self):
        from profiles.models import ArtistProfile
        self.add_call('Far')
        self.add_call('Near', location='MANGALURU, Karnataka')
        artist = User.objects.create_user('local@example.com', 'StrongPass123!', role='artist')
        ArtistProfile.objects.create(user=artist, disciplines=['actor'], location='mangaluru, Karnataka')
        self.client.force_authenticate(artist)
        posts = self.client.get('/api/v1/feed/opportunities/').json()['data']['posts']
        self.assertEqual([(p['body'], p['near_you']) for p in posts], [('Near', True), ('Far', False)])

    def test_production_viewer_gets_list_without_city_ranking(self):
        self.add_call('Anywhere')
        self.client.force_authenticate(self.owner)
        posts = self.client.get('/api/v1/feed/opportunities/').json()['data']['posts']
        self.assertEqual([(p['body'], p['near_you']) for p in posts], [('Anywhere', False)])
