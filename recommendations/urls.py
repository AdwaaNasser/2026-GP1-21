from django.urls import path

from .views import RecommendEmployeesView, SkillListView

urlpatterns = [
    path('', RecommendEmployeesView.as_view(), name='recommend-employees'),
    path('skills/', SkillListView.as_view(), name='recommend-skills'),
]