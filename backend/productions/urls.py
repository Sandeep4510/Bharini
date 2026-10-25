from django.urls import path

from production_posts.views import ProductionPostsAPIView

from .views import MyProductionAPIView, ProductionCreateAPIView, ProductionDetailAPIView

urlpatterns = [
    path('', ProductionCreateAPIView.as_view(), name='production-create'),
    path('me/', MyProductionAPIView.as_view(), name='production-me'),
    path('<int:pk>/', ProductionDetailAPIView.as_view(), name='production-detail'),
    path('<int:pk>/posts/', ProductionPostsAPIView.as_view(), name='production-posts'),
]
