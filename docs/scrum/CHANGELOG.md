# Changelog — LOUDMOUTH

---

## 2026-03-31 — Session 1
**Sprint:** 0 (Initialization) | **Story:** Project Setup
**Summary:** Initialized the Expo/React Native project scaffold from chat-generated files.

### Changes Made
- `.env.example` — Environment variable template (Supabase, AudioShake, RevenueCat)
- `.gitignore` — Expo/RN standard ignores
- `app.json` — Expo config with iOS/Android permissions (mic, music library, background audio)
- `ARCHITECTURE.md` — Full system design: data flows, DB schema, edge functions, audio pipeline
- `CLAUDE.md` — Scrum development framework with anti-drift protocol
- `CONTEXT.md` — Decision log (BYO-MP3, AudioShake, stem caching, charity, social gate, on-device scoring)
- `eas.json` — EAS Build profiles (dev/preview/production)
- `package.json` — Dependencies: Expo 52, React Native, Supabase, TanStack Query, Zustand, Zod, RevenueCat
- `README.md` — Project overview with setup instructions
- `tsconfig.json` — Strict TypeScript with path aliases
- Created full directory structure: `app/`, `components/`, `lib/`, `hooks/`, `constants/`, `supabase/`, `types/`
- Created scrum docs: `docs/scrum/BACKLOG.md`, `CURRENT_SPRINT.md`, `SPRINT_LOG.md`, `CHANGELOG.md`

### Decisions Made
- Preserve existing `api/`, `docs/`, `data/`, `static/` directories from prototype phase
- Scrum docs go in `docs/scrum/` to avoid conflicts with existing `docs/` content

### Known Issues
- `api/main.py` has hardcoded API keys (AudioShake, Supabase) — security concern
- `api/lyrics_engine.py` has hardcoded Genius API token
- `npm install` not yet run — dependencies not installed

### Next Steps
- Run `npm install` to bootstrap Expo project
- Deploy Supabase schema (from ARCHITECTURE.md)
- Begin Sprint 1, Story 1: Supabase Schema Deployment
