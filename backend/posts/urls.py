from django.urls import path

from .views import PostDetailAPIView, PostListCreateAPIView

urlpatterns = [
    path('', PostListCreateAPIView.as_view(), name='posts'),
    path('<int:post_id>/', PostDetailAPIView.as_view(), name='post-detail'),
]
