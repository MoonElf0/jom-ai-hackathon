"""
JOM AI -- Data Sync Script
=============================
Fetches facilities from data.gov.sg datasets,
filters to Tampines only, normalises to a standard
schema, and upserts into Supabase.

Run: python data_sync.py
"""

import os
import json
import csv
import io
import time
import requests
from dotenv import load_dotenv
from supabase import create_client

load_dotenv()


# ==============================================================
# SECTION 1: CONFIGURATION
# ==============================================================
#
# Problem: We need credentials and settings in one place so the
#          rest of the script doesn't contain any hardcoded values.
# Solution: Load from .env and define all constants up top.

SUPABASE_URL = os.getenv("SUPABASE_URL")
SUPABASE_KEY = os.getenv("SUPABASE_ANON_KEY")
DATA_GOV_KEY = os.getenv("DATA_GOV_API_KEY")

# Each dataset has its own ID — we fetch them independently
DATASETS = {
    "nparks":    os.getenv("DATASET_PARK_FACILITIES"),   # GeoJSON
    "sport_csv": os.getenv("DATASET_SPORT_FACILITIES"),  # CSV
    "sport_sg":  os.getenv("DATASET_SPORT_SG"),          # GeoJSON
}

# Tampines bounding box (GPS coordinates)
# Any facility outside these lat/lng limits gets discarded
TAMPINES = {
    "lat_min": 1.340,
    "lat_max": 1.380,
    "lng_min": 103.895,
    "lng_max": 103.960,
}

# NParks uses ALL-CAPS class names. We map them to our snake_case types.
# Classes NOT in this dict (e.g. CARPARK, TOILET) are automatically skipped.
NPARKS_TYPE_MAP = {
    "FITNESS CORNER":       "fitness_corner",
    "FITNESS STATION":      "fitness_corner",
    "PLAYGROUND":           "playground",
    "HARD COURT":           "multi_purpose_court",
    "BASKETBALL COURT":     "basketball_court",
    "BADMINTON COURT":      "badminton_court",
    "TENNIS COURT":         "tennis_court",
    "FUTSAL COURT":         "futsal_court",
    "VOLLEYBALL COURT":     "volleyball_court",
    "SWIMMING POOL":        "swimming_pool",
    "JOGGING TRACK":        "jogging_track",
    "CYCLING PATH":         "cycling_path",
    "SKATE PARK":           "skate_park",
    "SHELTERED PAVILION":   "sheltered_pavilion",
    "OPEN PAVILION":        "sheltered_pavilion",
    "MULTI-PURPOSE COURT":  "multi_purpose_court",
    "MULTIPURPOSE COURT":   "multi_purpose_court",
}

# Sport Facilities CSV uses Title Case names
SPORT_CSV_TYPE_MAP = {
    "Fitness Corner":       "fitness_corner",
    "Gymnasium":            "gym",
    "Swimming Pool":        "swimming_pool",
    "Basketball Court":     "basketball_court",
    "Badminton Court":      "badminton_court",
    "Tennis Court":         "tennis_court",
    "Squash Court":         "squash_court",
    "Multi-Purpose Court":  "multi_purpose_court",
    "Running Track":        "jogging_track",
    "Futsal Court":         "futsal_court",
    "Volleyball Court":     "volleyball_court",
    "Playground":           "playground",
}


# ==============================================================
# SECTION 2: HELPER FUNCTIONS
# ==============================================================
#
# Problem: Every dataset requires 2 API calls:
#          (1) ask for a download URL, (2) download the file.
#          We'd be repeating this pattern 3 times.
# Solution: One reusable function that does both steps.

BASE = "https://api-open.data.gov.sg/v1/public/api/datasets"
HEADERS = {"Authorization": DATA_GOV_KEY}


def fetch_dataset_content(dataset_id, label, max_retries=3):
    """
    Asks data.gov.sg for a pre-signed S3 download URL,
    then downloads the full file content as a string.
    Retries up to max_retries times on rate limit (429).
    Returns None on failure.
    """
    print(f"\n  Fetching {label} ({dataset_id})...")
    print(f"  Using API key: {'SET (' + DATA_GOV_KEY[:12] + '...)' if DATA_GOV_KEY else 'MISSING!'}")

    for attempt in range(1, max_retries + 1):
        try:
            r = requests.get(
                f"{BASE}/{dataset_id}/initiate-download",
                headers=HEADERS,
                timeout=10
            )
        except Exception as e:
            print(f"  [ERR] Network error: {e}")
            return None

        if r.status_code in (200, 201):
            break   # Success — exit retry loop

        if r.status_code == 429:
            wait = 15 * attempt  # 15s, 30s, 45s
            print(f"  [429] Rate limited (attempt {attempt}/{max_retries}). Waiting {wait}s...")
            time.sleep(wait)
            continue

        print(f"  [ERR] HTTP {r.status_code}: {r.text[:200]}")
        return None
    else:
        print(f"  [ERR] All {max_retries} attempts rate limited. Skipping dataset.")
        return None

    dl_url = r.json().get("data", {}).get("url", "")
    if not dl_url:
        print(f"  [ERR] No download URL in response")
        return None

    # Download the actual file from S3
    print(f"  Downloading file...")
    try:
        file_r = requests.get(dl_url, timeout=30)
        print(f"  [OK] Downloaded {len(file_r.content):,} bytes")
        return file_r.text
    except Exception as e:
        print(f"  [ERR] Download failed: {e}")
        return None


def is_in_tampines(lat, lng):
    """
    Problem: Datasets cover all Singapore.
    Solution: Returns True only if coordinates fall within Tampines' bounding box.
    """
    return (
        TAMPINES["lat_min"] <= lat <= TAMPINES["lat_max"] and
        TAMPINES["lng_min"] <= lng <= TAMPINES["lng_max"]
    )


# ==============================================================
# SECTION 3: DATASET PARSERS
# ==============================================================

def parse_nparks_geojson(content, source_key):
    """
    Problem: NParks data is GeoJSON. GeoJSON stores coordinates
             as [longitude, latitude] — reversed from what you'd expect.
             Also has many irrelevant classes like CARPARK, TOILET.
    Solution: Swap coordinate order, filter by CLASS map, filter by bounding box.
    """
    facilities = []
    seen_ids   = set()

    try:
        geo = json.loads(content)
    except json.JSONDecodeError as e:
        print(f"  [ERR] JSON parse error: {e}")
        return facilities

    features = geo.get("features", [])
    print(f"  Total features in dataset: {len(features)}")

    skipped_class  = 0
    skipped_bounds = 0
    skipped_coords = 0

    for feat in features:
        props    = feat.get("properties", {})
        geometry = feat.get("geometry", {})

        # -- Coordinate extraction --
        # GeoJSON = [lng, lat], so index 0=lng, index 1=lat
        coords = geometry.get("coordinates", [])
        if not coords or len(coords) < 2:
            skipped_coords += 1
            continue

        lng = float(coords[0])   # longitude is index 0 in GeoJSON
        lat = float(coords[1])   # latitude  is index 1 in GeoJSON

        # -- Bounding box filter --
        if not is_in_tampines(lat, lng):
            skipped_bounds += 1
            continue

        # -- Class / type mapping --
        raw_class    = (props.get("CLASS") or "").strip().upper()
        facility_type = NPARKS_TYPE_MAP.get(raw_class)
        if not facility_type:
            # This class isn't relevant (e.g. CARPARK, TOILET) — skip it
            skipped_class += 1
            continue

        # -- Build unique ID to prevent duplicates --
        source_id = props.get("UNIQUEID") or props.get("OBJECTID")
        if not source_id:
            continue
        source_id = str(source_id)
        if source_id in seen_ids:
            continue
        seen_ids.add(source_id)

        # -- Build the normalised facility record --
        name = props.get("NAME") or f"Tampines {facility_type.replace('_', ' ').title()}"

        facilities.append({
            "name":         name,
            "type":         facility_type,
            "address":      None,           # NParks dataset has no address field
            "lat":          lat,
            "lng":          lng,
            "is_sheltered": facility_type in ("sheltered_pavilion", "gym", "swimming_pool"),
            "is_indoor":    facility_type in ("gym",),
            "data_source":  source_key,
            "source_id":    source_id,
            "is_verified":  False,
        })

    print(f"  Skipped (wrong class): {skipped_class}")
    print(f"  Skipped (outside Tampines): {skipped_bounds}")
    print(f"  Skipped (bad coords): {skipped_coords}")
    print(f"  [OK] Kept {len(facilities)} Tampines facilities")
    return facilities


def parse_sport_facilities_csv(content, source_key):
    """
    Problem: This dataset is a CSV with columns:
             VenueName, PostalCode, Latitude, Longitude, SportsFacility
             Multiple rows can have the same venue but different sports.
    Solution: Parse CSV, map SportsFacility to our type, filter to Tampines.
             Use "VenueName + SportsFacility" as the unique source_id.
    """
    facilities = []
    seen_ids   = set()

    reader = csv.DictReader(io.StringIO(content))

    skipped_type   = 0
    skipped_bounds = 0
    skipped_coords = 0
    row_count      = 0

    for row in reader:
        row_count += 1

        # -- Coordinate extraction (CSV has Latitude/Longitude columns) --
        try:
            lat = float(row.get("Latitude",  0))
            lng = float(row.get("Longitude", 0))
        except (ValueError, TypeError):
            skipped_coords += 1
            continue

        if lat == 0 or lng == 0:
            skipped_coords += 1
            continue

        # -- Bounding box filter --
        if not is_in_tampines(lat, lng):
            skipped_bounds += 1
            continue

        # -- Type mapping --
        raw_type      = (row.get("SportsFacility") or "").strip()
        facility_type = SPORT_CSV_TYPE_MAP.get(raw_type)
        if not facility_type:
            skipped_type += 1
            continue

        # -- Unique ID: venue name + facility type --
        venue    = (row.get("VenueName") or "").strip()
        source_id = f"{venue}_{raw_type}".replace(" ", "_").lower()
        if source_id in seen_ids:
            continue
        seen_ids.add(source_id)

        # -- Geocode address via PostalCode if needed --
        postal   = (row.get("PostalCode") or "").strip()
        address  = f"Singapore {postal}" if postal else None

        facilities.append({
            "name":         f"{venue} - {raw_type}" if venue else raw_type,
            "type":         facility_type,
            "address":      address,
            "lat":          lat,
            "lng":          lng,
            "is_sheltered": facility_type in ("gym", "swimming_pool"),
            "is_indoor":    facility_type in ("gym",),
            "data_source":  source_key,
            "source_id":    source_id,
            "is_verified":  False,
        })

    print(f"  Total CSV rows: {row_count}")
    print(f"  Skipped (unknown type): {skipped_type}")
    print(f"  Skipped (outside Tampines): {skipped_bounds}")
    print(f"  Skipped (bad coords): {skipped_coords}")
    print(f"  [OK] Kept {len(facilities)} Tampines facilities")
    return facilities


# ==============================================================
# SECTION 4: SUPABASE UPSERTER
# ==============================================================
#
# Problem: Running this script twice would insert duplicate rows.
# Solution: Use upsert — insert the row if it doesn't exist,
#           update it if it does (matched on data_source + source_id).

def upsert_to_supabase(supabase_client, facilities, batch_size=50):
    """
    Inserts or updates facilities in Supabase in batches.
    Batching prevents timeouts on large datasets.
    """
    if not facilities:
        print("  No facilities to upsert.")
        return 0

    total_upserted = 0

    # Process in chunks of batch_size to avoid request size limits
    for i in range(0, len(facilities), batch_size):
        batch = facilities[i : i + batch_size]
        try:
            result = (
                supabase_client
                .table("facilities")
                .upsert(batch, on_conflict="data_source,source_id")
                .execute()
            )
            total_upserted += len(batch)
            print(f"  Upserted batch {i//batch_size + 1} ({len(batch)} records)...")
        except Exception as e:
            print(f"  [ERR] Upsert failed for batch {i//batch_size + 1}: {e}")

    return total_upserted


# ==============================================================
# SECTION 5: MAIN RUNNER
# ==============================================================

def main():
    print("=" * 60)
    print("JOM AI -- Data Sync")
    print("Tampines facilities --> Supabase")
    print("=" * 60)

    # -- Validate env vars --
    missing = [k for k, v in {
        "SUPABASE_URL": SUPABASE_URL,
        "SUPABASE_ANON_KEY": SUPABASE_KEY,
        "DATA_GOV_API_KEY": DATA_GOV_KEY,
    }.items() if not v]

    if missing:
        print(f"[ERR] Missing env vars: {', '.join(missing)}")
        print("Check your .env file!")
        return

    # -- Connect to Supabase --
    print("\nConnecting to Supabase...")
    supabase = create_client(SUPABASE_URL, SUPABASE_KEY)
    print("[OK] Connected")

    all_facilities = []

    # ── Dataset 1: NParks Park Facilities (GeoJSON) ────────────
    print("\n" + "-" * 60)
    print("Dataset 1: NParks Park Facilities (GeoJSON)")
    print("-" * 60)
    content = fetch_dataset_content(DATASETS["nparks"], "NParks GeoJSON")
    if content:
        nparks_facilities = parse_nparks_geojson(content, "nparks")
        all_facilities.extend(nparks_facilities)
    time.sleep(15)  # Respect rate limits (data.gov.sg allows ~3 req/10s)

    # ── Dataset 2: Sport Facilities CSV ───────────────────────
    print("\n" + "-" * 60)
    print("Dataset 2: Sport Facilities (CSV)")
    print("-" * 60)
    content = fetch_dataset_content(DATASETS["sport_csv"], "Sport Facilities CSV")
    if content:
        csv_facilities = parse_sport_facilities_csv(content, "sport_csv")
        all_facilities.extend(csv_facilities)
    time.sleep(6)

    # ── Dataset 3: SportSG GeoJSON ────────────────────────────
    print("\n" + "-" * 60)
    print("Dataset 3: SportSG Facilities (GeoJSON)")
    print("-" * 60)
    content = fetch_dataset_content(DATASETS["sport_sg"], "SportSG GeoJSON")
    if content:
        sportsg_facilities = parse_nparks_geojson(content, "sport_sg")
        all_facilities.extend(sportsg_facilities)
    time.sleep(6)

    # ── Upsert all to Supabase ─────────────────────────────────
    print("\n" + "=" * 60)
    print(f"Total facilities to upsert: {len(all_facilities)}")
    print("=" * 60)

    total = upsert_to_supabase(supabase, all_facilities)

    print("\n" + "=" * 60)
    print(f"Sync complete. {total} records upserted to Supabase.")
    print("Check your Supabase Table Editor to verify.")
    print("=" * 60)


if __name__ == "__main__":
    main()
