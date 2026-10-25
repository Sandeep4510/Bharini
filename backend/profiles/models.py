import uuid
from pathlib import Path

from django.conf import settings
from django.contrib.postgres.fields import ArrayField
from django.core.validators import MaxValueValidator, MinValueValidator, RegexValidator
from django.db import models

from .slots import SLOTS

PHOTO_SLOTS = ('center', 'left', 'right', 'full_length')

LANGUAGES = [
    ('assamese', 'Assamese'),
    ('bengali', 'Bengali'),
    ('bhojpuri', 'Bhojpuri'),
    ('english', 'English'),
    ('gujarati', 'Gujarati'),
    ('hindi', 'Hindi'),
    ('kannada', 'Kannada'),
    ('konkani', 'Konkani'),
    ('malayalam', 'Malayalam'),
    ('marathi', 'Marathi'),
    ('odia', 'Odia'),
    ('punjabi', 'Punjabi'),
    ('sanskrit', 'Sanskrit'),
    ('tamil', 'Tamil'),
    ('telugu', 'Telugu'),
    ('tulu', 'Tulu'),
    ('urdu', 'Urdu'),
    ('arabic', 'Arabic'),
    ('french', 'French'),
    ('german', 'German'),
    ('japanese', 'Japanese'),
    ('korean', 'Korean'),
    ('mandarin', 'Mandarin'),
    ('spanish', 'Spanish'),
]


class Discipline(models.TextChoices):
    ACTOR = 'actor', 'Actor'
    SINGER = 'singer', 'Singer'
    CHOREOGRAPHER = 'choreographer', 'Choreographer'
    MUSICIAN = 'musician', 'Musician'
    DIRECTOR = 'director', 'Director'
    CINEMATOGRAPHER = 'cinematographer', 'Cinematographer / Cameraman'


def photo_upload_to(instance, filename):
    return f'artists/{instance.user_id}/photos/{uuid.uuid4().hex}.jpg'


def media_upload_to(instance, filename):
    return f'artists/{instance.profile.user_id}/{instance.kind}/{uuid.uuid4().hex}{Path(filename).suffix.lower()}'


def document_upload_to(instance, filename):
    return f'artists/{instance.profile.user_id}/documents/{uuid.uuid4().hex}{Path(filename).suffix.lower()}'


USERNAME_PATTERN = r'^[a-z0-9_.]{3,30}$'


class ArtistProfile(models.Model):
    class Gender(models.TextChoices):
        MALE = 'male', 'Male'
        FEMALE = 'female', 'Female'
        NON_BINARY = 'non_binary', 'Non-binary'

    REQUIRED_FIELDS = (
        'username', 'profile_photo', 'bio', 'gender', 'date_of_birth', 'location', 'phone',
    )

    user = models.OneToOneField(settings.AUTH_USER_MODEL, on_delete=models.CASCADE, related_name='artist_profile')
    username = models.CharField(
        max_length=30,
        unique=True,
        null=True,
        blank=True,
        validators=[RegexValidator(USERNAME_PATTERN, 'Use 3-30 lowercase letters, numbers, dots or underscores.')],
    )
    disciplines = ArrayField(models.CharField(max_length=20, choices=Discipline.choices), default=list, blank=True)
    profile_photo = models.ImageField(upload_to=photo_upload_to, blank=True)
    bio = models.TextField('about yourself', max_length=1000, blank=True)
    gender = models.CharField(max_length=20, choices=Gender.choices, blank=True)
    date_of_birth = models.DateField(null=True, blank=True)
    height_cm = models.PositiveSmallIntegerField(
        null=True, blank=True, validators=[MinValueValidator(50), MaxValueValidator(250)],
    )
    location = models.CharField(max_length=100, blank=True, help_text='City and state, e.g. Mangaluru, Karnataka')
    phone = models.CharField(
        max_length=16,
        blank=True,
        validators=[RegexValidator(r'^\+91[6-9]\d{9}$', 'Enter a 10-digit Indian mobile number.')],
    )
    alt_email = models.EmailField('additional email', blank=True)
    alt_email_verified_at = models.DateTimeField(null=True, blank=True)
    alt_email_pin_hash = models.CharField(max_length=128, blank=True)
    alt_email_pin_expires_at = models.DateTimeField(null=True, blank=True)
    alt_email_pin_attempts = models.PositiveSmallIntegerField(default=0)
    instagram_url = models.URLField(blank=True)
    facebook_url = models.URLField(blank=True)
    showreel_links = models.JSONField(default=list, blank=True)
    photo_center = models.ImageField(upload_to=photo_upload_to, blank=True)
    photo_left = models.ImageField(upload_to=photo_upload_to, blank=True)
    photo_right = models.ImageField(upload_to=photo_upload_to, blank=True)
    photo_full_length = models.ImageField(upload_to=photo_upload_to, blank=True)
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    def __str__(self):
        return f'Artist profile of {self.user}'

    @property
    def missing_fields(self):
        missing = [field for field in self.REQUIRED_FIELDS if not getattr(self, field)]
        if not self.disciplines:
            missing.append('disciplines')
        if self.needs_height and not self.height_cm:
            missing.append('height_cm')
        if not self.languages.exists():
            missing.append('languages')
        return missing

    @property
    def needs_height(self):
        return Discipline.ACTOR in self.disciplines

    @property
    def needs_casting_photos(self):
        # singers, musicians and directors are cast on their work, not their look
        return bool({Discipline.ACTOR, Discipline.CHOREOGRAPHER} & set(self.disciplines))

    @property
    def onboarding_complete(self):
        return not self.missing_fields

    @property
    def completion_percent(self):
        required_total = len(self.REQUIRED_FIELDS) + 2 + self.needs_height
        total = required_total
        done = required_total - len(self.missing_fields)
        if self.needs_casting_photos:
            total += len(PHOTO_SLOTS)
            done += sum(1 for slot in PHOTO_SLOTS if getattr(self, f'photo_{slot}'))

        filled = set(self.media.values_list('discipline', 'slot'))
        for discipline in self.disciplines:
            for slot in SLOTS.get(discipline, []):
                total += 1
                done += (discipline, slot['key']) in filled
        if Discipline.DIRECTOR in self.disciplines:
            total += 1
            done += bool(self.showreel_links)
        return round(100 * done / total)


class ProfileLanguage(models.Model):
    class Level(models.TextChoices):
        NATIVE = 'native', 'Native'
        FLUENT = 'fluent', 'Fluent'
        CONVERSATIONAL = 'conversational', 'Conversational'
        BASIC = 'basic', 'Basic'

    profile = models.ForeignKey(ArtistProfile, on_delete=models.CASCADE, related_name='languages')
    language = models.CharField(max_length=20, choices=LANGUAGES)
    level = models.CharField(max_length=20, choices=Level.choices)

    class Meta:
        ordering = ['id']
        constraints = [models.UniqueConstraint(fields=['profile', 'language'], name='unique_profile_language')]


class PortfolioMedia(models.Model):
    class Kind(models.TextChoices):
        VIDEO = 'video', 'Video'
        AUDIO = 'audio', 'Audio'
        IMAGE = 'image', 'Image'

    profile = models.ForeignKey(ArtistProfile, on_delete=models.CASCADE, related_name='media')
    discipline = models.CharField(max_length=20, choices=Discipline.choices)
    slot = models.CharField(max_length=20)
    kind = models.CharField(max_length=10, choices=Kind.choices)
    file = models.FileField(upload_to=media_upload_to)
    duration_seconds = models.FloatField()
    uploaded_at = models.DateTimeField(auto_now=True)

    class Meta:
        constraints = [
            models.UniqueConstraint(fields=['profile', 'discipline', 'slot'], name='unique_profile_media_slot'),
        ]


class ProfileDocument(models.Model):
    class Kind(models.TextChoices):
        CERTIFICATE = 'certificate', 'Certificate'
        ACHIEVEMENT = 'achievement', 'Achievement'

    profile = models.ForeignKey(ArtistProfile, on_delete=models.CASCADE, related_name='documents')
    kind = models.CharField(max_length=20, choices=Kind.choices)
    title = models.CharField(max_length=120)
    file = models.FileField(upload_to=document_upload_to)
    uploaded_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        ordering = ['-uploaded_at']
