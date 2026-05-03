"""
JOM AI — AI Service (Groq + Llama 4 Scout)
============================================
Handles all AI chat logic with an agentic tool-calling loop.

Tools available:
  - query_facilities      → read facilities from Supabase
  - update_facility       → write a field on a specific facility
  - add_crowd_report      → insert a crowd report row
  - add_microclimate_tag  → insert a microclimate tag
  - search_location       → geocode a destination via OneMap
  - start_navigation      → signal the frontend to render a route

`chat()` returns {"reply": str, "action": dict | None}.
When `start_navigation` is called, `action` will contain the destination
and travel mode so the frontend can trigger live routing.
"""

import os
import json
import requests as req
from groq import Groq
from supabase import create_client
from dotenv import load_dotenv

load_dotenv()

# ── Clients ────────────────────────────────────────────────────────
_groq = Groq(api_key=os.getenv("GROQ_API_KEY"))
_sb   = create_client(os.getenv("SUPABASE_URL"), os.getenv("SUPABASE_ANON_KEY"))

MODEL = "meta-llama/llama-4-scout-17b-16e-instruct"

# ── System prompt ─────────────────────────────────────────────────
SYSTEM_PROMPT = """You are JOM AI, a friendly Singapore neighbourhood assistant \
built for Tampines HDB residents.

You help people find the best FREE nearby facilities for exercise, play, and \
gathering — factoring in shelter, weather, crowd levels, and personal preferences.

You can also navigate users to any location in Singapore. When a user asks to \
navigate, go to, or get directions to a place:
  1. Call search_location with the destination (add "Singapore" if not already in query)
  2. Pick the most relevant result from the list
  3. Call start_navigation with the lat, lng, name, and mode
     - mode must be one of: walk, drive, cycle, pt (public transport)
     - If the user doesn't specify mode, ask once then default to walk

You have access to tools that query and update a live Supabase database of facilities.

DATABASE SCHEMA (facilities table):
- id (uuid)
- name (text)
- type (text): basketball_court, badminton_court, tennis_court, volleyball_court,
  football_field, futsal_court, fitness_corner, gym, swimming_pool, playground,
  cycling_path, jogging_track, multi_purpose_court, sheltered_pavilion,
  community_hall, park, skate_park
- address (text)
- lat, lng (float)
- is_sheltered (boolean)
- is_indoor (boolean)
- is_verified (boolean)
- data_source (text)
- source_id (text)

DATABASE SCHEMA (crowd_reports table):
- facility_id (uuid, FK → facilities)
- occupancy_level (text): empty, quiet, moderate, busy, full
- note (text, optional)

DATABASE SCHEMA (microclimate_tags table):
- facility_id (uuid, FK → facilities)
- tag_type (text): too_windy, too_hot, wet_floor, shade_available, good_lighting,
  crowded, well_maintained, broken_equipment, mosquitoes, good_breeze
- note (text, optional)

RULES:
- Always be concise, friendly, and Singapore-appropriate (light Singlish is welcome).
- When asked to find a facility, ALWAYS call query_facilities first to get real data.
- When asked to navigate, ALWAYS call search_location then start_navigation.
- When updating data, confirm with the user what you changed.
- Suggest 1–3 specific facilities with reasons. Do not make up facility names.
- If you cannot find something, say so honestly.
"""

# ── Tool definitions (sent to Groq) ───────────────────────────────
# Llama 4 Scout passes all args as strings regardless of JSON schema type.
# All params are declared as "string"; types are coerced in _run_tool.
TOOLS = [
    {
        "type": "function",
        "function": {
            "name": "query_facilities",
            "description": (
                "Query the live Supabase database for facilities in Tampines. "
                "Returns a list of matching facilities with id, name, type, "
                "address, is_sheltered, is_indoor, lat, lng."
            ),
            "parameters": {
                "type": "object",
                "properties": {
                    "facility_type": {
                        "type": "string",
                        "description": (
                            "Filter by type: basketball_court, badminton_court, "
                            "tennis_court, gym, swimming_pool, fitness_corner, "
                            "playground, jogging_track, multi_purpose_court, "
                            "sheltered_pavilion, etc. Omit to return all."
                        )
                    },
                    "sheltered_only": {
                        "type": "string",
                        "description": "Pass 'yes' to return only sheltered facilities."
                    },
                    "indoor_only": {
                        "type": "string",
                        "description": "Pass 'yes' to return only indoor facilities."
                    },
                    "limit": {
                        "type": "string",
                        "description": "Max results to return as a number string, e.g. '10'."
                    }
                },
                "required": []
            }
        }
    },
    {
        "type": "function",
        "function": {
            "name": "update_facility",
            "description": (
                "Update one or more fields on a specific facility. "
                "Use when the user asks to correct data: mark as sheltered, "
                "update address, or change type."
            ),
            "parameters": {
                "type": "object",
                "properties": {
                    "facility_id": {
                        "type": "string",
                        "description": "UUID of the facility to update."
                    },
                    "field": {
                        "type": "string",
                        "description": "Field to update: name, address, type, is_sheltered, is_indoor."
                    },
                    "value": {
                        "type": "string",
                        "description": "New value as a string. For booleans use 'true' or 'false'."
                    }
                },
                "required": ["facility_id", "field", "value"]
            }
        }
    },
    {
        "type": "function",
        "function": {
            "name": "add_crowd_report",
            "description": "Insert a crowd report for a facility.",
            "parameters": {
                "type": "object",
                "properties": {
                    "facility_id": {
                        "type": "string",
                        "description": "UUID of the facility."
                    },
                    "occupancy_level": {
                        "type": "string",
                        "description": "One of: empty, quiet, moderate, busy, full."
                    },
                    "note": {
                        "type": "string",
                        "description": "Optional short note."
                    }
                },
                "required": ["facility_id", "occupancy_level"]
            }
        }
    },
    {
        "type": "function",
        "function": {
            "name": "add_microclimate_tag",
            "description": "Add a microclimate tag to a facility.",
            "parameters": {
                "type": "object",
                "properties": {
                    "facility_id": {
                        "type": "string",
                        "description": "UUID of the facility."
                    },
                    "tag_type": {
                        "type": "string",
                        "description": (
                            "One of: too_windy, too_hot, wet_floor, shade_available, "
                            "good_lighting, crowded, well_maintained, broken_equipment, "
                            "mosquitoes, good_breeze."
                        )
                    },
                    "note": {
                        "type": "string",
                        "description": "Optional short note."
                    }
                },
                "required": ["facility_id", "tag_type"]
            }
        }
    },
    {
        "type": "function",
        "function": {
            "name": "search_location",
            "description": (
                "Search OneMap for a place or address in Singapore. "
                "Returns coordinates and address details. "
                "ALWAYS call this before start_navigation to get the destination lat/lng."
            ),
            "parameters": {
                "type": "object",
                "properties": {
                    "query": {
                        "type": "string",
                        "description": (
                            "Place name or address to search, "
                            "e.g. 'THE TAPESTRY Tennis Court Singapore'"
                        )
                    }
                },
                "required": ["query"]
            }
        }
    },
    {
        "type": "function",
        "function": {
            "name": "start_navigation",
            "description": (
                "Initiates turn-by-turn navigation on the map to a destination. "
                "Call AFTER search_location to obtain coordinates. "
                "The user's live GPS location will be used as the start point."
            ),
            "parameters": {
                "type": "object",
                "properties": {
                    "lat": {
                        "type": "string",
                        "description": "Destination latitude from search_location result."
                    },
                    "lng": {
                        "type": "string",
                        "description": "Destination longitude from search_location result."
                    },
                    "name": {
                        "type": "string",
                        "description": "Human-readable destination name."
                    },
                    "mode": {
                        "type": "string",
                        "description": "Travel mode: 'walk', 'drive', 'cycle', or 'pt' (public transport)."
                    }
                },
                "required": ["lat", "lng", "name", "mode"]
            }
        }
    },
]


def _truthy(val) -> bool:
    if isinstance(val, bool):
        return val
    return str(val).strip().lower() in ("true", "yes", "1")


def _search_onemap(query: str) -> str:
    """Call OneMap elastic search and return top 5 results as JSON string."""
    try:
        from onemap_token import get_token
        token = get_token()
        resp = req.get(
            "https://www.onemap.gov.sg/api/common/elastic/search",
            params={
                "searchVal":      query,
                "returnGeom":     "Y",
                "getAddrDetails": "Y",
                "pageNum":        1,
            },
            headers={"Authorization": token},
            timeout=10,
        )
        data    = resp.json()
        results = data.get("results", [])[:5]
        return json.dumps([
            {
                "name":    r.get("BUILDING") or r.get("SEARCHVAL", ""),
                "address": r.get("ADDRESS", ""),
                "lat":     r.get("LATITUDE", ""),
                "lng":     r.get("LONGITUDE", ""),
                "postal":  r.get("POSTAL", ""),
            }
            for r in results
        ])
    except Exception as e:
        return json.dumps({"error": str(e)})


# ── Tool execution ────────────────────────────────────────────────
def _run_tool(name: str, args: dict, nav_action: list) -> str:
    """Dispatch a tool call and return its result as a JSON string."""
    try:
        if name == "search_location":
            return _search_onemap(args.get("query", ""))

        elif name == "start_navigation":
            nav_action[0] = {
                "type": "navigate",
                "destination": {
                    "lat":  float(args.get("lat", 0)),
                    "lng":  float(args.get("lng", 0)),
                    "name": args.get("name", "Destination"),
                },
                "mode": args.get("mode", "walk"),
            }
            return json.dumps({"status": "Navigation initiated. The map will display the route."})

        elif name == "query_facilities":
            q = _sb.table("facilities").select(
                "id, name, type, address, is_sheltered, is_indoor, lat, lng"
            )
            ftype = args.get("facility_type") or args.get("type")
            if ftype:
                q = q.eq("type", ftype)
            if _truthy(args.get("sheltered_only", False)):
                q = q.eq("is_sheltered", True)
            if _truthy(args.get("indoor_only", False)):
                q = q.eq("is_indoor", True)
            try:
                limit = min(int(str(args.get("limit", "10"))), 20)
            except ValueError:
                limit = 10
            result = q.limit(limit).execute()
            return json.dumps(result.data)

        elif name == "update_facility":
            facility_id = args["facility_id"]
            field       = args["field"]
            raw_value   = args["value"]

            allowed = {"name", "address", "is_sheltered", "is_indoor", "type"}
            if field not in allowed:
                return json.dumps({"error": f"Field '{field}' is not updatable."})

            value = _truthy(raw_value) if field in ("is_sheltered", "is_indoor") else raw_value
            result = (
                _sb.table("facilities")
                .update({field: value})
                .eq("id", facility_id)
                .execute()
            )
            return json.dumps({"updated": len(result.data)})

        elif name == "add_crowd_report":
            row = {
                "facility_id":     args["facility_id"],
                "occupancy_level": args["occupancy_level"],
            }
            if args.get("note"):
                row["note"] = args["note"]
            result = _sb.table("crowd_reports").insert(row).execute()
            return json.dumps({"inserted": len(result.data)})

        elif name == "add_microclimate_tag":
            row = {
                "facility_id": args["facility_id"],
                "tag_type":    args["tag_type"],
            }
            if args.get("note"):
                row["note"] = args["note"]
            result = _sb.table("microclimate_tags").insert(row).execute()
            return json.dumps({"inserted": len(result.data)})

        else:
            return json.dumps({"error": f"Unknown tool: {name}"})

    except Exception as e:
        return json.dumps({"error": str(e)})


# ── Main chat function ─────────────────────────────────────────────
def chat(messages: list[dict]) -> dict:
    """
    Run the full agentic loop and return {"reply": str, "action": dict | None}.

    `messages` is a list of {"role": "user"/"assistant", "content": "..."}
    (the history from the frontend, without the system prompt — we prepend it).

    When start_navigation is called, `action` contains:
        {"type": "navigate", "destination": {"lat", "lng", "name"}, "mode": str}
    This signals the frontend to request the user's GPS location and render the route.
    """
    nav_action: list = [None]  # mutable container so _run_tool can write into it

    groq_messages = [{"role": "system", "content": SYSTEM_PROMPT}] + messages

    for _ in range(5):
        response = _groq.chat.completions.create(
            model=MODEL,
            messages=groq_messages,
            tools=TOOLS,
            tool_choice="auto",
            temperature=0.7,
            max_completion_tokens=1024,
        )

        choice = response.choices[0]

        if choice.finish_reason == "tool_calls":
            assistant_msg = choice.message
            groq_messages.append(assistant_msg)

            for tool_call in assistant_msg.tool_calls:
                fn_name = tool_call.function.name
                fn_args = json.loads(tool_call.function.arguments)
                result  = _run_tool(fn_name, fn_args, nav_action)
                groq_messages.append({
                    "role":         "tool",
                    "tool_call_id": tool_call.id,
                    "content":      result,
                })
            continue

        return {
            "reply":  choice.message.content or "Sorry, I couldn't generate a response.",
            "action": nav_action[0],
        }

    return {
        "reply":  "Sorry, something went wrong after too many tool calls. Please try again.",
        "action": None,
    }
