# JOM AI — Product Specification
> Version 1.0 | Last Updated: 2026-04-28 | Deadline: 27 May 2026

---

## 1. Problem Statement

**How might we help residents discover and use suitable free neighbourhood facilities for play, exercise, and gathering — taking into consideration space limits, weather, comfort, and more?**

Residents have access to neighbourhood facilities but these spaces are not always comfortable or suitable for regular use. Outdoor areas can be too hot, affected by weather, or poorly maintained, discouraging regular use. At the same time, some facilities do not meet the needs of different groups, leaving them underused.

> *"Sometimes when we go to a badminton court, then it might be too windy, since it's outdoors and costs money to book."*
> *"Then for basketball, some of the courts are not sheltered. Okay, so it might be too hot, lah."*

---

## 2. Solution Overview

**JOM AI** is a web application that uses real-time weather data, AI-powered crowd prediction, and community micro-climate tagging to help Singapore HDB residents find the best free neighbourhood facility for their activity — right now or later.

---

## 3. Tech Stack

| Layer | Technology | Notes |
|---|---|---|
| Frontend | React (Vite) | SPA architecture |
| Styling | Tailwind CSS | Utility-first, responsive |
| Backend | Python + Flask | REST API |
| Database & Auth | Supabase | PostgreSQL + email/password auth |
| AI Engine | LM Studio (local) | OpenAI-compatible API endpoint |
| Map | Leaflet.js | Facility map with markers & heatmap |
| Weather | NEA Singapore API | Real-time per-location data |
| Facility Data | data.gov.sg + OneMap + AI enrichment | Multi-source aggregation |
| Hosting (Phase 1) | Local (Vite dev + Flask dev) | localhost:5173 + localhost:5000 |
| Hosting (Phase 2) | Vercel (frontend) + Render (backend) | Post-hackathon deployment |

---

## 4. User Types

| Role | Description |
|---|---|
| **Resident** | Regular user — searches, discovers, rates, and reports on facilities |
| **Admin** | Manages facility data, reviews reports, moderates micro-climate tags |

Authentication is handled by **Supabase Auth** (email + password). Role is stored as a field on the user profile table.

---

## 5. Data Model

### 5.1 `users` (Supabase Auth + custom profile table)

| Column | Type | Notes |
|---|---|---|
| `id` | UUID (PK) | Supabase Auth user ID |
| `email` | TEXT | From Supabase Auth |
| `display_name` | TEXT | |
| `avatar_url` | TEXT | Optional profile photo |
| `home_zone` | TEXT | e.g., "Tampines", "Jurong West" |
| `preferred_activities` | TEXT[] | e.g., ["basketball", "jogging"] |
| `points` | INTEGER | Default: 0 |
| `role` | TEXT | `resident` or `admin` |
| `created_at` | TIMESTAMPTZ | Auto |

---

### 5.2 `facilities`

| Column | Type | Notes |
|---|---|---|
| `id` | UUID (PK) | |
| `name` | TEXT | e.g., "Tampines Hub Basketball Court A" |
| `type` | TEXT | See Facility Types below |
| `address` | TEXT | Full address string |
| `lat` | FLOAT | Latitude |
| `lng` | FLOAT | Longitude |
| `zone` | TEXT | HDB town / planning area |
| `is_sheltered` | BOOLEAN | Covered / roofed |
| `is_indoor` | BOOLEAN | Fully enclosed |
| `max_capacity` | INTEGER | Estimated max users |
| `amenities` | TEXT[] | e.g., ["toilets", "water_cooler", "lighting"] |
| `is_wheelchair_accessible` | BOOLEAN | |
| `operating_hours` | JSONB | `{ "mon": "06:00-22:00", ... }` |
| `images` | TEXT[] | Array of image URLs |
| `data_source` | TEXT | `data.gov.sg`, `OneMap`, `AI_enriched`, `user_submitted` |
| `is_verified` | BOOLEAN | Admin-verified entry |
| `created_at` | TIMESTAMPTZ | |
| `updated_at` | TIMESTAMPTZ | |

**Facility Types (all in scope):**
`basketball_court`, `badminton_court`, `tennis_court`, `volleyball_court`, `football_field`, `futsal_court`, `fitness_corner`, `gym`, `swimming_pool`, `playground`, `cycling_path`, `jogging_track`, `multi_purpose_court`, `sheltered_pavilion`, `community_hall`, `park`, `skate_park`

---

### 5.3 `crowd_reports`

| Column | Type | Notes |
|---|---|---|
| `id` | UUID (PK) | |
| `facility_id` | UUID (FK → facilities) | |
| `reported_by` | UUID (FK → users, nullable) | |
| `occupancy_level` | TEXT | `empty`, `quiet`, `moderate`, `busy`, `full` |
| `is_leaving_soon` | BOOLEAN | User tapped "Leaving Soon" |
| `note` | TEXT | Optional user comment |
| `created_at` | TIMESTAMPTZ | |
| `expires_at` | TIMESTAMPTZ | Default: created_at + 30 mins |

---

### 5.4 `weather_cache`

| Column | Type | Notes |
|---|---|---|
| `id` | UUID (PK) | |
| `facility_id` | UUID (FK → facilities) | |
| `temperature_c` | FLOAT | Degrees Celsius |
| `humidity_pct` | FLOAT | Relative humidity % |
| `rainfall_mm` | FLOAT | |
| `uv_index` | FLOAT | |
| `wind_speed_kmh` | FLOAT | |
| `condition` | TEXT | `sunny`, `cloudy`, `raining`, `thunderstorm` |
| `forecast_2h` | TEXT | NEA 2-hour forecast text |
| `fetched_at` | TIMESTAMPTZ | Cache TTL: 15 minutes |

---

### 5.5 `microclimate_tags`

| Column | Type | Notes |
|---|---|---|
| `id` | UUID (PK) | |
| `facility_id` | UUID (FK → facilities) | |
| `tagged_by` | UUID (FK → users) | |
| `tag_type` | TEXT | See Tag Types below |
| `note` | TEXT | Optional free-text |
| `upvotes` | INTEGER | Default: 0 |
| `created_at` | TIMESTAMPTZ | |
| `expires_at` | TIMESTAMPTZ | Default: created_at + 4 hours |

**Tag Types:**
`too_windy`, `too_hot`, `wet_floor`, `shade_available`, `good_lighting`, `crowded`, `well_maintained`, `broken_equipment`, `mosquitoes`, `good_breeze`

---

### 5.6 `ai_predictions`

| Column | Type | Notes |
|---|---|---|
| `id` | UUID (PK) | |
| `facility_id` | UUID (FK → facilities) | |
| `predicted_for` | TIMESTAMPTZ | Target datetime of prediction |
| `predicted_occupancy_pct` | FLOAT | 0–100 |
| `confidence` | FLOAT | 0–1 |
| `model_used` | TEXT | LM Studio model name |
| `generated_at` | TIMESTAMPTZ | |

---

### 5.7 `points_transactions`

| Column | Type | Notes |
|---|---|---|
| `id` | UUID (PK) | |
| `user_id` | UUID (FK → users) | |
| `points_delta` | INTEGER | Positive = earned |
| `reason` | TEXT | `leaving_soon_report`, `microclimate_tag`, `crowd_report`, `signup_bonus` |
| `created_at` | TIMESTAMPTZ | |

**Points Economy:**

| Action | Points |
|---|---|
| Sign up | +20 |
| Submit crowd report | +5 |
| Tap "Leaving Soon" | +10 |
| Add micro-climate tag | +5 |
| Tag gets upvoted | +2 |

---

### 5.8 `bookmarks`

| Column | Type | Notes |
|---|---|---|
| `id` | UUID (PK) | |
| `user_id` | UUID (FK → users) | |
| `facility_id` | UUID (FK → facilities) | |
| `created_at` | TIMESTAMPTZ | |

---

## 6. Feature List & MVP Priority

| ID | Feature | Priority | Phase |
|---|---|---|---|
| A | Real-time weather + shelter filter per facility | MVP | Phase 1 |
| B | Crowd heatmap / occupancy indicator | MVP | Phase 1 |
| C | AI "Ghost Town" crowd predictor | MVP | Phase 1 |
| D | "Leaving Soon" button + points reward | MVP | Phase 1 |
| E | Psychological redirection nudge | Stretch | Phase 2 |
| F | Map view (Leaflet.js) | MVP | Phase 1 |
| G | Natural language AI query | MVP | Phase 1 |
| H | Dynamic micro-climate tagging by users | MVP | Phase 1 |
| I | AR Space Configurator | Future | Phase 3 |

---

## 7. Data Sources

| Source | Data | Endpoint |
|---|---|---|
| **data.gov.sg** | HDB facilities, parks, sports facilities | `https://data.gov.sg/api/action/datastore_search` |
| **OneMap API (SLA)** | Geocoding, facility locations, routing | `https://www.onemap.gov.sg/api/` |
| **NEA Weather API** | Temperature, rainfall, UV, 2h forecast | `https://api-open.data.gov.sg/v2/real-time/api/` |
| **SportSG / ActiveSG** | Sports facilities, gyms, pools | Public dataset |
| **LM Studio (AI enrichment)** | Fill missing amenities, hours, shelter status | `http://localhost:1234/v1` |

### AI Data Pipeline
1. Seed DB with coordinates from OneMap + data.gov.sg
2. For each facility, LM Studio fills in gaps (amenities, shelter, hours)
3. Admin reviews and verifies AI-enriched entries
4. Users can submit new facility sightings (admin-moderated)

---

## 8. Backend API Routes (Flask)

### Auth
| Method | Route | Description |
|---|---|---|
| POST | `/api/auth/register` | Create user + profile row in Supabase |
| POST | `/api/auth/login` | Return Supabase session token |
| POST | `/api/auth/logout` | Invalidate session |

### Facilities
| Method | Route | Description |
|---|---|---|
| GET | `/api/facilities` | List all (with query filters) |
| GET | `/api/facilities/:id` | Single facility detail |
| POST | `/api/facilities` | Create (admin only) |
| PUT | `/api/facilities/:id` | Update (admin only) |
| DELETE | `/api/facilities/:id` | Delete (admin only) |
| GET | `/api/facilities/:id/weather` | Current weather for facility |
| GET | `/api/facilities/:id/crowd` | Active crowd reports |
| POST | `/api/facilities/:id/crowd` | Submit crowd report |
| GET | `/api/facilities/:id/predictions` | AI crowd predictions |
| GET | `/api/facilities/:id/tags` | Micro-climate tags |
| POST | `/api/facilities/:id/tags` | Add micro-climate tag |
| POST | `/api/facilities/:id/tags/:tagId/upvote` | Upvote a tag |

### AI
| Method | Route | Description |
|---|---|---|
| POST | `/api/ai/query` | Natural language facility query |
| POST | `/api/ai/predict` | Generate crowd prediction for facility+time |
| POST | `/api/ai/enrich` | AI-enrich a facility's missing data |
| POST | `/api/ai/sync-facilities` | Trigger multi-source data fetch |

### Users
| Method | Route | Description |
|---|---|---|
| GET | `/api/user/profile` | Get current user profile |
| PUT | `/api/user/profile` | Update profile / preferences |
| GET | `/api/user/points` | Points balance + transaction history |
| GET | `/api/user/bookmarks` | List bookmarked facilities |
| POST | `/api/user/bookmarks/:facilityId` | Add bookmark |
| DELETE | `/api/user/bookmarks/:facilityId` | Remove bookmark |

### Admin
| Method | Route | Description |
|---|---|---|
| GET | `/api/admin/facilities` | All facilities (verified + unverified) |
| POST | `/api/admin/facilities/:id/verify` | Mark as verified |
| GET | `/api/admin/users` | List all users |
| GET | `/api/admin/reports` | Flagged crowd/tag reports |

---

## 9. Frontend Pages & Components

### Pages

| Page | Route | Description |
|---|---|---|
| Landing / Home | `/` | Hero search, featured facilities, weather snapshot |
| Map View | `/map` | Leaflet map with pins + heatmap overlay |
| Facility Detail | `/facility/:id` | Full info, weather, crowd, tags, AI predictions |
| Search & Filter | `/search` | Filter by type, shelter, weather, zone |
| AI Assistant | `/ai` | Natural language query interface |
| Profile | `/profile` | Preferences, points, bookmarks, history |
| Login | `/login` | Email + password login |
| Register | `/register` | Sign up form |
| Admin Panel | `/admin` | Facility management, user list, moderation |

### Shared Components

| Component | Description |
|---|---|
| `Navbar` | Logo, search bar, user avatar, points badge |
| `FacilityCard` | Name, type, weather status, crowd level, shelter badge |
| `FacilityMap` | Leaflet map with marker clustering and heatmap |
| `WeatherWidget` | Temperature, condition icon, UV, rain chance |
| `CrowdIndicator` | Visual bar: empty → quiet → moderate → busy → full |
| `LeavingSoonButton` | One-tap report; awards points on submission |
| `AIQueryBox` | Natural language input → LM Studio via backend |
| `FilterPanel` | Sidebar filters: activity, shelter, weather, zone |
| `MicroClimateTag` | Tag chip with upvote button and timestamp |
| `PointsBadge` | User points with animated increment |
| `FacilityTypeIcon` | Icon set for all facility types |
| `SearchBar` | Global search with autocomplete |
| `PredictionChart` | Line chart of AI-predicted occupancy over 6 hours |
| `BookmarkButton` | Toggle bookmark on card / detail page |
| `ToastNotification` | Points earned, report submitted, errors |

---

## 10. AI Integration (LM Studio)

### Setup
- LM Studio runs locally on `http://localhost:1234`
- Exposes an OpenAI-compatible REST API (`/v1/chat/completions`)
- Recommended model: **Llama 3 8B Instruct** or **Mistral 7B Instruct**
- Flask backend calls LM Studio; React never calls AI directly

### Use Cases

**10.1 Natural Language Query**
```
User input: "Where can I play badminton near Tampines if it rains at 5pm?"

System prompt: You are JOM AI, a Singapore neighbourhood facility assistant.
You have access to facility data, weather, and crowd info.
Answer concisely and suggest 2-3 specific facilities with reasons.
```

**10.2 Ghost Town Crowd Predictor**
- Input: facility type, zone, day of week, time of day, recent crowd reports, current weather
- Output: predicted occupancy % + confidence + plain-English reasoning
- Simulated for demo; pluggable with real historical data later

**10.3 Facility Data Enrichment**
- Input: facility name, address, type
- Output: inferred amenities, shelter status, operating hours, accessibility
- Stored back to DB with `data_source = 'AI_enriched'`

---

## 11. Project Directory Structure

```
jom-ai-hackathon/
├── backend/
│   ├── app.py                    # Flask entry point
│   ├── config.py                 # Env vars + Supabase client
│   ├── requirements.txt
│   ├── routes/
│   │   ├── auth.py
│   │   ├── facilities.py
│   │   ├── weather.py
│   │   ├── crowd.py
│   │   ├── ai.py
│   │   ├── users.py
│   │   └── admin.py
│   └── services/
│       ├── supabase_service.py
│       ├── weather_service.py    # NEA API + cache
│       ├── ai_service.py         # LM Studio client
│       ├── crowd_service.py      # Crowd aggregation logic
│       └── data_sync_service.py  # Multi-source facility fetcher
│
├── frontend/
│   ├── index.html
│   ├── package.json
│   ├── vite.config.js
│   ├── tailwind.config.js
│   └── src/
│       ├── main.jsx
│       ├── App.jsx               # Router setup
│       ├── index.css             # Tailwind base + custom tokens
│       ├── components/
│       │   ├── Navbar.jsx
│       │   ├── FacilityCard.jsx
│       │   ├── FacilityMap.jsx
│       │   ├── WeatherWidget.jsx
│       │   ├── CrowdIndicator.jsx
│       │   ├── LeavingSoonButton.jsx
│       │   ├── AIQueryBox.jsx
│       │   ├── FilterPanel.jsx
│       │   ├── MicroClimateTag.jsx
│       │   ├── PointsBadge.jsx
│       │   ├── PredictionChart.jsx
│       │   ├── BookmarkButton.jsx
│       │   └── ToastNotification.jsx
│       ├── pages/
│       │   ├── Home.jsx
│       │   ├── MapView.jsx
│       │   ├── FacilityDetail.jsx
│       │   ├── Search.jsx
│       │   ├── AIAssistant.jsx
│       │   ├── Profile.jsx
│       │   ├── Login.jsx
│       │   ├── Register.jsx
│       │   └── AdminPanel.jsx
│       ├── hooks/
│       │   ├── useAuth.js
│       │   ├── useFacilities.js
│       │   ├── useWeather.js
│       │   └── useCrowd.js
│       ├── context/
│       │   └── AuthContext.jsx
│       └── utils/
│           ├── supabaseClient.js
│           ├── api.js            # Axios wrapper for Flask
│           └── formatters.js
│
├── spec.md
└── README.md
```

---

## 12. Environment Variables

### Backend `.env`
```
SUPABASE_URL=https://xxxx.supabase.co
SUPABASE_SERVICE_KEY=your-service-role-key
NEA_API_KEY=your-nea-key
ONEMAP_TOKEN=your-onemap-token
LM_STUDIO_URL=http://localhost:1234/v1
LM_STUDIO_MODEL=lmstudio-community/Meta-Llama-3-8B-Instruct-GGUF
FLASK_ENV=development
FLASK_SECRET_KEY=your-secret-key
```

### Frontend `.env`
```
VITE_SUPABASE_URL=https://xxxx.supabase.co
VITE_SUPABASE_ANON_KEY=your-anon-key
VITE_API_BASE_URL=http://localhost:5000
```

---

## 13. Deployment Plan

| Phase | Frontend | Backend | Database |
|---|---|---|---|
| Phase 1 (Now) | Vite dev `localhost:5173` | Flask dev `localhost:5000` | Supabase cloud (free tier) |
| Phase 2 (Post-hackathon) | Vercel | Render.com | Supabase cloud |

---

## 14. Development Timeline

| Week | Dates | Goals |
|---|---|---|
| Week 1 | Apr 28 – May 4 | Scaffold, Supabase schema, email/password auth, Flask skeleton |
| Week 2 | May 5 – May 11 | Facility data pipeline (data.gov.sg + OneMap + AI enrichment), Map view |
| Week 3 | May 12 – May 18 | Weather integration, Crowd reports, Leaving Soon + Points, Micro-climate tags |
| Week 4 | May 19 – May 25 | AI query (LM Studio), Ghost Town predictor, UI polish, testing |
| Buffer | May 26 – May 27 | Bug fixes, demo prep, submission |

---

## 15. Key Design Principles

1. **Free facilities only** — no paid bookings, no commercial listings
2. **Hyper-local** — Singapore HDB estates; use Singapore weather data and naming
3. **Community-powered** — residents improve the data; rewarded with points
4. **AI-augmented, not AI-dependent** — app works without AI; AI enhances discovery
5. **Mobile-first** — most users will access on phones at or near the facility

---

*End of Spec — JOM AI v1.0*
