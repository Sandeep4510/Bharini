from rest_framework import status
from rest_framework.views import APIView

from accounts.responses import error_response, ok_response

from .serializers import PostSerializer

RECENT_POSTS = 20


class PostListCreateAPIView(APIView):
    def get(self, request, *args, **kwargs):
        posts = request.user.posts.select_related('author')[:RECENT_POSTS]
        serializer = PostSerializer(posts, many=True, context={'request': request})
        return ok_response(request, message='Your posts.', data={'posts': serializer.data})

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
    """Only the author can edit or delete; anyone else gets 404, so post ids are not probeable."""

    def get_post(self, request, post_id):
        return request.user.posts.filter(pk=post_id).first()

    def not_found(self, request):
        return error_response(request, 'not_found', 'Post not found.', status.HTTP_404_NOT_FOUND)

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
