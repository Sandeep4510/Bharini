from django.db.models import Count, Exists, F, OuterRef
from django.shortcuts import get_object_or_404
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
        serializer.is_valid(raise_exception=True)
        serializer.save(production=profile)
        return ok_response(request, 'Post published.', data=serializer.data, status_code=status.HTTP_201_CREATED)


class ProductionPostsAPIView(APIView):
    def get(self, request, pk):
        get_object_or_404(ProductionProfile, pk=pk)
        return paginated_post_list(request, annotated_posts(request.user).filter(production_id=pk))


class PostLikeAPIView(APIView):
    def post(self, request, pk):
        post = get_object_or_404(Post, pk=pk)
        PostLike.objects.get_or_create(post=post, user=request.user)
        return ok_response(request, 'Post liked.', data={'like_count': post.likes.count(), 'is_liked': True})

    def delete(self, request, pk):
        post = get_object_or_404(Post, pk=pk)
        PostLike.objects.filter(post=post, user=request.user).delete()
        return ok_response(request, 'Like removed.', data={'like_count': post.likes.count(), 'is_liked': False})


class PostShareAPIView(APIView):
    def post(self, request, pk):
        post = get_object_or_404(Post, pk=pk)
        Post.objects.filter(pk=post.pk).update(share_count=F('share_count') + 1)
        post.refresh_from_db(fields=['share_count'])
        return ok_response(request, 'Post shared.', data={'share_count': post.share_count})


class PostCommentListCreateAPIView(APIView):
    def get(self, request, pk):
        get_object_or_404(Post, pk=pk)
        paginator = CommentCursorPagination()
        page = paginator.paginate_queryset(
            PostComment.objects.select_related('author').filter(post_id=pk), request, view=None,
        )
        data = PostCommentSerializer(page, many=True).data
        return ok_response(request, 'Comments fetched.', data=paginator.get_paginated_response(data).data)

    def post(self, request, pk):
        post = get_object_or_404(Post, pk=pk)
        serializer = PostCommentSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        serializer.save(post=post, author=request.user)
        return ok_response(request, 'Comment added.', data=serializer.data, status_code=status.HTTP_201_CREATED)
