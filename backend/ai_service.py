"""
JOM AI -- AI Service (DeepSeek)
==============================
Handles general queries: facility lookup, crowd reports, microclimate tags.

Navigation is handled entirely by the frontend (direct OneMap calls).
This service is ONLY called for non-navigation questions.
"""

import os
import json
from openai import OpenAI
from supabase import create_client
from dotenv import load_dotenv

load_dotenv()

# -- Clients -------------------------------------------------------------------
_deepseek = OpenAI(
    api_key=os.getenv("DEEPSEEK_API_KEY"),
    base_url="https://api.deepseek.com",
)
_sb = create_client(os.getenv("SUPABASE_URL"), os.getenv("SUPABASE_ANON_KEY"))

MODEL = "deepseek-chat"

# -- Sport keyword → facility types to try (in order) -------------------------
SPORT_TYPE_MAP: dict[str, list[str]] = {
    "football":    ["football_field", "multi_purpose_court"],
    "soccer":      ["football_field", "multi_purpose_court"],
    "futsal":      ["futsal_court",   "multi_purpose_court"],
    "basketball":  ["basketball_court"],
    "badminton":   ["badminton_court"],
    "tennis":      ["tennis_court"],
    "volleyball":  ["volleyball_court", "multi_purpose_court"],
    "pickleball":  ["badminton_court",  "multi_purpose_court"],
    "squash":      ["badminton_court",  "gym"],
    "hockey":      ["football_field",   "multi_purpose_court"],
    "cricket":     ["football_field",   "park"],
    "lacrosse":    ["football_field",   "multi_purpose_court"],
    "gym":         ["gym", "fitness_corner"],
    "fitness":     ["fitness_corner", "gym"],
    "workout":     ["fitness_corner", "gym"],
    "swim":        ["swimming_pool"],
    "swimming":    ["swimming_pool"],
    "pool":        ["swimming_pool"],
    "jog":         ["jogging_track"],
    "jogging":     ["jogging_track"],
    "run":         ["jogging_track"],
    "running":     ["jogging_track"],
    "cycling":     ["cycling_path"],
    "cycle":       ["cycling_path"],
    "skate":       ["skate_park"],
    "playground":  ["playground"],
    "mpc":         ["multi_purpose_court"],
}

# Explains why an alternative type works for a given sport keyword
ALTERNATIVE_LABELS: dict[tuple[str, str], str] = {
    ("football",   "multi_purpose_court"): "multi-purpose courts are commonly used for casual football",
    ("soccer",     "multi_purpose_court"): "multi-purpose courts are commonly used for casual football",
    ("futsal",     "multi_purpose_court"): "indoor/covered MPC halls are used for futsal",
    ("pickleball", "badminton_court"):     "badminton courts can be adapted for pickleball",
    ("pickleball", "multi_purpose_court"): "MPC courts can host pickleball",
    ("squash",     "badminton_court"):     "similar indoor court setup",
    ("volleyball", "multi_purpose_court"): "MPC courts support volleyball",
    ("hockey",     "multi_purpose_court"): "MPC courts are used for hockey",
    ("cricket",    "park"):                "open park fields are used for cricket",
}


def _prequery(user_message: str, facility_result: list) -> str:
    """
    Detect sport/activity keywords in the latest user message, query Supabase
    for real matching facilities, populate facility_result for button generation,
    and return an injected context block for the system prompt.

    This runs BEFORE the AI, so the AI always works with verified data.
    """
    msg_lower = user_message.lower()

    # Collect ordered list of (sport_keyword, facility_type) pairs to query
    to_query: list[tuple[str, str]] = []
    seen_types: set[str] = set()
    for keyword, types in SPORT_TYPE_MAP.items():
        if keyword in msg_lower:
            for t in types:
                if t not in seen_types:
                    to_query.append((keyword, t))
                    seen_types.add(t)

    if not to_query:
        return ""

    fetched: list[dict] = []
    primary_sport = to_query[0][0]

    for keyword, ftype in to_query:
        if len(fetched) >= 5:
            break
        result = _sb.table("facilities").select(
            "id, name, type, address, is_sheltered, is_indoor, lat, lng"
        ).eq("type", ftype).limit(5).execute()

        for fac in (result.data or []):
            if len(fetched) >= 5:
                break
            if not any(f["id"] == fac["id"] for f in fetched):
                fac["_alt_label"] = ALTERNATIVE_LABELS.get((keyword, ftype), "")
                fac["_queried_type"] = ftype
                fetched.append(fac)

    if not fetched:
        return ""

    # Populate facility_result so the frontend renders navigate buttons
    seen_ids: set = {f["id"] for f in facility_result}
    for fac in fetched:
        if len(facility_result) >= 5:
            break
        if fac["id"] not in seen_ids:
            facility_result.append(fac)
            seen_ids.add(fac["id"])

    # Build context block injected into the system prompt
    lines = [
        f"VERIFIED FACILITIES FROM DATABASE for '{primary_sport}' (use ONLY these names, no others):"
    ]
    for fac in fetched:
        label = fac["type"].replace("_", " ")
        alt   = f" [{fac['_alt_label']}]" if fac["_alt_label"] else ""
        lines.append(f"  - {fac['name']} | {label}{alt} | {fac.get('address', 'Tampines')}")

    lines.append(
        "Each facility listed above will have a Navigate button shown to the user automatically. "
        "Do NOT tell the user to click a button or ask 'Want to navigate there?' — "
        "just present the options naturally and let them choose or ask more questions."
    )
    return "\n".join(lines)


# -- System prompt -------------------------------------------------------------
SYSTEM_PROMPT = """You are JOM AI, a helpful assistant for Tampines HDB residents in Singapore.

YOUR ROLE:
- Answer questions about sports facilities, parks, and amenities in Tampines
- Help users find specific facilities (basketball courts, gyms, swimming pools, etc.)
- Accept crowd and microclimate condition reports from users

FACILITY REPLY RULES:
- When a VERIFIED FACILITIES block is injected below, list 2-3 of those facilities
  (name + address). If any are alternative types, add a short note on why they work.
- NEVER name a facility that does not appear in the VERIFIED FACILITIES block.
- Do NOT end with "Want to navigate there?" -- navigate buttons are shown automatically.
- If no verified facilities are injected, call query_facilities yourself before replying.

GENERAL REPLY RULES:
- Max 3 bullet points or 2 short sentences -- never write paragraphs
- Use * for bullet points, NEVER -, **, or numbered lists
- NEVER use ** bold or * italic markdown
- Light Singlish is welcome (lah, can, shiok)
- If asked about navigation, say "Use the Navigate button above!"

DATABASE -- facilities table columns:
  id, name, type, address, lat, lng, is_sheltered, is_indoor, is_verified

FACILITY TYPES:
  basketball_court, badminton_court, tennis_court, volleyball_court,
  football_field, futsal_court, fitness_corner, gym, swimming_pool,
  playground, cycling_path, jogging_track, multi_purpose_court,
  sheltered_pavilion, community_hall, park, skate_park
"""

# -- Tool definitions ----------------------------------------------------------
TOOLS = [
    {
        "type": "function",
        "function": {
            "name": "query_facilities",
            "description": (
                "Query the Supabase database for facilities in Tampines. "
                "Use this when no VERIFIED FACILITIES block was injected or "
                "for follow-up questions like crowd reports, shelter info, etc."
            ),
            "parameters": {
                "type": "object",
                "properties": {
                    "facility_type": {
                        "type": "string",
                        "description": (
                            "Filter by type: basketball_court, badminton_court, "
                            "tennis_court, gym, swimming_pool, fitness_corner, "
                            "playground, jogging_track, multi_purpose_court, etc."
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
                        "description": "Max results to return, e.g. '10'."
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
            "description": "Update a field on a specific facility (name, address, type, is_sheltered, is_indoor).",
            "parameters": {
                "type": "object",
                "properties": {
                    "facility_id": {"type": "string"},
                    "field":       {"type": "string"},
                    "value":       {"type": "string"}
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
                    "facility_id":     {"type": "string"},
                    "occupancy_level": {"type": "string", "description": "empty, quiet, moderate, busy, or full"},
                    "note":            {"type": "string"}
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
                    "facility_id": {"type": "string"},
                    "tag_type": {
                        "type": "string",
                        "description": (
                            "One of: too_windy, too_hot, wet_floor, shade_available, "
                            "good_lighting, crowded, well_maintained, broken_equipment, "
                            "mosquitoes, good_breeze."
                        )
                    },
                    "note": {"type": "string"}
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
            if result.data:
                seen_ids: set = {row["id"] for row in facility_result}
                for fac in result.data:
                    if len(facility_result) >= 5:
                        break
                    if fac["id"] not in seen_ids:
                        facility_result.append(fac)
                        seen_ids.add(fac["id"])
            return json.dumps(result.data)

        elif name == "update_facility":
            allowed = {"name", "address", "is_sheltered", "is_indoor", "type"}
            field = args["field"]
            if field not in allowed:
                return json.dumps({"error": f"Field '{field}' is not updatable."})
            raw = args["value"]
            value = _truthy(raw) if field in ("is_sheltered", "is_indoor") else raw
            result = (
                _sb.table("facilities")
                .update({field: value})
                .eq("id", args["facility_id"])
                .execute()
            )
            return json.dumps({"updated": len(result.data)})

        elif name == "add_crowd_report":
            row: dict = {
                "facility_id":     args["facility_id"],
                "occupancy_level": args["occupancy_level"],
            }
            if args.get("note"):
                row["note"] = args["note"]
            result = _sb.table("crowd_reports").insert(row).execute()
            return json.dumps({"inserted": len(result.data)})

        elif name == "add_microclimate_tag":
            row = {"facility_id": args["facility_id"], "tag_type": args["tag_type"]}
            if args.get("note"):
                row["note"] = args["note"]
            result = _sb.table("microclimate_tags").insert(row).execute()
            return json.dumps({"inserted": len(result.data)})

        else:
            return json.dumps({"error": f"Unknown tool: {name}"})

    except Exception as e:
        return json.dumps({"error": str(e)})


# -- Main chat function --------------------------------------------------------
def chat(messages: list[dict], location: dict | None = None, preferences: dict | None = None) -> dict:
    """
    Run the agentic tool loop for general (non-navigation) queries.
    Returns {"reply": str, "action": None, "facilities": list | None}.
    """
    prompt = SYSTEM_PROMPT

    if location:
        try:
            lat = float(location["lat"])
            lng = float(location["lng"])
            prompt += f"\n\nUser GPS: {lat:.5f}N, {lng:.5f}E -- recommend nearby facilities."
        except (KeyError, TypeError, ValueError):
            pass

    if preferences:
        name  = preferences.get("display_name")
        types = preferences.get("favorite_types") or []
        trans = preferences.get("preferred_transport")
        if name:
            prompt += f"\n\nUser's name: {name}. Address them occasionally."
        if types:
            prompt += f"\n\nFavourite activities: {', '.join(t.replace('_', ' ') for t in types)}. Prioritise these."
        if trans:
            prompt += f"\n\nPreferred transport: {trans}."

    facility_result: list = []

    # Pre-query based on sport keywords so AI always gets real verified data
    last_user_msg = next(
        (m["content"] for m in reversed(messages) if m.get("role") == "user"), ""
    )
    prequery_ctx = _prequery(last_user_msg, facility_result)
    if prequery_ctx:
        prompt += f"\n\n{prequery_ctx}"

    ai_messages = [{"role": "system", "content": prompt}] + messages

    for _ in range(6):
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

        reply = choice.message.content or "Sorry, I couldn't generate a response."
        # Strip phantom "Want to navigate there?" if no real facilities were found
        if not facility_result:
            reply = "\n".join(
                line for line in reply.splitlines()
                if "want to navigate" not in line.lower()
            ).strip()

        return {
            "reply":      reply,
            "action":     None,
            "facilities": facility_result if facility_result else None,
        }

    return {
        "reply":      "Sorry, something went wrong. Please try again.",
        "action":     None,
        "facilities": None,
    }
