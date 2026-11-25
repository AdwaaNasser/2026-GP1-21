from django.urls import path

from .views import (
    BatSurveyView,
    BurnoutHistoryView,
    BurnoutPredictionView,
    DepartmentBurnoutView,
    SurveyQuestionsView,
    TeamBurnoutView,
)

urlpatterns = [
    path('prediction/<int:employee_id>/', BurnoutPredictionView.as_view(), name='burnout-prediction'),
    path('history/<int:employee_id>/', BurnoutHistoryView.as_view(), name='burnout-history'),
    path('team/', TeamBurnoutView.as_view(), name='burnout-team'),
    path('departments/', DepartmentBurnoutView.as_view(), name='burnout-departments'),
    path('bat/', BatSurveyView.as_view(), name='bat-survey'),
    path('bat/questions/', SurveyQuestionsView.as_view(), name='bat-questions'),
]
