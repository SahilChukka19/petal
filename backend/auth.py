import json
import os
from datetime import datetime, timedelta, timezone
from pathlib import Path

import bcrypt
import jwt
from fastapi import HTTPException, Request

USERS_FILE = Path(__file__).parent / "users.json"
MAX_USERS = 2
MAX_PASSWORD_BYTES = 72  # bcrypt ignores anything beyond this
COOKIE_NAME = "session"
SESSION_DAYS = 7
ALGORITHM = "HS256"

# Compared against when the username doesn't exist, so response time doesn't reveal valid usernames.
_DUMMY_HASH = bcrypt.hashpw(b"dummy-password", bcrypt.gensalt())


def _secret() -> str:
    secret = os.getenv("JWT_SECRET")
    if not secret or len(secret) < 32:
        raise RuntimeError("JWT_SECRET must be set in .env (at least 32 characters).")
    return secret


def load_users() -> dict[str, str]:
    # Hosted deployments set AUTH_USERS (JSON of {username: bcrypt hash}); locally we use users.json.
    env_users = os.getenv("AUTH_USERS")
    if env_users:
        return {k.strip().lower(): v for k, v in json.loads(env_users).items()}
    if not USERS_FILE.exists():
        return {}
    return json.loads(USERS_FILE.read_text(encoding="utf-8"))


def save_users(users: dict[str, str]) -> None:
    USERS_FILE.write_text(json.dumps(users, indent=2), encoding="utf-8")


def hash_password(password: str) -> str:
    raw = password.encode("utf-8")
    if len(raw) > MAX_PASSWORD_BYTES:
        raise ValueError(f"Password must be at most {MAX_PASSWORD_BYTES} bytes.")
    return bcrypt.hashpw(raw, bcrypt.gensalt(rounds=12)).decode()


def authenticate(username: str, password: str) -> str | None:
    """Returns the normalised username on success, otherwise None."""
    username = username.strip().lower()
    raw = password.encode("utf-8")[:MAX_PASSWORD_BYTES]
    stored = load_users().get(username)
    ok = bcrypt.checkpw(raw, stored.encode() if stored else _DUMMY_HASH)
    return username if (stored and ok) else None


def create_session_token(username: str) -> str:
    now = datetime.now(timezone.utc)
    payload = {"sub": username, "iat": now, "exp": now + timedelta(days=SESSION_DAYS)}
    return jwt.encode(payload, _secret(), algorithm=ALGORITHM)


def current_user(request: Request) -> str:
    """FastAPI dependency: requires a valid session cookie and returns the username."""
    token = request.cookies.get(COOKIE_NAME)
    if not token:
        raise HTTPException(status_code=401, detail="Not authenticated")
    try:
        username = jwt.decode(token, _secret(), algorithms=[ALGORITHM])["sub"]
    except jwt.PyJWTError:
        raise HTTPException(status_code=401, detail="Invalid or expired session")
    if username not in load_users():  # removed users lose access immediately
        raise HTTPException(status_code=401, detail="Invalid or expired session")
    return username
