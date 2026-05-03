import os
import requests
import json
from dotenv import load_dotenv

load_dotenv("backend/.env")

def get_token():
    email = os.getenv("ONEMAP_EMAIL")
    password = os.getenv("ONEMAP_EMAIL_PASSWORD")
    resp = requests.post(
        "https://www.onemap.gov.sg/api/auth/post/getToken",
        json={"email": email, "password": password}
    )
    data = resp.json()
    token = data.get("access_token") or data.get("token")
    if not token:
        print(f"Error getting token: {data}")
    return token

def fetch_tampines_boundary():
    token = get_token()
    if not token:
        return None
    url = "https://www.onemap.gov.sg/api/public/popapi/getAllPlanningarea?year=2019"
    headers = {"Authorization": token}
    resp = requests.get(url, headers=headers)
    data = resp.json()
    
    # OneMap API v2 returns SearchResults
    areas = data if isinstance(data, list) else data.get("SearchResults", [])
    
    for area in areas:
        if area.get("pln_area_n") == "TAMPINES":
            return area.get("geojson")
    return None

boundary = fetch_tampines_boundary()
if boundary:
    with open("tampines_boundary.json", "w") as f:
        f.write(boundary)
    print("Saved Tampines boundary to tampines_boundary.json")
else:
    print("Tampines boundary not found")
