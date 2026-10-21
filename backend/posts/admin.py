from django.contrib import admin

from .models import Post


@admin.register(Post)
class PostAdmin(admin.ModelAdmin):
    list_display = ('author', 'media_kind', 'created_at')
    search_fields = ('author__email', 'body')
