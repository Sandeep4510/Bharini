from pathlib import Path

from django.core.exceptions import ValidationError as DjangoValidationError
from rest_framework import serializers

from profiles.media import VIDEO_EXTS, process_photo
from profiles.serializers import absolute_url
from profiles.slots import MB

from .models import Post, PostComment

VIDEO_MAX_MB = 100
IMAGE_EXTS = {'.jpg', '.jpeg', '.png', '.webp'}


def user_summary(request, user):
    """What anyone signed in may see about an account: no email, phone or birth date."""
    profile = getattr(user, 'artist_profile', None)
    production = getattr(user, 'production_profile', None)
    photo = profile.profile_photo if profile else production.profile_picture if production else None
    return {
        'id': user.id,
        'name': production.name if production else user.get_full_name() or 'Bharini member',
        'role': user.role,
        'username': profile.username if profile else None,
        'profile_photo': absolute_url(request, photo),
        # production houses link to their /productions/<id> page instead of /u/<id>
        'production_id': production.id if production else None,
    }


class PostSerializer(serializers.ModelSerializer):
    author = serializers.SerializerMethodField()
    like_count = serializers.SerializerMethodField()
    comment_count = serializers.SerializerMethodField()
    liked = serializers.SerializerMethodField()
    is_mine = serializers.SerializerMethodField()
    author_followed = serializers.SerializerMethodField()

    class Meta:
        model = Post
        fields = ('id', 'author', 'body', 'media', 'media_kind', 'created_at', 'like_count', 'comment_count', 'liked', 'is_mine', 'author_followed')
        read_only_fields = ('id', 'media_kind', 'created_at')

    def get_author(self, obj):
        return user_summary(self.context.get('request'), obj.author)

    # feed querysets annotate these; a freshly created or edited post falls back to a query
    def get_like_count(self, obj):
        return obj.like_count if hasattr(obj, 'like_count') else obj.likes.count()

    def get_comment_count(self, obj):
        return obj.comment_count if hasattr(obj, 'comment_count') else obj.comments.count()

    def get_liked(self, obj):
        return obj.liked if hasattr(obj, 'liked') else obj.likes.filter(user=self.context['request'].user).exists()

    def get_author_followed(self, obj):
        if hasattr(obj, 'author_followed'):
            return obj.author_followed
        return obj.author.followers.filter(follower=self.context['request'].user).exists()

    def get_is_mine(self, obj):
        return obj.author_id == self.context['request'].user.id

    def to_representation(self, instance):
        data = super().to_representation(instance)
        data['media'] = absolute_url(self.context.get('request'), instance.media)
        return data

    def validate_body(self, value):
        if not value.strip():
            raise serializers.ValidationError('Write something to post.')
        return value.strip()

    def validate(self, attrs):
        media = attrs.get('media')
        if not media:
            return attrs
        suffix = Path(media.name).suffix.lower()
        if suffix in IMAGE_EXTS:
            try:
                attrs['media'] = process_photo(media, None)  # re-encode: drops EXIF such as GPS location
            except DjangoValidationError as exc:
                raise serializers.ValidationError({'media': exc.messages}) from exc
            attrs['media_kind'] = Post.MediaKind.IMAGE
        elif suffix in VIDEO_EXTS:
            if media.size > VIDEO_MAX_MB * MB:
                raise serializers.ValidationError({'media': f'Video is too large (max {VIDEO_MAX_MB} MB).'})
            attrs['media_kind'] = Post.MediaKind.VIDEO
        else:
            raise serializers.ValidationError({'media': 'Attach a JPG, PNG or WebP image, or an MP4, MOV or WebM video.'})
        return attrs


class CommentSerializer(serializers.ModelSerializer):
    author = serializers.SerializerMethodField()
    can_delete = serializers.SerializerMethodField()

    class Meta:
        model = PostComment
        fields = ('id', 'author', 'body', 'created_at', 'can_delete')
        read_only_fields = ('id', 'created_at')

    def get_author(self, obj):
        return user_summary(self.context.get('request'), obj.author)

    def get_can_delete(self, obj):
        user_id = self.context['request'].user.id
        return user_id in (obj.author_id, obj.post.author_id)

    def validate_body(self, value):
        if not value.strip():
            raise serializers.ValidationError('Write a comment.')
        return value.strip()
