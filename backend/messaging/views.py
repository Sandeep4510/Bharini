from django.contrib.auth import get_user_model
from django.db.models import Count, Prefetch, Q
from django.utils import timezone
from rest_framework import status
from rest_framework.throttling import ScopedRateThrottle
from rest_framework.views import APIView

from accounts.responses import error_response, ok_response
from artist_posts.models import Post as ArtistPost
from artist_posts.serializers import user_summary
from connections.models import are_connected, blocked_ids, connected_ids
from notifications.push import notify
from production_posts.models import Post as ProductionPost
from profiles.serializers import absolute_url

from .models import Conversation, Message

User = get_user_model()

CONVERSATION_LIMIT = 50
THREAD_SIZE = 50
PREVIEW_CHARS = 200
SUMMARY_RELATED = ('artist_profile', 'production_profile')
MESSAGE_RELATED = (
    'shared_artist_post__author__artist_profile',
    'shared_artist_post__author__production_profile',
    'shared_production_post__production',
)


def shared_preview(request, message):
    """A small card for a post sent in chat; None when nothing was shared or the post is gone."""
    post = message.shared_artist_post
    if post and post.author.is_active:
        author = user_summary(request, post.author)
        return {
            'kind': 'artist', 'id': post.id, 'author_name': author['name'], 'author_photo': author['profile_photo'],
            'body': post.body[:PREVIEW_CHARS], 'image': absolute_url(request, post.media) if post.media_kind == 'image' else None,
            'url': f'/posts/{post.id}',
        }
    post = message.shared_production_post
    if post:
        production = post.production
        return {
            'kind': 'production', 'id': post.id, 'author_name': production.name,
            'author_photo': absolute_url(request, production.profile_picture),
            'body': post.body[:PREVIEW_CHARS], 'image': absolute_url(request, post.image),
            'url': f'/productions/{production.id}#post-{post.id}',
        }
    return None


def message_data(request, message):
    return {
        'id': message.id,
        'is_mine': message.sender_id == request.user.id,
        'body': message.body,
        'shared': shared_preview(request, message),
        'created_at': message.created_at,
        'read': message.read_at is not None,
    }


def as_id(value):
    """Client-sent ids as int; anything else matches no row instead of raising."""
    return int(value) if str(value).isdigit() else 0


def mine(request):
    """The viewer's chats, minus any with someone blocked either way (the viewer is never in their own blocked set)."""
    hidden = blocked_ids(request.user)
    return Conversation.objects.filter(Q(user_a=request.user) | Q(user_b=request.user)).exclude(
        Q(user_a__in=hidden) | Q(user_b__in=hidden),
    )


def conversation_data(request, conversation, last=None, unread=0, connected=None):
    other = conversation.other(request.user)
    return {
        'id': conversation.id,
        'other': user_summary(request, other),
        'last_message': message_data(request, last) if last else None,
        'unread_count': unread,
        'updated_at': conversation.updated_at,
        # old chats stay readable after a connection is removed, but only connected users can send
        'can_message': are_connected(request.user, other) if connected is None else connected,
    }


def not_connected(request, other):
    return error_response(
        request, 'not_connected', f'Connect with {other.get_full_name() or "them"} to message them.', status.HTTP_403_FORBIDDEN,
    )


class ConversationListAPIView(APIView):
    def get(self, request, *args, **kwargs):
        latest = Message.objects.select_related(*MESSAGE_RELATED).order_by('-created_at', '-id')[:1]
        conversations = (
            mine(request)
            .filter(user_a__is_active=True, user_b__is_active=True)
            .select_related(*(f'user_{side}__{rel}' for side in 'ab' for rel in SUMMARY_RELATED))
            .annotate(unread=Count('messages', filter=Q(messages__read_at__isnull=True) & ~Q(messages__sender=request.user)))
            .prefetch_related(Prefetch('messages', queryset=latest, to_attr='latest'))
            .order_by('-updated_at')[:CONVERSATION_LIMIT]
        )
        connected = connected_ids(request.user)
        data = [
            conversation_data(
                request, item, item.latest[0] if item.latest else None, item.unread, item.other(request.user).id in connected,
            )
            for item in conversations
        ]
        return ok_response(request, message='Conversations.', data={'conversations': data})

    def post(self, request, *args, **kwargs):
        """Open (or reuse) the chat with `user_id`."""
        other = User.objects.filter(pk=as_id(request.data.get('user_id')), is_active=True).exclude(
            pk__in=blocked_ids(request.user),
        ).first()
        if not other:
            return error_response(request, 'not_found', 'Profile not found.', status.HTTP_404_NOT_FOUND)
        if other.id == request.user.id:
            return error_response(request, 'cannot_message_self', 'You cannot message yourself.', status.HTTP_400_BAD_REQUEST)
        existing = Conversation.objects.filter(
            user_a=min(request.user, other, key=lambda user: user.id), user_b=max(request.user, other, key=lambda user: user.id),
        ).exists()
        if not existing and not are_connected(request.user, other):
            return not_connected(request, other)
        conversation, created = Conversation.between(request.user, other)
        last = conversation.messages.select_related(*MESSAGE_RELATED).last()
        unread = conversation.messages.filter(read_at__isnull=True).exclude(sender=request.user).count()
        return ok_response(
            request,
            message='Conversation.',
            data=conversation_data(request, conversation, last, unread),
            status_code=status.HTTP_201_CREATED if created else status.HTTP_200_OK,
        )


class MessagesAPIView(APIView):
    throttle_scope = 'messages_send'

    def get_throttles(self):
        # polling reads are covered by the default user rate; only sending gets the tighter scope
        return [ScopedRateThrottle()] if self.request.method == 'POST' else super().get_throttles()

    def get_conversation(self, request, conversation_id):
        return mine(request).filter(pk=conversation_id, user_a__is_active=True, user_b__is_active=True).first()

    def get(self, request, conversation_id, *args, **kwargs):
        conversation = self.get_conversation(request, conversation_id)
        if not conversation:
            return error_response(request, 'not_found', 'Conversation not found.', status.HTTP_404_NOT_FOUND)
        messages = conversation.messages.select_related(*MESSAGE_RELATED)
        after = request.query_params.get('after', '')
        if after.isdigit():
            # polling: only what arrived since the newest message the client has; reading happens on a full load
            page = list(messages.filter(id__gt=int(after))[:THREAD_SIZE])
        else:
            # shortcut: the latest THREAD_SIZE only, no scroll-back; add a `before` cursor when chats get long
            page = list(messages.order_by('-created_at', '-id')[:THREAD_SIZE])[::-1]
            conversation.messages.filter(read_at__isnull=True).exclude(sender=request.user).update(read_at=timezone.now())
        return ok_response(request, message='Messages.', data={
            'conversation': conversation_data(request, conversation),
            'messages': [message_data(request, message) for message in page],
        })

    def post(self, request, conversation_id, *args, **kwargs):
        conversation = self.get_conversation(request, conversation_id)
        if not conversation:
            return error_response(request, 'not_found', 'Conversation not found.', status.HTTP_404_NOT_FOUND)
        other = conversation.other(request.user)
        if not are_connected(request.user, other):
            return not_connected(request, other)
        body = str(request.data.get('body', '')).strip()
        if len(body) > 2000:
            return self.invalid(request, 'body', 'Keep messages under 2000 characters.')

        shared = {}
        artist_post_id = request.data.get('shared_artist_post_id')
        production_post_id = request.data.get('shared_production_post_id')
        if artist_post_id:
            shared['shared_artist_post'] = ArtistPost.objects.filter(pk=as_id(artist_post_id), author__is_active=True).first()
        if production_post_id:
            shared['shared_production_post'] = ProductionPost.objects.filter(pk=as_id(production_post_id)).first()
        if not all(shared.values()):
            return self.invalid(request, 'shared', 'That post is no longer available.')
        if not body and not shared:
            return self.invalid(request, 'body', 'Write a message.')

        message = Message.objects.create(conversation=conversation, sender=request.user, body=body, **shared)
        conversation.save(update_fields=['updated_at'])  # moves the chat to the top of both lists
        notify(
            [other], 'messages', user_summary(request, request.user)['name'],
            body or 'Shared a post with you', {'conversation_id': conversation.id},
        )
        return ok_response(request, message='Sent.', data=message_data(request, message), status_code=status.HTTP_201_CREATED)

    def invalid(self, request, field, text):
        return error_response(request, 'validation_error', text, status.HTTP_400_BAD_REQUEST, field_errors={field: [text]})


class UnreadCountAPIView(APIView):
    def get(self, request, *args, **kwargs):
        count = (
            Message.objects.filter(conversation__in=mine(request), read_at__isnull=True)
            .exclude(sender=request.user)
            .count()
        )
        return ok_response(request, message='Unread messages.', data={'unread': count})
