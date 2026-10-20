from django.contrib.auth import get_user_model
from django.contrib.auth.backends import BaseBackend


class CaseInsensitiveEmailBackend(BaseBackend):
    def authenticate(self, request, username=None, password=None, **kwargs):
        user_model = get_user_model()
        email = kwargs.get(user_model.USERNAME_FIELD, username)
        if email is None or password is None:
            return None

        try:
            user = user_model._default_manager.get(
                **{f'{user_model.USERNAME_FIELD}__iexact': email}
            )
        except user_model.DoesNotExist:
            return None

        if user.check_password(password) and user.is_active:
            return user
        return None
