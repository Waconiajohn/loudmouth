# Code Conventions — LOUDMOUTH

---

## Naming

| Entity | Convention | Example |
|--------|-----------|---------|
| Files | `kebab-case.ts` / `.tsx` | `pitch-detector.ts` |
| Components | `PascalCase` exports | `export function ScoreCard()` |
| Hooks | `useCamelCase` | `useAudioSession` |
| DB tables | `snake_case` | `stems_meta` |
| DB columns | `snake_case` | `file_hash` |
| Edge Functions | `kebab-case/index.ts` | `separate-stems/index.ts` |
| Types/Interfaces | `PascalCase`, no `I` prefix | `interface SongMetadata` |
| Constants | `SCREAMING_SNAKE_CASE` | `MAX_SCORE` |

## TypeScript

- Strict mode always (`"strict": true`)
- No `any` — use `unknown` and narrow
- Prefer `interface` over `type` for object shapes
- All Supabase queries use generated types from `supabase gen types`
- Zod validation on all API boundaries

## State Management

- **Server state:** TanStack Query with Supabase
- **Local UI state:** `useState` / `useReducer`
- **Global app state:** Zustand (auth status, current song, playback state)
- No Redux

## Error Handling

- Every external call (API, DB, file system) wrapped in try/catch
- User-facing errors: show toast or inline message, never raw error text
- Logging: structured logger (no `console.log` in production)
- Edge Functions: return typed error responses with status codes

## Audio

- All audio processing on main thread or dedicated worklet
- Audio buffers cleaned up on component unmount
- Stem separation is one-time per song — cache aggressively
- Pitch detection: YIN algorithm

## Imports

- Use path aliases: `@/lib/...`, `@/components/...`, `@/hooks/...`
- Group imports: React → External → Internal → Types
- No circular imports

## Git

- Conventional commits: `feat:`, `fix:`, `chore:`, `docs:`, `test:`
- Branch naming: `feat/description`, `fix/description`, `chore/description`
- Squash merge to `develop`, merge commit to `main`
