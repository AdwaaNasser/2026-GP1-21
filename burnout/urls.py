from django.urls import path

from .views import BurnoutPredictionView

urlpatterns = [
    path('prediction/<int:employee_id>/', BurnoutPredictionView.as_view(), name='burnout-prediction'),
]
