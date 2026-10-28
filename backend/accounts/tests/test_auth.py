from datetime import date, datetime, timedelta, timezone as dt_timezone
from unittest import mock
from urllib.parse import parse_qs, urlparse

from allauth.socialaccount.models import SocialAccount
from django.conf import settings
from django.contrib.auth import get_user_model
from django.contrib.auth.tokens import default_token_generator
from django.core.cache import cache
from django.core.exceptions import ValidationError
from django.test import Client, RequestFactory, override_settings
from django.utils.encoding import force_bytes
from django.utils.http import urlsafe_base64_encode
from rest_framework.test import APIClient, APITestCase

from accounts.mail import _send
from accounts.models import RefreshSession
from accounts.social import SOCIAL_ROLE_SESSION_KEY, SocialAccountAdapter
from accounts.validators import CharacterClassValidator
from accounts.views import social_code_key
from profiles.models import ArtistProfile

User = get_user_model()

PASSWORD = 'StrongPass123!'
NEW_PASSWORD = 'NewStrongPass123!'
EMAIL = 'artist@example.com'
BASE = '/api/v1/auth'


class AuthTestCase(APITestCase):
    def setUp(self):
        # Throttle counters live in the process-local cache; without this they leak between tests.
        cache.clear()
        self.client = APIClient()

    def make_user(self, email=EMAIL, password=PASSWORD, verified=True, role='artist', **extra):
        return User.objects.create_user(
            email=email,
            password=password,
            first_name=extra.pop('first_name', 'Asha'),
            last_name=extra.pop('last_name', 'Rao'),
            role=role,
            is_verified=verified,
            **extra,
        )

    def login(self, email=EMAIL, password=PASSWORD, **headers):
        return self.client.post(f'{BASE}/login/', {'email': email, 'password': password}, format='json', **headers)

    def auth(self, access):
        return {'HTTP_AUTHORIZATION': f'Bearer {access}'}

    def uid_and_token(self, user):
        return urlsafe_base64_encode(force_bytes(user.pk)), default_token_generator.make_token(user)

    def register_payload(self, **overrides):
        payload = {
            'email': 'new@example.com',
            'first_name': 'New',
            'last_name': 'User',
            'role': 'artist',
            'password': PASSWORD,
            'password_confirm': PASSWORD,
        }
        payload.update(overrides)
        return payload


class RegisterTests(AuthTestCase):
    @mock.patch('accounts.views.send_mail_in_background')
    def test_register_creates_unverified_user_and_returns_tokens(self, send_mail):
        response = self.client.post(f'{BASE}/register/', self.register_payload(), format='json')

        self.assertEqual(response.status_code, 201)
        self.assertEqual(response.data['code'], 'ok')
        self.assertEqual(response.data['message'], 'User registered successfully. Please verify your email.')
        self.assertEqual(response.data['data']['user']['email'], 'new@example.com')
        self.assertFalse(response.data['data']['user']['is_verified'])
        self.assertIn('access', response.data['data']['tokens'])
        self.assertIn('refresh', response.data['data']['tokens'])
        self.assertIn('refresh_token', response.cookies)

        user = User.objects.get(email='new@example.com')
        self.assertFalse(user.is_verified)
        self.assertTrue(user.check_password(PASSWORD))
        self.assertNotEqual(user.password, PASSWORD)
        self.assertEqual(RefreshSession.objects.filter(user=user).count(), 1)

    @mock.patch('accounts.views.send_mail_in_background')
    def test_register_sends_verification_link_with_uid_and_token(self, send_mail):
        self.client.post(f'{BASE}/register/', self.register_payload(), format='json')

        send_mail.assert_called_once()
        kwargs = send_mail.call_args.kwargs
        self.assertEqual(kwargs['recipient'], 'new@example.com')
        self.assertEqual(kwargs['subject'], 'Verify your Bharini account')
        user = User.objects.get(email='new@example.com')
        uid, token = self.uid_and_token(user)
        self.assertIn(f'/auth/verify-email?uid={uid}&token=', kwargs['message'])
        self.assertTrue(default_token_generator.check_token(user, token))

    @mock.patch('accounts.views.send_mail_in_background')
    def test_register_role_defaults_to_artist(self, send_mail):
        payload = self.register_payload()
        payload.pop('role')
        response = self.client.post(f'{BASE}/register/', payload, format='json')
        self.assertEqual(response.status_code, 201)
        self.assertEqual(User.objects.get(email='new@example.com').role, 'artist')

    @mock.patch('accounts.views.send_mail_in_background')
    def test_register_accepts_production_house_role(self, send_mail):
        response = self.client.post(f'{BASE}/register/', self.register_payload(role='production_house'), format='json')
        self.assertEqual(response.status_code, 201)
        self.assertEqual(response.data['data']['user']['role'], 'production_house')

    def test_register_rejects_unknown_role(self):
        response = self.client.post(f'{BASE}/register/', self.register_payload(role='director'), format='json')
        self.assertEqual(response.status_code, 400)
        self.assertEqual(response.data['code'], 'validation_error')
        self.assertIn('role', response.data['field_errors'])
        self.assertFalse(User.objects.filter(email='new@example.com').exists())

    def test_register_cannot_self_assign_admin_role(self):
        response = self.client.post(f'{BASE}/register/', self.register_payload(role='admin'), format='json')
        self.assertEqual(response.status_code, 400)
        self.assertEqual(response.data['code'], 'validation_error')
        self.assertIn('role', response.data['field_errors'])
        self.assertFalse(User.objects.filter(email='new@example.com').exists())
        self.assertEqual(RefreshSession.objects.count(), 0)

    def test_register_rejects_duplicate_email_case_insensitively(self):
        self.make_user()
        response = self.client.post(f'{BASE}/register/', self.register_payload(email='ARTIST@example.com'), format='json')
        self.assertEqual(response.status_code, 400)
        self.assertEqual(response.data['message'], 'This email is already registered. Please sign in.')
        self.assertIn('email', response.data['field_errors'])
        self.assertEqual(User.objects.filter(email__iexact=EMAIL).count(), 1)

    def test_register_requires_names(self):
        payload = self.register_payload()
        payload.pop('first_name')
        payload.pop('last_name')
        response = self.client.post(f'{BASE}/register/', payload, format='json')
        self.assertEqual(response.status_code, 400)
        self.assertIn('first_name', response.data['field_errors'])
        self.assertIn('last_name', response.data['field_errors'])

    def test_register_rejects_mismatched_passwords(self):
        response = self.client.post(
            f'{BASE}/register/', self.register_payload(password_confirm='Different123!'), format='json'
        )
        self.assertEqual(response.status_code, 400)
        self.assertEqual(response.data['message'], 'Please fix the highlighted fields.')
        self.assertIn('password_confirm', response.data['field_errors'])

    def test_register_rejects_password_missing_character_classes(self):
        response = self.client.post(
            f'{BASE}/register/', self.register_payload(password='weakpassword', password_confirm='weakpassword'), format='json'
        )
        self.assertEqual(response.status_code, 400)
        self.assertIn('password', response.data['field_errors'])
        self.assertFalse(User.objects.filter(email='new@example.com').exists())

    def test_register_rejects_short_password(self):
        response = self.client.post(
            f'{BASE}/register/', self.register_payload(password='Ab1!', password_confirm='Ab1!'), format='json'
        )
        self.assertEqual(response.status_code, 400)
        self.assertIn('password', response.data['field_errors'])

    def test_register_missing_body_fields_returns_field_errors(self):
        response = self.client.post(f'{BASE}/register/', {}, format='json')
        self.assertEqual(response.status_code, 400)
        for field in ('email', 'first_name', 'last_name', 'password', 'password_confirm'):
            self.assertIn(field, response.data['field_errors'])

    @mock.patch('accounts.views.send_mail_in_background')
    def test_register_echoes_request_id_header(self, send_mail):
        response = self.client.post(
            f'{BASE}/register/', self.register_payload(), format='json', HTTP_X_REQUEST_ID='req-123'
        )
        self.assertEqual(response.data['request_id'], 'req-123')

    @mock.patch('accounts.views.send_mail_in_background')
    def test_register_is_throttled_after_five_attempts_per_minute(self, send_mail):
        for index in range(5):
            response = self.client.post(
                f'{BASE}/register/', self.register_payload(email=f'user{index}@example.com'), format='json'
            )
            self.assertEqual(response.status_code, 201)
        response = self.client.post(f'{BASE}/register/', self.register_payload(email='extra@example.com'), format='json')
        self.assertEqual(response.status_code, 429)


class LoginTests(AuthTestCase):
    def test_verified_user_gets_tokens_and_refresh_cookie(self):
        self.make_user()
        response = self.login()

        self.assertEqual(response.status_code, 200)
        self.assertEqual(response.data['code'], 'ok')
        self.assertEqual(response.data['message'], 'Login successful.')
        self.assertEqual(response.data['data']['user']['email'], EMAIL)
        self.assertIn('access', response.data['data']['tokens'])
        self.assertIn('refresh', response.data['data']['tokens'])
        self.assertEqual(response.cookies['refresh_token'].value, response.data['data']['tokens']['refresh'])
        self.assertTrue(response.cookies['refresh_token']['httponly'])
        self.assertEqual(response.cookies['refresh_token']['path'], '/api/v1/auth/')

    def test_login_records_device_label_and_forwarded_ip(self):
        user = self.make_user()
        self.login(HTTP_X_DEVICE_LABEL='Pixel 8', HTTP_X_FORWARDED_FOR='203.0.113.5, 10.0.0.1', HTTP_USER_AGENT='BhariniApp/1.0')

        session = RefreshSession.objects.get(user=user)
        self.assertEqual(session.device_label, 'Pixel 8')
        self.assertEqual(session.ip_address, '203.0.113.5')
        self.assertEqual(session.user_agent, 'BhariniApp/1.0')
        self.assertTrue(session.is_active)

    def test_wrong_password_is_rejected(self):
        self.make_user()
        response = self.login(password='wrong-password')
        self.assertEqual(response.status_code, 400)
        self.assertEqual(response.data['code'], 'invalid_credentials')
        self.assertEqual(response.data['message'], 'Login failed.')
        self.assertEqual(response.data['field_errors'], {'detail': ['Invalid email or password.']})
        self.assertNotIn('refresh_token', response.cookies)

    def test_unknown_email_gets_same_message_as_wrong_password(self):
        response = self.login(email='nobody@example.com')
        self.assertEqual(response.status_code, 400)
        self.assertEqual(response.data['field_errors'], {'detail': ['Invalid email or password.']})

    def test_unverified_user_cannot_log_in(self):
        self.make_user(verified=False)
        response = self.login()
        self.assertEqual(response.status_code, 400)
        self.assertEqual(response.data['field_errors'], {'detail': ['Please verify your email before logging in.']})

    def test_disabled_user_cannot_log_in(self):
        # ModelBackend refuses inactive users before our serializer runs, so they get the generic message.
        user = self.make_user()
        user.is_active = False
        user.save(update_fields=['is_active'])
        response = self.login()
        self.assertEqual(response.status_code, 400)
        self.assertEqual(response.data['field_errors'], {'detail': ['Invalid email or password.']})

    def test_missing_fields_return_invalid_credentials(self):
        response = self.client.post(f'{BASE}/login/', {}, format='json')
        self.assertEqual(response.status_code, 400)
        self.assertEqual(response.data['code'], 'invalid_credentials')
        self.assertIn('email', response.data['field_errors'])
        self.assertIn('password', response.data['field_errors'])

    def test_invalid_email_format_is_rejected(self):
        response = self.login(email='not-an-email')
        self.assertEqual(response.status_code, 400)
        self.assertIn('email', response.data['field_errors'])

    def test_login_is_throttled_after_ten_attempts_per_minute(self):
        self.make_user()
        for _ in range(10):
            self.assertEqual(self.login(password='wrong-password').status_code, 400)
        self.assertEqual(self.login().status_code, 429)


class VerifyEmailTests(AuthTestCase):
    def test_valid_link_verifies_user(self):
        user = self.make_user(verified=False)
        uid, token = self.uid_and_token(user)
        response = self.client.post(f'{BASE}/verify-email/', {'uid': uid, 'token': token}, format='json')

        self.assertEqual(response.status_code, 200)
        self.assertEqual(response.data['code'], 'ok')
        self.assertEqual(response.data['message'], 'Email verified successfully.')
        user.refresh_from_db()
        self.assertTrue(user.is_verified)
        self.assertIsNotNone(user.email_verified_at)

    def test_verify_alias_path_works(self):
        user = self.make_user(verified=False)
        uid, token = self.uid_and_token(user)
        response = self.client.post(f'{BASE}/verify/', {'uid': uid, 'token': token}, format='json')
        self.assertEqual(response.status_code, 200)

    def test_already_verified_user_gets_informational_ok(self):
        user = self.make_user(verified=True)
        uid, token = self.uid_and_token(user)
        response = self.client.post(f'{BASE}/verify-email/', {'uid': uid, 'token': token}, format='json')
        self.assertEqual(response.status_code, 200)
        self.assertEqual(response.data['message'], 'Email is already verified.')

    def test_bad_token_is_rejected(self):
        user = self.make_user(verified=False)
        uid, _ = self.uid_and_token(user)
        response = self.client.post(f'{BASE}/verify-email/', {'uid': uid, 'token': 'bad-token'}, format='json')
        self.assertEqual(response.status_code, 400)
        self.assertEqual(response.data['code'], 'invalid_verification_token')
        self.assertEqual(response.data['field_errors'], {'detail': ['Invalid or expired verification token.']})
        user.refresh_from_db()
        self.assertFalse(user.is_verified)

    def test_unknown_uid_is_rejected(self):
        self.make_user(verified=False)
        response = self.client.post(f'{BASE}/verify-email/', {'uid': 'bad', 'token': 'bad'}, format='json')
        self.assertEqual(response.status_code, 400)
        self.assertEqual(response.data['field_errors'], {'detail': ['Invalid verification link.']})

    def test_missing_fields_are_rejected(self):
        response = self.client.post(f'{BASE}/verify-email/', {}, format='json')
        self.assertEqual(response.status_code, 400)
        self.assertEqual(response.data['code'], 'invalid_verification_token')
        self.assertIn('uid', response.data['field_errors'])
        self.assertIn('token', response.data['field_errors'])


class RefreshTokenTests(AuthTestCase):
    def setUp(self):
        super().setUp()
        self.user = self.make_user()
        self.tokens = self.login().data['data']['tokens']

    def test_refresh_rotates_tokens_and_keeps_session_family(self):
        old_session = RefreshSession.objects.get(user=self.user)
        response = self.client.post(f'{BASE}/refresh/', {'refresh': self.tokens['refresh']}, format='json')

        self.assertEqual(response.status_code, 200)
        self.assertEqual(response.data['message'], 'Token refreshed successfully.')
        self.assertIn('access', response.data['data'])
        self.assertIn('refresh', response.data['data'])
        self.assertNotEqual(response.data['data']['refresh'], self.tokens['refresh'])
        self.assertEqual(response.cookies['refresh_token'].value, response.data['data']['refresh'])

        old_session.refresh_from_db()
        self.assertEqual(old_session.revoked_reason, 'rotated')
        self.assertIsNotNone(old_session.revoked_at)
        new_session = old_session.replaced_by
        self.assertIsNotNone(new_session)
        self.assertEqual(new_session.family_id, old_session.family_id)
        self.assertTrue(new_session.is_active)

    def test_refresh_accepts_refresh_cookie_when_body_is_empty(self):
        self.client.cookies['refresh_token'] = self.tokens['refresh']
        response = self.client.post(f'{BASE}/refresh/', {}, format='json')
        self.assertEqual(response.status_code, 200)
        self.assertIn('refresh', response.data['data'])

    def test_replaying_rotated_token_is_rejected(self):
        self.client.post(f'{BASE}/refresh/', {'refresh': self.tokens['refresh']}, format='json')
        replay = self.client.post(f'{BASE}/refresh/', {'refresh': self.tokens['refresh']}, format='json')
        self.assertEqual(replay.status_code, 401)
        self.assertEqual(replay.data['code'], 'invalid_refresh_token')

    def test_missing_token_is_unauthorized(self):
        self.client.cookies.clear()
        response = self.client.post(f'{BASE}/refresh/', {}, format='json')
        self.assertEqual(response.status_code, 401)
        self.assertEqual(response.data['code'], 'invalid_refresh_token')
        self.assertIn('refresh', response.data['field_errors'])

    def test_garbage_token_is_unauthorized(self):
        response = self.client.post(f'{BASE}/refresh/', {'refresh': 'garbage'}, format='json')
        self.assertEqual(response.status_code, 401)
        self.assertEqual(response.data['code'], 'invalid_refresh_token')

    def test_access_token_cannot_be_used_as_refresh_token(self):
        response = self.client.post(f'{BASE}/refresh/', {'refresh': self.tokens['access']}, format='json')
        self.assertEqual(response.status_code, 401)

    def test_token_without_session_row_is_unauthorized(self):
        RefreshSession.objects.all().delete()
        response = self.client.post(f'{BASE}/refresh/', {'refresh': self.tokens['refresh']}, format='json')
        self.assertEqual(response.status_code, 401)
        self.assertEqual(response.data['code'], 'invalid_refresh_session')

    def test_revoked_session_cannot_refresh(self):
        RefreshSession.objects.filter(user=self.user).update(revoked_at='2026-01-01T00:00:00Z')
        response = self.client.post(f'{BASE}/refresh/', {'refresh': self.tokens['refresh']}, format='json')
        self.assertEqual(response.status_code, 401)
        self.assertEqual(response.data['code'], 'revoked_refresh_session')

    def test_expired_session_cannot_refresh(self):
        RefreshSession.objects.filter(user=self.user).update(expires_at='2020-01-01T00:00:00Z')
        response = self.client.post(f'{BASE}/refresh/', {'refresh': self.tokens['refresh']}, format='json')
        self.assertEqual(response.status_code, 401)
        self.assertEqual(response.data['code'], 'revoked_refresh_session')


class LogoutTests(AuthTestCase):
    def setUp(self):
        super().setUp()
        self.user = self.make_user()
        self.tokens = self.login().data['data']['tokens']

    def test_logout_revokes_session_blacklists_token_and_clears_cookie(self):
        response = self.client.post(f'{BASE}/logout/', {'refresh': self.tokens['refresh']}, format='json')

        self.assertEqual(response.status_code, 200)
        self.assertEqual(response.data['message'], 'Logged out successfully.')
        self.assertEqual(response.cookies['refresh_token'].value, '')
        session = RefreshSession.objects.get(user=self.user)
        self.assertIsNotNone(session.revoked_at)
        self.assertEqual(session.revoked_reason, 'logout')

        reuse = self.client.post(f'{BASE}/refresh/', {'refresh': self.tokens['refresh']}, format='json')
        self.assertEqual(reuse.status_code, 401)

    def test_logout_accepts_refresh_cookie(self):
        self.client.cookies['refresh_token'] = self.tokens['refresh']
        response = self.client.post(f'{BASE}/logout/', {}, format='json')
        self.assertEqual(response.status_code, 200)
        self.assertIsNotNone(RefreshSession.objects.get(user=self.user).revoked_at)

    def test_logout_without_token_is_bad_request(self):
        self.client.cookies.clear()
        response = self.client.post(f'{BASE}/logout/', {}, format='json')
        self.assertEqual(response.status_code, 400)
        self.assertEqual(response.data['code'], 'missing_refresh_token')

    def test_logout_with_garbage_token_is_unauthorized(self):
        response = self.client.post(f'{BASE}/logout/', {'refresh': 'garbage'}, format='json')
        self.assertEqual(response.status_code, 401)
        self.assertEqual(response.data['code'], 'invalid_refresh_token')

    def test_logout_twice_is_unauthorized_on_second_call(self):
        self.client.post(f'{BASE}/logout/', {'refresh': self.tokens['refresh']}, format='json')
        response = self.client.post(f'{BASE}/logout/', {'refresh': self.tokens['refresh']}, format='json')
        self.assertEqual(response.status_code, 401)


class PasswordResetRequestTests(AuthTestCase):
    @mock.patch('accounts.views.send_mail_in_background')
    def test_sends_reset_link_for_existing_account(self, send_mail):
        user = self.make_user()
        response = self.client.post(f'{BASE}/password/reset/', {'email': EMAIL}, format='json')

        self.assertEqual(response.status_code, 200)
        self.assertEqual(response.data['message'], f'Password reset link sent to {EMAIL}.')
        send_mail.assert_called_once()
        kwargs = send_mail.call_args.kwargs
        uid, token = self.uid_and_token(user)
        self.assertEqual(kwargs['recipient'], EMAIL)
        self.assertIn(f'/auth/reset-password?uid={uid}&token=', kwargs['message'])
        self.assertTrue(default_token_generator.check_token(user, token))

    @mock.patch('accounts.views.send_mail_in_background')
    def test_email_lookup_is_case_insensitive(self, send_mail):
        self.make_user()
        response = self.client.post(f'{BASE}/password/reset/', {'email': EMAIL.upper()}, format='json')
        self.assertEqual(response.status_code, 200)
        send_mail.assert_called_once()

    @mock.patch('accounts.views.send_mail_in_background')
    def test_unknown_email_returns_not_found(self, send_mail):
        response = self.client.post(f'{BASE}/password/reset/', {'email': 'nobody@example.com'}, format='json')
        self.assertEqual(response.status_code, 404)
        self.assertEqual(response.data['code'], 'account_not_found')
        self.assertEqual(response.data['field_errors'], {'email': ['No account found with this email.']})
        send_mail.assert_not_called()

    @mock.patch('accounts.views.send_mail_in_background')
    def test_social_only_account_is_told_to_use_its_provider(self, send_mail):
        user = self.make_user()
        user.set_unusable_password()
        user.save(update_fields=['password'])
        SocialAccount.objects.create(user=user, provider='google', uid='123')

        response = self.client.post(f'{BASE}/password/reset/', {'email': EMAIL}, format='json')
        self.assertEqual(response.status_code, 400)
        self.assertEqual(response.data['code'], 'social_account')
        self.assertIn('Google', response.data['message'])
        send_mail.assert_not_called()

    @mock.patch('accounts.views.send_mail_in_background')
    def test_social_only_account_without_provider_row_gets_generic_message(self, send_mail):
        user = self.make_user()
        user.set_unusable_password()
        user.save(update_fields=['password'])
        response = self.client.post(f'{BASE}/password/reset/', {'email': EMAIL}, format='json')
        self.assertEqual(response.data['code'], 'social_account')
        self.assertIn('a social login', response.data['message'])

    def test_invalid_email_is_rejected(self):
        response = self.client.post(f'{BASE}/password/reset/', {'email': 'not-an-email'}, format='json')
        self.assertEqual(response.status_code, 400)
        self.assertEqual(response.data['code'], 'validation_error')
        self.assertIn('email', response.data['field_errors'])

    @mock.patch('accounts.views.send_mail_in_background')
    def test_reset_request_is_throttled_after_five_per_minute(self, send_mail):
        self.make_user()
        for _ in range(5):
            self.assertEqual(self.client.post(f'{BASE}/password/reset/', {'email': EMAIL}, format='json').status_code, 200)
        self.assertEqual(self.client.post(f'{BASE}/password/reset/', {'email': EMAIL}, format='json').status_code, 429)


class PasswordResetConfirmTests(AuthTestCase):
    def setUp(self):
        super().setUp()
        self.user = self.make_user()

    def confirm(self, uid, token, password=NEW_PASSWORD, password_confirm=NEW_PASSWORD):
        return self.client.post(
            f'{BASE}/password/reset/confirm/',
            {'uid': uid, 'token': token, 'password': password, 'password_confirm': password_confirm},
            format='json',
        )

    def test_valid_token_sets_new_password(self):
        uid, token = self.uid_and_token(self.user)
        response = self.confirm(uid, token)

        self.assertEqual(response.status_code, 200)
        self.assertEqual(response.data['message'], 'Password reset successful.')
        self.user.refresh_from_db()
        self.assertTrue(self.user.check_password(NEW_PASSWORD))
        self.assertFalse(self.user.check_password(PASSWORD))

    def test_reset_token_cannot_be_reused(self):
        uid, token = self.uid_and_token(self.user)
        self.assertEqual(self.confirm(uid, token).status_code, 200)
        response = self.confirm(uid, token, password='Another123!', password_confirm='Another123!')
        self.assertEqual(response.status_code, 400)
        self.assertEqual(response.data['code'], 'invalid_reset_link')

    def test_bad_token_is_rejected(self):
        uid, _ = self.uid_and_token(self.user)
        response = self.confirm(uid, 'bad-token')
        self.assertEqual(response.status_code, 400)
        self.assertEqual(response.data['code'], 'invalid_reset_link')
        self.assertEqual(response.data['message'], 'Invalid or expired reset link.')

    def test_bad_uid_is_rejected(self):
        _, token = self.uid_and_token(self.user)
        response = self.confirm('bad', token)
        self.assertEqual(response.status_code, 400)
        self.assertEqual(response.data['code'], 'invalid_reset_link')

    def test_uid_of_missing_user_is_rejected(self):
        _, token = self.uid_and_token(self.user)
        response = self.confirm(urlsafe_base64_encode(force_bytes(999999)), token)
        self.assertEqual(response.data['code'], 'invalid_reset_link')

    def test_mismatched_passwords_are_rejected(self):
        uid, token = self.uid_and_token(self.user)
        response = self.confirm(uid, token, password_confirm='Different123!')
        self.assertEqual(response.status_code, 400)
        self.assertEqual(response.data['code'], 'validation_error')
        self.assertIn('password_confirm', response.data['field_errors'])

    def test_weak_password_is_rejected(self):
        uid, token = self.uid_and_token(self.user)
        response = self.confirm(uid, token, password='weakpassword', password_confirm='weakpassword')
        self.assertEqual(response.status_code, 400)
        self.assertIn('password', response.data['field_errors'])
        self.user.refresh_from_db()
        self.assertTrue(self.user.check_password(PASSWORD))


class SocialLoginTests(AuthTestCase):
    GOOGLE_APPS = {'google': {'APPS': [{'client_id': 'id', 'secret': 's'}]}}

    def test_start_stores_signup_role_and_redirects_to_provider(self):
        browser = Client()
        with override_settings(SOCIALACCOUNT_PROVIDERS=self.GOOGLE_APPS):
            response = browser.get(f'{BASE}/social/google/start/?role=production_house')
        self.assertEqual(response.status_code, 302)
        self.assertEqual(response['Location'], '/accounts/google/login/')
        self.assertEqual(browser.session[SOCIAL_ROLE_SESSION_KEY], 'production_house')

    def test_start_ignores_unknown_role(self):
        browser = Client()
        with override_settings(SOCIALACCOUNT_PROVIDERS=self.GOOGLE_APPS):
            browser.get(f'{BASE}/social/google/start/?role=admin')
        self.assertNotIn(SOCIAL_ROLE_SESSION_KEY, browser.session)

    def test_start_rejects_unknown_provider(self):
        for provider in ('twitter', 'facebook'):
            response = Client().get(f'{BASE}/social/{provider}/start/')
            self.assertEqual(response.status_code, 302)
            self.assertIn(f'{settings.FRONTEND_URL}/auth/login?social_error=unknown_provider', response['Location'])

    def test_start_reports_unconfigured_provider(self):
        with override_settings(SOCIALACCOUNT_PROVIDERS={'google': {'APPS': []}}):
            response = Client().get(f'{BASE}/social/google/start/')
        self.assertIn('social_error=not_configured', response['Location'])

    def test_complete_without_session_redirects_with_error(self):
        response = Client().get(f'{BASE}/social/complete/')
        self.assertEqual(response.status_code, 302)
        self.assertIn('social_error=unknown', response['Location'])

    def test_complete_issues_one_time_code_that_exchanges_for_tokens(self):
        user = self.make_user()
        browser = Client()
        browser.force_login(user, backend='django.contrib.auth.backends.ModelBackend')

        response = browser.get(f'{BASE}/social/complete/')
        self.assertEqual(response.status_code, 302)
        self.assertTrue(response['Location'].startswith(f'{settings.FRONTEND_URL}/auth/social?code='))
        code = parse_qs(urlparse(response['Location']).query)['code'][0]

        exchange = self.client.post(f'{BASE}/social/exchange/', {'code': code}, format='json')
        self.assertEqual(exchange.status_code, 200)
        self.assertEqual(exchange.data['data']['user']['email'], EMAIL)
        self.assertIn('access', exchange.data['data']['tokens'])
        self.assertIn('refresh_token', exchange.cookies)

        replay = self.client.post(f'{BASE}/social/exchange/', {'code': code}, format='json')
        self.assertEqual(replay.status_code, 400)
        self.assertEqual(replay.data['code'], 'invalid_social_code')

    def test_exchange_rejects_unknown_code(self):
        response = self.client.post(f'{BASE}/social/exchange/', {'code': 'nope'}, format='json')
        self.assertEqual(response.status_code, 400)
        self.assertEqual(response.data['code'], 'invalid_social_code')
        self.assertEqual(response.data['message'], 'Sign-in link expired. Please try again.')

    def test_exchange_rejects_missing_code(self):
        response = self.client.post(f'{BASE}/social/exchange/', {}, format='json')
        self.assertEqual(response.status_code, 400)
        self.assertEqual(response.data['code'], 'invalid_social_code')

    def test_exchange_rejects_expired_code(self):
        user = self.make_user()
        browser = Client()
        browser.force_login(user, backend='django.contrib.auth.backends.ModelBackend')
        code = parse_qs(urlparse(browser.get(f'{BASE}/social/complete/')['Location']).query)['code'][0]
        cache.delete(social_code_key(code))  # what the 60 s cache timeout does

        response = self.client.post(f'{BASE}/social/exchange/', {'code': code}, format='json')
        self.assertEqual(response.data['code'], 'invalid_social_code')

    def test_exchange_rejects_code_for_disabled_user(self):
        user = self.make_user()
        browser = Client()
        browser.force_login(user, backend='django.contrib.auth.backends.ModelBackend')
        code = parse_qs(urlparse(browser.get(f'{BASE}/social/complete/')['Location']).query)['code'][0]
        user.is_active = False
        user.save(update_fields=['is_active'])

        response = self.client.post(f'{BASE}/social/exchange/', {'code': code}, format='json')
        self.assertEqual(response.data['code'], 'invalid_social_code')

    def test_adapter_marks_social_user_verified_with_session_role(self):
        request = RequestFactory().get('/')
        request.session = {SOCIAL_ROLE_SESSION_KEY: 'production_house'}

        populated = SocialAccountAdapter().populate_user(request, mock.Mock(), {'email': 'social@example.com'})

        self.assertEqual(populated.role, 'production_house')
        self.assertTrue(populated.is_verified)
        self.assertIsNotNone(populated.email_verified_at)

    def test_adapter_defaults_social_role_to_artist(self):
        request = RequestFactory().get('/')
        request.session = {SOCIAL_ROLE_SESSION_KEY: 'admin'}
        populated = SocialAccountAdapter().populate_user(request, mock.Mock(), {'email': 'x@example.com'})
        self.assertEqual(populated.role, 'artist')


class MeTests(AuthTestCase):
    def test_me_requires_bearer_token(self):
        response = self.client.get(f'{BASE}/me/')
        self.assertEqual(response.status_code, 401)

    def test_me_rejects_invalid_token(self):
        response = self.client.get(f'{BASE}/me/', **self.auth('garbage'))
        self.assertEqual(response.status_code, 401)

    def test_me_returns_profile_without_secrets(self):
        user = self.make_user(role='production_house')
        access = self.login().data['data']['tokens']['access']
        response = self.client.get(f'{BASE}/me/', **self.auth(access))

        self.assertEqual(response.status_code, 200)
        data = response.data['data']
        self.assertEqual(
            set(data),
            {
                'id', 'email', 'username', 'first_name', 'last_name', 'role', 'is_verified',
                'email_verified_at', 'date_joined', 'onboarding_complete', 'completion_percent',
            },
        )
        self.assertEqual(data['id'], user.pk)
        self.assertEqual(data['role'], 'production_house')
        self.assertTrue(data['is_verified'])
        self.assertTrue(data['onboarding_complete'])
        self.assertIsNone(data['username'])
        self.assertIsNone(data['completion_percent'])

    def test_artist_without_profile_is_not_onboarded(self):
        self.make_user()
        access = self.login().data['data']['tokens']['access']
        data = self.client.get(f'{BASE}/me/', **self.auth(access)).data['data']
        self.assertFalse(data['onboarding_complete'])
        self.assertIsNone(data['username'])

    def test_artist_profile_drives_onboarding_fields(self):
        user = self.make_user()
        ArtistProfile.objects.create(user=user, username='asha_rao', bio='Actor', date_of_birth=date(1995, 1, 1))
        access = self.login().data['data']['tokens']['access']
        data = self.client.get(f'{BASE}/me/', **self.auth(access)).data['data']

        self.assertEqual(data['username'], 'asha_rao')
        self.assertFalse(data['onboarding_complete'])
        self.assertIsInstance(data['completion_percent'], int)
        self.assertLess(data['completion_percent'], 100)


class SessionTests(AuthTestCase):
    def setUp(self):
        super().setUp()
        self.user = self.make_user()
        self.access = self.login().data['data']['tokens']['access']

    def test_sessions_require_authentication(self):
        self.assertEqual(self.client.get(f'{BASE}/sessions/').status_code, 401)

    def test_sessions_list_contains_only_own_sessions(self):
        other = self.make_user(email='other@example.com')
        RefreshSession.objects.create(user=other, jti_hash='other-hash', expires_at='2999-01-01T00:00:00Z')

        response = self.client.get(f'{BASE}/sessions/', **self.auth(self.access))
        self.assertEqual(response.status_code, 200)
        sessions = response.data['data']['sessions']
        self.assertEqual(len(sessions), 1)
        self.assertEqual(
            set(sessions[0]),
            {'id', 'device_label', 'user_agent', 'ip_address', 'created_at', 'last_used_at', 'expires_at', 'revoked_at', 'is_active'},
        )
        self.assertTrue(sessions[0]['is_active'])
        self.assertIsNone(sessions[0]['revoked_at'])

    def test_revoke_own_session_blocks_its_refresh_token(self):
        refresh = self.login().data['data']['tokens']['refresh']
        session_id = self.client.get(f'{BASE}/sessions/', **self.auth(self.access)).data['data']['sessions'][0]['id']

        response = self.client.post(f'{BASE}/sessions/{session_id}/revoke/', **self.auth(self.access))
        self.assertEqual(response.status_code, 200)
        self.assertEqual(response.data['message'], 'Session revoked successfully.')

        refresh_response = self.client.post(f'{BASE}/refresh/', {'refresh': refresh}, format='json')
        self.assertEqual(refresh_response.status_code, 401)

    def test_revoking_twice_is_idempotent_and_keeps_first_timestamp(self):
        session = RefreshSession.objects.get(user=self.user)
        url = f'{BASE}/sessions/{session.public_id}/revoke/'
        self.client.post(url, **self.auth(self.access))
        session.refresh_from_db()
        first_revoked_at = session.revoked_at

        response = self.client.post(url, **self.auth(self.access))
        self.assertEqual(response.status_code, 200)
        session.refresh_from_db()
        self.assertEqual(session.revoked_at, first_revoked_at)
        self.assertEqual(session.revoked_reason, 'user_revoked')

    def test_revoked_session_is_listed_as_inactive(self):
        session = RefreshSession.objects.get(user=self.user)
        self.client.post(f'{BASE}/sessions/{session.public_id}/revoke/', **self.auth(self.access))
        listed = self.client.get(f'{BASE}/sessions/', **self.auth(self.access)).data['data']['sessions']
        self.assertFalse(listed[0]['is_active'])
        self.assertIsNotNone(listed[0]['revoked_at'])

    def test_unknown_or_foreign_session_is_not_found(self):
        other = self.make_user(email='other@example.com')
        foreign = RefreshSession.objects.create(user=other, jti_hash='foreign-hash', expires_at='2999-01-01T00:00:00Z')

        for session_id in (foreign.public_id, '00000000-0000-0000-0000-000000000000'):
            response = self.client.post(f'{BASE}/sessions/{session_id}/revoke/', **self.auth(self.access))
            self.assertEqual(response.status_code, 404)
            self.assertEqual(response.data['code'], 'session_not_found')

        foreign.refresh_from_db()
        self.assertIsNone(foreign.revoked_at)

    def test_revoke_requires_authentication(self):
        session = RefreshSession.objects.get(user=self.user)
        response = self.client.post(f'{BASE}/sessions/{session.public_id}/revoke/')
        self.assertEqual(response.status_code, 401)


class ValidatorAndModelTests(AuthTestCase):
    def test_character_class_validator_lists_each_missing_class(self):
        with self.assertRaises(ValidationError) as ctx:
            CharacterClassValidator().validate('alllowercase')
        messages = ctx.exception.messages
        self.assertEqual(len(messages), 3)
        self.assertIn('Password must contain at least one uppercase letter.', messages)
        self.assertIn('Password must contain at least one number.', messages)
        self.assertIn('Password must contain at least one special character.', messages)

    def test_character_class_validator_accepts_strong_password(self):
        CharacterClassValidator().validate(PASSWORD)

    def test_create_user_requires_email(self):
        with self.assertRaises(ValueError):
            User.objects.create_user(email='', password=PASSWORD, first_name='A', last_name='B')

    def test_create_user_normalizes_email_domain(self):
        user = User.objects.create_user(email='Mixed@EXAMPLE.com', password=PASSWORD, first_name='A', last_name='B')
        self.assertEqual(user.email, 'Mixed@example.com')
        self.assertEqual(str(user), 'Mixed@example.com')

    def test_create_superuser_sets_staff_flags(self):
        admin = User.objects.create_superuser(email='root@example.com', password=PASSWORD, first_name='R', last_name='T')
        self.assertTrue(admin.is_staff and admin.is_superuser and admin.is_active)

    def test_refresh_session_is_inactive_when_expired(self):
        session = RefreshSession.objects.create(
            user=self.make_user(), jti_hash='expired-hash', expires_at=datetime(2020, 1, 1, tzinfo=dt_timezone.utc)
        )
        self.assertFalse(session.is_active)


class MailTests(AuthTestCase):
    @mock.patch('accounts.mail.send_mail')
    def test_send_uses_default_from_address(self, send):
        _send('Subject', 'Body', 'to@example.com')
        send.assert_called_once_with('Subject', 'Body', settings.DEFAULT_FROM_EMAIL, ['to@example.com'], fail_silently=False)

    @mock.patch('accounts.mail.send_mail', side_effect=OSError('smtp down'))
    def test_send_failure_is_logged_not_raised(self, send):
        with self.assertLogs('accounts.mail', level='ERROR'):
            _send('Subject', 'Body', 'to@example.com')
