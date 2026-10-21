import re
import secrets
from datetime import date
from urllib.parse import urlparse

from django.core.exceptions import ValidationError as DjangoValidationError
from django.utils import timezone
from rest_framework import serializers

from .media import process_photo
from .models import PHOTO_SLOTS, USERNAME_PATTERN, ArtistProfile, Discipline, ProfileDocument, ProfileLanguage
from .slots import SHOWREEL_LINK_LIMIT, SLOTS

SHOWREEL_HOSTS = ('youtube.com', 'youtu.be', 'vimeo.com', 'drive.google.com')


def host_matches(url, hosts):
    hostname = (urlparse(url).hostname or '').lower()
    return any(hostname == host or hostname.endswith(f'.{host}') for host in hosts)


def absolute_url(request, field_file):
    if not field_file:
        return None
    return request.build_absolute_uri(field_file.url) if request else field_file.url


def username_taken(username, profile=None):
    return ArtistProfile.objects.filter(username=username).exclude(pk=getattr(profile, 'pk', None)).exists()


def suggest_usernames(wanted, profile, count=4):
    """Free usernames close to `wanted`: name, birth year and number variations."""
    base = re.sub(r'[^a-z0-9_.]', '', wanted.lower())[:24] or 'artist'
    base = base.ljust(3, '_')
    user = profile.user
    candidates = [
        f'{base}_{user.last_name.lower()}' if user.last_name else '',
        f'{base}.{user.first_name.lower()}' if user.first_name else '',
        f'{base}{profile.date_of_birth.year}' if profile.date_of_birth else '',
        f'{base}_official',
        f'the.{base}',
        *(f'{base}{secrets.randbelow(900) + 100}' for _ in range(4)),
    ]
    candidates = [name[:30] for name in dict.fromkeys(candidates) if name and re.match(USERNAME_PATTERN, name[:30])]
    taken = set(ArtistProfile.objects.filter(username__in=candidates).values_list('username', flat=True))
    return [name for name in candidates if name not in taken][:count]


class ProfileDocumentSerializer(serializers.ModelSerializer):
    class Meta:
        model = ProfileDocument
        fields = ('id', 'kind', 'title', 'file', 'uploaded_at')
        read_only_fields = ('id', 'uploaded_at')

    def to_representation(self, instance):
        data = super().to_representation(instance)
        data['file'] = absolute_url(self.context.get('request'), instance.file)
        return data


class ProfileLanguageSerializer(serializers.ModelSerializer):
    class Meta:
        model = ProfileLanguage
        fields = ('language', 'level')


class LanguageListSerializer(serializers.Serializer):
    languages = ProfileLanguageSerializer(many=True, allow_empty=False, max_length=20)

    def validate_languages(self, value):
        names = [item['language'] for item in value]
        if len(names) != len(set(names)):
            raise serializers.ValidationError('Each language can be added only once.')
        return value


class ArtistProfileSerializer(serializers.ModelSerializer):
    username = serializers.CharField(max_length=30, required=False, allow_blank=True, allow_null=True)
    languages = ProfileLanguageSerializer(many=True, read_only=True)
    documents = ProfileDocumentSerializer(many=True, read_only=True)
    alt_email_verified = serializers.SerializerMethodField()
    photos = serializers.SerializerMethodField()
    media_slots = serializers.SerializerMethodField()
    missing_fields = serializers.ListField(read_only=True)
    onboarding_complete = serializers.BooleanField(read_only=True)
    completion_percent = serializers.IntegerField(read_only=True)

    class Meta:
        model = ArtistProfile
        fields = (
            'username',
            'disciplines',
            'profile_photo',
            'bio',
            'gender',
            'date_of_birth',
            'height_cm',
            'location',
            'phone',
            'alt_email',
            'alt_email_verified',
            'instagram_url',
            'facebook_url',
            'showreel_links',
            'languages',
            'documents',
            'photos',
            'media_slots',
            'missing_fields',
            'onboarding_complete',
            'completion_percent',
        )

    def to_representation(self, instance):
        data = super().to_representation(instance)
        data['profile_photo'] = absolute_url(self.context.get('request'), instance.profile_photo)
        return data

    def get_alt_email_verified(self, obj):
        return obj.alt_email_verified_at is not None

    def get_photos(self, obj):
        request = self.context.get('request')
        return {slot: absolute_url(request, getattr(obj, f'photo_{slot}')) for slot in PHOTO_SLOTS}

    def get_media_slots(self, obj):
        request = self.context.get('request')
        uploaded = {(item.discipline, item.slot): item for item in obj.media.all()}
        sections = []
        for discipline in obj.disciplines:
            slots = []
            for slot in SLOTS[discipline]:
                item = uploaded.get((discipline, slot['key']))
                file = {'url': absolute_url(request, item.file), 'duration_seconds': item.duration_seconds} if item else None
                slots.append({**slot, 'file': file})
            sections.append({'discipline': discipline, 'label': Discipline(discipline).label, 'slots': slots})
        return sections

    def validate_username(self, value):
        value = (value or '').strip().lower()
        if not value:
            return None
        if not re.match(USERNAME_PATTERN, value):
            raise serializers.ValidationError('Use 3-30 lowercase letters, numbers, dots or underscores.')
        if username_taken(value, self.instance):
            raise serializers.ValidationError('This username is taken. Try one of the suggestions.')
        return value

    def validate_disciplines(self, value):
        if not value:
            raise serializers.ValidationError('Pick at least one.')
        return list(dict.fromkeys(value))

    def validate_profile_photo(self, value):
        try:
            return process_photo(value, 'profile')
        except DjangoValidationError as exc:
            raise serializers.ValidationError(exc.messages) from exc

    def validate_date_of_birth(self, value):
        if value >= timezone.localdate():
            raise serializers.ValidationError('Date of birth must be in the past.')
        if value < date(1900, 1, 1):
            raise serializers.ValidationError('Enter a real date of birth.')
        return value

    def validate_alt_email(self, value):
        if value and value.lower() == self.instance.user.email.lower():
            raise serializers.ValidationError('Use a different email from your login email.')
        return value

    def validate_instagram_url(self, value):
        if value and not host_matches(value, ('instagram.com',)):
            raise serializers.ValidationError('Enter your Instagram profile link, like https://instagram.com/yourname.')
        return value

    def validate_facebook_url(self, value):
        if value and not host_matches(value, ('facebook.com', 'fb.com')):
            raise serializers.ValidationError('Enter your Facebook profile link, like https://facebook.com/yourname.')
        return value

    def validate_showreel_links(self, value):
        if not isinstance(value, list) or len(value) > SHOWREEL_LINK_LIMIT:
            raise serializers.ValidationError(f'Add up to {SHOWREEL_LINK_LIMIT} links.')
        url_field = serializers.URLField()
        for link in value:
            url_field.run_validation(link)
            if not host_matches(link, SHOWREEL_HOSTS):
                raise serializers.ValidationError('Links must be on YouTube, Vimeo or Google Drive.')
        return value

    def update(self, instance, validated_data):
        old_photo = instance.profile_photo.name if 'profile_photo' in validated_data else None
        new_alt_email = validated_data.get('alt_email')
        if new_alt_email is not None and new_alt_email.lower() != instance.alt_email.lower():
            instance.alt_email_verified_at = None
            instance.alt_email_pin_hash = ''
            instance.alt_email_pin_expires_at = None
            instance.alt_email_pin_attempts = 0

        instance = super().update(instance, validated_data)
        if old_photo and old_photo != instance.profile_photo.name:
            instance.profile_photo.storage.delete(old_photo)
        return instance


class PinSerializer(serializers.Serializer):
    pin = serializers.RegexField(r'^\d{6}$', error_messages={'invalid': 'Enter the 6-digit PIN.'})
