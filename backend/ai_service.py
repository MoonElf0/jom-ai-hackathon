"""
JOM AI — AI Service (DeepSeek)
==============================
Handles general queries: facility lookup, crowd reports, microclimate tags.

Navigation is handled entirely by the frontend (direct OneMap calls).
This service is ONLY called for non-navigation questions.

`chat()` always returns {"reply": str, "action": None}.
"""

import os
import json
from openai import OpenAI
from supabase import create_client
from dotenv import load_dotenv

load_dotenv()

# ── Clients ────────────────────────────────────────────────────────
_deepseek = OpenAI(
    api_key=os.getenv("DEEPSEEK_API_KEY"),
    base_url="https://api.deepseek.com",
)
_sb = create_client(os.getenv("SUPABASE_URL"), os.getenv("SUPABASE_ANON_KEY"))

MODEL = "deepseek-chat"

# ── System prompt ─────────────────────────────────────────────────
SYSTEM_PROMPT = """You are JOM AI, a helpful assistant for Tampines HDB residents in Singapore.

YOUR ROLE:
- Answer questions about sports facilities, parks, and amenities in Tampines
- Help users find specific facilities (basketball courts, gyms, swimming pools, etc.)
- Accept crowd and microclimate condition reports from users

REPLY RULES:
- Max 3 bullet points or 2 short sentences — never write paragraphs
- Use • for bullet points, NEVER -, *, or numbered lists
- NEVER use ** bold or * italic markdown
- For facility queries: call query_facilities, list 2-3 results with just name and address
- End facility replies with "Want to navigate there?" on a new line
- For crowd/condition reports: use add_crowd_report or add_microclimate_tag
- Light Singlish welcome (lah, can, shiok)
- If asked about navigation, say "Use the Navigate button above!"

DATABASE — facilities table columns:
  id, name, type, address, lat, lng, is_sheltered, is_indoor, is_verified

FACILITY TYPES:
  basketball_court, badminton_court, tennis_court, volleyball_court,
  football_field, futsal_court, fitness_corner, gym, swimming_pool,
  playground, cycling_path, jogging_track, multi_purpose_court,
  sheltered_pavilion, community_hall, park, skate_park
"""

# ── Tool definitions ──────────────────────────────────────────────
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
]


def _truthy(val) -> bool:
    if isinstance(val, bool):
        return val
    return str(val).strip().lower() in ("true", "yes", "1")


def _run_tool(name: str, args: dict, facility_result: list) -> str:
    """Dispatch a tool call and return its result as a JSON string."""
    try:
        if name == "query_facilities":
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
            # Collect all returned facilities (up to 5) so frontend can show selection buttons
            if result.data:
                seen_ids = {f["id"] for f in facility_result}
                for fac in result.data:
                    if len(facility_result) >= 5:
                        break
                    if fac["id"] not in seen_ids:
                        facility_result.append(fac)
                        seen_ids.add(fac["id"])
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
def chat(messages: list[dict], location: dict | None = None, preferences: dict | None = None) -> dict:
    """
    Run the agentic tool loop for general (non-navigation) queries.
    Returns {"reply": str, "action": None}.

    `messages` is a list of {"role": "user"/"assistant", "content": "..."}
    `location` is {"lat": float, "lng": float} from the user's live GPS, or None.
    """
    prompt = SYSTEM_PROMPT
    if location:
        try:
            lat = float(location["lat"])
            lng = float(location["lng"])
            prompt += f"\n\nUser's current GPS location: {lat:.5f}°N, {lng:.5f}°E — use this to recommend nearby facilities and give distance estimates."
        except (KeyError, TypeError, ValueError):
            pass
    if preferences:
        name  = preferences.get("display_name")
        types = preferences.get("favorite_types") or []
        trans = preferences.get("preferred_transport")
        if name:
            prompt += f"\n\nUser's name: {name}. Address them by name occasionally."
        if types:
            readable = ", ".join(t.replace("_", " ") for t in types)
            prompt += f"\n\nUser's favourite activities: {readable}. Prioritise these facility types in your answers."
        if trans:
            prompt += f"\n\nUser's preferred transport: {trans}. Mention this when relevant."
    ai_messages      = [{"role": "system", "content": prompt}] + messages
    facility_result  = []  # collects all queried facilities (up to 5) for frontend buttons

    for _ in range(5):
        response = _deepseek.chat.completions.create(
            model=MODEL,
            messages=ai_messages,
            tools=TOOLS,
            tool_choice="auto",
            temperature=0.7,
            max_tokens=512,
        )

        choice = response.choices[0]

        if choice.finish_reason == "tool_calls":
            assistant_msg = choice.message
            ai_messages.append(assistant_msg)

            for tool_call in assistant_msg.tool_calls:
                fn_name = tool_call.function.name
                fn_args = json.loads(tool_call.function.arguments)
                result  = _run_tool(fn_name, fn_args, facility_result)
                ai_messages.append({
                    "role":         "tool",
                    "tool_call_id": tool_call.id,
                    "content":      result,
                })
            continue

        return {
            "reply":      choice.message.content or "Sorry, I couldn't generate a response.",
            "action":     None,
            "facilities": facility_result if facility_result else None,
        }

    return {
        "reply":      "Sorry, something went wrong after too many tool calls. Please try again.",
        "action":     None,
        "facilities": None,
    }
