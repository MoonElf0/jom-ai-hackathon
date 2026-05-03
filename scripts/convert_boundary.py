import json

def convert_geojson_to_leaflet(geojson_path):
    with open(geojson_path, 'r') as f:
        data = json.load(f)
    
    leaflet_polygons = []
    
    if data['type'] == 'MultiPolygon':
        for polygon in data['coordinates']:
            # For each polygon, we only take the exterior ring (index 0)
            exterior_ring = polygon[0]
            leaflet_ring = [[lat, lng] for lng, lat in exterior_ring]
            leaflet_polygons.append(leaflet_ring)
    elif data['type'] == 'Polygon':
        exterior_ring = data['coordinates'][0]
        leaflet_ring = [[lat, lng] for lng, lat in exterior_ring]
        leaflet_polygons.append(leaflet_ring)
    
    return leaflet_polygons

polygons = convert_geojson_to_leaflet('tampines_boundary.json')

# We'll take the largest polygon if there are multiple, or just join them
# Actually, for a mask, we can just put all of them as holes?
# But Leaflet's Polygon component handles a list of rings where the first is the exterior.
# If we want a mask with multiple holes, we can pass [Outer, Hole1, Hole2, ...]

js_content = "export const TAMPINES_BOUNDARY = " + json.dumps(polygons)
with open('frontend/src/utils/tampinesBoundary.js', 'w') as f:
    f.write(js_content)

print(f"Extracted {len(polygons)} polygons to frontend/src/utils/tampinesBoundary.js")
