"""
JOM AI — AI Service (Groq + Llama 4 Scout)
============================================
Handles all AI chat logic.

The AI has access to "tools" (function-calling) that let it:
  - query_facilities  → read from Supabase
  - update_facility   → write a field on a specific facility
  - add_crowd_report  → insert a crowd report row
  - add_microclimate_tag → insert a microclimate tag

The conversation loop runs until the model stops calling tools,
then returns the final text reply.
"""

import os
import json
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
- Always be concise, friendly, and Singapore-appropriate (you can use light Singlish).
- When asked to find a facility, ALWAYS call query_facilities first to get real data.
- When updating data, confirm with the user what you changed.
- Suggest 1–3 specific facilities with reasons. Do not make up facility names.
- If you cannot find something, say so honestly.
"""

# ── Tool definitions (sent to Groq) ───────────────────────────────
# NOTE: Llama 4 Scout passes all args as strings regardless of schema type.
# All params are declared as "string" here; we coerce types in _run_tool.
TOOLS = [
    {
        "type": "function",
        "function": {
            "name": "query_facilities",
            "description": (
                "Query the live Supabase database for facilities in Tampines. "
                "Returns a list of matching facilities with id, name, type, "
                "address, is_sheltered, and is_indoor."
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
    }
]


def _truthy(val) -> bool:
    """Coerce any string/bool representation to Python bool."""
    if isinstance(val, bool):
        return val
    return str(val).strip().lower() in ("true", "yes", "1")


# ── Tool execution ────────────────────────────────────────────────
def _run_tool(name: str, args: dict) -> str:
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
            return json.dumps(result.data)

        elif name == "update_facility":
            facility_id = args["facility_id"]
            field       = args["field"]
            raw_value   = args["value"]

            allowed = {"name", "address", "is_sheltered", "is_indoor", "type"}
            if field not in allowed:
                return json.dumps({"error": f"Field '{field}' is not updatable."})

            # Coerce value type
            if field in ("is_sheltered", "is_indoor"):
                value = _truthy(raw_value)
            else:
                value = raw_value

            result = (
                _sb.table("facilities")
                .update({field: value})
                .eq("id", facility_id)
                .execute()
            )
            return json.dumps({"updated": len(result.data)})

        elif name == "add_crowd_report":
            row = {
                "facility_id":   args["facility_id"],
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
def chat(messages: list[dict]) -> str:
    """
    Run the full agentic loop:
      1. Send messages to Groq with tools available.
      2. If model calls tools, execute them and loop.
      3. Return the final text reply.

    `messages` is a list of {"role": "user"/"assistant", "content": "..."}
    (the history from the frontend, without the system prompt — we prepend it here).
    """
    # Build the full message list with system prompt at position 0
    groq_messages = [{"role": "system", "content": SYSTEM_PROMPT}] + messages

    # Agentic loop — up to 5 tool-call rounds to prevent infinite loops
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

        # If model wants to call tools, execute them and continue
        if choice.finish_reason == "tool_calls":
            assistant_msg = choice.message
            groq_messages.append(assistant_msg)  # Groq message object → OK as dict-like

            for tool_call in assistant_msg.tool_calls:
                fn_name = tool_call.function.name
                fn_args = json.loads(tool_call.function.arguments)
                result  = _run_tool(fn_name, fn_args)
                groq_messages.append({
                    "role":         "tool",
                    "tool_call_id": tool_call.id,
                    "content":      result,
                })
            # Loop again with tool results appended
            continue

        # No more tool calls — return the final text
        return choice.message.content or "Sorry, I couldn't generate a response."

    return "Sorry, something went wrong after too many tool calls. Please try again."
