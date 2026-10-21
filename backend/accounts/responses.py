from rest_framework import status
from rest_framework.response import Response


def request_id(request):
    return request.headers.get('X-Request-ID', '')


def ok_response(request, message, data=None, status_code=status.HTTP_200_OK):
    payload = {
        'code': 'ok',
        'message': message,
        'request_id': request_id(request),
    }
    if data is not None:
        payload['data'] = data
    return Response(payload, status=status_code)


def error_response(request, code, message, status_code, field_errors=None):
    payload = {
        'code': code,
        'message': message,
        'request_id': request_id(request),
    }
    if field_errors:
        payload['field_errors'] = field_errors
    return Response(payload, status=status_code)
