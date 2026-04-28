"""
JOM AI -- Final Dataset Test
Reads from .env and tests all dataset IDs.
"""

import requests
import time
import os
from dotenv import load_dotenv

load_dotenv()

DATA_GOV_KEY = os.getenv("DATA_GOV_API_KEY")

DATASETS = {
    "Park Facilities (NParks GeoJSON)":  os.getenv("DATASET_PARK_FACILITIES"),
    "Sport Facilities (CSV)":            os.getenv("DATASET_SPORT_FACILITIES"),
    "Park Facilities v2":                os.getenv("DATASET_PARK_FACILITIES_2"),
}

SEP = "-" * 60
BASE = "https://api-open.data.gov.sg/v1/public/api/datasets"
HEADERS = {"Authorization": DATA_GOV_KEY}

def ok(msg):   print(f"  [OK]  {msg}")
def err(msg):  print(f"  [ERR] {msg}")
def info(msg): print(f"  [>>]  {msg}")

print(f"\n{SEP}")
print("Environment Check")
print(SEP)
print(f"  DATA_GOV_API_KEY : {'SET' if DATA_GOV_KEY else 'MISSING'}")
for name, val in DATASETS.items():
    print(f"  {name[:35]}: {val if val else 'MISSING'}")

for name, dataset_id in DATASETS.items():
    print(f"\n{SEP}")
    print(f"Dataset : {name}")
    print(f"ID      : {dataset_id}")
    print(SEP)

    if not dataset_id:
        err("Dataset ID not found in .env!")
        continue

    try:
        r = requests.get(
            f"{BASE}/{dataset_id}/initiate-download",
            headers=HEADERS,
            timeout=10
        )
        info(f"HTTP {r.status_code}")

        if r.status_code in (200, 201):
            dl_url = r.json().get("data", {}).get("url", "")
            if dl_url:
                ok(f"Download URL obtained")
                # Peek at first 1KB
                peek = requests.get(dl_url, timeout=10, stream=True)
                chunk = b""
                for block in peek.iter_content(1024):
                    chunk += block
                    break
                text = chunk.decode("utf-8", errors="replace")
                is_geojson = text.strip().startswith("{")
                is_csv = not is_geojson and "," in text[:100]
                fmt = "GeoJSON" if is_geojson else ("CSV" if is_csv else "Unknown")
                ok(f"Format: {fmt}")
                # Show header or first feature
                lines = text.split("\n")
                info(f"Preview: {lines[0][:200]}")
                if len(lines) > 1:
                    info(f"        {lines[1][:200]}")
            else:
                err("No URL in response")
        elif r.status_code == 429:
            err("Rate limited - key not applying or too fast")
            info(r.text[:200])
        else:
            err(f"HTTP {r.status_code}: {r.text[:150]}")

    except Exception as e:
        err(f"Exception: {e}")

    time.sleep(6)

print(f"\n{SEP}")
print("All done.")
print(SEP + "\n")
