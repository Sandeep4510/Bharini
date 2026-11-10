# Bharini

A casting marketplace for India.
- Artists and technicians (actors, singers, musicians, dancers, directors, cameramen) show portfolios and posts.
- Production houses and producers find talent and post casting calls.
- Users follow, connect, message, share and block each other.

For the detailed session history, decisions and open items, read `CHECKPOINT.md`. Its Windows-specific notes are out of date: development moved to Linux on 2026-11-07. The full product and system plan is in `prompt.md`.

## Layout
This is an npm workspaces monorepo with a Django backend.

| Path | What it is |
|---|---|
| `apps/web` | Next 16 (App Router) and Tailwind v4. Port 3000. |
| `apps/mobile` | One Expo SDK 58 app for Android and iOS (development build, Expo Router, `src/app/`). |
| `packages/types` | Shared TypeScript types. |
| `packages/api-client` | `ApiClient`, the only way either app calls the backend. |
| `packages/auth` | Token session with pluggable storage: localStorage on the web, SecureStore on mobile (`setSessionStorage`). |
| `packages/theme` | Colour, radius, spacing and font-size tokens. |
| `backend/` | Django 6.1, DRF, simplejwt and django-allauth (Google only), on PostgreSQL. |
| `infra/` | Terraform for AWS (`modules/app`, `envs/staging`, `envs/prod`). Setup steps in `infra/README.md`. |

### Backend apps (`backend/`)
| App | What it does |
|---|---|
| `accounts` | User, refresh sessions, Google login (`social.py`), account deletion with 90-day restore (`deletion.py`), choose-role, terms acceptance. |
| `profiles` | ArtistProfile, portfolio media slots (`slots.py`), face check (`face.py`), username check, directory, guardian consent for minors. |
| `artist_posts` | Posts, likes, comments, follows, user search, public profiles. Also holds `user_urlpatterns`. |
| `productions` | ProductionProfile. Its username shares one namespace with artist usernames. |
| `production_posts` | Feed and casting calls. |
| `connections` | Connection requests and blocks. `blocked_ids(user)` covers both directions. |
| `messaging` | One-to-one chats. Only connected users can send. |
| `notifications` | Expo push devices and per-user settings. `push.notify(...)` sends after the transaction commits. |

Routes are in `backend/bharini/urls.py`, all under `/api/v1/`: `auth/`, `profile/`, `posts/`, `productions/`, `feed/`, `users/`, `messages/` and `notifications/`. `users/` is shared by `artist_posts` and `connections`. Each app documents its endpoints in `backend/<app>/API.md`, and auth is also covered in `docs/auth-api.md`.

Every API response uses one envelope: `{code, message, request_id, field_errors, data}`. Validation errors are under `field_errors`.

## Commands (Linux)
```bash
# Backend (venv is .venv at the repo root)
cd backend && ../.venv/bin/python manage.py runserver 8000
cd backend && ../.venv/bin/python manage.py check
cd backend && ../.venv/bin/python manage.py test --noinput   # full suite, ~4 min, creates a test DB

# Web
npm run dev                                   # Next on port 3000
cd apps/web && npx tsc --noEmit -p . && npx eslint src

# Mobile
cd apps/mobile && npm run start               # Metro for the dev build
cd apps/mobile && npx tsc --noEmit && npx expo lint
npm test --workspace=mobile                   # Jest (jest-expo)
```
Secrets are in `backend/.env` (DB, SMTP, Google OAuth) and `apps/mobile/.env` (`EXPO_PUBLIC_API_BASE_URL`, `EXPO_PUBLIC_WEB_URL`). Both are gitignored. Never print or commit them. Templates are in the `.env.example` files.

Test accounts are listed in `test_profiles.txt`.

## Rules and gotchas
- **Next 16 has breaking changes.** Read `node_modules/next/dist/docs/` before writing Next code (see `apps/web/AGENTS.md`).
  - With `cacheComponents: true`, anything using `useParams` or `useSearchParams` must be inside `<Suspense>`.
  - The Tailwind v4 important modifier is a trailing `!` (`px-3!`).
- **Expo changes every SDK.** Check the versioned docs for SDK 58 (see `apps/mobile/AGENTS.md`).
  - Add packages with `npx expo install`, not `npm install`.
  - `android/` and `ios/` are generated. Never edit them; use `app.json` and the config plugins in `plugins/`.
  - After installing a package, restart Metro with `--clear`. Never start Metro with `CI=1`: it turns off file watching.
- Never run `next build` while `next dev` is running: it clobbers `.next`.
- Mobile uploads must use an `expo-file-system` `File` (`lib/config.ts` `toUpload`). React Native's old `{uri, name, type}` form parts are rejected.
- The camera must be a route (`src/app/camera.tsx`), not a Modal: Android only sends volume-key events to the main window.
- Never put tests (or any non-route file) in `apps/mobile/src/app/`: Expo Router bundles every file there into the app. Screen tests go in `src/__tests__/`.
- Blocked users must stay hidden everywhere: feeds, comments, profiles, search, follows, connections and conversations.
- When merging other developers' work, keep the pulled version's structure, and check the diff for silent reverts. Commit `03b5e8e` once reverted finished work.

## Working preferences
- Respond tersely (caveman style) and make the smallest complete change (ponytail style, see `.github/copilot-instructions.md`).
- Commit only when asked. The commit trailer is `Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>`.

## Current state (2026-11-09)
- **Built:**
  - Web: auth, onboarding, portfolio, posts, feed and casting calls, messaging, connections, block, delete and restore account, terms.
  - Mobile: login, feed, profile, messages, search, share, onboarding with camera, push-notification code.
- **Checks that pass:**
  - Backend: all 243 tests, `manage.py check`, `check --deploy` (prod env).
  - Mobile Jest: 57 tests.
  - Both type checks and both lints (warnings only).
  - Docker: `backend/Dockerfile` and `apps/web/Dockerfile` build from repo root; `docker compose up --build` for a local stack.
- **Known problems:**
  - `app.json` has no EAS `projectId`. Run `npx eas-cli@latest init` again before building for iOS or testing push.
  - `backend/.env` allows LAN IP `192.168.0.107` but not `10.0.2.2`, which the Android emulator needs.
- **Hosting:** AWS `ap-south-1` (decided 2026-11-09). Media goes to S3 when `AWS_STORAGE_BUCKET_NAME` is set. Terraform in `infra/` (validated, not yet applied). CI: `.github/workflows/ci.yml` on PRs. Deploy: `deploy.yml`, `dev` → staging, `main` → production (one approval). Per service: `backend/**` ships api only, `apps/web/**` + `packages/**` ships web only (`.github/filters.yml`).
  - The ALB health check hits `/api/v1/health/` by IP, so `bharini.health.HealthCheckMiddleware` answers it before host validation. Keep it first in `MIDDLEWARE`.
- **Not built:**
  - The casting application flow.
  - Moderation and reporting.
  - An in-app notification list.
  - Production profile editing on mobile.
  - The Grievance Officer's details on the terms page.
