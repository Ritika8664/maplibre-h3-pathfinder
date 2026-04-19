from rest_framework.decorators import api_view
from rest_framework.response import Response
from .models import Hexagon
from rest_framework import status
import h3


@api_view(['GET'])
def get_hexagons(request):
    resolution = request.query_params.get('resolution')
    stat       = request.query_params.get('stat', '')

    hexagons = Hexagon.objects.all().order_by('hex_id')[:20000]

    if resolution:
        res = int(resolution)

        grouped = {}

        for h in hexagons:
            parent = h3.cell_to_parent(h.hex_id, res)

            if parent not in grouped:
                grouped[parent] = {
                    "hex_id":  parent,
                    "price":   [],
                    "rating":  [],
                    "value":   [],
                    "height":  []
                }

            grouped[parent]["price"].append(h.price)
            grouped[parent]["rating"].append(h.rating)
            grouped[parent]["value"].append(h.value)
            grouped[parent]["height"].append(h.height)

        def apply_stat(arr):
            if not arr:
                return None
            if stat == 'min':
                return min(arr)
            if stat == 'max':
                return max(arr)
            if stat == 'mean':
                return round(sum(arr) / len(arr))  # default: mean

        data = [
            {
                "hex_id":  parent,
                "price":   apply_stat(vals["price"]),
                "rating":  apply_stat(vals["rating"]),
                "value":   apply_stat(vals["value"]),
                "height":  apply_stat(vals["height"]),
            }
            for parent, vals in grouped.items()
        ]

    else:
        data = [
            {
                "hex_id": h.hex_id,
                "price":  h.price,
                "rating": h.rating,
                "value":  h.value,
                "height": h.height,
            }
            for h in hexagons
        ]

    return Response(data)
@api_view(['GET'])
def get_path(request):
    start = request.query_params.get('start')
    end   = request.query_params.get('end')

    if not start or not end:
        return Response({'error': 'start and end required'}, 
                        status=status.HTTP_400_BAD_REQUEST)

    try:
        # Detect resolution from the hex_id itself
        res = h3.get_resolution(start)
        res_end = h3.get_resolution(end)

        if res != res_end:
            return Response({'error': f'Resolution mismatch: {res} vs {res_end}'}, 
                            status=status.HTTP_400_BAD_REQUEST)

        path_cells    = list(h3.grid_path_cells(start, end))
        grid_distance = h3.grid_distance(start, end)

        return Response({
            'start_hex':     start,
            'end_hex':       end,
            'path':          path_cells,
            'grid_distance': grid_distance,
            'steps':         len(path_cells) - 1,
            'resolution':    res
        })
    except Exception as e:
        return Response({'error': str(e)}, status=status.HTTP_400_BAD_REQUEST)