from django.urls import path

from .views import (
    BatSurveyView,
    BurnoutHistoryView,
    DepartmentBurnoutView,
    SurveyQuestionsView,
    SurveySendView,
    SurveySettingsView,
    TeamBurnoutView,
)

urlpatterns = [
    path('history/<int:employee_id>/', BurnoutHistoryView.as_view(), name='burnout-history'),
    path('team/', TeamBurnoutView.as_view(), name='burnout-team'),
    path('departments/', DepartmentBurnoutView.as_view(), name='burnout-departments'),
    path('bat/', BatSurveyView.as_view(), name='bat-survey'),
    path('survey-settings/', SurveySettingsView.as_view(), name='survey-settings'),
    path('survey-settings/send/', SurveySendView.as_view(), name='survey-send'),
    path('bat/questions/', SurveyQuestionsView.as_view(), name='bat-questions'),
]
