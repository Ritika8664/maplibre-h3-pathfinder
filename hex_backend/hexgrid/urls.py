from django.urls import path
from .views import get_hexagons, get_path 

urlpatterns = [
    path('hexagons/', get_hexagons),
    path('path/', get_path),
]