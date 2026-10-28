import os
import shutil
import tempfile
import wave
from datetime import timedelta
from io import BytesIO
from unittest import mock

import cv2
import numpy as np
from django.contrib.auth import get_user_model
from django.core import mail
from django.core.cache import cache
from django.core.exceptions import ValidationError
from django.core.files.uploadedfile import SimpleUploadedFile
from django.test import TestCase, override_settings
from django.utils import timezone
from PIL import Image
from rest_framework.test import APIClient

from accounts.mail import _send
from profiles.face import check_face
from profiles.models import ArtistProfile, PortfolioMedia, ProfileDocument

User = get_user_model()

MEDIA_ROOT = tempfile.mkdtemp()


def make_image(name='photo.jpg', size=(400, 400)):
    output = BytesIO()
    Image.new('RGB', size, (180, 140, 120)).save(output, format='JPEG')
    return SimpleUploadedFile(name, output.getvalue(), content_type='image/jpeg')


def make_video(seconds, fps=10):
    fd, path = tempfile.mkstemp(suffix='.mp4')
    os.close(fd)
    writer = cv2.VideoWriter(path, cv2.VideoWriter_fourcc(*'mp4v'), fps, (64, 64))
    for _ in range(int(seconds * fps)):
        writer.write(np.zeros((64, 64, 3), dtype=np.uint8))
    writer.release()
    with open(path, 'rb') as handle:
        data = handle.read()
    os.remove(path)
    return SimpleUploadedFile('clip.mp4', data, content_type='video/mp4')


def make_audio(seconds, rate=8000):
    output = BytesIO()
    with wave.open(output, 'wb') as wav:
        wav.setnchannels(1)
        wav.setsampwidth(1)
        wav.setframerate(rate)
        wav.writeframes(b'\x80' * int(seconds * rate))
    return SimpleUploadedFile('song.wav', output.getvalue(), content_type='audio/wav')


@override_settings(MEDIA_ROOT=MEDIA_ROOT, EMAIL_BACKEND='django.core.mail.backends.locmem.EmailBackend')
@mock.patch('profiles.views.send_mail_in_background', _send)  # send synchronously so mail.outbox fills
@mock.patch('profiles.media.check_face')
class ProfileApiTests(TestCase):
    @classmethod
    def tearDownClass(cls):
        super().tearDownClass()
        shutil.rmtree(MEDIA_ROOT, ignore_errors=True)

    def setUp(self):
        cache.clear()  # throttle counters live in the process-local cache
        self.client = APIClient()
        self.user = User.objects.create_user(
            email='artist@example.com',
            first_name='Asha',
            last_name='Rao',
            password='StrongPass123!',
            role='artist',
            is_verified=True,
        )
        self.client.force_authenticate(self.user)

    def complete_required_fields(self):
        response = self.client.patch('/api/v1/profile/', {
            'username': 'Asha.Rao',
            'disciplines': ['actor'],
            'profile_photo': make_image(),
            'bio': 'Theatre actor from Mangaluru.',
            'gender': 'female',
            'date_of_birth': '1998-04-12',
            'height_cm': 165,
            'location': 'Mangaluru, Karnataka',
            'phone': '+919876543210',
        }, format='multipart')
        self.assertEqual(response.status_code, 200, response.data)
        self.assertEqual(response.data['data']['username'], 'asha.rao')
        self.client.put('/api/v1/profile/languages/', {'languages': [{'language': 'kannada', 'level': 'native'}]}, format='json')

    def test_required_fields_drive_onboarding_complete(self, check_face_mock):
        response = self.client.get('/api/v1/profile/')
        self.assertEqual(response.status_code, 200)
        self.assertFalse(response.data['data']['onboarding_complete'])
        self.assertIn('disciplines', response.data['data']['missing_fields'])

        self.complete_required_fields()
        data = self.client.get('/api/v1/profile/').data['data']
        self.assertTrue(data['onboarding_complete'])
        self.assertLess(data['completion_percent'], 100)
        self.assertEqual([section['discipline'] for section in data['media_slots']], ['actor'])
        self.assertEqual(len(data['media_slots'][0]['slots']), 9)

        self.client.force_authenticate(User.objects.get(pk=self.user.pk))  # drop the stale cached artist_profile
        me = self.client.get('/api/v1/auth/me/').data['data']
        self.assertTrue(me['onboarding_complete'])

    def test_phone_must_be_indian_mobile(self, check_face_mock):
        for phone in ('+14155550123', '+91123456789', '+9198765432101', '9876543210'):
            response = self.client.patch('/api/v1/profile/', {'phone': phone}, format='json')
            self.assertEqual(response.status_code, 400, phone)
        response = self.client.patch('/api/v1/profile/', {'phone': '+919876543210'}, format='json')
        self.assertEqual(response.status_code, 200)

    def test_username_unique_with_suggestions(self, check_face_mock):
        other = User.objects.create_user(
            email='other@example.com', first_name='Ravi', last_name='K', password='StrongPass123!', role='artist',
        )
        ArtistProfile.objects.create(user=other, username='asha')

        response = self.client.patch('/api/v1/profile/', {'username': 'ASHA'}, format='json')
        self.assertEqual(response.status_code, 400)
        self.assertIn('username', response.data['field_errors'])
        response = self.client.patch('/api/v1/profile/', {'username': 'a b'}, format='json')
        self.assertEqual(response.status_code, 400)

        data = self.client.get('/api/v1/profile/username-check/?username=Asha').data['data']
        self.assertFalse(data['available'])
        self.assertTrue(data['suggestions'])
        self.assertNotIn('asha', data['suggestions'])
        for suggestion in data['suggestions']:
            self.assertEqual(self.client.patch('/api/v1/profile/', {'username': suggestion}, format='json').status_code, 200)

        data = self.client.get('/api/v1/profile/username-check/?username=asha_new').data['data']
        self.assertTrue(data['available'])

    def test_documents_upload_validate_and_delete(self, check_face_mock):
        pdf = SimpleUploadedFile('award.pdf', b'%PDF-1.4 test', content_type='application/pdf')
        response = self.client.post('/api/v1/profile/documents/', {'kind': 'certificate', 'title': 'Diploma', 'file': pdf}, format='multipart')
        self.assertEqual(response.status_code, 200, response.data)
        self.assertEqual(response.data['data']['documents'][0]['title'], 'Diploma')

        fake = SimpleUploadedFile('fake.pdf', b'MZ not a pdf', content_type='application/pdf')
        response = self.client.post('/api/v1/profile/documents/', {'kind': 'achievement', 'title': 'Award', 'file': fake}, format='multipart')
        self.assertEqual(response.status_code, 400)
        response = self.client.post('/api/v1/profile/documents/', {'kind': 'achievement', 'title': 'Award', 'file': make_image('award.png')}, format='multipart')
        self.assertEqual(response.status_code, 200, response.data)

        document = ProfileDocument.objects.get(title='Diploma')
        response = self.client.delete(f'/api/v1/profile/documents/{document.pk}/')
        self.assertEqual([item['title'] for item in response.data['data']['documents']], ['Award'])
        self.assertFalse(document.file.storage.exists(document.file.name))

    def test_height_required_only_for_actors(self, check_face_mock):
        data = self.client.patch('/api/v1/profile/', {'disciplines': ['singer']}, format='json').data['data']
        self.assertNotIn('height_cm', data['missing_fields'])
        data = self.client.patch('/api/v1/profile/', {'disciplines': ['singer', 'actor']}, format='json').data['data']
        self.assertIn('height_cm', data['missing_fields'])

    def test_profile_photo_without_face_is_rejected(self, check_face_mock):
        check_face_mock.side_effect = ValidationError('no face')
        response = self.client.patch('/api/v1/profile/', {'profile_photo': make_image()}, format='multipart')
        self.assertEqual(response.status_code, 400)
        self.assertIn('profile_photo', response.data['field_errors'])

    def test_disciplines_cannot_be_empty_and_links_need_allowed_host(self, check_face_mock):
        response = self.client.patch('/api/v1/profile/', {'disciplines': []}, format='json')
        self.assertEqual(response.status_code, 400)

        response = self.client.patch('/api/v1/profile/', {'showreel_links': ['https://example.com/film']}, format='json')
        self.assertEqual(response.status_code, 400)

        response = self.client.patch('/api/v1/profile/', {'showreel_links': ['https://youtu.be/abc123']}, format='json')
        self.assertEqual(response.status_code, 200)

    def test_languages_replace_and_reject_duplicates(self, check_face_mock):
        response = self.client.put('/api/v1/profile/languages/', {'languages': [
            {'language': 'hindi', 'level': 'fluent'},
            {'language': 'hindi', 'level': 'basic'},
        ]}, format='json')
        self.assertEqual(response.status_code, 400)

        response = self.client.put('/api/v1/profile/languages/', {'languages': [
            {'language': 'hindi', 'level': 'fluent'},
            {'language': 'english', 'level': 'basic'},
        ]}, format='json')
        self.assertEqual(response.status_code, 200)
        self.assertEqual(len(response.data['data']['languages']), 2)

    def test_casting_photo_upload_and_replace(self, check_face_mock):
        response = self.client.put('/api/v1/profile/photos/left/', {'file': make_image()}, format='multipart')
        self.assertEqual(response.status_code, 200)
        first_name = ArtistProfile.objects.get(user=self.user).photo_left.name
        check_face_mock.assert_called_once()
        self.assertEqual(check_face_mock.call_args.args[1], 'left')

        self.client.put('/api/v1/profile/photos/left/', {'file': make_image()}, format='multipart')
        profile = ArtistProfile.objects.get(user=self.user)
        self.assertNotEqual(profile.photo_left.name, first_name)
        self.assertFalse(profile.photo_left.storage.exists(first_name))

        response = self.client.put('/api/v1/profile/photos/back/', {'file': make_image()}, format='multipart')
        self.assertEqual(response.status_code, 404)

    def test_media_slots_enforce_discipline_and_duration(self, check_face_mock):
        self.client.patch('/api/v1/profile/', {'disciplines': ['actor', 'musician']}, format='json')

        response = self.client.put('/api/v1/profile/media/actor/love/', {'file': make_video(11)}, format='multipart')
        self.assertEqual(response.status_code, 400)
        self.assertEqual(response.data['code'], 'invalid_upload')

        response = self.client.put('/api/v1/profile/media/actor/love/', {'file': make_video(5)}, format='multipart')
        self.assertEqual(response.status_code, 200, response.data)
        first_name = PortfolioMedia.objects.get(profile__user=self.user, slot='love').file.name

        self.client.put('/api/v1/profile/media/actor/love/', {'file': make_video(4)}, format='multipart')
        item = PortfolioMedia.objects.get(profile__user=self.user, slot='love')
        self.assertFalse(item.file.storage.exists(first_name))

        response = self.client.put('/api/v1/profile/media/musician/audio_1/', {'file': make_audio(181)}, format='multipart')
        self.assertEqual(response.status_code, 400)
        response = self.client.put('/api/v1/profile/media/musician/audio_1/', {'file': make_audio(170)}, format='multipart')
        self.assertEqual(response.status_code, 200, response.data)

        response = self.client.put('/api/v1/profile/media/choreographer/video_1/', {'file': make_video(5)}, format='multipart')
        self.assertEqual(response.status_code, 400)
        self.assertEqual(response.data['code'], 'discipline_not_selected')

        response = self.client.put('/api/v1/profile/media/actor/joy/', {'file': make_video(5)}, format='multipart')
        self.assertEqual(response.status_code, 404)

    def test_choreographer_accepts_two_minute_clip(self, check_face_mock):
        self.client.patch('/api/v1/profile/', {'disciplines': ['choreographer']}, format='json')
        response = self.client.put('/api/v1/profile/media/choreographer/video_1/', {'file': make_video(118, fps=2)}, format='multipart')
        self.assertEqual(response.status_code, 200, response.data)

    def test_cinematographer_images_and_thirty_second_videos(self, check_face_mock):
        self.client.patch('/api/v1/profile/', {'disciplines': ['cinematographer']}, format='json')
        response = self.client.put('/api/v1/profile/media/cinematographer/image_1/', {'file': make_image()}, format='multipart')
        self.assertEqual(response.status_code, 200, response.data)
        item = PortfolioMedia.objects.get(profile__user=self.user, slot='image_1')
        self.assertEqual(item.kind, 'image')
        self.assertTrue(item.file.name.endswith('.jpg'))
        check_face_mock.assert_not_called()

        bad = SimpleUploadedFile('frame.jpg', b'not an image', content_type='image/jpeg')
        response = self.client.put('/api/v1/profile/media/cinematographer/image_2/', {'file': bad}, format='multipart')
        self.assertEqual(response.status_code, 400)

        response = self.client.put('/api/v1/profile/media/cinematographer/video_1/', {'file': make_video(31, fps=2)}, format='multipart')
        self.assertEqual(response.status_code, 400)
        response = self.client.put('/api/v1/profile/media/cinematographer/video_1/', {'file': make_video(29, fps=2)}, format='multipart')
        self.assertEqual(response.status_code, 200, response.data)
        slots = response.data['data']['media_slots'][0]['slots']
        self.assertEqual([slot['kind'] for slot in slots].count('image'), 5)
        self.assertEqual([slot['kind'] for slot in slots].count('video'), 5)

    def test_alt_email_pin_flow(self, check_face_mock):
        self.client.patch('/api/v1/profile/', {'alt_email': 'asha.alt@example.com'}, format='json')
        response = self.client.post('/api/v1/profile/alt-email/send-pin/')
        self.assertEqual(response.status_code, 200)
        self.assertEqual(mail.outbox[-1].to, ['asha.alt@example.com'])
        pin = next(word for word in mail.outbox[-1].body.split() if word.strip('.').isdigit() and len(word.strip('.')) == 6).strip('.')

        wrong = '000000' if pin != '000000' else '111111'
        response = self.client.post('/api/v1/profile/alt-email/verify/', {'pin': wrong}, format='json')
        self.assertEqual(response.data['code'], 'invalid_pin')

        profile = ArtistProfile.objects.get(user=self.user)
        profile.alt_email_pin_expires_at = timezone.now() - timedelta(seconds=1)
        profile.save()
        response = self.client.post('/api/v1/profile/alt-email/verify/', {'pin': pin}, format='json')
        self.assertEqual(response.data['code'], 'pin_expired')

        self.client.post('/api/v1/profile/alt-email/send-pin/')
        pin = next(word for word in mail.outbox[-1].body.split() if word.strip('.').isdigit() and len(word.strip('.')) == 6).strip('.')
        profile.refresh_from_db()
        profile.alt_email_pin_attempts = 5
        profile.save()
        response = self.client.post('/api/v1/profile/alt-email/verify/', {'pin': pin}, format='json')
        self.assertEqual(response.data['code'], 'pin_expired')

        self.client.post('/api/v1/profile/alt-email/send-pin/')
        pin = next(word for word in mail.outbox[-1].body.split() if word.strip('.').isdigit() and len(word.strip('.')) == 6).strip('.')
        response = self.client.post('/api/v1/profile/alt-email/verify/', {'pin': pin}, format='json')
        self.assertEqual(response.status_code, 200)
        self.assertTrue(response.data['data']['alt_email_verified'])

        response = self.client.patch('/api/v1/profile/', {'alt_email': 'other@example.com'}, format='json')
        self.assertFalse(response.data['data']['alt_email_verified'])

    def test_non_artist_is_forbidden(self, check_face_mock):
        producer = User.objects.create_user(
            email='studio@example.com',
            first_name='Studio',
            last_name='One',
            password='StrongPass123!',
            role='production_house',
            is_verified=True,
        )
        self.client.force_authenticate(producer)
        self.assertEqual(self.client.get('/api/v1/profile/').status_code, 403)


class FaceCheckTests(TestCase):
    def test_profile_photo_allows_more_than_one_face(self):
        two = [(10, 10, 100, 100), (200, 10, 90, 90)]
        with mock.patch('profiles.face._detect', return_value=two):
            check_face(Image.new('RGB', (400, 400)), 'profile')  # no error
            with self.assertRaises(ValidationError):
                check_face(Image.new('RGB', (400, 400)), 'center')

    def test_blank_image_has_no_face(self):
        with self.assertRaises(ValidationError):
            check_face(Image.new('RGB', (400, 400), (200, 200, 200)), 'profile')


class ArtistDirectoryFilterTests(TestCase):
    def setUp(self):
        self.client = APIClient()
        self.client.force_authenticate(User.objects.create_user('viewer@example.com', 'StrongPass123!', role='production_house'))
        today = timezone.localdate()
        self.young_actor = self.make_artist('young@example.com', ['actor'], 'female', today.replace(year=today.year - 22))
        self.older_singer = self.make_artist('older@example.com', ['singer'], 'male', today.replace(year=today.year - 40))
        self.no_dob = self.make_artist('nodob@example.com', ['actor'], 'female', None)

    def make_artist(self, email, disciplines, gender, date_of_birth):
        user = User.objects.create_user(email, 'StrongPass123!', role='artist')
        return ArtistProfile.objects.create(user=user, disciplines=disciplines, gender=gender, date_of_birth=date_of_birth)

    def ids(self, **params):
        response = self.client.get('/api/v1/profile/directory/', params)
        self.assertEqual(response.status_code, 200)
        return {item['id'] for item in response.json()['data']['results']}

    def test_filters_by_age_gender_and_discipline(self):
        self.assertEqual(self.ids(age_min=20, age_max=25), {self.young_actor.id})
        self.assertEqual(self.ids(age_min=30), {self.older_singer.id})
        self.assertEqual(self.ids(gender='female'), {self.young_actor.id, self.no_dob.id})
        self.assertEqual(self.ids(discipline='singer'), {self.older_singer.id})
        self.assertEqual(self.ids(gender='female', discipline='actor', age_max=25), {self.young_actor.id})

    def test_filters_by_language(self):
        self.young_actor.languages.create(language='hindi', level='fluent')
        self.assertEqual(self.ids(language='hindi'), {self.young_actor.id})

    def test_invalid_filter_is_rejected(self):
        self.assertEqual(self.client.get('/api/v1/profile/directory/', {'gender': 'alien'}).status_code, 400)
        self.assertEqual(self.client.get('/api/v1/profile/directory/', {'age_min': 200}).status_code, 400)


class ArtistTestBase(TestCase):
    def setUp(self):
        cache.clear()
        self.client = APIClient()
        self.user = User.objects.create_user(
            email='artist@example.com',
            first_name='Asha',
            last_name='Rao',
            password='StrongPass123!',
            role='artist',
            is_verified=True,
        )
        self.client.force_authenticate(self.user)


@override_settings(MEDIA_ROOT=MEDIA_ROOT, EMAIL_BACKEND='django.core.mail.backends.locmem.EmailBackend')
@mock.patch('profiles.views.send_mail_in_background', _send)
@mock.patch('profiles.media.check_face')
class ProfileValidationTests(ArtistTestBase):
    def test_options_list_every_choice(self, check_face_mock):
        data = self.client.get('/api/v1/profile/options/').data['data']
        self.assertIn('cinematographer', [item['value'] for item in data['disciplines']])
        self.assertIn('certificate', [item['value'] for item in data['document_kinds']])
        self.assertIn('kannada', [item['value'] for item in data['languages']])
        self.assertIn('native', [item['value'] for item in data['language_levels']])

    def test_profile_rejects_out_of_range_values(self, check_face_mock):
        bad_values = {
            'gender': 'alien',
            'height_cm': 49,
            'bio': 'x' * 1001,
            'date_of_birth': timezone.localdate().isoformat(),
            'instagram_url': 'https://example.com/asha',
            'facebook_url': 'https://instagram.com/asha',
            'showreel_links': ['https://vimeo.com/1', 'https://vimeo.com/2', 'https://vimeo.com/3',
                               'https://vimeo.com/4', 'https://vimeo.com/5', 'https://vimeo.com/6'],
        }
        for field, value in bad_values.items():
            response = self.client.patch('/api/v1/profile/', {field: value}, format='json')
            self.assertEqual(response.status_code, 400, field)
            self.assertEqual(response.data['code'], 'validation_error', field)
            self.assertIn(field, response.data['field_errors'], field)

        response = self.client.patch('/api/v1/profile/', {'date_of_birth': '1899-12-31'}, format='json')
        self.assertEqual(response.status_code, 400)

    def test_minors_need_guardian_consent(self, check_face_mock):
        fifteen = (timezone.localdate() - timedelta(days=15 * 365)).isoformat()  # about 14, never 15 on a leap day
        response = self.client.patch('/api/v1/profile/', {'date_of_birth': fifteen}, format='json')
        self.assertEqual(response.status_code, 400)
        self.assertEqual(set(response.data['field_errors']), {'guardian_name', 'guardian_consent'})

        payload = {'date_of_birth': fifteen, 'guardian_name': ' Lata Rao ', 'guardian_consent': True}
        response = self.client.patch('/api/v1/profile/', payload, format='json')
        self.assertEqual(response.status_code, 200, response.data)
        self.assertEqual(response.data['data']['guardian_name'], 'Lata Rao')
        self.assertIsNotNone(response.data['data']['guardian_consent_at'])
        # consent given once covers later saves; adults need none
        self.assertEqual(self.client.patch('/api/v1/profile/', {'date_of_birth': fifteen}, format='json').status_code, 200)
        self.assertEqual(self.client.patch('/api/v1/profile/', {'date_of_birth': '1998-04-12'}, format='json').status_code, 200)

    def test_valid_social_and_showreel_links_are_saved(self, check_face_mock):
        response = self.client.patch('/api/v1/profile/', {
            'instagram_url': 'https://www.instagram.com/asha',
            'facebook_url': 'https://www.facebook.com/asha',
            'showreel_links': [
                'https://vimeo.com/1', 'https://drive.google.com/file/d/1', 'https://www.youtube.com/watch?v=x',
                'https://youtu.be/a', 'https://vimeo.com/2',
            ],
        }, format='json')
        self.assertEqual(response.status_code, 200, response.data)
        self.assertEqual(response.data['data']['instagram_url'], 'https://www.instagram.com/asha')
        self.assertEqual(len(response.data['data']['showreel_links']), 5)

    def test_alt_email_cannot_equal_login_email(self, check_face_mock):
        response = self.client.patch('/api/v1/profile/', {'alt_email': self.user.email.upper()}, format='json')
        self.assertEqual(response.status_code, 400)
        self.assertIn('alt_email', response.data['field_errors'])

    def test_profile_ignores_fields_it_does_not_own(self, check_face_mock):
        response = self.client.patch('/api/v1/profile/', {'role': 'production_house', 'is_verified': False}, format='json')
        self.assertEqual(response.status_code, 200)
        self.user.refresh_from_db()
        self.assertEqual(self.user.role, 'artist')
        self.assertTrue(self.user.is_verified)

    def test_blank_username_clears_it(self, check_face_mock):
        self.client.patch('/api/v1/profile/', {'username': 'asha_rao'}, format='json')
        response = self.client.patch('/api/v1/profile/', {'username': ''}, format='json')
        self.assertEqual(response.status_code, 200)
        self.assertIsNone(response.data['data']['username'])

    def test_username_check_for_own_name_is_available(self, check_face_mock):
        self.client.patch('/api/v1/profile/', {'username': 'asha_rao'}, format='json')
        data = self.client.get('/api/v1/profile/username-check/?username=asha_rao').data['data']
        self.assertTrue(data['available'])
        self.assertEqual(data['suggestions'], [])

    def test_username_check_rejects_non_artists(self, check_face_mock):
        producer = User.objects.create_user('studio@example.com', 'StrongPass123!', role='production_house')
        self.client.force_authenticate(producer)
        self.assertEqual(self.client.get('/api/v1/profile/username-check/?username=asha').status_code, 403)
        self.assertEqual(self.client.put('/api/v1/profile/languages/', {'languages': []}, format='json').status_code, 403)
        self.assertEqual(self.client.post('/api/v1/profile/documents/', {}, format='multipart').status_code, 403)

    def test_every_profile_endpoint_requires_login(self, check_face_mock):
        anonymous = APIClient()
        self.assertEqual(anonymous.get('/api/v1/profile/').status_code, 401)
        self.assertEqual(anonymous.get('/api/v1/profile/directory/').status_code, 401)
        self.assertEqual(anonymous.get('/api/v1/profile/username-check/?username=asha').status_code, 401)
        self.assertEqual(anonymous.post('/api/v1/profile/alt-email/send-pin/').status_code, 401)


@override_settings(MEDIA_ROOT=MEDIA_ROOT, EMAIL_BACKEND='django.core.mail.backends.locmem.EmailBackend')
@mock.patch('profiles.views.send_mail_in_background', _send)
@mock.patch('profiles.media.check_face')
class ProfileUploadTests(ArtistTestBase):
    def test_photo_delete_removes_slot_and_file(self, check_face_mock):
        self.client.put('/api/v1/profile/photos/left/', {'file': make_image()}, format='multipart')
        name = ArtistProfile.objects.get(user=self.user).photo_left.name

        response = self.client.delete('/api/v1/profile/photos/left/')
        self.assertEqual(response.status_code, 200)
        self.assertIsNone(response.data['data']['photos']['left'])
        profile = ArtistProfile.objects.get(user=self.user)
        self.assertFalse(profile.photo_left)
        self.assertFalse(profile.photo_left.storage.exists(name))

        self.assertEqual(self.client.delete('/api/v1/profile/photos/back/').status_code, 404)

    def test_photo_put_without_file_or_wrong_type_is_rejected(self, check_face_mock):
        response = self.client.put('/api/v1/profile/photos/left/', {}, format='multipart')
        self.assertEqual(response.status_code, 400)
        self.assertEqual(response.data['code'], 'validation_error')

        text = SimpleUploadedFile('notes.txt', b'hello', content_type='text/plain')
        response = self.client.put('/api/v1/profile/photos/left/', {'file': text}, format='multipart')
        self.assertEqual(response.status_code, 400)
        self.assertEqual(response.data['code'], 'invalid_upload')

    def test_profile_photo_replacement_deletes_old_file(self, check_face_mock):
        self.client.patch('/api/v1/profile/', {'profile_photo': make_image()}, format='multipart')
        old = ArtistProfile.objects.get(user=self.user).profile_photo.name

        self.client.patch('/api/v1/profile/', {'profile_photo': make_image()}, format='multipart')
        profile = ArtistProfile.objects.get(user=self.user)
        self.assertNotEqual(profile.profile_photo.name, old)
        self.assertFalse(profile.profile_photo.storage.exists(old))

    def test_media_delete_removes_item_and_file(self, check_face_mock):
        self.client.patch('/api/v1/profile/', {'disciplines': ['actor']}, format='json')
        self.client.put('/api/v1/profile/media/actor/love/', {'file': make_video(3)}, format='multipart')
        item = PortfolioMedia.objects.get(profile__user=self.user, slot='love')
        name = item.file.name

        response = self.client.delete('/api/v1/profile/media/actor/love/')
        self.assertEqual(response.status_code, 200)
        self.assertFalse(PortfolioMedia.objects.filter(pk=item.pk).exists())
        self.assertFalse(item.file.storage.exists(name))
        love = response.data['data']['media_slots'][0]['slots'][0]
        self.assertIsNone(love['file'])

    def test_media_rejects_wrong_extension_missing_file_and_unknown_discipline(self, check_face_mock):
        self.client.patch('/api/v1/profile/', {'disciplines': ['actor']}, format='json')

        wav = SimpleUploadedFile('clip.wav', b'RIFF', content_type='audio/wav')
        response = self.client.put('/api/v1/profile/media/actor/love/', {'file': wav}, format='multipart')
        self.assertEqual(response.status_code, 400)
        self.assertEqual(response.data['code'], 'invalid_upload')

        response = self.client.put('/api/v1/profile/media/actor/love/', {}, format='multipart')
        self.assertEqual(response.status_code, 400)
        self.assertEqual(response.data['code'], 'validation_error')

        response = self.client.put('/api/v1/profile/media/dancer/video_1/', {'file': make_video(3)}, format='multipart')
        self.assertEqual(response.status_code, 404)
        self.assertEqual(response.data['code'], 'not_found')

    def test_document_rejects_unknown_kind(self, check_face_mock):
        pdf = SimpleUploadedFile('award.pdf', b'%PDF-1.4 test', content_type='application/pdf')
        response = self.client.post('/api/v1/profile/documents/', {'kind': 'diploma', 'title': 'X', 'file': pdf}, format='multipart')
        self.assertEqual(response.status_code, 400)
        self.assertIn('kind', response.data['field_errors'])

    def test_document_limit_is_enforced(self, check_face_mock):
        profile = ArtistProfile.objects.create(user=self.user)
        ProfileDocument.objects.bulk_create(
            ProfileDocument(profile=profile, kind='certificate', title=f'Doc {n}', file='docs/doc.pdf') for n in range(20)
        )
        pdf = SimpleUploadedFile('award.pdf', b'%PDF-1.4 test', content_type='application/pdf')
        response = self.client.post('/api/v1/profile/documents/', {'kind': 'certificate', 'title': 'Extra', 'file': pdf}, format='multipart')
        self.assertEqual(response.status_code, 400)
        self.assertEqual(response.data['code'], 'document_limit')

    def test_cannot_delete_another_artists_document(self, check_face_mock):
        other = User.objects.create_user('other@example.com', 'StrongPass123!', role='artist')
        other_profile = ArtistProfile.objects.create(user=other)
        document = ProfileDocument.objects.create(profile=other_profile, kind='certificate', title='Theirs', file='docs/x.pdf')

        response = self.client.delete(f'/api/v1/profile/documents/{document.pk}/')
        self.assertEqual(response.status_code, 200)
        self.assertTrue(ProfileDocument.objects.filter(pk=document.pk).exists())


@override_settings(MEDIA_ROOT=MEDIA_ROOT, EMAIL_BACKEND='django.core.mail.backends.locmem.EmailBackend')
@mock.patch('profiles.views.send_mail_in_background', _send)
@mock.patch('profiles.media.check_face')
class ProfileLanguageAndPinTests(ArtistTestBase):
    def test_languages_reject_unknown_language_level_and_empty_list(self, check_face_mock):
        for payload in (
            {'languages': [{'language': 'klingon', 'level': 'native'}]},
            {'languages': [{'language': 'hindi', 'level': 'expert'}]},
            {'languages': []},
        ):
            response = self.client.put('/api/v1/profile/languages/', payload, format='json')
            self.assertEqual(response.status_code, 400, payload)
            self.assertEqual(response.data['code'], 'validation_error')

    def test_languages_put_replaces_previous_list(self, check_face_mock):
        self.client.put('/api/v1/profile/languages/', {'languages': [{'language': 'hindi', 'level': 'fluent'}]}, format='json')
        response = self.client.put('/api/v1/profile/languages/', {'languages': [{'language': 'tamil', 'level': 'basic'}]}, format='json')
        self.assertEqual([item['language'] for item in response.data['data']['languages']], ['tamil'])

    def test_send_pin_requires_alt_email(self, check_face_mock):
        response = self.client.post('/api/v1/profile/alt-email/send-pin/')
        self.assertEqual(response.status_code, 400)
        self.assertIn('alt_email', response.data['field_errors'])
        self.assertEqual(len(mail.outbox), 0)

    def test_send_pin_is_skipped_when_already_verified(self, check_face_mock):
        ArtistProfile.objects.create(user=self.user, alt_email='asha.alt@example.com', alt_email_verified_at=timezone.now())
        response = self.client.post('/api/v1/profile/alt-email/send-pin/')
        self.assertEqual(response.status_code, 200)
        self.assertEqual(response.data['message'], 'This email is already verified.')
        self.assertEqual(len(mail.outbox), 0)

    def test_verify_rejects_malformed_pin(self, check_face_mock):
        self.client.patch('/api/v1/profile/', {'alt_email': 'asha.alt@example.com'}, format='json')
        response = self.client.post('/api/v1/profile/alt-email/verify/', {'pin': 'abc123'}, format='json')
        self.assertEqual(response.status_code, 400)
        self.assertEqual(response.data['code'], 'validation_error')

    def test_verify_without_sent_pin_reports_expired(self, check_face_mock):
        self.client.patch('/api/v1/profile/', {'alt_email': 'asha.alt@example.com'}, format='json')
        response = self.client.post('/api/v1/profile/alt-email/verify/', {'pin': '123456'}, format='json')
        self.assertEqual(response.data['code'], 'pin_expired')

    def test_send_pin_is_throttled(self, check_face_mock):
        self.client.patch('/api/v1/profile/', {'alt_email': 'asha.alt@example.com'}, format='json')
        for _ in range(5):
            self.assertEqual(self.client.post('/api/v1/profile/alt-email/send-pin/').status_code, 200)
        response = self.client.post('/api/v1/profile/alt-email/send-pin/')
        self.assertEqual(response.status_code, 429)
        self.assertIn('detail', response.data)


class ArtistDirectoryPrivacyTests(ArtistTestBase):
    def test_directory_requires_login_and_hides_private_fields(self):
        ArtistProfile.objects.create(
            user=self.user, username='asha_rao', disciplines=['actor'], phone='+919876543210', location='Mangaluru',
        )
        viewer = User.objects.create_user('viewer@example.com', 'StrongPass123!', role='production_house')
        self.client.force_authenticate(viewer)

        results = self.client.get('/api/v1/profile/directory/').data['data']['results']
        self.assertEqual(len(results), 1)
        self.assertEqual(
            set(results[0]),
            {'id', 'user_id', 'username', 'display_name', 'profile_photo', 'disciplines', 'location'},
        )
        self.assertEqual(results[0]['display_name'], 'Asha Rao')

        self.assertEqual(APIClient().get('/api/v1/profile/directory/').status_code, 401)

    def test_directory_skips_profiles_without_disciplines(self):
        ArtistProfile.objects.create(user=self.user)
        viewer = User.objects.create_user('viewer@example.com', 'StrongPass123!', role='production_house')
        self.client.force_authenticate(viewer)
        self.assertEqual(self.client.get('/api/v1/profile/directory/').data['data']['results'], [])
