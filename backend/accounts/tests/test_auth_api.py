from django.contrib.auth import get_user_model
from django.contrib.auth.tokens import default_token_generator
from django.test import TestCase
from django.utils.encoding import force_bytes
from django.utils.http import urlsafe_base64_encode
from rest_framework.test import APIClient

User = get_user_model()


class AuthApiTests(TestCase):
    def setUp(self):
        self.client = APIClient()
        self.email = 'artist@example.com'
        self.password = 'StrongPass123!'

    def test_register_creates_unverified_user_and_returns_tokens(self):
        response = self.client.post(
            '/api/v1/auth/register/',
            {
                'email': self.email,
                'first_name': 'Bharini',
                'last_name': 'User',
                'role': 'artist',
                'password': self.password,
                'password_confirm': self.password,
            },
            format='json',
        )

        self.assertEqual(response.status_code, 201)
        self.assertIn('tokens', response.data)
        self.assertIn('access', response.data['tokens'])
        self.assertIn('refresh', response.data['tokens'])
        self.assertFalse(User.objects.get(email=self.email).is_verified)

    def test_login_requires_verification(self):
        User.objects.create_user(
            email=self.email,
            first_name='Bharini',
            last_name='User',
            password=self.password,
            role='artist',
            is_verified=False,
        )

        response = self.client.post(
            '/api/v1/auth/login/',
            {'email': self.email, 'password': self.password},
            format='json',
        )

        self.assertEqual(response.status_code, 400)
        self.assertIn('Please verify your email', str(response.data))

    def test_verify_email_marks_user_verified(self):
        user = User.objects.create_user(
            email=self.email,
            first_name='Bharini',
            last_name='User',
            password=self.password,
            role='artist',
            is_verified=False,
        )
        uid = urlsafe_base64_encode(force_bytes(user.pk))
        token = default_token_generator.make_token(user)

        response = self.client.post(
            '/api/v1/auth/verify-email/',
            {'uid': uid, 'token': token},
            format='json',
        )

        self.assertEqual(response.status_code, 200)
        user.refresh_from_db()
        self.assertTrue(user.is_verified)

    def test_refresh_returns_new_access_token(self):
        user = User.objects.create_user(
            email=self.email,
            first_name='Bharini',
            last_name='User',
            password=self.password,
            role='artist',
            is_verified=True,
        )
        login_response = self.client.post(
            '/api/v1/auth/login/',
            {'email': self.email, 'password': self.password},
            format='json',
        )

        refresh_token = login_response.cookies['refresh_token'].value
        response = self.client.post(
            '/api/v1/auth/refresh/',
            {'refresh': refresh_token},
            format='json',
        )

        self.assertEqual(response.status_code, 200)
        self.assertIn('access', response.data)
        self.assertIn('refresh', response.data)

    def test_password_reset_confirm_resets_password(self):
        user = User.objects.create_user(
            email=self.email,
            first_name='Bharini',
            last_name='User',
            password=self.password,
            role='artist',
            is_verified=True,
        )
        uid = urlsafe_base64_encode(force_bytes(user.pk))
        token = default_token_generator.make_token(user)

        response = self.client.post(
            '/api/v1/auth/password/reset/confirm/',
            {
                'uid': uid,
                'token': token,
                'password': 'NewStrongPass123!',
                'password_confirm': 'NewStrongPass123!',
            },
            format='json',
        )

        self.assertEqual(response.status_code, 200)
        user.refresh_from_db()
        self.assertTrue(user.check_password('NewStrongPass123!'))

    def test_me_requires_authentication(self):
        response = self.client.get('/api/v1/auth/me/')
        self.assertEqual(response.status_code, 401)
