from django.contrib.auth import get_user_model
from django.contrib.auth.backends import ModelBackend


class CaseInsensitiveEmailBackend(ModelBackend):
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
            user_model().set_password(password)
            return None

        if user.check_password(password) and self.user_can_authenticate(user):
            return user
        return None

    def has_perm(self, user_obj, perm, obj=None):
        return user_obj.is_active and user_obj.is_staff

    def has_module_perms(self, user_obj, app_label):
        return user_obj.is_active and user_obj.is_staff
