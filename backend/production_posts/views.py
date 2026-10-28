from django.db.models import Case, Count, Exists, F, OuterRef, Value, When
from rest_framework import status
from rest_framework.pagination import CursorPagination
from rest_framework.views import APIView

from accounts.views import error_response, ok_response
from productions.models import ProductionProfile

from .models import Post, PostComment, PostLike
from .serializers import PostCommentSerializer, PostSerializer


class PostCursorPagination(CursorPagination):
    page_size = 20
    ordering = '-created_at'


class CommentCursorPagination(CursorPagination):
    page_size = 50
    ordering = 'created_at'


def annotated_posts(user):
    return (
        Post.objects.select_related('production', 'casting')
        .annotate(
            like_count=Count('likes', distinct=True),
            comment_count=Count('comments', distinct=True),
            is_liked=Exists(PostLike.objects.filter(post=OuterRef('pk'), user=user)),
        )
    )


def not_found(request, what='Post'):
    return error_response(request, 'not_found', f'{what} not found.', status.HTTP_404_NOT_FOUND)


def validation_error(request, message, errors):
    return error_response(request, 'validation_error', message, status.HTTP_400_BAD_REQUEST, field_errors=errors)


def paginated_post_list(request, queryset):
    paginator = PostCursorPagination()
    page = paginator.paginate_queryset(queryset, request, view=None)
    data = PostSerializer(page, many=True, context={'request': request}).data
    return ok_response(request, 'Posts fetched.', data=paginator.get_paginated_response(data).data)


class PostListCreateAPIView(APIView):
    def get(self, request):
        return paginated_post_list(request, annotated_posts(request.user))

    def post(self, request):
        profile = ProductionProfile.objects.filter(owner=request.user).first()
        if profile is None:
            return error_response(
                request, 'forbidden', 'Only production profile owners can publish posts.', status.HTTP_403_FORBIDDEN,
            )
        serializer = PostSerializer(data=request.data, context={'request': request})
        if not serializer.is_valid():
            return validation_error(request, 'Please fix the highlighted fields.', serializer.errors)
        serializer.save(production=profile)
        return ok_response(request, 'Post published.', data=serializer.data, status_code=status.HTTP_201_CREATED)


class ProductionPostsAPIView(APIView):
    def get(self, request, pk):
        if not ProductionProfile.objects.filter(pk=pk).exists():
            return not_found(request, 'Production profile')
        return paginated_post_list(request, annotated_posts(request.user).filter(production_id=pk))


class PostLikeAPIView(APIView):
    def post(self, request, pk):
        post = Post.objects.filter(pk=pk).first()
        if post is None:
            return not_found(request)
        PostLike.objects.get_or_create(post=post, user=request.user)
        return ok_response(request, 'Post liked.', data={'like_count': post.likes.count(), 'is_liked': True})

    def delete(self, request, pk):
        post = Post.objects.filter(pk=pk).first()
        if post is None:
            return not_found(request)
        PostLike.objects.filter(post=post, user=request.user).delete()
        return ok_response(request, 'Like removed.', data={'like_count': post.likes.count(), 'is_liked': False})


class PostShareAPIView(APIView):
    def post(self, request, pk):
        post = Post.objects.filter(pk=pk).first()
        if post is None:
            return not_found(request)
        Post.objects.filter(pk=post.pk).update(share_count=F('share_count') + 1)
        post.refresh_from_db(fields=['share_count'])
        return ok_response(request, 'Post shared.', data={'share_count': post.share_count})


class PostCommentListCreateAPIView(APIView):
    def get(self, request, pk):
        if not Post.objects.filter(pk=pk).exists():
            return not_found(request)
        paginator = CommentCursorPagination()
        page = paginator.paginate_queryset(
            PostComment.objects.select_related('author').filter(post_id=pk), request, view=None,
        )
        data = PostCommentSerializer(page, many=True).data
        return ok_response(request, 'Comments fetched.', data=paginator.get_paginated_response(data).data)

    def post(self, request, pk):
        post = Post.objects.filter(pk=pk).first()
        if post is None:
            return not_found(request)
        serializer = PostCommentSerializer(data=request.data)
        if not serializer.is_valid():
            return validation_error(request, 'Please fix your comment.', serializer.errors)
        serializer.save(post=post, author=request.user)
        return ok_response(request, 'Comment added.', data=serializer.data, status_code=status.HTTP_201_CREATED)


OPPORTUNITY_LIMIT = 20


def artist_city(user):
    """'Mangaluru, Karnataka' -> 'mangaluru'; empty when the viewer has no location."""
    profile = getattr(user, 'artist_profile', None)
    return (profile.location.split(',')[0].strip() if profile and profile.location else '').lower()


class OpportunitiesAPIView(APIView):
    """Casting calls for the home feed: ones in the viewer's city first, then the newest elsewhere."""

    def get(self, request):
        city = artist_city(request.user)
        near = When(casting__location__icontains=city, then=Value(True)) if city else None
        posts = annotated_posts(request.user).filter(post_type=Post.Type.CASTING_CALL).annotate(
            near_you=Case(near, default=Value(False)) if near else Value(False),
        ).order_by('-near_you', '-created_at')[:OPPORTUNITY_LIMIT]
        # shortcut: city text match only; switch to a city/state field or geo distance when locations get structured
        data = [
            {**item, 'near_you': post.near_you}
            for post, item in zip(posts, PostSerializer(posts, many=True, context={'request': request}).data)
        ]
        return ok_response(request, 'Opportunities.', data={'posts': data})
