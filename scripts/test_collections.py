"""
JOM AI -- Collections API Test
Tests the data.gov.sg Collections API and searches for relevant collections.
"""

import requests
import time

DATA_GOV_KEY = "v2:e90f036e8a496759469a5d6e703fe0bfb455776a39f1bd61cfe0854ffd0c3221:Av6_xMjAKxRAo7vZUH-KydVo9yYpkH9Q"
HEADERS = {"Authorization": DATA_GOV_KEY}
BASE_COLLECTIONS = "https://api-production.data.gov.sg/v2/public/api/collections"
SEP = "-" * 60

def ok(msg):   print(f"  [OK]  {msg}")
def err(msg):  print(f"  [ERR] {msg}")
def info(msg): print(f"  [>>]  {msg}")

# ── 1. Test the base collections URL (what the user put in .env) ──────────
print(f"\n{SEP}")
print("1. Testing base collections URL (no ID)")
print(SEP)
try:
    r = requests.get(BASE_COLLECTIONS, headers=HEADERS, timeout=10)
    info(f"HTTP {r.status_code}")
    if r.status_code == 200:
        ok("Base URL reachable")
        info(f"Response: {r.text[:400]}")
    else:
        info(f"Response: {r.text[:300]}")
except Exception as e:
    err(f"Failed: {e}")

time.sleep(3)

# ── 2. Try known collection IDs related to sports/parks ───────────────────
print(f"\n{SEP}")
print("2. Probing known collection IDs (sports/parks/facilities)")
print(SEP)

# Common data.gov.sg collection IDs to try
collection_ids_to_try = [3, 5, 12, 14, 22, 30, 39, 43, 52, 60, 79, 93, 101, 117, 134]

for cid in collection_ids_to_try:
    url = f"{BASE_COLLECTIONS}/{cid}"
    try:
        r = requests.get(url, headers=HEADERS, timeout=8)
        if r.status_code == 200:
            data = r.json()
            name = data.get("data", {}).get("collectionMetadata", {}).get("name", "")
            datasets = data.get("data", {}).get("datasetIds", [])
            if any(kw in name.lower() for kw in ["sport", "park", "facilit", "exercise", "recreation", "fitness", "npark"]):
                ok(f"Collection {cid}: '{name}' — {len(datasets)} datasets")
                info(f"Dataset IDs: {datasets[:5]}")
            else:
                print(f"  [ - ]  Collection {cid}: '{name}'")
        time.sleep(1)
    except Exception as e:
        pass

time.sleep(3)

# ── 3. Also check the new API v2 endpoint format ──────────────────────────
print(f"\n{SEP}")
print("3. Checking API v2 public collections list")
print(SEP)
try:
    r = requests.get(
        "https://api-open.data.gov.sg/v1/public/api/datasets",
        params={"query": "tampines facilities sport park", "limit": 5},
        headers=HEADERS,
        timeout=10
    )
    info(f"HTTP {r.status_code}: {r.text[:400]}")
except Exception as e:
    err(f"Failed: {e}")

print(f"\n{SEP}")
print("Done.")
print(SEP + "\n")
