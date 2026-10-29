from django.apps import AppConfig


class GoalsConfig(AppConfig):
    name = 'goals'

    def ready(self):
        from . import signals  # noqa: F401  (connects the signal handlers)
