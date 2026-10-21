from pathlib import Path

from django.core.exceptions import ValidationError as DjangoValidationError
from rest_framework import serializers

from profiles.media import VIDEO_EXTS, process_photo
from profiles.serializers import absolute_url
from profiles.slots import MB

from .models import Post

VIDEO_MAX_MB = 100
IMAGE_EXTS = {'.jpg', '.jpeg', '.png', '.webp'}


class PostSerializer(serializers.ModelSerializer):
    author_name = serializers.SerializerMethodField()

    class Meta:
        model = Post
        fields = ('id', 'author_name', 'body', 'media', 'media_kind', 'created_at')
        read_only_fields = ('id', 'author_name', 'media_kind', 'created_at')

    def get_author_name(self, obj):
        return obj.author.get_full_name() or obj.author.email

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
