# Connecting Your Whisper Output to the Smart Lyric Display
## LOUDMOUTH — Developer Guide

---

## What You Have Right Now

Your pipeline at `~/thunderstruck/` already produces everything needed. Here's what exists:

```
~/thunderstruck/outputs/htdemucs/2fbbb816-8a4a-4bc4-af47-24da32fb31ca/
  vocals.mp3          ← isolated vocals (Demucs output)
  no_vocals.mp3       ← backing track
  
~/thunderstruck/lyrics/
  [song-uuid].json    ← Whisper word timestamps
  [song-uuid]_map.json ← processed lyric map (if pipeline.py ran to completion)
```

---

## Step 1 — Check What Whisper Gave You

Open your Whisper JSON. It looks like this:

```json
{
  "text": "every time that i look in the mirror...",
  "segments": [
    {
      "id": 0,
      "start": 1.0,
      "end": 1.8,
      "text": " Every",
      "words": [
        {
          "word": " Every",
          "start": 1.0,
          "end": 1.8,
          "probability": 0.92
        }
      ]
    },
    ...
  ]
}
```

**The key fields you need per word:**
- `word` — the word text (may have leading space, strip it)
- `start` — when to hit the word (seconds from song start)
- `end` — when the word ends (duration = end - start)

---

## Step 2 — What the Display Expects

Open `smart-lyrics-display.html` and look at the `WORDS` array near the top of the `<script>`:

```javascript
const WORDS = [
  {t:1.0,  w:'Every',     p:4.2, d:0.8,  sec:'Verse 1'},
  {t:2.0,  w:'time',      p:4.5, d:0.75},
  ...
];
```

**Each word object needs:**
| Field | Type   | Meaning                                      |
|-------|--------|----------------------------------------------|
| `t`   | float  | Start time in seconds                        |
| `w`   | string | The word (no leading/trailing spaces)        |
| `p`   | float  | Pitch (0–10 scale, 5 = middle range)         |
| `d`   | float  | Duration in seconds (end - start)            |
| `sec` | string | Section name — optional, first word of section only |

**About pitch (`p`):** Whisper doesn't give you pitch. You have two options:
1. **Default everything to 5.0** — words all appear on the middle line. Works fine, just flat.
2. **Run a pitch extractor** (see Step 5 below for how to add this later)

---

## Step 3 — The Conversion Script

Save this as `~/thunderstruck/whisper_to_display.py`:

```python
#!/usr/bin/env python3
"""
Convert Whisper JSON output → LOUDMOUTH display format (WORDS array).
Usage: python3 whisper_to_display.py [whisper_output.json] [output.js]
"""

import json
import sys
import os

def convert(whisper_path, output_path=None):
    with open(whisper_path, 'r') as f:
        data = json.load(f)

    words = []

    for segment in data.get('segments', []):
        # Use word-level timestamps if available (Whisper with word_timestamps=True)
        if 'words' in segment and segment['words']:
            for w in segment['words']:
                word_text = w['word'].strip()
                if not word_text:
                    continue
                words.append({
                    't': round(w['start'], 3),
                    'w': word_text,
                    'p': 5.0,          # default pitch — replace with real pitch later
                    'd': round(w['end'] - w['start'], 3),
                })
        else:
            # Fallback: segment-level only (no word timestamps)
            # Spread words evenly across the segment
            text = segment['text'].strip()
            seg_words = text.split()
            if not seg_words:
                continue
            duration = segment['end'] - segment['start']
            word_dur = duration / len(seg_words)
            for i, word_text in enumerate(seg_words):
                words.append({
                    't': round(segment['start'] + i * word_dur, 3),
                    'w': word_text,
                    'p': 5.0,
                    'd': round(word_dur, 3),
                })

    # Format as JavaScript WORDS array
    lines = ['const WORDS = [']
    for i, w in enumerate(words):
        sec_part = f", sec:'{w.get('sec', '')}'" if w.get('sec') else ''
        comma = ',' if i < len(words) - 1 else ''
        lines.append(
            f"  {{t:{w['t']:.3f}, w:'{w['w'].replace(chr(39), chr(92)+chr(39))}', "
            f"p:{w['p']:.1f}, d:{w['d']:.3f}{sec_part}}}{comma}"
        )
    lines.append('];')

    result = '\n'.join(lines)

    if output_path:
        with open(output_path, 'w') as f:
            f.write(result)
        print(f"✓ Written to {output_path}")
        print(f"  {len(words)} words converted")
    else:
        print(result)

    return words

if __name__ == '__main__':
    if len(sys.argv) < 2:
        print("Usage: python3 whisper_to_display.py whisper.json [output.js]")
        sys.exit(1)
    whisper_path = sys.argv[1]
    output_path = sys.argv[2] if len(sys.argv) > 2 else None
    convert(whisper_path, output_path)
```

---

## Step 4 — Run It

```bash
cd ~/thunderstruck

# Find your Whisper JSON (it'll be in lyrics/ or outputs/)
ls lyrics/

# Convert it
python3 whisper_to_display.py lyrics/YOUR_FILE.json words_output.js

# Check the output looks right
head -20 words_output.js
```

You'll see something like:
```javascript
const WORDS = [
  {t:1.000, w:'Every', p:5.0, d:0.800},
  {t:2.000, w:'time', p:5.0, d:0.750},
  {t:2.900, w:'that', p:5.0, d:0.500},
  ...
```

---

## Step 5 — Paste Into the Display

1. Open `smart-lyrics-display.html`
2. Find the `const WORDS = [` block (around line 295)
3. Replace the entire WORDS array with your new one
4. Also update `SONG_DURATION` near the top to match your song length:

```javascript
const SONG_DURATION = 245.0; // seconds — get this from: ffprobe -i your_song.mp3
```

5. Open the HTML in your browser and hit play — it should run your actual song data.

---

## Step 6 — Add Section Labels (Optional but Nice)

The section label (`sec:`) appears above the progress bar ("Verse 1", "Chorus", etc.).
Add it to the first word of each section:

```javascript
{t:1.000, w:'Every', p:5.0, d:0.800, sec:'Verse 1'},
// ...
{t:45.200, w:'Down', p:6.5, d:0.600, sec:'Chorus'},
```

To find section boundaries: listen to the song and note timestamps, or check Genius for song structure.

---

## Step 7 — Wire the Audio Playback (The Real Song)

Right now the display runs on a timer with no actual audio. Here's how to add the backing track:

In `smart-lyrics-display.html`, find the play button click handler and replace the timer logic:

```javascript
// At the top of the script, add:
const audio = new Audio();
audio.src = 'static/2fbbb816.../no_vocals.mp3'; // path to your backing track

// In the play() function, add:
audio.currentTime = startTime ? (performance.now()/1000 - startTime) : 0;
audio.play();

// In the pause() function, add:
audio.pause();

// Change the time calculation to use audio.currentTime instead of performance.now():
// Replace: const elapsed = (performance.now() / 1000 - startTime) * demoSpeed;
// With:    const elapsed = audio.currentTime;
```

For local development with the FastAPI server running:
```javascript
audio.src = 'http://localhost:8000/audio/2fbbb816-8a4a-4bc4-af47-24da32fb31ca/no_vocals';
```

Add this endpoint to `thunderstruck_api.py`:
```python
from fastapi.responses import FileResponse

@app.get("/audio/{uuid}/{stem}")
async def get_audio(uuid: str, stem: str):
    path = f"outputs/htdemucs/{uuid}/{stem}.mp3"
    return FileResponse(path, media_type="audio/mpeg")
```

---

## Step 8 — Add Real Pitch Data (Level Up)

When you're ready to move beyond flat pitch=5.0, add this to the pipeline:

```bash
pip install librosa --break-system-packages
```

Then add to `pipeline.py`:

```python
import librosa
import numpy as np

def extract_pitch(vocals_path, words):
    """
    For each word, extract the average fundamental frequency
    and map it to the 0-10 pitch scale used by the display.
    """
    y, sr = librosa.load(vocals_path)
    
    # Extract F0 using pyin (good for vocals)
    f0, voiced_flag, voiced_probs = librosa.pyin(
        y, fmin=librosa.note_to_hz('C2'), fmax=librosa.note_to_hz('C7')
    )
    times = librosa.times_like(f0, sr=sr)
    
    # Map Hz to 0-10 display scale
    # C3 (130 Hz) = 1, C4 (262 Hz) = 5, C5 (523 Hz) = 9
    def hz_to_display(hz):
        if hz is None or np.isnan(hz):
            return 5.0
        # Log scale mapping
        midi = librosa.hz_to_midi(hz)
        # MIDI 48 (C3) = 1.0, MIDI 60 (C4) = 5.0, MIDI 72 (C5) = 9.0
        p = (midi - 48) / (72 - 48) * 8 + 1
        return float(np.clip(p, 0.5, 9.5))
    
    # For each word, average the pitch during that word's time window
    for word in words:
        t_start = word['t']
        t_end = t_start + word['d']
        mask = (times >= t_start) & (times <= t_end) & voiced_flag
        if mask.any():
            avg_hz = np.nanmean(f0[mask])
            word['p'] = hz_to_display(avg_hz)
        # else: leave at 5.0
    
    return words
```

---

## Quick Checklist — "Is It Working?"

- [ ] `WORDS` array has correct timestamps (first word hits at ~1-2 seconds)
- [ ] `SONG_DURATION` matches actual song length
- [ ] Words appear to be scrolling at the right speed (not too fast/slow)
- [ ] Red line hits words at the right time
- [ ] Section labels appear at section changes

**If timing is off:** The most common issue is that Whisper timestamps are relative to the start of the VOCALS stem, not the original song. If your vocals stem was trimmed or has silence removed, add an offset:

```javascript
const WHISPER_OFFSET = 0.0; // adjust if words appear too early/late
// Then in WORDS: t: word.t + WHISPER_OFFSET
```

---

## The Two Commands You Need

```bash
# 1. Start the FastAPI server
cd ~/thunderstruck && python3 -m uvicorn thunderstruck_api:app --reload

# 2. Convert Whisper output to display format
python3 whisper_to_display.py lyrics/YOUR_FILE.json words.js
```

Then open `loudmouth.html` in your browser.

---

*Built for LOUDMOUTH — https://loudmouth.app (coming soon)*
