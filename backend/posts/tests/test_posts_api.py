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
        self.assertEqual([post['body'] for post in posts], ['On set', 'First audition done!'])
