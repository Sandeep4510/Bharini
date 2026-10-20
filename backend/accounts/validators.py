import re

from django.core.exceptions import ValidationError

# Keep in sync with apps/web/src/components/password-checklist.tsx
PASSWORD_RULES = (
    (r'[A-Z]', 'Password must contain at least one uppercase letter.'),
    (r'[a-z]', 'Password must contain at least one lowercase letter.'),
    (r'\d', 'Password must contain at least one number.'),
    (r'[^A-Za-z0-9]', 'Password must contain at least one special character.'),
)


class CharacterClassValidator:
    def validate(self, password, user=None):
        errors = [message for pattern, message in PASSWORD_RULES if not re.search(pattern, password)]
        if errors:
            raise ValidationError(errors, code='password_character_class')

    def get_help_text(self):
        return 'Your password must contain an uppercase letter, a lowercase letter, a number and a special character.'
