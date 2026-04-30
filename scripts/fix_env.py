"""
Fixes the .env file:
- Renames NEXT_PUBLIC_SUPABASE_URL → SUPABASE_URL (and strips /rest/v1/)
- Renames NEXT_PUBLIC_SUPABASE_ANON_KEY → SUPABASE_ANON_KEY
- Renames dataset IDs to match data_sync.py expectations
Run once: python fix_env.py
"""

import re

ENV_PATH = ".env"

with open(ENV_PATH, "r", encoding="utf-8") as f:
    content = f.read()

# Fix Supabase URL (rename + strip /rest/v1/ suffix)
content = re.sub(
    r"NEXT_PUBLIC_SUPABASE_URL=(.+?)(/rest/v1/)?(\r?\n)",
    lambda m: f"SUPABASE_URL={m.group(1).rstrip('/')}{m.group(3)}",
    content
)

# Fix Supabase key name
content = content.replace(
    "NEXT_PUBLIC_SUPABASE_ANON_KEY=",
    "SUPABASE_ANON_KEY="
)

# Fix dataset ID names (strip quotes too)
content = content.replace("PARK_FACILITIES_ID=",   "DATASET_PARK_FACILITIES=")
content = content.replace("SPORT_FACILITIES_ID=",  "DATASET_SPORT_FACILITIES=")
content = content.replace("SPORT_SG_FACILITIES_ID=", "DATASET_SPORT_SG=")

# Strip surrounding quotes from values (e.g. "d_xxx" → d_xxx)
content = re.sub(r'="([^"]+)"', r'=\1', content)

with open(ENV_PATH, "w", encoding="utf-8") as f:
    f.write(content)

print("Done! Updated .env:")
print("-" * 40)
# Print non-secret lines for verification
for line in content.splitlines():
    if "KEY" in line or "TOKEN" in line:
        key = line.split("=")[0]
        print(f"{key}=***hidden***")
    else:
        print(line)
