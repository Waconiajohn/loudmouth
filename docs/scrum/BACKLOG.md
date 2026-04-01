# BACKLOG — LOUDMOUTH

> All epics and stories not yet scheduled for a sprint.

---

## Epic 1: Core Loop (MVP)

The minimum viable karaoke experience. Import a song, separate stems, sing along, get scored.

### Story: User Authentication
- **As a** user
- **I want to** sign up and log in with email or Apple Sign-In
- **So that** my scores, library, and progress are persisted
- **Acceptance Criteria:**
  - [ ] Email sign-up + login via Supabase Auth
  - [ ] Apple Sign-In integration
  - [ ] Profile row created in `profiles` table on first sign-in
  - [ ] Auth state persisted across app launches (Zustand + SecureStore)
- **Estimated complexity:** Medium
- **Dependencies:** Supabase project deployed

### Story: Song Import from Device
- **As a** user
- **I want to** import an MP3/AAC file from my device
- **So that** I can use my own purchased songs for karaoke
- **Acceptance Criteria:**
  - [ ] File picker opens and filters for audio files (MP3, AAC, WAV)
  - [ ] Selected file is copied to app's local storage
  - [ ] Song metadata extracted (title, artist, duration) or user-entered
  - [ ] Song row created in `songs` table
  - [ ] File hash (SHA-256) computed for deduplication
- **Estimated complexity:** Medium
- **Dependencies:** User Authentication

### Story: AudioShake Stem Separation
- **As a** user
- **I want to** separate my imported song into vocal and instrumental stems
- **So that** I can sing along to just the instrumental
- **Acceptance Criteria:**
  - [ ] Edge Function `separate-stems` proxies request to AudioShake API
  - [ ] Hash-based dedup: check `stems_meta` before calling AudioShake
  - [ ] Stems stored in Supabase Storage at `stems/{hash}/`
  - [ ] `stems_meta` row created with storage paths
  - [ ] Song marked as `stems_ready = true`
- **Estimated complexity:** Large
- **Dependencies:** Song Import, AudioShake API key

### Story: Instrumental Playback + Mic Recording
- **As a** user
- **I want to** hear the instrumental track while my mic records my voice
- **So that** I can sing along and be scored
- **Acceptance Criteria:**
  - [ ] Instrumental stem plays through speakers/headphones
  - [ ] Microphone captures user's voice simultaneously
  - [ ] No feedback loop between speaker output and mic input
  - [ ] Playback and recording are synchronized
- **Estimated complexity:** Large
- **Dependencies:** Stem Separation

### Story: Real-Time Pitch Detection (YIN)
- **As a** user
- **I want to** see my pitch visualized in real time while singing
- **So that** I can adjust my singing on the fly
- **Acceptance Criteria:**
  - [ ] YIN algorithm detects F0 from mic audio frames
  - [ ] Pitch data updates at ~50ms intervals
  - [ ] Visual pitch indicator shows current note
  - [ ] Works on both iOS and Android
- **Estimated complexity:** Large
- **Dependencies:** Instrumental Playback + Mic Recording

### Story: Basic Scoring Engine (Pitch + Timing)
- **As a** user
- **I want to** get a score (1-10) after singing a song
- **So that** I know how well I performed
- **Acceptance Criteria:**
  - [ ] Pitch accuracy: compare user F0 vs reference vocal stem
  - [ ] Timing accuracy: compare onset times vs lyric map timestamps
  - [ ] Weighted composite: pitch (40%) + timing (25%) + clarity (20%) + dynamics (15%)
  - [ ] Score mapped to 1-10 scale with calibrated curve
  - [ ] Score persisted to `scores` table
- **Estimated complexity:** Large
- **Dependencies:** Pitch Detection

### Story: Score History Per Song
- **As a** user
- **I want to** see my past scores for each song
- **So that** I can track my improvement over time
- **Acceptance Criteria:**
  - [ ] Score history screen shows all scores for a song
  - [ ] Sorted by date, most recent first
  - [ ] Shows overall score + dimension breakdown
- **Estimated complexity:** Small
- **Dependencies:** Basic Scoring Engine

### Story: Basic UI (Library, Sing, Results)
- **As a** user
- **I want to** navigate between my song library, the singing screen, and results
- **So that** I have a complete core experience
- **Acceptance Criteria:**
  - [ ] Tab navigation: Library, Sing, Scores, Profile
  - [ ] Library tab shows imported songs with stems status
  - [ ] Sing tab is the active session screen
  - [ ] Results screen shows score breakdown after a session
- **Estimated complexity:** Medium
- **Dependencies:** None (can scaffold UI early)

---

## Epic 2: Engagement

### Story: Advanced Detailed Scoring
### Story: Voice Lesson Plans
### Story: Show Choir Lesson Plans
### Story: Social Media Share (9+/10 Gate)
### Story: Subscription + Payments (RevenueCat)
### Story: Leaderboards

---

## Epic 3: Expansion

### Story: A Cappella Mode
### Story: Virtual AI Vocal Coach
### Story: Duet/Group Mode
### Story: Synced Lyrics Display
