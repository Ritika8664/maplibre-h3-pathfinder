from rest_framework import serializers
from .models import Hexagon

class HexagonSerializer(serializers.ModelSerializer):
    class Meta:
        model = Hexagon
        fields = '__all__'