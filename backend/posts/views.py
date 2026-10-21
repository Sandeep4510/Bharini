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
