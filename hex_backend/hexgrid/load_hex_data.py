import os
import sys
import django
import random

# sys.path.append(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
os.environ.setdefault('DJANGO_SETTINGS_MODULE', 'hex_project.settings')
django.setup()

from hexgrid.models import Hexagon

file_path = os.path.join(os.path.dirname(__file__), 'hex_ids.txt')

hexagons = []

with open(file_path, 'r') as file:
    for line in file:
        hex_id = line.strip()

        if hex_id:
            hexagons.append(
                Hexagon(
                    hex_id=hex_id,
                    price=random.randint(1000, 10000),
                    rating=random.randint(1, 10),
                    value=random.randint(500, 5000),
                    height=random.randint(1, 5),
                )
            )

Hexagon.objects.bulk_create(hexagons, ignore_conflicts=True)

print(f"✅ Inserted {len(hexagons)} hexagons successfully 🚀")