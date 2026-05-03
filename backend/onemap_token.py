"""
OneMap token manager — auto-refreshes the JWT every ~3 days.

Priority:
  1. Refresh using ONEMAP_EMAIL + ONEMAP_EMAIL_PASSWORD (recommended)
  2. Fall back to ONE_MAP_API_KEY static token (last resort)

Add to backend/.env:
    ONEMAP_EMAIL=your@email.com
    ONEMAP_EMAIL_PASSWORD=yourpassword
"""

import os
import time
import requests
from dotenv import load_dotenv

load_dotenv()

_cache: dict = {"token": None, "expires_at": 0.0}


def get_token() -> str:
    """Return a valid OneMap bearer token, auto-refreshing if within 5 min of expiry."""
    now = time.time()

    if _cache["token"] and _cache["expires_at"] > now + 300:
        return _cache["token"]

    email    = os.getenv("ONEMAP_EMAIL", "").strip()
    password = os.getenv("ONEMAP_EMAIL_PASSWORD", "").strip()

    if email and password:
        try:
            resp = requests.post(
                "https://www.onemap.gov.sg/api/auth/post/getToken",
                json={"email": email, "password": password},
                timeout=10,
            )
            resp.raise_for_status()
            data   = resp.json()
            token  = data.get("access_token") or data.get("token")
            expiry = data.get("expiry_timestamp", now + 259200)  # default 3 days
            if token:
                _cache["token"]      = token
                _cache["expires_at"] = float(expiry)
                print(f"[OneMap] Token refreshed. Expires at {expiry}")
                return token
            print(f"[OneMap] Unexpected token response: {data}")
        except Exception as exc:
            print(f"[OneMap] Token refresh failed: {exc}")

    # Fall back to static key from env
    static = os.getenv("ONE_MAP_API_KEY", "").strip()
    if static:
        print("[OneMap] Using static ONE_MAP_API_KEY (may be expired).")
        return static

    raise RuntimeError(
        "OneMap token unavailable. "
        "Set ONEMAP_EMAIL + ONEMAP_EMAIL_PASSWORD in backend/.env, "
        "or set ONE_MAP_API_KEY as a static fallback."
    )
