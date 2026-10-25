from django.urls import path

from .views import ConnectAPIView, ConnectionRequestsAPIView, MyConnectionsAPIView

# mounted at /api/v1/users/, next to the profile and follow routes
urlpatterns = [
    path('me/connections/', MyConnectionsAPIView.as_view(), name='my-connections'),
    path('me/connection-requests/', ConnectionRequestsAPIView.as_view(), name='connection-requests'),
    path('<int:user_id>/connect/', ConnectAPIView.as_view(), name='user-connect'),
]
