import json

from django.core.exceptions import ValidationError as DjangoValidationError
from rest_framework import serializers

from productions.serializers import ProductionSummarySerializer
from profiles.media import process_photo
from profiles.serializers import absolute_url

from .models import CastingCall, Post, PostComment


class CastingCallSerializer(serializers.ModelSerializer):
    class Meta:
        model = CastingCall
        fields = ['age_min', 'age_max', 'gender', 'complexion', 'languages', 'location', 'approx_pay']

    def validate(self, attrs):
        if attrs['age_min'] > attrs['age_max']:
            raise serializers.ValidationError('age_min must be less than or equal to age_max.')
        return attrs


class PostSerializer(serializers.ModelSerializer):
    post_type = serializers.ChoiceField(choices=[Post.Type.CASTING_CALL], default=Post.Type.CASTING_CALL)
    body = serializers.CharField(max_length=2000)
    casting = CastingCallSerializer(required=False)
    image = serializers.ImageField(required=False, allow_null=True)
    production = ProductionSummarySerializer(read_only=True)
    like_count = serializers.SerializerMethodField()
    comment_count = serializers.SerializerMethodField()
    is_liked = serializers.SerializerMethodField()

    class Meta:
        model = Post
        fields = [
            'id', 'post_type', 'body', 'image', 'hashtags', 'share_count', 'like_count', 'comment_count',
            'is_liked', 'casting', 'production', 'created_at',
        ]
        read_only_fields = ['id', 'hashtags', 'share_count', 'created_at']

    def to_internal_value(self, data):
        # multipart requests cannot nest JSON, so the casting details arrive as a JSON string
        if isinstance(data.get('casting'), str):
            try:
                data = {key: data[key] for key in data}
                data['casting'] = json.loads(data['casting'])
            except ValueError as exc:
                raise serializers.ValidationError({'casting': 'Casting details must be valid JSON.'}) from exc
        return super().to_internal_value(data)

    def to_representation(self, instance):
        data = super().to_representation(instance)
        data['image'] = absolute_url(self.context.get('request'), instance.image)
        return data

    def validate_image(self, value):
        if value is None:
            return value
        try:
            return process_photo(value, None)  # re-encode: drops EXIF such as GPS location
        except DjangoValidationError as exc:
            raise serializers.ValidationError(exc.messages) from exc

    def get_like_count(self, obj):
        return getattr(obj, 'like_count', 0)

    def get_comment_count(self, obj):
        return getattr(obj, 'comment_count', 0)

    def get_is_liked(self, obj):
        return getattr(obj, 'is_liked', False)

    def validate(self, attrs):
        if 'casting' not in attrs:
            raise serializers.ValidationError({'casting': 'Casting details are required for a casting call.'})
        return attrs

    def create(self, validated_data):
        casting_data = validated_data.pop('casting', None)
        post = Post.objects.create(**validated_data)
        if casting_data:
            CastingCall.objects.create(post=post, **casting_data)
        return post


class PostCommentSerializer(serializers.ModelSerializer):
    author_name = serializers.CharField(source='author.get_full_name', read_only=True)
    body = serializers.CharField(max_length=500)

    class Meta:
        model = PostComment
        fields = ['id', 'body', 'author_name', 'created_at']
        read_only_fields = ['id', 'created_at']
