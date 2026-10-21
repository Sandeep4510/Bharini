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
from django.core.exceptions import ValidationError
from django.core.files.uploadedfile import SimpleUploadedFile
from django.test import TestCase, override_settings
from django.utils import timezone
from PIL import Image
from rest_framework.test import APIClient

from accounts.mail import _send
from profiles.face import check_face
from profiles.models import ArtistProfile, PortfolioMedia

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
            'disciplines': ['actor'],
            'profile_photo': make_image(),
            'bio': 'Theatre actor from Mangaluru.',
            'goal': 'Lead roles in Kannada cinema',
            'gender': 'female',
            'date_of_birth': '1998-04-12',
            'height_cm': 165,
            'location': 'Mangaluru, Karnataka',
            'phone': '+919876543210',
            'alt_email': 'asha.alt@example.com',
        }, format='multipart')
        self.assertEqual(response.status_code, 200, response.data)
        self.client.put('/api/v1/profile/languages/', {'languages': [{'language': 'kannada', 'level': 'native'}]}, format='json')
        self.client.post('/api/v1/profile/alt-email/send-pin/')
        profile = ArtistProfile.objects.get(user=self.user)
        profile.alt_email_verified_at = timezone.now()
        profile.save()

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

        me = self.client.get('/api/v1/auth/me/').data['data']
        self.assertTrue(me['onboarding_complete'])

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
        first_name = PortfolioMedia.objects.get(slot='love').file.name

        self.client.put('/api/v1/profile/media/actor/love/', {'file': make_video(4)}, format='multipart')
        item = PortfolioMedia.objects.get(slot='love')
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

    def test_alt_email_pin_flow(self, check_face_mock):
        self.client.patch('/api/v1/profile/', {'alt_email': 'asha.alt@example.com'}, format='json')
        response = self.client.post('/api/v1/profile/alt-email/send-pin/')
        self.assertEqual(response.status_code, 200)
        self.assertEqual(mail.outbox[-1].to, ['asha.alt@example.com'])
        pin = next(word for word in mail.outbox[-1].body.split() if word.isdigit() and len(word) == 6)

        wrong = '000000' if pin != '000000' else '111111'
        response = self.client.post('/api/v1/profile/alt-email/verify/', {'pin': wrong}, format='json')
        self.assertEqual(response.data['code'], 'invalid_pin')

        profile = ArtistProfile.objects.get(user=self.user)
        profile.alt_email_pin_expires_at = timezone.now() - timedelta(seconds=1)
        profile.save()
        response = self.client.post('/api/v1/profile/alt-email/verify/', {'pin': pin}, format='json')
        self.assertEqual(response.data['code'], 'pin_expired')

        self.client.post('/api/v1/profile/alt-email/send-pin/')
        pin = next(word for word in mail.outbox[-1].body.split() if word.isdigit() and len(word) == 6)
        profile.refresh_from_db()
        profile.alt_email_pin_attempts = 5
        profile.save()
        response = self.client.post('/api/v1/profile/alt-email/verify/', {'pin': pin}, format='json')
        self.assertEqual(response.data['code'], 'pin_expired')

        self.client.post('/api/v1/profile/alt-email/send-pin/')
        pin = next(word for word in mail.outbox[-1].body.split() if word.isdigit() and len(word) == 6)
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
    def test_blank_image_has_no_face(self):
        with self.assertRaises(ValidationError):
            check_face(Image.new('RGB', (400, 400), (200, 200, 200)), 'profile')
