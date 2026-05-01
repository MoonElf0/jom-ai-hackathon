"""
JOM AI -- Backend Flask Server
==============================
Main entry point. Run: flask run (or python app.py)
"""

import os
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
            "chat": "POST /api/ai/chat",
            "status": "GET /api/status",
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

    The `messages` array is the full conversation history (without the system
    prompt — the AI service prepends it). Returns:
        { "reply": "..." }
    """
    body = request.get_json(silent=True) or {}
    messages = body.get("messages", [])

    if not messages:
        return jsonify({"error": "No messages provided."}), 400

    # Validate each message has role + content
    for m in messages:
        if not isinstance(m, dict) or "role" not in m or "content" not in m:
            return jsonify({"error": "Each message must have 'role' and 'content'."}), 400

    try:
        from ai_service import chat
        reply = chat(messages)
        return jsonify({"reply": reply})
    except Exception as e:
        print(f"[AI ERROR] {e}")
        return jsonify({"error": str(e)}), 500