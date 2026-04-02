# Sprint 1: Project Foundation
**Goal:** Set up the Expo project, deploy Supabase schema, scaffold core UI, and prove audio feasibility.
**Started:** 2026-03-31

## Stories This Sprint
1. [x] Supabase Schema Deployment — **DONE**
2. [x] Basic UI (Library, Sing, Scores, Profile tabs) — **DONE**
3. [x] Audio POC (Pitch Detection) — **DONE** — YIN at 22ms on iPhone
4. [x] Live Microphone Capture — **DONE** — expo-av recording + PCM decode
5. [x] Simultaneous Speaker + Mic — **DONE** — native Swift module forces speaker routing
6. [x] Scoring Engine + Lyric Map — **DONE** — session results with coverage + stability scores
7. [ ] User Authentication (Supabase Auth + Apple Sign-In) — **NOT STARTED**

## Sprint 1 Complete — Ready for Sprint 2

### What's Proven
- Pitch detection on real iPhone voice: YIN algorithm via pitchfinder
- Simultaneous speaker output + mic recording (native Swift module)
- Scoring engine aligns pitch samples to lyric map word timings
- Session results: composite score, coverage, pitch stability
- Full audio pipeline: record → decode → detect → score

### What Was Hard
- expo-av resets iOS audio session to earpiece on every prepareToRecordAsync (known bug since 2022)
- react-native-audio-api AudioRecorder doesn't deliver buffers on iOS physical devices (bug #721)
- Solution: native Swift module calling AVAudioSession.overrideOutputAudioPort(.speaker)
- SDK upgrade from 52→54 caused cascading dependency issues (React 18→19, RN 0.76→0.81)

## Next Session: Sprint 2 — AudioShake Integration

### Pick-Up Point
1. Create Supabase Edge Function `separate-stems` that proxies to AudioShake API
2. AudioShake API key: `ashke_8c39361eea4daddc8ff51dc4af3bfad5e8f9af02930c912224fd6a26a6b249e2`
   - Currently hardcoded in `api/main.py` (v1 prototype)
   - Must be stored as Supabase secret, never in client code
3. Build song import flow: user picks MP3 → upload to Edge Function → AudioShake separates → store stems
4. Play the instrumental stem as the backing track during singing sessions
5. Extract target pitch values from the vocal stem for pitch accuracy scoring

### Sprint 2 Stories (Proposed)
1. [ ] Edge Function: `separate-stems` — proxy to AudioShake with hash-based dedup
2. [ ] Song Import UI — document picker → upload → processing status
3. [ ] Backing Track Playback — play instrumental stem through speaker during session
4. [ ] Pitch Target Extraction — analyze vocal stem for per-word target pitches
5. [ ] Full Scoring — compare user pitch against artist pitch (the 40% weight)
6. [ ] User Authentication — Supabase Auth + Apple Sign-In

### AudioShake Integration Notes
- API base: `https://api.audioshake.ai`
- Models: `vocals` (vocal stem) + `no_vocals` (instrumental/backing track)
- Flow from v1 prototype (`api/main.py`):
  1. Upload audio file → get asset ID
  2. Create separation task with asset ID + target models
  3. Poll task status until complete
  4. Download stem URLs
- Hash-based dedup: hash the audio file, check `song_stems` table before calling AudioShake
- Stems stored in Supabase Storage with signed URLs

## Technical Notes
- **SDK**: Expo 54, React 19.1, React Native 0.81.5
- **Supabase project**: qslrhgtkxxhesazipcbs
- **Dev server**: `npx expo start` (Metro) + Xcode Cmd+R for native builds
- **Native module**: `modules/my-module/` — Swift module for iOS speaker routing
- **Lyric map**: `data/lyric-maps/Disturbed - Down With The Sickness_lyric_map.json`
- **Scoring engine**: `lib/scoring/engine.ts` — coverage + stability scoring
- **Apple Music Store**: User-facing copy should say "Apple Music Store" not "iTunes"
- **Node.js PATH**: `/usr/local/bin` must be in PATH (added to ~/.zshrc after macOS update)
- **GitHub auth**: `gh auth login` was configured this session
