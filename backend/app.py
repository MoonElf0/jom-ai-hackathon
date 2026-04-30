"""
JOM AI -- Backend Flask Server
==============================
Main entry point for the JOM AI Flask application.

Run: flask run
"""

import os
from flask import Flask, jsonify
from flask_cors import CORS
from dotenv import load_dotenv

# Load environment variables from the .env file in the backend directory
load_dotenv()

# Create the core Flask application instance
app = Flask(__name__)

# Enable Cross-Origin Resource Sharing (CORS) for the app.
# This is crucial for allowing your React frontend (on localhost:5173)
# to make requests to this backend (on localhost:5000).
CORS(app)

@app.route("/")
def index():
    """A simple root route to provide guidance."""
    return jsonify({
        "status": "ok",
        "message": "JOM AI backend is running. Please use the frontend application on http://localhost:5173 to interact with the API.",
        "test_endpoint": "/api/status"
    })

@app.route("/api/status")
def status():
    """A simple test route to confirm the API is up and running."""
    return jsonify({"status": "ok", "message": "JOM AI backend is running!"})

# The `flask run` command will automatically find and run this 'app' object.