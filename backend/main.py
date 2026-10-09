import os
import uuid
from datetime import date

from dotenv import load_dotenv
import logging

from fastapi import FastAPI, File, Form, HTTPException, Depends, Request, Response, UploadFile
from fastapi.middleware.cors import CORSMiddleware
from slowapi import Limiter, _rate_limit_exceeded_handler
from slowapi.errors import RateLimitExceeded
from slowapi.middleware import SlowAPIMiddleware
from slowapi.util import get_remote_address
from fastapi.responses import JSONResponse
from postgrest.exceptions import APIError
from supabase import create_client, Client

load_dotenv()

from auth import COOKIE_NAME, SESSION_DAYS, authenticate, create_session_token, current_user  # noqa: E402
from models import DailyUpdateCreate, LoginRequest, ResourceCreate  # noqa: E402

limiter = Limiter(key_func=get_remote_address, default_limits=["120/minute"])

app = FastAPI(title="Learning Calendar API")
app.state.limiter = limiter
app.add_exception_handler(RateLimitExceeded, _rate_limit_exceeded_handler)
app.add_middleware(SlowAPIMiddleware)

log = logging.getLogger("uvicorn.error")


@app.exception_handler(APIError)
async def database_error_handler(request: Request, exc: APIError):
    # Handled here (inside the CORS middleware) so the browser sees a real error, not a CORS failure.
    log.error("Database error on %s: %s", request.url.path, exc)
    code = (exc.args[0] or {}).get("code") if exc.args and isinstance(exc.args[0], dict) else None
    detail = "Database rejected the request. Check the Supabase key (use service_role) and that the migration ran."
    if code != "42501":
        detail = "Database error. Please try again."
    return JSONResponse(status_code=500, content={"detail": detail})

ORIGINS = [o.strip() for o in os.getenv("FRONTEND_ORIGINS", "http://localhost:3000,http://127.0.0.1:3000").split(",")]
app.add_middleware(
    CORSMiddleware,
    allow_origins=ORIGINS,
    allow_credentials=True,
    allow_methods=["GET", "POST", "OPTIONS"],
    allow_headers=["Content-Type"],
)

SUPABASE_URL = os.getenv("SUPABASE_URL")
SUPABASE_KEY = os.getenv("SUPABASE_KEY")
COOKIE_SECURE = os.getenv("COOKIE_SECURE", "false").lower() == "true"  # set true behind HTTPS


def get_supabase() -> Client:
    if not SUPABASE_URL or not SUPABASE_KEY:
        raise HTTPException(status_code=500, detail="Supabase credentials not configured.")
    return create_client(SUPABASE_URL, SUPABASE_KEY)


@app.get("/")
def read_root():
    return {"message": "Welcome to the Learning Calendar API"}


# --- Auth ---

@app.post("/api/auth/login")
@limiter.limit("5/minute")
def login(request: Request, body: LoginRequest, response: Response):
    username = authenticate(body.username, body.password)
    if not username:
        raise HTTPException(status_code=401, detail="Invalid username or password")
    response.set_cookie(
        COOKIE_NAME,
        create_session_token(username),
        max_age=SESSION_DAYS * 86400,
        httponly=True,
        secure=COOKIE_SECURE,
        samesite="lax",
        path="/",
    )
    return {"username": username}


@app.post("/api/auth/logout")
def logout(response: Response):
    response.delete_cookie(COOKIE_NAME, path="/")
    return {"ok": True}


@app.get("/api/auth/me")
def me(user: str = Depends(current_user)):
    return {"username": user}


# --- Daily Updates (each user only sees and writes their own) ---

@app.post("/api/updates")
def create_update(update: DailyUpdateCreate, user: str = Depends(current_user), supabase: Client = Depends(get_supabase)):
    data = update.model_dump()
    data["date"] = data["date"].isoformat()
    data["username"] = user
    response = supabase.table("daily_updates").upsert(data, on_conflict="username,date").execute()
    if response.data:
        return response.data[0]
    raise HTTPException(status_code=400, detail="Could not create update")


@app.get("/api/updates")
def get_updates(user: str = Depends(current_user), supabase: Client = Depends(get_supabase)):
    response = supabase.table("daily_updates").select("*").eq("username", user).order("date").execute()
    return response.data


@app.get("/api/updates/{date_str}")
def get_update_by_date(date_str: date, user: str = Depends(current_user), supabase: Client = Depends(get_supabase)):
    response = (
        supabase.table("daily_updates").select("*")
        .eq("username", user).eq("date", date_str.isoformat()).execute()
    )
    if not response.data:
        raise HTTPException(status_code=404, detail="Update not found for this date")
    return response.data[0]


@app.delete("/api/updates/{date_str}")
def delete_update_by_date(date_str: date, user: str = Depends(current_user), supabase: Client = Depends(get_supabase)):
    response = (
        supabase.table("daily_updates").delete()
        .eq("username", user).eq("date", date_str.isoformat()).execute()
    )
    if not response.data:
        raise HTTPException(status_code=404, detail="Update not found for this date")
    return {"ok": True}


@app.delete("/api/updates/{update_id}/media/{kind}")
def delete_update_media(update_id: str, kind: str, user: str = Depends(current_user), supabase: Client = Depends(get_supabase)):
    if kind not in ["video", "audio"]:
        raise HTTPException(status_code=400, detail="Invalid kind")
    col = "video_url" if kind == "video" else "voice_note_url"
    response = (
        supabase.table("daily_updates").update({col: None})
        .eq("username", user).eq("id", update_id).execute()
    )
    if not response.data:
        raise HTTPException(status_code=404, detail="Update not found")
    return {"ok": True}


# --- Resources ---

@app.post("/api/resources")
def create_resource(resource: ResourceCreate, user: str = Depends(current_user), supabase: Client = Depends(get_supabase)):
    response = supabase.table("resources").insert({**resource.model_dump(), "username": user}).execute()
    if response.data:
        return response.data[0]
    raise HTTPException(status_code=400, detail="Could not create resource")


@app.get("/api/resources")
def get_resources(user: str = Depends(current_user), supabase: Client = Depends(get_supabase)):
    response = (
        supabase.table("resources").select("*")
        .eq("username", user).order("created_at", desc=True).execute()
    )
    return response.data


@app.delete("/api/resources/{resource_id}")
def delete_resource(resource_id: str, user: str = Depends(current_user), supabase: Client = Depends(get_supabase)):
    response = (
        supabase.table("resources").delete()
        .eq("username", user).eq("id", resource_id).execute()
    )
    if not response.data:
        raise HTTPException(status_code=404, detail="Resource not found")
    return {"ok": True}


# --- Media upload (Supabase Storage, bucket "media") ---

MEDIA_BUCKET = "media"
MAX_UPLOAD_BYTES = 50 * 1024 * 1024
ALLOWED_TYPES = {"video": "video/webm", "audio": "audio/webm"}


@app.post("/api/upload")
@limiter.limit("20/minute")
async def upload_media(
    request: Request,
    kind: str = Form(...),
    file: UploadFile = File(...),
    user: str = Depends(current_user),
    supabase: Client = Depends(get_supabase),
):
    if kind not in ALLOWED_TYPES:
        raise HTTPException(status_code=400, detail="kind must be 'video' or 'audio'")
    if not (file.content_type or "").startswith(ALLOWED_TYPES[kind]):
        raise HTTPException(status_code=415, detail=f"Expected {ALLOWED_TYPES[kind]}")
    content = await file.read(MAX_UPLOAD_BYTES + 1)
    if len(content) > MAX_UPLOAD_BYTES:
        raise HTTPException(status_code=413, detail="File too large")
    path = f"{user}/{kind}/{uuid.uuid4()}.webm"
    try:
        supabase.storage.from_(MEDIA_BUCKET).upload(path, content, {"content-type": ALLOWED_TYPES[kind]})
    except Exception:
        raise HTTPException(status_code=500, detail="Upload failed")
    return {"url": supabase.storage.from_(MEDIA_BUCKET).get_public_url(path)}
