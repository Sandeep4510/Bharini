from django.contrib.auth.models import AbstractUser
from django.db import models

from .managers import UserManager


class User(AbstractUser):
    username = None
    email = models.EmailField('email address', unique=True)
    role = models.CharField(
        max_length=20,
        choices=[
            ('artist', 'Artist'),
            ('producer', 'Production House'),
            ('admin', 'Admin'),
        ],
        default='artist',
    )
    is_verified = models.BooleanField(default=False)

    USERNAME_FIELD = 'email'
    REQUIRED_FIELDS = ['first_name', 'last_name']

    objects = UserManager()

    def __str__(self):
        return self.email
