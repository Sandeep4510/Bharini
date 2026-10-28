from rest_framework import serializers

import re

from connections.models import connection_status
from profiles.models import USERNAME_PATTERN
from profiles.serializers import username_taken

from .models import ProductionProfile, ProductionTitle


class ProductionSummarySerializer(serializers.ModelSerializer):
    class Meta:
        model = ProductionProfile
        fields = ['id', 'name', 'kind', 'profile_picture']


class TitleCreditSerializer(serializers.ModelSerializer):
    id = serializers.IntegerField(source='title.id', read_only=True)
    name = serializers.CharField(source='title.name', read_only=True)
    kind = serializers.CharField(source='title.kind', read_only=True)
    release_year = serializers.IntegerField(source='title.release_year', read_only=True)
    poster = serializers.ImageField(source='title.poster', read_only=True)

    class Meta:
        model = ProductionTitle
        fields = ['id', 'name', 'kind', 'release_year', 'poster', 'role']


class ProductionSerializer(serializers.ModelSerializer):
    title_credits = TitleCreditSerializer(many=True, read_only=True)
    is_owner = serializers.SerializerMethodField()
    owner_id = serializers.IntegerField(read_only=True)
    follower_count = serializers.SerializerMethodField()
    following_count = serializers.SerializerMethodField()
    is_following = serializers.SerializerMethodField()
    connection = serializers.SerializerMethodField()
    username = serializers.CharField(max_length=30, required=False)

    class Meta:
        model = ProductionProfile
        fields = [
            'id', 'kind', 'name', 'username', 'profile_picture', 'title_credits', 'is_owner', 'created_at',
            'owner_id', 'follower_count', 'following_count', 'is_following', 'connection',
        ]
        read_only_fields = ['id', 'created_at']

    def get_is_owner(self, obj):
        return obj.owner_id == self.context['request'].user.id

    def validate_username(self, value):
        value = value.strip().lower()
        if not re.match(USERNAME_PATTERN, value):
            raise serializers.ValidationError('Use 3-30 lowercase letters, numbers, dots or underscores.')
        if username_taken(value, self.instance):
            raise serializers.ValidationError('This username is taken. Try another.')
        return value

    def validate(self, attrs):
        if self.instance is None and not attrs.get('username'):
            raise serializers.ValidationError({'username': ['Choose a username.']})
        return attrs

    # follows belong to the owner's account (artist_posts.Follow), so the production page shows theirs
    def get_follower_count(self, obj):
        return obj.owner.followers.count()

    def get_following_count(self, obj):
        return obj.owner.following.count()

    def get_is_following(self, obj):
        return obj.owner.followers.filter(follower=self.context['request'].user).exists()

    def get_connection(self, obj):
        viewer = self.context['request'].user
        return 'none' if obj.owner_id == viewer.id else connection_status(viewer, obj.owner)
