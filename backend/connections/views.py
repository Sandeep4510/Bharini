from django.contrib.auth import get_user_model
from django.db import IntegrityError, transaction
from django.db.models import Q
from django.utils import timezone
from rest_framework import status
from rest_framework.throttling import ScopedRateThrottle
from rest_framework.views import APIView

from accounts.responses import error_response, ok_response
from artist_posts.serializers import user_summary

from .models import Connection, connected_ids, connection_status

User = get_user_model()

REQUEST_LIST_LIMIT = 50
CONNECTION_RESULTS = 50


def not_found(request):
    return error_response(request, 'not_found', 'Profile not found.', status.HTTP_404_NOT_FOUND)


class ConnectAPIView(APIView):
    """POST asks to connect (or accepts their pending ask); DELETE cancels, declines or removes."""

    throttle_scope = 'connections'

    def get_throttles(self):
        return [ScopedRateThrottle()] if self.request.method == 'POST' else super().get_throttles()

    def respond(self, request, other):
        return ok_response(request, message='Connection updated.', data={'connection': connection_status(request.user, other)})

    def post(self, request, user_id, *args, **kwargs):
        other = User.objects.filter(pk=user_id, is_active=True).first()
        if not other:
            return not_found(request)
        if other.id == request.user.id:
            return error_response(request, 'cannot_connect_self', 'You cannot connect with yourself.', status.HTTP_400_BAD_REQUEST)
        link = Connection.between(request.user, other)
        if link is None:
            try:
                with transaction.atomic():
                    Connection.objects.create(from_user=request.user, to_user=other)
            except IntegrityError:  # double click; the request already exists
                pass
        elif link.status == Connection.Status.PENDING and link.to_user_id == request.user.id:
            # they asked first, so connecting back accepts
            link.status = Connection.Status.ACCEPTED
            link.responded_at = timezone.now()
            link.save(update_fields=['status', 'responded_at'])
        return self.respond(request, other)

    def delete(self, request, user_id, *args, **kwargs):
        other = User.objects.filter(pk=user_id).first()
        if not other:
            return not_found(request)
        link = Connection.between(request.user, other)
        if link:
            link.delete()
        return self.respond(request, other)


class ConnectionRequestsAPIView(APIView):
    """Requests waiting for your answer, newest first."""

    def get(self, request, *args, **kwargs):
        pending = (
            Connection.objects.filter(to_user=request.user, status=Connection.Status.PENDING, from_user__is_active=True)
            .select_related('from_user__artist_profile', 'from_user__production_profile')
            .order_by('-created_at')[:REQUEST_LIST_LIMIT]
        )
        return ok_response(request, message='Connection requests.', data={
            'requests': [{**user_summary(request, item.from_user), 'requested_at': item.created_at} for item in pending],
        })


class MyConnectionsAPIView(APIView):
    """People you are connected with, optionally filtered by name; used to pick who to send a post to."""

    def get(self, request, *args, **kwargs):
        people = User.objects.filter(pk__in=connected_ids(request.user), is_active=True)
        for word in request.query_params.get('q', '').split()[:5]:
            people = people.filter(
                Q(first_name__icontains=word)
                | Q(last_name__icontains=word)
                | Q(artist_profile__username__icontains=word)
                | Q(production_profile__name__icontains=word)
            )
        people = people.select_related('artist_profile', 'production_profile').order_by('first_name', 'last_name', 'id')
        # shortcut: first CONNECTION_RESULTS only; the search box narrows it down
        return ok_response(request, message='Connections.', data={
            'connections': [user_summary(request, person) for person in people.distinct()[:CONNECTION_RESULTS]],
        })
