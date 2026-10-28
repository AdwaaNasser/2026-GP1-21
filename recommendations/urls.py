from django.urls import path

from .views import RecommendEmployeesView

urlpatterns = [
    path('', RecommendEmployeesView.as_view(), name='recommend-employees'),
]