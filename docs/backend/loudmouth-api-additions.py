"""
LOUDMOUTH — FastAPI Endpoint Additions
Add these to ~/thunderstruck/thunderstruck_api.py

These endpoints complete the pipeline from song processing → display → session scoring.
"""

from fastapi import FastAPI, UploadFile, File, HTTPException, Depends, BackgroundTasks
from fastapi.responses import FileResponse, StreamingResponse
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel
from typing import Optional
import json, os, uuid, asyncio, time

# ─────────────────────────────────────────────────────────────────────
#  EXISTING endpoints in thunderstruck_api.py:
#    POST /separate
#    GET  /status/{uuid}
#    GET  /lyrics/{uuid}
#
#  NEW endpoints below — add these to your existing app instance
# ─────────────────────────────────────────────────────────────────────

# ── AUDIO STREAMING ──────────────────────────────────────────────────

@app.get("/audio/{job_uuid}/{stem}")
async def get_audio_stem(job_uuid: str, stem: str):
    """
    Stream a processed audio stem.
    stem = 'vocals' | 'no_vocals' | 'full_mix'
    
    Usage in frontend:
      audio.src = 'http://localhost:8000/audio/2fbbb816-8a4a-4bc4-af47-24da32fb31ca/no_vocals'
    """
    valid_stems = {'vocals', 'no_vocals', 'full_mix'}
    if stem not in valid_stems:
        raise HTTPException(status_code=400, detail=f"stem must be one of: {valid_stems}")
    
    # Demucs outputs as 'vocals' and 'no_vocals'
    filename = f"{stem}.mp3"
    path = f"outputs/htdemucs/{job_uuid}/{filename}"
    
    if not os.path.exists(path):
        # Try .wav fallback
        path = f"outputs/htdemucs/{job_uuid}/{stem}.wav"
        if not os.path.exists(path):
            raise HTTPException(status_code=404, detail=f"Stem not found: {stem}")
        media_type = "audio/wav"
    else:
        media_type = "audio/mpeg"
    
    return FileResponse(
        path,
        media_type=media_type,
        headers={
            "Accept-Ranges": "bytes",
            "Cache-Control": "no-cache",
        }
    )


# ── LYRIC MAP ────────────────────────────────────────────────────────

@app.get("/lyric-map/{job_uuid}")
async def get_lyric_map(job_uuid: str):
    """
    Return the processed lyric map JSON for a song.
    This is what the Smart Lyric Display consumes as its WORDS array.
    
    Returns array of:
      { t: float, w: str, p: float, d: float, sec?: str }
    """
    # Try processed lyric map first
    map_path = f"lyrics/{job_uuid}_map.json"
    if os.path.exists(map_path):
        with open(map_path) as f:
            return json.load(f)
    
    # Fallback: convert raw Whisper JSON on the fly
    whisper_path = f"lyrics/{job_uuid}.json"
    if not os.path.exists(whisper_path):
        raise HTTPException(status_code=404, detail="Lyric map not found — is the song processed?")
    
    with open(whisper_path) as f:
        whisper_data = json.load(f)
    
    words = convert_whisper_to_display(whisper_data)
    return words


def convert_whisper_to_display(whisper_data: dict) -> list:
    """Convert Whisper JSON output to LOUDMOUTH display format."""
    words = []
    for segment in whisper_data.get('segments', []):
        if 'words' in segment and segment['words']:
            for w in segment['words']:
                word_text = w['word'].strip()
                if not word_text:
                    continue
                words.append({
                    't': round(w['start'], 3),
                    'w': word_text,
                    'p': 5.0,   # Default pitch — replace with librosa extraction
                    'd': round(w['end'] - w['start'], 3),
                })
        else:
            # Segment-level fallback
            text = segment['text'].strip()
            seg_words = text.split()
            if not seg_words:
                continue
            duration = segment['end'] - segment['start']
            word_dur = duration / len(seg_words)
            for i, wt in enumerate(seg_words):
                words.append({
                    't': round(segment['start'] + i * word_dur, 3),
                    'w': wt,
                    'p': 5.0,
                    'd': round(word_dur, 3),
                })
    return words


# ── SESSIONS ─────────────────────────────────────────────────────────

class SessionCreate(BaseModel):
    song_id: str
    job_uuid: str       # local job UUID until Supabase is wired
    vas_value: int = 50
    playback_speed: float = 1.0

class SessionComplete(BaseModel):
    completed: bool = True
    duration_sec: int
    score_you: float
    score_artist: float
    scores_breakdown: Optional[dict] = None  # {pitch, timing, clarity, dynamics}

# In-memory session store (replace with Supabase when ready)
_sessions: dict = {}

@app.post("/sessions")
async def create_session(data: SessionCreate):
    """
    Create a new sing-through session.
    Call this when user presses play.
    """
    session_id = str(uuid.uuid4())
    _sessions[session_id] = {
        'id': session_id,
        'song_id': data.song_id,
        'job_uuid': data.job_uuid,
        'vas_value': data.vas_value,
        'playback_speed': data.playback_speed,
        'started_at': time.time(),
        'completed': False,
    }
    return {'session_id': session_id}


@app.patch("/sessions/{session_id}")
async def complete_session(session_id: str, data: SessionComplete):
    """
    Update a session with completion data and scores.
    Call this when song ends.
    """
    if session_id not in _sessions:
        raise HTTPException(status_code=404, detail="Session not found")
    
    session = _sessions[session_id]
    session.update({
        'completed': data.completed,
        'duration_sec': data.duration_sec,
        'score_you': data.score_you,
        'score_artist': data.score_artist,
        'scores_breakdown': data.scores_breakdown,
        'completed_at': time.time(),
    })
    
    # Determine tier name from VAS value
    vas = session['vas_value']
    tier = (
        'LEGEND'        if vas < 15 else
        'FRONT MAN'     if vas < 35 else
        'KARAOKE HERO'  if vas < 65 else
        'SHOWER SINGER' if vas < 85 else
        'TRAIN WRECK'
    )
    session['tier_name'] = tier
    
    return {
        'session_id': session_id,
        'tier_name': tier,
        'score_you': data.score_you,
        'score_artist': data.score_artist,
        'beat_artist': data.score_you > data.score_artist,
    }


@app.get("/sessions/{session_id}")
async def get_session(session_id: str):
    """Get session data including scores (for score reveal screen)."""
    if session_id not in _sessions:
        raise HTTPException(status_code=404, detail="Session not found")
    return _sessions[session_id]


@app.get("/sessions/history/{job_uuid}")
async def get_session_history(job_uuid: str, limit: int = 10):
    """
    Get recent sessions for a song (for sparkline in score reveal).
    In production: query Supabase sessions table.
    """
    song_sessions = [
        s for s in _sessions.values()
        if s.get('job_uuid') == job_uuid and s.get('completed')
    ]
    song_sessions.sort(key=lambda x: x.get('started_at', 0), reverse=True)
    return song_sessions[:limit]


# ── SONG CATALOG ─────────────────────────────────────────────────────

@app.get("/songs")
async def list_songs():
    """
    List all processed songs available in the catalog.
    Scans the outputs/htdemucs directory for ready songs.
    
    In production: query Supabase songs table where status = 'ready'.
    """
    songs = []
    htdemucs_dir = "outputs/htdemucs"
    
    if not os.path.exists(htdemucs_dir):
        return []
    
    for job_uuid in os.listdir(htdemucs_dir):
        job_path = os.path.join(htdemucs_dir, job_uuid)
        if not os.path.isdir(job_path):
            continue
        
        # Check stems exist
        has_vocals = os.path.exists(os.path.join(job_path, 'vocals.mp3'))
        has_backing = os.path.exists(os.path.join(job_path, 'no_vocals.mp3'))
        has_lyrics = os.path.exists(f"lyrics/{job_uuid}.json") or \
                     os.path.exists(f"lyrics/{job_uuid}_map.json")
        
        if has_vocals and has_backing:
            # Try to load any metadata we have
            meta_path = f"lyrics/{job_uuid}_meta.json"
            meta = {}
            if os.path.exists(meta_path):
                with open(meta_path) as f:
                    meta = json.load(f)
            
            songs.append({
                'job_uuid': job_uuid,
                'title': meta.get('title', 'Unknown Title'),
                'artist': meta.get('artist', 'Unknown Artist'),
                'status': 'ready' if has_lyrics else 'missing_lyrics',
                'has_vocals': has_vocals,
                'has_backing': has_backing,
                'has_lyric_map': has_lyrics,
            })
    
    return songs


# ── PITCH EXTRACTION ENDPOINT ─────────────────────────────────────────

@app.post("/songs/{job_uuid}/extract-pitch")
async def extract_pitch(job_uuid: str, background_tasks: BackgroundTasks):
    """
    Trigger pitch extraction from the vocals stem using librosa.
    Runs in background — check status endpoint for completion.
    
    Requires: pip install librosa --break-system-packages
    """
    vocals_path = f"outputs/htdemucs/{job_uuid}/vocals.mp3"
    if not os.path.exists(vocals_path):
        raise HTTPException(status_code=404, detail="Vocals stem not found")
    
    whisper_path = f"lyrics/{job_uuid}.json"
    if not os.path.exists(whisper_path):
        raise HTTPException(status_code=404, detail="Whisper JSON not found — run transcription first")
    
    background_tasks.add_task(run_pitch_extraction, job_uuid, vocals_path, whisper_path)
    
    return {
        'status': 'queued',
        'job_uuid': job_uuid,
        'message': 'Pitch extraction started. Check /lyric-map/{job_uuid} when complete.'
    }


def run_pitch_extraction(job_uuid: str, vocals_path: str, whisper_path: str):
    """
    Background task: extract pitch from vocals and merge into lyric map.
    
    This replaces the default p=5.0 with real pitch values (0–10 scale).
    """
    try:
        import librosa
        import numpy as np
        
        print(f"[pitch] Loading {vocals_path}...")
        y, sr = librosa.load(vocals_path, sr=22050)
        
        print(f"[pitch] Extracting F0 with pyin...")
        f0, voiced_flag, _ = librosa.pyin(
            y,
            fmin=librosa.note_to_hz('C2'),
            fmax=librosa.note_to_hz('C6'),
            sr=sr
        )
        times = librosa.times_like(f0, sr=sr)
        
        def hz_to_display(hz):
            if hz is None or np.isnan(hz):
                return 5.0
            midi = librosa.hz_to_midi(float(hz))
            # MIDI 48 (C3) → 1.0, MIDI 60 (C4) → 5.0, MIDI 72 (C5) → 9.0
            p = (midi - 48) / 24.0 * 8.0 + 1.0
            return float(np.clip(p, 0.5, 9.5))
        
        # Load Whisper JSON and build lyric map with real pitch
        with open(whisper_path) as f:
            whisper_data = json.load(f)
        
        words = []
        for segment in whisper_data.get('segments', []):
            for w in segment.get('words', []):
                word_text = w['word'].strip()
                if not word_text:
                    continue
                t_start = w['start']
                t_end = w['end']
                
                # Average F0 during this word's time window
                mask = (times >= t_start) & (times <= t_end) & voiced_flag
                if mask.any():
                    avg_hz = np.nanmean(f0[mask])
                    pitch = hz_to_display(avg_hz)
                else:
                    pitch = 5.0  # Unvoiced — use middle
                
                words.append({
                    't': round(t_start, 3),
                    'w': word_text,
                    'p': round(pitch, 2),
                    'd': round(t_end - t_start, 3),
                })
        
        # Write lyric map
        map_path = f"lyrics/{job_uuid}_map.json"
        with open(map_path, 'w') as f:
            json.dump(words, f, indent=2)
        
        print(f"[pitch] Done. {len(words)} words with pitch written to {map_path}")
    
    except ImportError:
        print("[pitch] ERROR: librosa not installed. Run: pip install librosa --break-system-packages")
    except Exception as e:
        print(f"[pitch] ERROR: {e}")


# ── DUET SYNC ────────────────────────────────────────────────────────
# Simple in-memory room for two-phone sync (WiFi local only in v1)

_duet_rooms: dict = {}

class DuetRoom(BaseModel):
    song_id: str
    job_uuid: str
    player1_name: str
    player2_name: str = ""

@app.post("/duet/create")
async def create_duet_room(data: DuetRoom):
    """Create a duet room. Player 1 calls this, shares room_code with Player 2."""
    room_code = str(uuid.uuid4())[:6].upper()
    _duet_rooms[room_code] = {
        'room_code': room_code,
        'job_uuid': data.job_uuid,
        'song_id': data.song_id,
        'player1': {'name': data.player1_name, 'ready': False, 'score': None},
        'player2': {'name': data.player2_name, 'ready': False, 'score': None},
        'status': 'waiting',      # waiting | countdown | singing | done
        'start_time': None,
        'created_at': time.time(),
    }
    return {'room_code': room_code, 'room': _duet_rooms[room_code]}

@app.post("/duet/{room_code}/join")
async def join_duet_room(room_code: str, player_name: str):
    """Player 2 joins with the room code."""
    if room_code not in _duet_rooms:
        raise HTTPException(status_code=404, detail="Room not found")
    room = _duet_rooms[room_code]
    room['player2']['name'] = player_name
    room['player2']['ready'] = True
    return {'room': room}

@app.post("/duet/{room_code}/ready")
async def player_ready(room_code: str, player: int):
    """Mark a player as ready. When both ready, server triggers countdown."""
    if room_code not in _duet_rooms:
        raise HTTPException(status_code=404, detail="Room not found")
    room = _duet_rooms[room_code]
    room[f'player{player}']['ready'] = True
    
    if room['player1']['ready'] and room['player2']['ready']:
        room['status'] = 'countdown'
        room['start_time'] = time.time() + 3.5  # 3 second countdown + 0.5s buffer
    
    return {'room': room}

@app.get("/duet/{room_code}")
async def get_duet_room(room_code: str):
    """Poll for room status (both players poll this during countdown/sync)."""
    if room_code not in _duet_rooms:
        raise HTTPException(status_code=404, detail="Room not found")
    return _duet_rooms[room_code]

@app.post("/duet/{room_code}/score")
async def submit_duet_score(room_code: str, player: int, score: float, artist_score: float):
    """Submit final score for a player after song ends."""
    if room_code not in _duet_rooms:
        raise HTTPException(status_code=404, detail="Room not found")
    room = _duet_rooms[room_code]
    room[f'player{player}']['score'] = score
    room[f'player{player}']['artist_score'] = artist_score
    
    # If both scores submitted, finalize
    if room['player1']['score'] is not None and room['player2']['score'] is not None:
        room['status'] = 'done'
        p1s = room['player1']['score']
        p2s = room['player2']['score']
        room['winner'] = 'player1' if p1s >= p2s else 'player2'
    
    return {'room': room}


# ─────────────────────────────────────────────────────────────────────
#  HOW TO WIRE THIS INTO THE EXISTING API
#
#  In thunderstruck_api.py, your existing app is something like:
#
#    app = FastAPI()
#    app.add_middleware(CORSMiddleware, allow_origins=["*"], ...)
#
#  Just paste the functions above into the same file and they'll
#  be available on the same server instance.
#
#  OR, if you want to keep things clean, create a new file:
#    ~/thunderstruck/loudmouth_api.py
#  and import your app:
#    from thunderstruck_api import app
#  then add all the new endpoints there.
#
#  Start command (unchanged):
#    cd ~/thunderstruck && python3 -m uvicorn thunderstruck_api:app --reload
# ─────────────────────────────────────────────────────────────────────
