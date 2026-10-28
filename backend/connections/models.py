from django.conf import settings
from django.db import models
from django.db.models import Q


class Connection(models.Model):
    """A two-way link, LinkedIn style: one side asks, the other accepts. Separate from one-way follows."""

    class Status(models.TextChoices):
        PENDING = 'pending', 'Pending'
        ACCEPTED = 'accepted', 'Accepted'

    from_user = models.ForeignKey(settings.AUTH_USER_MODEL, on_delete=models.CASCADE, related_name='sent_connections')
    to_user = models.ForeignKey(settings.AUTH_USER_MODEL, on_delete=models.CASCADE, related_name='received_connections')
    status = models.CharField(max_length=10, choices=Status.choices, default=Status.PENDING)
    created_at = models.DateTimeField(auto_now_add=True)
    responded_at = models.DateTimeField(null=True, blank=True)

    class Meta:
        constraints = [
            models.UniqueConstraint(fields=['from_user', 'to_user'], name='unique_connection_request'),
            models.CheckConstraint(condition=~Q(from_user=models.F('to_user')), name='no_self_connection'),
        ]

    @classmethod
    def between(cls, first, second):
        """The one row linking two users, whichever of them asked."""
        return cls.objects.filter(
            Q(from_user=first, to_user=second) | Q(from_user=second, to_user=first)
        ).first()


class Block(models.Model):
    """`blocker` stops seeing `blocked`. Both sides lose each other's posts, chats, profile and the connection."""

    blocker = models.ForeignKey(settings.AUTH_USER_MODEL, on_delete=models.CASCADE, related_name='blocks_made')
    blocked = models.ForeignKey(settings.AUTH_USER_MODEL, on_delete=models.CASCADE, related_name='blocks_received')
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        constraints = [
            models.UniqueConstraint(fields=['blocker', 'blocked'], name='unique_block'),
            models.CheckConstraint(condition=~Q(blocker=models.F('blocked')), name='no_self_block'),
        ]


def blocked_ids(user):
    """Ids hidden from `user`, whichever side blocked: people they blocked and people who blocked them."""
    pairs = Block.objects.filter(Q(blocker=user) | Q(blocked=user)).values_list('blocker_id', 'blocked_id')
    return {blocked if blocker == user.id else blocker for blocker, blocked in pairs}


def connection_status(viewer, other):
    """none, pending_sent, pending_received or connected, from the viewer's side."""
    link = Connection.between(viewer, other)
    if not link:
        return 'none'
    if link.status == Connection.Status.ACCEPTED:
        return 'connected'
    return 'pending_sent' if link.from_user_id == viewer.id else 'pending_received'


def are_connected(first, second):
    link = Connection.between(first, second)
    return bool(link and link.status == Connection.Status.ACCEPTED)


def connected_ids(user):
    """Ids of everyone the user is connected with, in one query."""
    links = Connection.objects.filter(Q(from_user=user) | Q(to_user=user), status=Connection.Status.ACCEPTED)
    return {link.to_user_id if link.from_user_id == user.id else link.from_user_id for link in links.only('from_user', 'to_user')}
