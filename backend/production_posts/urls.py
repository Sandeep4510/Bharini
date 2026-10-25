from django.urls import path

from .views import OpportunitiesAPIView, PostCommentListCreateAPIView, PostLikeAPIView, PostListCreateAPIView, PostShareAPIView

urlpatterns = [
    path('', PostListCreateAPIView.as_view(), name='post-list-create'),
    path('opportunities/', OpportunitiesAPIView.as_view(), name='opportunities'),
    path('<int:pk>/like/', PostLikeAPIView.as_view(), name='post-like'),
    path('<int:pk>/share/', PostShareAPIView.as_view(), name='post-share'),
    path('<int:pk>/comments/', PostCommentListCreateAPIView.as_view(), name='post-comments'),
]
