from django.urls import path

from .views import BatSurveyView, BurnoutPredictionView, DepartmentBurnoutView, TeamBurnoutView

urlpatterns = [
    path('prediction/<int:employee_id>/', BurnoutPredictionView.as_view(), name='burnout-prediction'),
    path('team/', TeamBurnoutView.as_view(), name='burnout-team'),
    path('departments/', DepartmentBurnoutView.as_view(), name='burnout-departments'),
    path('bat/', BatSurveyView.as_view(), name='bat-survey'),
]
