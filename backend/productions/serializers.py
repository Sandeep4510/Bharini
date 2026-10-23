from rest_framework import serializers

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

    class Meta:
        model = ProductionProfile
        fields = ['id', 'kind', 'name', 'profile_picture', 'title_credits', 'is_owner', 'created_at']
        read_only_fields = ['id', 'created_at']

    def get_is_owner(self, obj):
        return obj.owner_id == self.context['request'].user.id

    def create(self, validated_data):
        user = self.context['request'].user
        if ProductionProfile.objects.filter(owner=user).exists():
            raise serializers.ValidationError('You already have a production profile.')
        return ProductionProfile.objects.create(owner=user, **validated_data)
