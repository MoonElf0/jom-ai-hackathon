"""
JOM AI -- API Key Tester v2
Tests: Supabase, data.gov.sg, OneMap
"""

import requests
import json
import base64
import time

SUPABASE_URL = "https://bmajqelppzssxrsnmcja.supabase.co"
SUPABASE_KEY = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImJtYWpxZWxwcHpzc3hyc25tY2phIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzczNjI1OTksImV4cCI6MjA5MjkzODU5OX0.xqpGBngSOk7uV-fNGjfiD3VnlvIgDqs8ywPmZ9t1gH8"
DATA_GOV_KEY = "v2:e90f036e8a496759469a5d6e703fe0bfb455776a39f1bd61cfe0854ffd0c3221:Av6_xMjAKxRAo7vZUH-KydVo9yYpkH9Q"
ONEMAP_TOKEN = "eyJhbGciOiJSUzI1NiIsInR5cCI6IkpXVCJ9.eyJ1c2VyX2lkIjoxMzA0NSwiZm9yZXZlciI6ZmFsc2UsImlzcyI6Ik9uZU1hcCIsImlhdCI6MTc3NzM3MzY4MCwibmJmIjoxNzc3MzczNjgwLCJleHAiOjE3Nzc2MzI4ODAsImp0aSI6ImE2ZmJkMWYwLTk5NTYtNDc3Yy04MDk0LWNlYmZjZjEwOTBjZiJ9.SvF1M8BLnEypMKNPk-EsXiXzlM97eV-saLklE7GBxiUW3akLNwe-NnnVOLQgQWRgCLX3oPrPQmYEASOp4IPqp6iA6VHmJycpDUi6jDDdP8mIu3hJkywENfAWu1R5lu5Opd6zo4TCYq2W6nwg4kULkCLSgbT8YHp1c8eUljbOhsRU5xshwQe9gHwrQhfabjf27IbNhJpHBh3GNlhS8wNwKQg3e-MuqfUsB3Dhgru5DTywtcgohiCSkm_36R1a6AkBBcvS7mkJCD5xx4awURCoRCLsUqzL8rplp_ajHTtOljj_XHBr9wNbLI4_spJkN-Md8aM9iybHTk_LOA"

SEP = "-" * 55

def ok(msg):   print(f"  [OK]  {msg}")
def err(msg):  print(f"  [ERR] {msg}")
def info(msg): print(f"  [>>]  {msg}")


# ── 1. SUPABASE ────────────────────────────────────────────────────────────
# NOTE: The anon key cannot hit /rest/v1/ root (needs service_role).
# Instead, we validate the key by decoding the JWT and checking project ref.
print(f"\n{SEP}")
print("1. SUPABASE  (JWT validation + ping)")
print(SEP)
try:
    # Decode JWT to verify it's for this project
    payload_b64 = SUPABASE_KEY.split(".")[1]
    payload_b64 += "=" * (-len(payload_b64) % 4)
    payload = json.loads(base64.b64decode(payload_b64))
    ref = payload.get("ref", "?")
    role = payload.get("role", "?")
    exp = payload.get("exp", 0)
    ok(f"JWT decoded successfully")
    info(f"Project ref: {ref}")
    info(f"Role: {role}")
    exp_years = (exp - int(time.time())) / (365.25 * 86400)
    info(f"Expires in: ~{exp_years:.0f} years (long-lived anon key)")

    # Ping the Supabase project auth endpoint to confirm the URL is reachable
    ping_url = f"{SUPABASE_URL}/auth/v1/settings"
    headers = {"apikey": SUPABASE_KEY}
    r = requests.get(ping_url, headers=headers, timeout=8)
    if r.status_code == 200:
        ok(f"Project reachable  (HTTP {r.status_code})")
    else:
        err(f"Ping returned HTTP {r.status_code}: {r.text[:150]}")
except Exception as e:
    err(f"Supabase check failed: {e}")


# ── 2a. DATA.GOV.SG — Weather (wait & retry) ──────────────────────────────
print(f"\n{SEP}")
print("2a. DATA.GOV.SG  (NEA Air Temperature)")
print(SEP)
info("Waiting 12s to clear any rate limit from previous run...")
time.sleep(12)
try:
    url = "https://api-open.data.gov.sg/v2/real-time/api/air-temperature"
    # data.gov.sg v2 API key goes in Authorization header
    headers = {"Authorization": DATA_GOV_KEY}
    r = requests.get(url, headers=headers, timeout=10)
    if r.status_code == 200:
        data = r.json()
        stations = data.get("data", {}).get("stations", [])
        readings = data.get("data", {}).get("readings", [])
        ok(f"Connected!  (HTTP {r.status_code})")
        info(f"Stations returned: {len(stations)}")
        if readings:
            sample = readings[0].get("data", [])
            if sample:
                info(f"Sample: Station {sample[0]['stationId']} -> {sample[0]['value']} deg C")
    elif r.status_code == 429:
        err("HTTP 429 - Still rate limited (API key may not be applied)")
        info(f"Full response: {r.text[:300]}")
    elif r.status_code == 401:
        err("HTTP 401 - API key rejected")
        info(f"Response: {r.text[:300]}")
    else:
        err(f"HTTP {r.status_code}")
        info(f"Response: {r.text[:300]}")
except Exception as e:
    err(f"Request failed: {e}")


# ── 2b. DATA.GOV.SG — Try without auth key (public endpoint) ──────────────
print(f"\n{SEP}")
print("2b. DATA.GOV.SG  (NEA Rainfall - public, no key needed)")
print(SEP)
try:
    url = "https://api-open.data.gov.sg/v2/real-time/api/rainfall"
    r = requests.get(url, timeout=10)
    if r.status_code == 200:
        data = r.json()
        stations = data.get("data", {}).get("stations", [])
        ok(f"Public endpoint works  (HTTP {r.status_code}), stations: {len(stations)}")
        info("NOTE: data.gov.sg real-time APIs are public (no key needed)")
        info("Your API key gives you higher rate limits, not access")
    else:
        err(f"HTTP {r.status_code}: {r.text[:200]}")
except Exception as e:
    err(f"Request failed: {e}")


# ── 2c. DATA.GOV.SG — NParks dataset (correct ID) ─────────────────────────
print(f"\n{SEP}")
print("2c. DATA.GOV.SG  (NParks Fitness Corners dataset)")
print(SEP)
try:
    # Search for NParks datasets on the new API
    url = "https://api-open.data.gov.sg/v1/public/api/datasets"
    params = {"query": "fitness corner", "limit": 5}
    r = requests.get(url, params=params, timeout=10)
    if r.status_code == 200:
        ok(f"Dataset search works  (HTTP {r.status_code})")
        data = r.json()
        info(f"Response preview: {str(data)[:400]}")
    else:
        # Try the older CKAN API endpoint
        url2 = "https://data.gov.sg/api/3/action/package_search"
        params2 = {"q": "fitness corners nparks", "rows": 3}
        r2 = requests.get(url2, params=params2, timeout=10)
        info(f"CKAN API HTTP {r2.status_code}: {r2.text[:300]}")
except Exception as e:
    err(f"Request failed: {e}")


# ── 3a. ONEMAP — Theme search (better for facilities) ─────────────────────
print(f"\n{SEP}")
print("3a. ONEMAP  (Search: 'TAMPINES SPORTS HALL')")
print(SEP)
try:
    url = "https://www.onemap.gov.sg/api/common/elastic/search"
    params = {
        "searchVal": "TAMPINES SPORTS HALL",
        "returnGeom": "Y",
        "getAddrDetails": "Y",
        "pageNum": 1
    }
    headers = {"Authorization": ONEMAP_TOKEN}
    r = requests.get(url, params=params, headers=headers, timeout=8)
    if r.status_code == 200:
        data = r.json()
        results = data.get("results", [])
        total   = data.get("found", 0)
        ok(f"Connected!  (HTTP {r.status_code}), found: {total}")
        if results:
            first = results[0]
            info(f"Top: {first.get('SEARCHVAL')}")
            info(f"Address: {first.get('ADDRESS')}")
            info(f"Coords: Lat {first.get('LATITUDE')}, Lng {first.get('LONGITUDE')}")
        else:
            info("No results -- try a different search term")
    else:
        err(f"HTTP {r.status_code}: {r.text[:200]}")
except Exception as e:
    err(f"Request failed: {e}")


# ── 3b. ONEMAP — Route/Geocode test ────────────────────────────────────────
print(f"\n{SEP}")
print("3b. ONEMAP  (Geocode: 'Tampines Hub')")
print(SEP)
try:
    url = "https://www.onemap.gov.sg/api/common/elastic/search"
    params = {
        "searchVal": "Tampines Hub",
        "returnGeom": "Y",
        "getAddrDetails": "Y",
        "pageNum": 1
    }
    headers = {"Authorization": ONEMAP_TOKEN}
    r = requests.get(url, params=params, headers=headers, timeout=8)
    if r.status_code == 200:
        data = r.json()
        results = data.get("results", [])
        ok(f"HTTP {r.status_code}, found: {data.get('found', 0)}")
        if results:
            first = results[0]
            info(f"Result: {first.get('SEARCHVAL')}")
            info(f"Lat: {first.get('LATITUDE')}, Lng: {first.get('LONGITUDE')}")
    else:
        err(f"HTTP {r.status_code}: {r.text[:200]}")
except Exception as e:
    err(f"Request failed: {e}")


# ── 3c. OneMap token expiry ────────────────────────────────────────────────
print(f"\n{SEP}")
print("3c. ONEMAP  (Token Expiry)")
print(SEP)
try:
    payload_b64 = ONEMAP_TOKEN.split(".")[1]
    payload_b64 += "=" * (-len(payload_b64) % 4)
    payload = json.loads(base64.b64decode(payload_b64))
    exp = payload.get("exp", 0)
    now = int(time.time())
    remaining_days = (exp - now) / 86400
    if remaining_days > 0:
        ok(f"Token valid for {remaining_days:.1f} more days")
        info(f"Expires: {time.strftime('%Y-%m-%d %H:%M UTC', time.gmtime(exp))}")
        if remaining_days < 1:
            err("Expires in < 24h -- refresh at onemap.gov.sg!")
    else:
        err(f"Token EXPIRED {abs(remaining_days):.1f} days ago!")
except Exception as e:
    err(f"Could not decode token: {e}")


print(f"\n{SEP}")
print("Done. Review results above.")
print(SEP + "\n")
