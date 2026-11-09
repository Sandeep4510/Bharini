from django.db import connection
from django.http import JsonResponse

HEALTH_PATH = '/api/v1/health/'


class HealthCheckMiddleware:
    """Answers the load-balancer health check before host validation and the HTTPS redirect.

    The AWS ALB probes each container by IP over plain HTTP, so the request would fail
    ALLOWED_HOSTS and SECURE_SSL_REDIRECT if it reached the rest of the stack.
    """

    def __init__(self, get_response):
        self.get_response = get_response

    def __call__(self, request):
        if request.path != HEALTH_PATH:
            return self.get_response(request)
        try:
            connection.ensure_connection()
        except Exception:
            return JsonResponse({'code': 'unavailable', 'message': 'Database unreachable.', 'data': None}, status=503)
        return JsonResponse({'code': 'ok', 'message': 'OK', 'data': None})
