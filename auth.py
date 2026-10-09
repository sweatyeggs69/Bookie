"""Simple username/password authentication with session management."""
import hashlib
import hmac
import secrets
import logging
import threading
import time
from functools import wraps
from flask import request, jsonify, session, redirect

from models import Settings

logger = logging.getLogger(__name__)


def _hash_password(password: str, salt: str) -> str:
    return hashlib.pbkdf2_hmac("sha256", password.encode(), salt.encode(), 260_000).hex()


def is_first_run(settings_model) -> bool:
    """Return True if no account has been created yet."""
    return not settings_model.get("auth_password_hash")


def check_credentials(username: str, password: str, settings_model) -> bool:
    stored_user = settings_model.get("auth_username")
    stored_hash = settings_model.get("auth_password_hash")
    stored_salt = settings_model.get("auth_password_salt")

    if not (stored_hash and stored_salt and stored_user):
        return False
    if username != stored_user:
        return False
    computed = _hash_password(password, stored_salt)
    return hmac.compare_digest(computed, stored_hash)


def set_password(username: str, password: str, settings_model):
    """Hash and store new credentials and sign out every existing session."""
    salt = secrets.token_hex(32)
    hashed = _hash_password(password, salt)
    settings_model.set("auth_username", username)
    settings_model.set("auth_password_hash", hashed)
    settings_model.set("auth_password_salt", salt)
    settings_model.set("auth_session_version", secrets.token_hex(8))


def _session_version(settings_model) -> str:
    return settings_model.get("auth_session_version") or ""


def _start_session(username: str, settings_model):
    session.clear()
    session["authenticated"] = True
    session["username"] = username
    session["v"] = _session_version(settings_model)
    session.permanent = True


def _session_valid() -> bool:
    if not session.get("authenticated"):
        return False
    # Sessions are signed cookies, so they can't be revoked server-side. Instead
    # each one carries the version current at login; changing the password
    # bumps the version and invalidates every older cookie.
    return hmac.compare_digest(str(session.get("v", "")), _session_version(Settings))


# ── Login throttling ─────────────────────────────────────────────────────────
# Per-client failure counter kept in memory. Behind a reverse proxy every
# client shares the proxy's address, which still caps guessing overall.
_MAX_FAILURES = 10
_FAILURE_WINDOW = 15 * 60  # seconds
_failures: dict[str, list[float]] = {}
_failures_lock = threading.Lock()


def _recent_failures(client: str, now: float) -> list[float]:
    recent = [t for t in _failures.get(client, []) if now - t < _FAILURE_WINDOW]
    if recent:
        _failures[client] = recent
    else:
        _failures.pop(client, None)
    return recent


def _login_blocked(client: str) -> bool:
    with _failures_lock:
        return len(_recent_failures(client, time.time())) >= _MAX_FAILURES


def _record_failure(client: str):
    with _failures_lock:
        now = time.time()
        _failures[client] = _recent_failures(client, now) + [now]


def _clear_failures(client: str):
    with _failures_lock:
        _failures.pop(client, None)


def login_required(f):
    """Decorator: require an authenticated session for API routes."""
    @wraps(f)
    def decorated(*args, **kwargs):
        if not _session_valid():
            if request.path.startswith("/api/"):
                return jsonify({"error": "Unauthorized"}), 401
            return redirect("/login")
        return f(*args, **kwargs)
    return decorated


def basic_auth_required(f):
    """Decorator for feeds read by e-reader apps (OPDS), which can't log in
    through the web UI. Accepts HTTP Basic credentials or a valid session."""
    @wraps(f)
    def decorated(*args, **kwargs):
        if _session_valid():
            return f(*args, **kwargs)
        client = request.remote_addr or "unknown"
        if _login_blocked(client):
            return jsonify({"error": "Too many failed attempts. Try again later."}), 429
        creds = request.authorization
        if creds and creds.type == "basic":
            if check_credentials(creds.username or "", creds.password or "", Settings):
                _clear_failures(client)
                return f(*args, **kwargs)
            _record_failure(client)
            logger.warning("Failed OPDS login attempt from %s", client)
        resp = jsonify({"error": "Unauthorized"})
        resp.status_code = 401
        resp.headers["WWW-Authenticate"] = 'Basic realm="Bookie", charset="UTF-8"'
        return resp
    return decorated


def register_auth_routes(app, Settings):
    """Register login/logout/setup routes on the Flask app."""

    @app.route("/api/auth/setup", methods=["POST"])
    def api_setup():
        if not is_first_run(Settings):
            return jsonify({"error": "Setup already complete"}), 403
        data = request.get_json(silent=True) or {}
        username = str(data.get("username") or "").strip()
        password = str(data.get("password") or "")
        if not username:
            return jsonify({"error": "Username is required"}), 400
        if len(password) < 8:
            return jsonify({"error": "Password must be at least 8 characters"}), 400
        if len(password) > 256:
            return jsonify({"error": "Password must be 256 characters or fewer"}), 400
        set_password(username, password, Settings)
        _start_session(username, Settings)
        return jsonify({"success": True})

    @app.route("/api/auth/login", methods=["POST"])
    def api_login():
        if is_first_run(Settings):
            return jsonify({"error": "No account configured. Please complete setup."}), 403
        client = request.remote_addr or "unknown"
        if _login_blocked(client):
            logger.warning("Login throttled for %s", client)
            return jsonify({"error": "Too many failed attempts. Try again later."}), 429
        data = request.get_json(silent=True) or {}
        username = str(data.get("username") or "").strip()
        password = str(data.get("password") or "")
        if check_credentials(username, password, Settings):
            _clear_failures(client)
            _start_session(username, Settings)
            return jsonify({"success": True})
        _record_failure(client)
        logger.warning("Failed login attempt from %s", client)
        return jsonify({"error": "Invalid username or password"}), 401

    @app.route("/api/auth/logout", methods=["POST"])
    def api_logout():
        session.clear()
        return jsonify({"success": True})

    @app.route("/api/auth/status", methods=["GET"])
    def api_auth_status():
        return jsonify({
            "authenticated": _session_valid(),
            "username": session.get("username"),
            "first_run": is_first_run(Settings),
        })

    @app.route("/api/auth/change-password", methods=["POST"])
    @login_required
    def api_change_password():
        data = request.get_json(silent=True) or {}
        current = str(data.get("current_password") or "")
        new_pass = str(data.get("new_password") or "")
        username = session.get("username", "")
        if not check_credentials(username, current, Settings):
            return jsonify({"error": "Current password incorrect"}), 403
        if len(new_pass) < 8:
            return jsonify({"error": "Password must be at least 8 characters"}), 400
        if len(new_pass) > 256:
            return jsonify({"error": "Password must be 256 characters or fewer"}), 400
        set_password(username, new_pass, Settings)
        # Keep this browser signed in; every other session is now invalid
        _start_session(username, Settings)
        return jsonify({"success": True})
