import re
import secrets
from datetime import timedelta

from django.contrib.auth import get_user_model
from django.contrib.auth.hashers import check_password, make_password
from django.core.exceptions import ValidationError as DjangoValidationError
from django.db import IntegrityError, transaction
from django.utils import timezone
from rest_framework import status
from rest_framework.permissions import BasePermission, IsAuthenticated
from rest_framework.throttling import ScopedRateThrottle
from rest_framework.views import APIView

from accounts.mail import send_mail_in_background
from accounts.responses import error_response, ok_response

from .media import process_photo, validate_document, validate_media
from .models import LANGUAGES, PHOTO_SLOTS, USERNAME_PATTERN, ArtistProfile, Discipline, PortfolioMedia, ProfileDocument, ProfileLanguage
from .serializers import (
    ArtistProfileSerializer,
    LanguageListSerializer,
    PinSerializer,
    ProfileDocumentSerializer,
    suggest_usernames,
    username_taken,
)
from .slots import get_slot

User = get_user_model()

PIN_LIFETIME = timedelta(minutes=10)
PIN_MAX_ATTEMPTS = 5
DOCUMENT_LIMIT = 20


class IsArtist(BasePermission):
    message = 'Only artist accounts have an artist profile.'

    def has_permission(self, request, view):
        return request.user.is_authenticated and request.user.role == User.Roles.ARTIST


class ArtistAPIView(APIView):
    permission_classes = [IsAuthenticated, IsArtist]

    def get_profile(self):
        profile, _ = ArtistProfile.objects.get_or_create(user=self.request.user)
        return profile

    def profile_response(self, profile, message):
        serializer = ArtistProfileSerializer(profile, context={'request': self.request})
        return ok_response(self.request, message=message, data=serializer.data)

    def upload_error(self, exc):
        return error_response(
            self.request,
            code='invalid_upload',
            message=exc.messages[0],
            status_code=status.HTTP_400_BAD_REQUEST,
            field_errors={'file': exc.messages},
        )

    def missing_file_error(self):
        return error_response(
            self.request,
            code='validation_error',
            message='Choose a file to upload.',
            status_code=status.HTTP_400_BAD_REQUEST,
            field_errors={'file': ['Choose a file to upload.']},
        )


class ProfileOptionsAPIView(APIView):
    def get(self, request, *args, **kwargs):
        def options(choices):
            return [{'value': value, 'label': str(label)} for value, label in choices]

        return ok_response(request, message='Profile options.', data={
            'disciplines': options(Discipline.choices),
            'genders': options(ArtistProfile.Gender.choices),
            'languages': options(LANGUAGES),
            'language_levels': options(ProfileLanguage.Level.choices),
            'document_kinds': options(ProfileDocument.Kind.choices),
        })


class ProfileAPIView(ArtistAPIView):
    def get(self, request, *args, **kwargs):
        return self.profile_response(self.get_profile(), 'Artist profile.')

    def patch(self, request, *args, **kwargs):
        profile = self.get_profile()
        serializer = ArtistProfileSerializer(profile, data=request.data, partial=True, context={'request': request})
        if not serializer.is_valid():
            return error_response(
                request,
                code='validation_error',
                message='Please fix the highlighted fields.',
                status_code=status.HTTP_400_BAD_REQUEST,
                field_errors=serializer.errors,
            )
        try:
            serializer.save()
        except IntegrityError:  # someone claimed the same username a moment ago
            return error_response(
                request,
                code='validation_error',
                message='This username is taken. Try one of the suggestions.',
                status_code=status.HTTP_400_BAD_REQUEST,
                field_errors={'username': ['This username is taken. Try one of the suggestions.']},
            )
        return self.profile_response(profile, 'Profile saved.')


class UsernameCheckAPIView(ArtistAPIView):
    def get(self, request, *args, **kwargs):
        wanted = request.query_params.get('username', '').strip().lower()
        profile = self.get_profile()
        available = bool(re.match(USERNAME_PATTERN, wanted)) and not username_taken(wanted, profile)
        return ok_response(request, message='Username checked.', data={
            'username': wanted,
            'available': available,
            'suggestions': [] if available else suggest_usernames(wanted or request.user.first_name, profile),
        })


class LanguagesAPIView(ArtistAPIView):
    def put(self, request, *args, **kwargs):
        serializer = LanguageListSerializer(data=request.data)
        if not serializer.is_valid():
            return error_response(
                request,
                code='validation_error',
                message='Please fix the highlighted languages.',
                status_code=status.HTTP_400_BAD_REQUEST,
                field_errors=serializer.errors,
            )
        profile = self.get_profile()
        with transaction.atomic():
            profile.languages.all().delete()
            ProfileLanguage.objects.bulk_create(
                ProfileLanguage(profile=profile, **item) for item in serializer.validated_data['languages']
            )
        return self.profile_response(profile, 'Languages saved.')


class PhotoAPIView(ArtistAPIView):
    def put(self, request, slot, *args, **kwargs):
        if slot not in PHOTO_SLOTS:
            return error_response(request, 'not_found', 'Unknown photo slot.', status.HTTP_404_NOT_FOUND)
        upload = request.FILES.get('file')
        if not upload:
            return self.missing_file_error()
        try:
            photo = process_photo(upload, slot)
        except DjangoValidationError as exc:
            return self.upload_error(exc)

        profile = self.get_profile()
        field = getattr(profile, f'photo_{slot}')
        old_name = field.name
        field.save(photo.name, photo)
        if old_name:
            field.storage.delete(old_name)
        return self.profile_response(profile, 'Photo saved.')

    def delete(self, request, slot, *args, **kwargs):
        if slot not in PHOTO_SLOTS:
            return error_response(request, 'not_found', 'Unknown photo slot.', status.HTTP_404_NOT_FOUND)
        profile = self.get_profile()
        getattr(profile, f'photo_{slot}').delete()
        return self.profile_response(profile, 'Photo removed.')


class MediaSlotAPIView(ArtistAPIView):
    def get_slot_or_error(self, profile, discipline, slot_key):
        slot = get_slot(discipline, slot_key)
        if slot is None:
            return None, error_response(self.request, 'not_found', 'Unknown media slot.', status.HTTP_404_NOT_FOUND)
        if discipline not in profile.disciplines:
            return None, error_response(
                self.request,
                code='discipline_not_selected',
                message=f'Add {Discipline(discipline).label} to your disciplines first.',
                status_code=status.HTTP_400_BAD_REQUEST,
            )
        return slot, None

    def put(self, request, discipline, slot_key, *args, **kwargs):
        profile = self.get_profile()
        slot, error = self.get_slot_or_error(profile, discipline, slot_key)
        if error:
            return error
        upload = request.FILES.get('file')
        if not upload:
            return self.missing_file_error()
        try:
            duration = validate_media(upload, slot)
        except DjangoValidationError as exc:
            return self.upload_error(exc)

        item = PortfolioMedia.objects.filter(profile=profile, discipline=discipline, slot=slot_key).first()
        old_name = item.file.name if item else None
        item = item or PortfolioMedia(profile=profile, discipline=discipline, slot=slot_key)
        item.kind = slot['kind']
        item.duration_seconds = duration
        item.file = upload
        item.save()
        if old_name:
            item.file.storage.delete(old_name)
        return self.profile_response(profile, 'Upload saved.')

    def delete(self, request, discipline, slot_key, *args, **kwargs):
        profile = self.get_profile()
        item = PortfolioMedia.objects.filter(profile=profile, discipline=discipline, slot=slot_key).first()
        if item:
            item.file.delete(save=False)
            item.delete()
        return self.profile_response(profile, 'Upload removed.')


class DocumentsAPIView(ArtistAPIView):
    def post(self, request, *args, **kwargs):
        profile = self.get_profile()
        if profile.documents.count() >= DOCUMENT_LIMIT:
            return error_response(
                request,
                code='document_limit',
                message=f'You can add up to {DOCUMENT_LIMIT} documents. Remove one first.',
                status_code=status.HTTP_400_BAD_REQUEST,
            )
        serializer = ProfileDocumentSerializer(data=request.data)
        if not serializer.is_valid():
            return error_response(
                request,
                code='validation_error',
                message='Please fix the highlighted fields.',
                status_code=status.HTTP_400_BAD_REQUEST,
                field_errors=serializer.errors,
            )
        try:
            validate_document(serializer.validated_data['file'])
        except DjangoValidationError as exc:
            return self.upload_error(exc)
        serializer.save(profile=profile)
        return self.profile_response(profile, 'Document added.')


class DocumentAPIView(ArtistAPIView):
    def delete(self, request, document_id, *args, **kwargs):
        document = ProfileDocument.objects.filter(profile=self.get_profile(), pk=document_id).first()
        if document:
            document.file.delete(save=False)
            document.delete()
        return self.profile_response(self.get_profile(), 'Document removed.')


class SendAltEmailPinAPIView(ArtistAPIView):
    throttle_classes = [ScopedRateThrottle]
    throttle_scope = 'profile_pin'

    def post(self, request, *args, **kwargs):
        profile = self.get_profile()
        if not profile.alt_email:
            return error_response(
                request,
                code='validation_error',
                message='Save an additional email first.',
                status_code=status.HTTP_400_BAD_REQUEST,
                field_errors={'alt_email': ['Save an additional email first.']},
            )
        if profile.alt_email_verified_at:
            return ok_response(request, message='This email is already verified.')

        pin = f'{secrets.randbelow(10 ** 6):06d}'
        profile.alt_email_pin_hash = make_password(pin)
        profile.alt_email_pin_expires_at = timezone.now() + PIN_LIFETIME
        profile.alt_email_pin_attempts = 0
        profile.save(update_fields=['alt_email_pin_hash', 'alt_email_pin_expires_at', 'alt_email_pin_attempts'])

        send_mail_in_background(
            subject='Your Bharini verification PIN',
            message=(
                f"Hi {request.user.first_name or request.user.email},\n\n"
                f'Your PIN to verify this email on Bharini is {pin}. It expires in 10 minutes.\n\n'
                'If you did not request this, you can ignore this email.'
            ),
            recipient=profile.alt_email,
        )
        return ok_response(request, message=f'PIN sent to {profile.alt_email}. It might take a minute to arrive.')


class VerifyAltEmailPinAPIView(ArtistAPIView):
    def post(self, request, *args, **kwargs):
        serializer = PinSerializer(data=request.data)
        if not serializer.is_valid():
            return error_response(
                request,
                code='validation_error',
                message='Enter the 6-digit PIN.',
                status_code=status.HTTP_400_BAD_REQUEST,
                field_errors=serializer.errors,
            )

        profile = self.get_profile()
        if profile.alt_email_verified_at:
            return self.profile_response(profile, 'This email is already verified.')
        if (
            not profile.alt_email_pin_hash
            or profile.alt_email_pin_expires_at <= timezone.now()
            or profile.alt_email_pin_attempts >= PIN_MAX_ATTEMPTS
        ):
            return error_response(
                request,
                code='pin_expired',
                message='This PIN has expired. Request a new one.',
                status_code=status.HTTP_400_BAD_REQUEST,
            )

        if not check_password(serializer.validated_data['pin'], profile.alt_email_pin_hash):
            profile.alt_email_pin_attempts += 1
            profile.save(update_fields=['alt_email_pin_attempts'])
            return error_response(
                request,
                code='invalid_pin',
                message='That PIN is not correct.',
                status_code=status.HTTP_400_BAD_REQUEST,
                field_errors={'pin': ['That PIN is not correct.']},
            )

        profile.alt_email_verified_at = timezone.now()
        profile.alt_email_pin_hash = ''
        profile.alt_email_pin_expires_at = None
        profile.save(update_fields=['alt_email_verified_at', 'alt_email_pin_hash', 'alt_email_pin_expires_at'])
        return self.profile_response(profile, 'Email verified.')
