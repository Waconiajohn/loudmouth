# LOUDMOUTH

Karaoke and vocal training app — sing, score, and improve.

## Structure

```
api/          FastAPI backend (stem separation, transcription, scoring)
app/          React Native mobile app (coming soon)
docs/         Design specs, prototypes, business docs, marketing
static/       Shared static assets
```

## API Quick Start

```bash
cd api
pip install -r requirements.txt

# Required env vars
export AUDIOSHAKE_API_KEY=your_key
export SUPABASE_SERVICE_KEY=your_service_role_key   # Supabase dashboard → Settings → API
export SUPABASE_URL=https://qslrhgtkxxhesazipcbs.supabase.co

uvicorn main:app --reload
```

## Key Endpoints

| Method | Path | Description |
|--------|------|-------------|
| `POST` | `/process-song` | Full pipeline: upload → AudioShake → cache stems → Supabase |
| `POST` | `/transcribe` | Whisper word-by-word timestamps |
| `GET`  | `/song-stems/{song_id}` | Fetch cached stems |
| `GET`  | `/task-status/{task_id}` | AudioShake job status |
