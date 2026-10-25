from django.urls import path

from .views import (
    FollowAPIView,
    FollowerSearchAPIView,
    PostCommentAPIView,
    PostCommentsAPIView,
    PostDetailAPIView,
    PostLikeAPIView,
    PostListCreateAPIView,
    UserProfileAPIView,
)

urlpatterns = [
    path('', PostListCreateAPIView.as_view(), name='posts'),
    path('<int:post_id>/', PostDetailAPIView.as_view(), name='post-detail'),
    path('<int:post_id>/like/', PostLikeAPIView.as_view(), name='post-like'),
    path('<int:post_id>/comments/', PostCommentsAPIView.as_view(), name='post-comments'),
    path('<int:post_id>/comments/<int:comment_id>/', PostCommentAPIView.as_view(), name='post-comment'),
]

# mounted at /api/v1/users/
user_urlpatterns = [
    path('me/followers/', FollowerSearchAPIView.as_view(), name='user-follower-search'),
    path('<int:user_id>/', UserProfileAPIView.as_view(), name='user-profile'),
    path('<int:user_id>/follow/', FollowAPIView.as_view(), name='user-follow'),
]
