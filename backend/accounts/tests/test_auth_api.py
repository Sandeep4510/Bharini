from django.contrib.auth import get_user_model
from django.contrib.auth.tokens import default_token_generator
from django.test import TestCase
from django.utils.encoding import force_bytes
from django.utils.http import urlsafe_base64_encode
from rest_framework.test import APIClient

from accounts.models import RefreshSession

User = get_user_model()


class AuthApiTests(TestCase):
    def setUp(self):
        self.client = APIClient()
        self.email = 'artist@example.com'
        self.password = 'StrongPass123!'

    def verify_user(self, user):
        uid = urlsafe_base64_encode(force_bytes(user.pk))
        token = default_token_generator.make_token(user)
        response = self.client.post('/api/v1/auth/verify-email/', {'uid': uid, 'token': token}, format='json')
        self.assertEqual(response.status_code, 200)
        user.refresh_from_db()
        self.assertTrue(user.is_verified)

    def auth_header_for(self, access_token):
        return {'HTTP_AUTHORIZATION': f'Bearer {access_token}'}

    def test_register_creates_unverified_user_and_refresh_session(self):
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
        self.assertIn('data', response.data)
        self.assertIn('tokens', response.data['data'])
        self.assertIn('refresh_token', response.cookies)
        self.assertFalse(User.objects.get(email=self.email).is_verified)
        self.assertEqual(RefreshSession.objects.filter(user__email=self.email).count(), 1)

    def test_login_requires_verified_email(self):
        User.objects.create_user(
            email=self.email,
            first_name='Bharini',
            last_name='User',
            password=self.password,
            role='artist',
            is_verified=False,
        )
        response = self.client.post('/api/v1/auth/login/', {'email': self.email, 'password': self.password}, format='json')
        self.assertEqual(response.status_code, 400)
        self.assertEqual(response.data['code'], 'invalid_credentials')

    def test_verify_then_login_works(self):
        user = User.objects.create_user(
            email=self.email,
            first_name='Bharini',
            last_name='User',
            password=self.password,
            role='artist',
            is_verified=False,
        )
        self.verify_user(user)
        response = self.client.post('/api/v1/auth/login/', {'email': self.email, 'password': self.password}, format='json')
        self.assertEqual(response.status_code, 200)
        self.assertIn('access', response.data['data']['tokens'])
        self.assertIn('refresh', response.data['data']['tokens'])

    def test_refresh_rotates_token_and_invalidates_previous_session_token(self):
        user = User.objects.create_user(
            email=self.email,
            first_name='Bharini',
            last_name='User',
            password=self.password,
            role='artist',
            is_verified=True,
        )
        login_response = self.client.post('/api/v1/auth/login/', {'email': self.email, 'password': self.password}, format='json')
        old_refresh = login_response.data['data']['tokens']['refresh']
        refresh_response = self.client.post('/api/v1/auth/refresh/', {'refresh': old_refresh}, format='json')
        self.assertEqual(refresh_response.status_code, 200)
        new_refresh = refresh_response.data['data']['refresh']
        self.assertNotEqual(old_refresh, new_refresh)

        replay_response = self.client.post('/api/v1/auth/refresh/', {'refresh': old_refresh}, format='json')
        self.assertEqual(replay_response.status_code, 401)
        self.assertEqual(RefreshSession.objects.filter(user=user).count(), 2)

    def test_logout_revokes_session_and_clears_cookie(self):
        User.objects.create_user(
            email=self.email,
            first_name='Bharini',
            last_name='User',
            password=self.password,
            role='artist',
            is_verified=True,
        )
        login_response = self.client.post('/api/v1/auth/login/', {'email': self.email, 'password': self.password}, format='json')
        refresh = login_response.data['data']['tokens']['refresh']
        response = self.client.post('/api/v1/auth/logout/', {'refresh': refresh}, format='json')

        self.assertEqual(response.status_code, 200)
        self.assertEqual(response.cookies['refresh_token'].value, '')
        self.assertEqual(RefreshSession.objects.filter(user__email=self.email, revoked_at__isnull=False).count(), 1)

    def test_session_list_and_revoke(self):
        user = User.objects.create_user(
            email=self.email,
            first_name='Bharini',
            last_name='User',
            password=self.password,
            role='artist',
            is_verified=True,
        )
        login_response = self.client.post('/api/v1/auth/login/', {'email': self.email, 'password': self.password}, format='json')
        access = login_response.data['data']['tokens']['access']
        refresh = login_response.data['data']['tokens']['refresh']

        sessions_response = self.client.get('/api/v1/auth/sessions/', **self.auth_header_for(access))
        self.assertEqual(sessions_response.status_code, 200)
        self.assertEqual(len(sessions_response.data['data']['sessions']), 1)
        session_id = sessions_response.data['data']['sessions'][0]['id']

        revoke_response = self.client.post(f'/api/v1/auth/sessions/{session_id}/revoke/', {}, format='json', **self.auth_header_for(access))
        self.assertEqual(revoke_response.status_code, 200)

        replay_response = self.client.post('/api/v1/auth/refresh/', {'refresh': refresh}, format='json')
        self.assertEqual(replay_response.status_code, 401)
        self.assertEqual(RefreshSession.objects.filter(user=user, revoked_at__isnull=False).count(), 1)

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
