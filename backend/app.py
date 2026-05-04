"""
JOM AI -- Backend Flask Server
==============================
Main entry point. Run: flask run (or python app.py)
"""

import requests as req
from flask import Flask, jsonify, request
from flask_cors import CORS
from dotenv import load_dotenv

load_dotenv()

app = Flask(__name__)
CORS(app, origins=["http://localhost:5173", "http://localhost:5174"])


# ── Health check routes ───────────────────────────────────────────
@app.route("/")
def index():
    return jsonify({
        "status": "ok",
        "message": "JOM AI backend is running.",
        "endpoints": {
            "chat":          "POST /api/ai/chat",
            "status":        "GET /api/status",
            "onemap_search": "GET /api/onemap/search?searchVal=...",
            "onemap_route":  "GET /api/onemap/route?start=lat,lng&end=lat,lng&routeType=walk|drive|cycle|pt",
        }
    })


@app.route("/api/status")
def status():
    return jsonify({"status": "ok", "message": "JOM AI backend is running!"})


# ── AI Chat endpoint ──────────────────────────────────────────────
@app.route("/api/ai/chat", methods=["POST"])
def ai_chat():
    """
    Expects JSON body:
        { "messages": [ {"role": "user", "content": "..."}, ... ] }

    Returns:
        { "reply": "...", "action": null | {"type": "navigate", "destination": {...}, "mode": "..."} }
    """
    body        = request.get_json(silent=True) or {}
    messages    = body.get("messages", [])
    location    = body.get("location")     # {"lat": float, "lng": float} or None
    preferences = body.get("preferences")  # {"display_name", "favorite_types", "preferred_transport", "home_address", "bio"} or None

    if not messages:
        return jsonify({"error": "No messages provided."}), 400

    for m in messages:
        if not isinstance(m, dict) or "role" not in m or "content" not in m:
            return jsonify({"error": "Each message must have 'role' and 'content'."}), 400

    try:
        from ai_service import chat
        result = chat(messages, location=location, preferences=preferences)
        # result is {"reply": str, "action": dict | None}
        return jsonify(result)
    except Exception as e:
        err_str = str(e)
        print(f"[AI ERROR] {err_str}")
        # Surface API-key errors with a clear message instead of raw Groq traceback
        err_lower = err_str.lower()
        if "401" in err_str and ("api_key" in err_lower or "invalid" in err_lower):
            return jsonify({
                "error": (
                    "DEEPSEEK_API_KEY is invalid or expired. "
                    "Please update DEEPSEEK_API_KEY in backend/.env and restart the server."
                )
            }), 503
        return jsonify({"error": err_str}), 500


# ── OneMap proxy: place / address search ─────────────────────────
@app.route("/api/onemap/search")
def onemap_search():
    """
    Proxy OneMap elastic search.
    Query params: searchVal (required)
    Returns OneMap results with LATITUDE, LONGITUDE, ADDRESS, BUILDING, POSTAL.
    """
    search_val = request.args.get("searchVal", "").strip()
    if not search_val:
        return jsonify({"error": "searchVal is required"}), 400

    try:
        from onemap_token import get_token
        token = get_token()
        resp = req.get(
            "https://www.onemap.gov.sg/api/common/elastic/search",
            params={
                "searchVal":      search_val,
                "returnGeom":     "Y",
                "getAddrDetails": "Y",
                "pageNum":        1,
            },
            headers={"Authorization": token},
            timeout=10,
        )
        return jsonify(resp.json()), resp.status_code
    except Exception as e:
        print(f"[OneMap search] {e}")
        return jsonify({"error": str(e)}), 500


# ── OneMap proxy: routing ─────────────────────────────────────────
@app.route("/api/onemap/route")
def onemap_route():
    """
    Proxy OneMap routing service.

    Query params (all modes):
        start       — "lat,lng"  e.g. "1.320981,103.844150"
        end         — "lat,lng"
        routeType   — walk | drive | cycle | pt

    Additional params for routeType=pt:
        date             — MM-DD-YYYY  (defaults to today)
        time             — HH:MM:SS   (defaults to now)
        mode             — TRANSIT | BUS | RAIL  (default: TRANSIT)
        maxWalkDistance  — metres (default: 1000)
        numItineraries   — 1-3 (default: 3)

    Response for walk/drive/cycle:
        route_geometry      — encoded polyline string
        route_summary       — { total_time (s), total_distance (m), ... }
        route_instructions  — array of turn-by-turn steps

    Response for pt:
        plan.itineraries    — array of trip options; each has legs[]
        Each leg: mode, route, legGeometry.points (encoded polyline),
                  startTime, endTime, distance, from, to
    """
    start      = request.args.get("start", "").strip()
    end        = request.args.get("end", "").strip()
    route_type = request.args.get("routeType", "walk").strip()

    if not start or not end:
        return jsonify({"error": "start and end are required (lat,lng format)"}), 400

    try:
        from onemap_token import get_token
        token  = get_token()
        params = {
            "start":     start,
            "end":       end,
            "routeType": route_type,
        }
        if route_type == "pt":
            params["date"]            = request.args.get("date", "")
            params["time"]            = request.args.get("time", "")
            params["mode"]            = request.args.get("mode", "TRANSIT")
            params["maxWalkDistance"] = request.args.get("maxWalkDistance", "1000")
            params["numItineraries"]  = request.args.get("numItineraries", "3")

        resp = req.get(
            "https://www.onemap.gov.sg/api/public/routingsvc/route",
            params=params,
            headers={"Authorization": token},
            timeout=15,
        )
        data = resp.json()

        if route_type == "pt":
            itins = data.get("plan", {}).get("itineraries", [])
            if itins:
                legs = itins[0].get("legs", [])
                leg_summary = [(l.get("mode"), l.get("transitLeg"), round(l.get("distance", 0))) for l in legs]
                print(f"[PT Route] legs: {leg_summary}")
            else:
                print(f"[PT Route] no itineraries — response keys: {list(data.keys())}")
                print(f"[PT Route] raw: {data}")

        return jsonify(data), resp.status_code
    except Exception as e:
        print(f"[OneMap route] {e}")
        return jsonify({"error": str(e)}), 500


if __name__ == "__main__":
    app.run(debug=True, port=5000)
