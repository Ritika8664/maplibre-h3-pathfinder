from django.db import models

class Hexagon(models.Model):
    hex_id = models.CharField(max_length=20, unique=True)
    price = models.IntegerField()
    rating = models.IntegerField()
    value = models.IntegerField()
    height = models.IntegerField()

    def __str__(self):
        return self.hex_id
