from django.urls import path

from .views import ConversationListAPIView, MessagesAPIView, UnreadCountAPIView

urlpatterns = [
    path('conversations/', ConversationListAPIView.as_view(), name='conversations'),
    path('conversations/<int:conversation_id>/messages/', MessagesAPIView.as_view(), name='conversation-messages'),
    path('unread-count/', UnreadCountAPIView.as_view(), name='messages-unread-count'),
]
