from django.test import SimpleTestCase, TestCase, override_settings


class HealthCheckTests(TestCase):
    @override_settings(ALLOWED_HOSTS=['api.example.com'], SECURE_SSL_REDIRECT=True)
    def test_health_answers_by_ip_over_http(self):
        response = self.client.get('/api/v1/health/', HTTP_HOST='10.0.11.25:8000')
        self.assertEqual(response.status_code, 200)
        self.assertEqual(response.json()['code'], 'ok')


class HostValidationTests(SimpleTestCase):
    @override_settings(ALLOWED_HOSTS=['api.example.com'])
    def test_other_paths_still_validate_host(self):
        response = self.client.get('/api/v1/feed/', HTTP_HOST='10.0.11.25:8000')
        self.assertEqual(response.status_code, 400)
