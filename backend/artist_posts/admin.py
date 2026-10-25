from django.contrib import admin

from .models import Follow, Post, PostComment


@admin.register(Post)
class PostAdmin(admin.ModelAdmin):
    list_display = ('author', 'media_kind', 'created_at')
    search_fields = ('author__email', 'body')


@admin.register(PostComment)
class PostCommentAdmin(admin.ModelAdmin):
    list_display = ('author', 'post', 'created_at')
    search_fields = ('author__email', 'body')


@admin.register(Follow)
class FollowAdmin(admin.ModelAdmin):
    list_display = ('follower', 'followee', 'created_at')
