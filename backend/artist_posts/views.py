from django.contrib.auth import get_user_model
from django.db.models import Case, Count, Exists, OuterRef, Q, Value, When
from rest_framework import status
from rest_framework.views import APIView

from accounts.responses import error_response, ok_response
from connections.models import connection_status
from profiles.models import Discipline
from profiles.serializers import ArtistProfileSerializer

from .models import Follow, Post, PostComment, PostLike
from .serializers import CommentSerializer, PostSerializer, user_summary

User = get_user_model()

FEED_SIZE = 50
PROFILE_POSTS = 20
COMMENT_LIMIT = 200
FOLLOWER_RESULTS = 20


def posts_for(request):
    """Posts by active accounts, with counts and the viewer's like worked out in one query."""
    return Post.objects.filter(author__is_active=True).select_related('author__artist_profile', 'author__production_profile').annotate(
        like_count=Count('likes', distinct=True),
        comment_count=Count('comments', distinct=True),
        liked=Exists(PostLike.objects.filter(post=OuterRef('pk'), user=request.user)),
        author_followed=Exists(Follow.objects.filter(follower=request.user, followee=OuterRef('author'))),
    )


def not_found(request, what='Post'):
    return error_response(request, 'not_found', f'{what} not found.', status.HTTP_404_NOT_FOUND)


def validation_error(request, message, errors):
    return error_response(request, 'validation_error', message, status.HTTP_400_BAD_REQUEST, field_errors=errors)


class PostListCreateAPIView(APIView):
    def get(self, request, *args, **kwargs):
        # own posts and posts by people you follow come first, then everyone else; newest first within each
        # shortcut: one page of FEED_SIZE, no pagination or ranking; add cursor paging once the feed grows
        posts = posts_for(request).annotate(
            rank=Case(When(Q(author=request.user) | Q(author_followed=True), then=Value(0)), default=Value(1)),
        ).order_by('rank', '-created_at')[:FEED_SIZE]
        serializer = PostSerializer(posts, many=True, context={'request': request})
        return ok_response(request, message='Your feed.', data={'posts': serializer.data})

    def post(self, request, *args, **kwargs):
        serializer = PostSerializer(data=request.data, context={'request': request})
        if not serializer.is_valid():
            return error_response(
                request,
                code='validation_error',
                message='Please fix your post.',
                status_code=status.HTTP_400_BAD_REQUEST,
                field_errors=serializer.errors,
            )
        serializer.save(author=request.user)
        return ok_response(request, message='Posted.', data=serializer.data, status_code=status.HTTP_201_CREATED)


class PostDetailAPIView(APIView):
    """Anyone signed in can read a post (shared links); only the author can edit or delete, others get 404."""

    def get_post(self, request, post_id):
        return request.user.posts.filter(pk=post_id).first()

    def not_found(self, request):
        return not_found(request)

    def get(self, request, post_id, *args, **kwargs):
        post = posts_for(request).filter(pk=post_id).first()
        if not post:
            return self.not_found(request)
        return ok_response(request, message='Post.', data=PostSerializer(post, context={'request': request}).data)

    def patch(self, request, post_id, *args, **kwargs):
        post = self.get_post(request, post_id)
        if not post:
            return self.not_found(request)
        serializer = PostSerializer(post, data=request.data, partial=True, context={'request': request})
        if not serializer.is_valid():
            return error_response(
                request,
                code='validation_error',
                message='Please fix your post.',
                status_code=status.HTTP_400_BAD_REQUEST,
                field_errors=serializer.errors,
            )
        old_media = post.media.name
        remove_media = str(request.data.get('remove_media', '')).lower() == 'true'
        if remove_media and 'media' not in serializer.validated_data:
            serializer.validated_data.update(media='', media_kind='')
        post = serializer.save()
        if old_media and old_media != post.media.name:
            post.media.storage.delete(old_media)
        return ok_response(request, message='Post updated.', data=serializer.data)

    def delete(self, request, post_id, *args, **kwargs):
        post = self.get_post(request, post_id)
        if not post:
            return self.not_found(request)
        post.media.delete(save=False)
        post.delete()
        return ok_response(request, message='Post deleted.')


class PostLikeAPIView(APIView):
    def respond(self, request, post):
        return ok_response(request, message='Likes updated.', data={
            'liked': post.likes.filter(user=request.user).exists(),
            'like_count': post.likes.count(),
        })

    def post(self, request, post_id, *args, **kwargs):
        post = Post.objects.filter(pk=post_id, author__is_active=True).first()
        if not post:
            return not_found(request)
        PostLike.objects.get_or_create(post=post, user=request.user)
        return self.respond(request, post)

    def delete(self, request, post_id, *args, **kwargs):
        post = Post.objects.filter(pk=post_id, author__is_active=True).first()
        if not post:
            return not_found(request)
        post.likes.filter(user=request.user).delete()
        return self.respond(request, post)


class PostCommentsAPIView(APIView):
    def get(self, request, post_id, *args, **kwargs):
        post = Post.objects.filter(pk=post_id, author__is_active=True).first()
        if not post:
            return not_found(request)
        # shortcut: oldest COMMENT_LIMIT only; page them once posts get busy
        comments = post.comments.select_related('author__artist_profile', 'author__production_profile', 'post')[:COMMENT_LIMIT]
        serializer = CommentSerializer(comments, many=True, context={'request': request})
        return ok_response(request, message='Comments.', data={'comments': serializer.data})

    def post(self, request, post_id, *args, **kwargs):
        post = Post.objects.filter(pk=post_id, author__is_active=True).first()
        if not post:
            return not_found(request)
        serializer = CommentSerializer(data=request.data, context={'request': request})
        if not serializer.is_valid():
            return validation_error(request, 'Please fix your comment.', serializer.errors)
        serializer.save(post=post, author=request.user)
        return ok_response(request, message='Comment added.', data=serializer.data, status_code=status.HTTP_201_CREATED)


class PostCommentAPIView(APIView):
    def delete(self, request, post_id, comment_id, *args, **kwargs):
        # the comment's author or the post's owner may delete it
        comment = PostComment.objects.filter(pk=comment_id, post_id=post_id).filter(
            Q(author=request.user) | Q(post__author=request.user)
        ).first()
        if not comment:
            return not_found(request, 'Comment')
        comment.delete()
        return ok_response(request, message='Comment deleted.')


class UserProfileAPIView(APIView):
    """Public view of any account: the summary, follow counts and recent posts."""

    def get(self, request, user_id, *args, **kwargs):
        user = User.objects.filter(pk=user_id, is_active=True).select_related('artist_profile', 'production_profile').first()
        if not user:
            return not_found(request, 'Profile')
        profile = getattr(user, 'artist_profile', None)
        posts = posts_for(request).filter(author=user).order_by('-created_at')[:PROFILE_POSTS]
        return ok_response(request, message='Profile.', data={
            **user_summary(request, user),
            'bio': profile.bio if profile else '',
            'location': profile.location if profile else '',
            'disciplines': [Discipline(value).label for value in profile.disciplines] if profile else [],
            'follower_count': user.followers.count(),
            'following_count': user.following.count(),
            'is_following': user.followers.filter(follower=request.user).exists(),
            'is_me': user.id == request.user.id,
            'connection': 'none' if user.id == request.user.id else connection_status(request.user, user),
            'posts': PostSerializer(posts, many=True, context={'request': request}).data,
            'portfolio': public_portfolio(request, profile) if profile else None,
        })


def public_portfolio(request, profile):
    """The work an artist shows casting teams; contact details and birth date stay private."""
    data = ArtistProfileSerializer(profile, context={'request': request}).data
    return {
        'photos': data['photos'] if profile.needs_casting_photos else None,
        'media_slots': data['media_slots'],
        'documents': data['documents'],
        'showreel_links': data['showreel_links'],
        'languages': [
            {'language': item.get_language_display(), 'level': item.get_level_display()} for item in profile.languages.all()
        ],
    }


class FollowerSearchAPIView(APIView):
    """People who follow you, filtered by name or username; every word of `q` must match."""

    def get(self, request, *args, **kwargs):
        followers = User.objects.filter(following__followee=request.user, is_active=True)
        for word in request.query_params.get('q', '').split()[:5]:
            followers = followers.filter(
                Q(first_name__icontains=word)
                | Q(last_name__icontains=word)
                | Q(artist_profile__username__icontains=word)
                | Q(production_profile__name__icontains=word)
            )
        followers = followers.select_related('artist_profile', 'production_profile').order_by('first_name', 'last_name', 'id')
        # shortcut: first FOLLOWER_RESULTS matches only; page them if accounts get thousands of followers
        data = [
            {**user_summary(request, user), 'connection': connection_status(request.user, user)}
            for user in followers.distinct()[:FOLLOWER_RESULTS]
        ]
        return ok_response(request, message='Followers.', data={'followers': data})


class FollowAPIView(APIView):
    def respond(self, request, user):
        return ok_response(request, message='Follow updated.', data={
            'is_following': user.followers.filter(follower=request.user).exists(),
            'follower_count': user.followers.count(),
        })

    def post(self, request, user_id, *args, **kwargs):
        user = User.objects.filter(pk=user_id, is_active=True).first()
        if not user:
            return not_found(request, 'Profile')
        if user.id == request.user.id:
            return error_response(request, 'cannot_follow_self', 'You cannot follow yourself.', status.HTTP_400_BAD_REQUEST)
        Follow.objects.get_or_create(follower=request.user, followee=user)
        return self.respond(request, user)

    def delete(self, request, user_id, *args, **kwargs):
        user = User.objects.filter(pk=user_id).first()
        if not user:
            return not_found(request, 'Profile')
        Follow.objects.filter(follower=request.user, followee=user).delete()
        return self.respond(request, user)
