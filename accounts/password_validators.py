from django.core.exceptions import ValidationError


class UppercaseValidator:
    def validate(self, password, user=None):
        has_uppercase = any(character.isupper() for character in password)
        if not has_uppercase:
            raise ValidationError(
                'Password must contain at least one uppercase letter.',
                code='password_no_uppercase',
            )

    def get_help_text(self):
        return 'Your password must contain at least one uppercase letter.'


class NumberValidator:
    def validate(self, password, user=None):
        has_number = any(character.isdigit() for character in password)
        if not has_number:
            raise ValidationError(
                'Password must contain at least one number.',
                code='password_no_number',
            )

    def get_help_text(self):
        return 'Your password must contain at least one number.'
