from django.conf import settings
from django.db import models


class ProductionProfile(models.Model):
    class Kind(models.TextChoices):
        INDIVIDUAL = 'individual', 'Individual'
        HOUSE = 'house', 'Production House'

    owner = models.OneToOneField(
        settings.AUTH_USER_MODEL,
        on_delete=models.CASCADE,
        related_name='production_profile',
    )
    kind = models.CharField(max_length=20, choices=Kind.choices)
    name = models.CharField(max_length=150)
    profile_picture = models.ImageField(upload_to='productions/pictures/', blank=True)
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    def __str__(self):
        return self.name


class Title(models.Model):
    class Kind(models.TextChoices):
        MOVIE = 'movie', 'Movie'
        SERIAL = 'serial', 'Serial'

    name = models.CharField(max_length=200)
    kind = models.CharField(max_length=20, choices=Kind.choices)
    release_year = models.PositiveSmallIntegerField(null=True, blank=True)
    poster = models.ImageField(upload_to='productions/posters/', blank=True)

    def __str__(self):
        return self.name


class ProductionTitle(models.Model):
    class Role(models.TextChoices):
        MADE = 'made', 'Made'
        PART_OF = 'part_of', 'Part of'

    production = models.ForeignKey(
        ProductionProfile,
        on_delete=models.CASCADE,
        related_name='title_credits',
    )
    title = models.ForeignKey(Title, on_delete=models.CASCADE, related_name='production_credits')
    role = models.CharField(max_length=20, choices=Role.choices)

    class Meta:
        constraints = [
            models.UniqueConstraint(fields=['production', 'title'], name='unique_production_title'),
        ]

    def __str__(self):
        return f'{self.production} {self.get_role_display()} {self.title}'
