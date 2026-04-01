import os, uuid, shutil, asyncio, json, tempfile
from pathlib import Path
from contextlib import asynccontextmanager
from typing import Optional

from fastapi import FastAPI, File, UploadFile, HTTPException, Form
from fastapi.responses import JSONResponse
from fastapi.middleware.cors import CORSMiddleware
from fastapi.staticfiles import StaticFiles
import httpx
from supabase import create_client, Client as SupabaseClient

# ── Config ────────────────────────────────────────────────────────────────────

AUDIOSHAKE_API_KEY = os.getenv(
    "AUDIOSHAKE_API_KEY",
    "ashke_8c39361eea4daddc8ff51dc4af3bfad5e8f9af02930c912224fd6a26a6b249e2",
)
AUDIOSHAKE_BASE = "https://api.audioshake.ai"

SUPABASE_URL = os.getenv("SUPABASE_URL", "https://qslrhgtkxxhesazipcbs.supabase.co")
SUPABASE_SERVICE_KEY = os.getenv("SUPABASE_SERVICE_KEY", "")  # required — see dashboard → Settings → API

WHISPER_MODEL_SIZE = os.getenv("WHISPER_MODEL", "base")  # tiny|base|small|medium|large

UPLOAD_DIR = Path("uploads")
UPLOAD_DIR.mkdir(exist_ok=True)

ALLOWED_EXTENSIONS = {".mp3", ".wav", ".flac", ".m4a", ".ogg", ".aac"}
STEMS_BUCKET = "stems"
ORIGINALS_BUCKET = "originals"

POLL_INTERVAL = 2    # seconds
POLL_TIMEOUT  = 300  # max wait for AudioShake

# ── Lazy singletons ───────────────────────────────────────────────────────────

_supabase: SupabaseClient | None = None
_whisper_model = None


def get_supabase() -> SupabaseClient:
    global _supabase
    if _supabase is None:
        if not SUPABASE_SERVICE_KEY:
            raise HTTPException(500, "SUPABASE_SERVICE_KEY env var not set. Get it from Supabase dashboard → Settings → API.")
        _supabase = create_client(SUPABASE_URL, SUPABASE_SERVICE_KEY)
    return _supabase


def get_whisper():
    global _whisper_model
    if _whisper_model is None:
        import whisper as whisper_lib
        _whisper_model = whisper_lib.load_model(WHISPER_MODEL_SIZE)
    return _whisper_model


# ── Startup ───────────────────────────────────────────────────────────────────

@asynccontextmanager
async def lifespan(app: FastAPI):
    # Ensure Storage buckets exist (no-op if already created)
    if SUPABASE_SERVICE_KEY:
        await asyncio.to_thread(_ensure_buckets)
    else:
        print("⚠️  SUPABASE_SERVICE_KEY not set — Storage and DB features disabled until configured.")
    yield


def _ensure_buckets():
    sb = get_supabase()
    existing = {b.name for b in sb.storage.list_buckets()}
    for bucket in (STEMS_BUCKET, ORIGINALS_BUCKET):
        if bucket not in existing:
            sb.storage.create_bucket(bucket, options={"public": False})
            print(f"Created Storage bucket: {bucket}")


# ── App ───────────────────────────────────────────────────────────────────────

app = FastAPI(title="LOUDMOUTH API", version="0.3.0", lifespan=lifespan)

app.mount("/static", StaticFiles(directory="../static"), name="static")
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_methods=["*"],
    allow_headers=["*"],
)


@app.get("/")
def root():
    return {"status": "LOUDMOUTH API is running 🎤", "version": "0.3.0"}


# ── Task 3: Song Processing Pipeline ─────────────────────────────────────────

@app.post("/process-song")
async def process_song(
    file: UploadFile = File(...),
    song_id: Optional[str] = Form(None),   # pass if song already exists in DB
    title: Optional[str] = Form(None),     # required if song_id not provided
    artist: Optional[str] = Form(None),    # required if song_id not provided
    genre: Optional[str] = Form(None),
    price_cents: Optional[int] = Form(129),
):
    """
    Full song processing pipeline:
      1. Check DB for cached stems → return immediately if found
      2. Upload original to Supabase Storage
      3. Send to AudioShake for vocal_lead + instrumental separation
      4. Download stems from AudioShake
      5. Upload stems to Supabase Storage
      6. Write song_stems record + update songs.status → 'ready'
      7. Return permanent Storage URLs
    """
    suffix = Path(file.filename).suffix.lower()
    if suffix not in ALLOWED_EXTENSIONS:
        raise HTTPException(400, f"Unsupported file type '{suffix}'.")

    sb = get_supabase()

    # ── Step 1: Cache check ────────────────────────────────────────────────
    if song_id:
        cached = await asyncio.to_thread(_get_cached_stems, sb, song_id)
        if cached:
            return JSONResponse({"song_id": song_id, "status": "cached", **cached})

    # ── Step 2: Resolve / create song record ──────────────────────────────
    if not song_id:
        if not title or not artist:
            raise HTTPException(400, "title and artist are required when song_id is not provided.")
        song_id = await asyncio.to_thread(_create_song_record, sb, title, artist, genre, price_cents)

    job_id = str(uuid.uuid4())
    input_path = UPLOAD_DIR / f"{job_id}{suffix}"

    with open(input_path, "wb") as f:
        shutil.copyfileobj(file.file, f)

    # Log to processing_queue
    await asyncio.to_thread(_queue_upsert, sb, song_id, "processing")

    try:
        # ── Step 3: Upload original to Storage ────────────────────────────
        original_storage_path = f"{song_id}/original{suffix}"
        await asyncio.to_thread(
            _upload_to_storage, sb, ORIGINALS_BUCKET, original_storage_path, input_path, _mime(suffix)
        )

        # ── Step 4: AudioShake separation ─────────────────────────────────
        async with httpx.AsyncClient(base_url=AUDIOSHAKE_BASE, headers=_as_headers(), timeout=60) as client:
            asset_id = await _upload_asset(client, input_path, file.filename)
            task_id  = await _create_task(client, asset_id)
            result   = await _poll_task(client, task_id)

        # Map AudioShake output URLs
        as_urls = {}
        for target in result.get("targets", []):
            outputs = target.get("output", [])
            if outputs:
                as_urls[target["model"]] = outputs[0]["link"]

        if "vocals_lead" not in as_urls or "instrumental" not in as_urls:
            raise HTTPException(502, f"AudioShake did not return both stems: {as_urls}")

        # ── Step 5: Download stems + re-upload to Storage ─────────────────
        stems_paths = await _cache_stems(sb, song_id, as_urls)

        # ── Step 6: Persist to DB ─────────────────────────────────────────
        await asyncio.to_thread(_upsert_song_stems, sb, song_id, original_storage_path, stems_paths)
        await asyncio.to_thread(_mark_song_ready, sb, song_id)
        await asyncio.to_thread(_queue_upsert, sb, song_id, "done")

    except Exception as e:
        await asyncio.to_thread(_queue_upsert, sb, song_id, "failed", str(e))
        raise
    finally:
        input_path.unlink(missing_ok=True)

    return JSONResponse({
        "song_id":      song_id,
        "task_id":      task_id,
        "status":       "complete",
        "stems": {
            "vocals":       stems_paths["vocals_path"],
            "instrumental": stems_paths["backing_path"],
        },
        "original_path": original_storage_path,
    })


@app.get("/song-stems/{song_id}")
async def get_song_stems(song_id: str):
    """Return cached stem Storage paths for a song, or 404 if not yet processed."""
    sb = get_supabase()
    cached = await asyncio.to_thread(_get_cached_stems, sb, song_id)
    if not cached:
        raise HTTPException(404, "Stems not found for this song_id.")
    return JSONResponse({"song_id": song_id, **cached})


@app.get("/task-status/{task_id}")
async def task_status(task_id: str):
    """Check the status of an in-flight AudioShake processing task."""
    async with httpx.AsyncClient(base_url=AUDIOSHAKE_BASE, headers=_as_headers(), timeout=30) as client:
        resp = await client.get(f"/tasks/{task_id}")
        if resp.status_code != 200:
            raise HTTPException(resp.status_code, f"AudioShake error: {resp.text}")
        data = resp.json()

    targets = data.get("targets", [])
    target_statuses = {t["model"]: t["status"] for t in targets}
    all_done = all(s == "completed" for s in target_statuses.values())

    stems = {}
    if all_done:
        for t in targets:
            if t.get("output"):
                stems[t["model"]] = t["output"][0].get("link")

    return JSONResponse({
        "task_id": task_id,
        "status":  "complete" if all_done else "processing",
        "targets": target_statuses,
        "stems":   stems if all_done else None,
    })


# ── Task 4: Whisper Transcription ─────────────────────────────────────────────

@app.post("/transcribe")
async def transcribe(
    file: UploadFile = File(...),
    language: Optional[str] = Form(None),   # ISO 639-1 code e.g. "en", "es". None = auto-detect.
    save_to_song_id: Optional[str] = Form(None),  # if provided, persist JSON to song_stems
):
    """
    Transcribe audio with word-by-word timestamps using local OpenAI Whisper.

    Returns:
      - text: full transcript
      - language: detected or specified language
      - words: [{word, start, end, probability}] — word-level timing for lyric sync
      - segments: raw Whisper segment data
    """
    suffix = Path(file.filename).suffix.lower()
    if suffix not in ALLOWED_EXTENSIONS:
        raise HTTPException(400, f"Unsupported file type '{suffix}'.")

    # Write to temp file
    tmp = tempfile.NamedTemporaryFile(suffix=suffix, delete=False)
    try:
        shutil.copyfileobj(file.file, tmp)
        tmp.close()

        # Run Whisper in a thread (blocking CPU work)
        result = await asyncio.to_thread(
            _run_whisper, tmp.name, language
        )
    finally:
        Path(tmp.name).unlink(missing_ok=True)

    # Optionally persist the Whisper JSON to Supabase Storage
    if save_to_song_id and SUPABASE_SERVICE_KEY:
        sb = get_supabase()
        whisper_json = json.dumps(result).encode()
        storage_path = f"{save_to_song_id}/whisper.json"
        await asyncio.to_thread(
            _upload_bytes_to_storage, sb, STEMS_BUCKET, storage_path,
            whisper_json, "application/json"
        )
        # Update song_stems.whisper_json_path
        await asyncio.to_thread(
            lambda: sb.table("song_stems")
                .update({"whisper_json_path": storage_path})
                .eq("song_id", save_to_song_id)
                .execute()
        )

    return JSONResponse(result)


def _run_whisper(audio_path: str, language: Optional[str]) -> dict:
    model = get_whisper()
    opts = {"word_timestamps": True}
    if language:
        opts["language"] = language

    raw = model.transcribe(audio_path, **opts)

    # Flatten word-level timestamps from segments
    words = []
    for seg in raw.get("segments", []):
        for w in seg.get("words", []):
            words.append({
                "word":        w["word"].strip(),
                "start":       round(w["start"], 3),
                "end":         round(w["end"], 3),
                "probability": round(w.get("probability", 0.0), 4),
            })

    return {
        "text":     raw.get("text", "").strip(),
        "language": raw.get("language", language or "unknown"),
        "words":    words,
        "segments": [
            {
                "id":    s["id"],
                "start": round(s["start"], 3),
                "end":   round(s["end"], 3),
                "text":  s["text"].strip(),
            }
            for s in raw.get("segments", [])
        ],
    }


# ── AudioShake helpers ────────────────────────────────────────────────────────

def _as_headers():
    return {"x-api-key": AUDIOSHAKE_API_KEY}


async def _upload_asset(client: httpx.AsyncClient, file_path: Path, filename: str) -> str:
    with open(file_path, "rb") as f:
        resp = await client.post("/assets", files={"file": (filename, f)})
    if resp.status_code not in (200, 201):
        raise HTTPException(502, f"AudioShake asset upload failed ({resp.status_code}): {resp.text}")
    data = resp.json()
    asset_id = data.get("id")
    if not asset_id:
        raise HTTPException(502, f"AudioShake returned no asset ID: {data}")
    return asset_id


async def _create_task(client: httpx.AsyncClient, asset_id: str) -> str:
    payload = {
        "assetId": asset_id,
        "targets": [
            {"model": "vocals_lead",  "formats": ["mp3"]},
            {"model": "instrumental", "formats": ["mp3"]},
        ],
    }
    resp = await client.post("/tasks", json=payload)
    if resp.status_code not in (200, 201):
        raise HTTPException(502, f"AudioShake task creation failed ({resp.status_code}): {resp.text}")
    data = resp.json()
    task_id = data.get("id")
    if not task_id:
        raise HTTPException(502, f"AudioShake returned no task ID: {data}")
    return task_id


async def _poll_task(client: httpx.AsyncClient, task_id: str) -> dict:
    elapsed = 0
    while elapsed < POLL_TIMEOUT:
        resp = await client.get(f"/tasks/{task_id}")
        if resp.status_code != 200:
            raise HTTPException(502, f"AudioShake poll failed ({resp.status_code}): {resp.text}")
        data    = resp.json()
        targets = data.get("targets", [])
        statuses = [t.get("status") for t in targets]

        if any(s == "failed" for s in statuses):
            raise HTTPException(502, f"AudioShake processing failed: {[t for t in targets if t.get('status') == 'failed']}")
        if all(s == "completed" for s in statuses) and len(statuses) >= 2:
            return data

        await asyncio.sleep(POLL_INTERVAL)
        elapsed += POLL_INTERVAL

    raise HTTPException(504, f"AudioShake timed out after {POLL_TIMEOUT}s")


# ── Storage helpers ───────────────────────────────────────────────────────────

def _upload_to_storage(sb: SupabaseClient, bucket: str, path: str, local_path: Path, mime: str):
    with open(local_path, "rb") as f:
        sb.storage.from_(bucket).upload(
            path, f, file_options={"content-type": mime, "upsert": "true"}
        )


def _upload_bytes_to_storage(sb: SupabaseClient, bucket: str, path: str, data: bytes, mime: str):
    sb.storage.from_(bucket).upload(
        path, data, file_options={"content-type": mime, "upsert": "true"}
    )


async def _cache_stems(sb: SupabaseClient, song_id: str, as_urls: dict) -> dict:
    """Download AudioShake stem URLs and re-upload to Supabase Storage."""
    paths = {}
    async with httpx.AsyncClient(timeout=120) as dl:
        for model, url in as_urls.items():
            storage_key = "vocals_path" if model == "vocals_lead" else "backing_path"
            filename = "vocals.mp3" if model == "vocals_lead" else "instrumental.mp3"
            storage_path = f"{song_id}/{filename}"

            resp = await dl.get(url)
            if resp.status_code != 200:
                raise HTTPException(502, f"Failed to download {model} stem from AudioShake")

            await asyncio.to_thread(
                _upload_bytes_to_storage, sb, STEMS_BUCKET,
                storage_path, resp.content, "audio/mpeg"
            )
            paths[storage_key] = storage_path

    return paths


def _mime(suffix: str) -> str:
    return {
        ".mp3": "audio/mpeg", ".wav": "audio/wav", ".flac": "audio/flac",
        ".m4a": "audio/mp4",  ".ogg": "audio/ogg", ".aac": "audio/aac",
    }.get(suffix, "audio/mpeg")


# ── DB helpers ────────────────────────────────────────────────────────────────

def _get_cached_stems(sb: SupabaseClient, song_id: str) -> dict | None:
    res = (
        sb.table("song_stems")
        .select("vocals_path, backing_path, whisper_json_path, lyric_map_path")
        .eq("song_id", song_id)
        .maybe_single()
        .execute()
    )
    data = res.data
    if not data or not data.get("vocals_path"):
        return None
    return {
        "stems": {
            "vocals":       data["vocals_path"],
            "instrumental": data["backing_path"],
        },
        "whisper_json_path": data.get("whisper_json_path"),
        "lyric_map_path":    data.get("lyric_map_path"),
    }


def _create_song_record(sb: SupabaseClient, title: str, artist: str,
                         genre: Optional[str], price_cents: int) -> str:
    res = (
        sb.table("songs")
        .insert({
            "title":       title,
            "artist":      artist,
            "genre":       genre,
            "price_cents": price_cents,
            "status":      "processing",
        })
        .execute()
    )
    return res.data[0]["id"]


def _upsert_song_stems(sb: SupabaseClient, song_id: str,
                        original_path: str, stems: dict):
    sb.table("song_stems").upsert({
        "song_id":       song_id,
        "original_path": original_path,
        "vocals_path":   stems.get("vocals_path"),
        "backing_path":  stems.get("backing_path"),
        "format":        "mp3",
    }, on_conflict="song_id").execute()


def _mark_song_ready(sb: SupabaseClient, song_id: str):
    from datetime import datetime, timezone
    sb.table("songs").update({
        "status":       "ready",
        "processed_at": datetime.now(timezone.utc).isoformat(),
    }).eq("id", song_id).execute()


def _queue_upsert(sb: SupabaseClient, song_id: str, status: str, error: str = None):
    sb.table("processing_queue").upsert({
        "song_id": song_id,
        "status":  status,
        **({"error_message": error} if error else {}),
    }, on_conflict="song_id").execute()
