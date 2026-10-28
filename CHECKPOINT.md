# Bharini — session checkpoint

Last updated: 2026-10-28. Branch `dev` (main branch is `main`, remote `origin` = github.com/Sandeep4510/Bharini). Read this first in a new session.

## What Bharini is
A casting marketplace.
- Artists and technicians (actors, singers, musicians, dancers, directors, cameramen) show their portfolios and posts.
- Production houses and producers discover talent and post casting calls.
- Users follow, connect, message, share and block each other.

## Layout
- **Monorepo:** npm workspaces.
- **`apps/web`:** Next 16.4.2 with Tailwind v4.
  - `apps/web/AGENTS.md`: Next 16 has breaking changes. Read `node_modules/next/dist/docs/` (hoisted to the repo root) before writing Next code.
  - `cacheComponents: true`: `useParams` and `useSearchParams` must sit inside a `<Suspense>` boundary.
  - Tailwind v4 important syntax is a trailing `!` (`px-3!`).
- **Shared packages:**
  - `packages/types`: shared TypeScript types.
  - `packages/api-client`: `apiClient`.
  - `packages/auth`: `readSession`; tokens are kept in `localStorage`.
- **`backend/`:** Django 6.1 + DRF + simplejwt + django-allauth (Google only), PostgreSQL (database `bharini`, user `bharini`). Python virtualenv at `venv/`.
  - **Apps:**
    - `accounts`: User, `RefreshSession`, Google login (`social.py`), account deletion (`deletion.py`).
    - `profiles`: ArtistProfile, portfolio, face check, directory.
    - `artist_posts`: posts, likes, comments, follows, user search, public profile.
    - `productions`: ProductionProfile with username.
    - `production_posts`: feed and casting calls at `/api/v1/feed/`, opportunities at `/api/v1/feed/opportunities/`.
    - `connections`: Connection requests and Block.
    - `messaging`: 1:1 chats; only connected users can send.
  - **URLs:** `backend/bharini/urls.py`. `user_urlpatterns` (in `artist_posts/urls.py`) and `connections.urls` both mount at `/api/v1/users/`.
  - **API docs:** `backend/<app>/API.md` for each app, plus `docs/auth-api.md`.
  - **Admin:** themed via `backend/templates/admin/base_site.html`. No superuser exists after the data wipe; create one with `manage.py createsuperuser`.
- **Secrets:** in `backend/.env` (DB, SMTP, Google OAuth). Gitignored; never print it. The Google client secret was pasted in chat once, so rotate it before production.
- **`.gitignore`:** a single file at the repo root.
- **Plan docs:**
  - `prompt.md`.
  - `docs/agent-teams-plan.txt`: proposes one Expo mobile app for Android and iOS, a reviewer agent first, CI, a DevOps agent with no production credentials, and a legal agent for drafting only. Not started.
- **Test accounts:** listed in `test_profiles.txt` (all passwords `Qwerty20@`).
  - 9 artists, such as `test_actor@bharini.com` and `test_cameraman@bharini.com`.
  - 2 production accounts: `test_production_house@bharini.com` and `test_producer@bharini.com`.
  - Emails are marked verified so login works.

## Dev workflow
- **Ports:** Django on 8000, Next on 3000.
  - Kill whatever holds a port before starting.
  - `start_servers.bat` and `stop_servers.bat` are local helpers and gitignored.
- **Never run `next build` while `next dev` is running:** it clobbers `.next`.
- **Checks:**
  - In `apps/web`: `npx tsc --noEmit -p .` and `npx eslint src`. 2 old warnings remain in `home/page.tsx` (unused `ArtistCard` and `artists`).
  - In `backend`: `python manage.py check`.
- **Tests:** the role `bharini` lacks `CREATEDB`, so `manage.py test` fails.
  - Fix: run `ALTER ROLE bharini CREATEDB;` as the Postgres superuser.
  - Workaround: run the `TestCase` tests in-process against the dev database. They roll back.

    ```
    cd backend && EMAIL_BACKEND=django.core.mail.backends.locmem.EmailBackend DJANGO_SETTINGS_MODULE=bharini.settings ../venv/Scripts/python.exe - <<'PYEOF'
    import django, unittest; django.setup()
    from django.test.utils import setup_test_environment; setup_test_environment()
    unittest.TextTestRunner(verbosity=1).run(unittest.defaultTestLoader.loadTestsFromNames(['accounts.tests.test_auth_api','profiles.tests.test_profile_api','artist_posts.tests.test_posts_api','production_posts.tests.test_posts_api','productions.tests.test_productions_api','connections.tests.test_connections_api','messaging.tests.test_messaging_api']))
    PYEOF
    ```

  - Under this workaround, the 2 `ArtistDirectoryFilterTests` fail only because dev-DB profiles leak into their results. On an empty test database they pass.
- **Edit tip on Windows:** bash heredocs that contain JSX or backticks break. Write a Python edit script to a file instead and run it with `venv/Scripts/python.exe`, reading and writing with `encoding='utf-8'`.
- **Dev servers started from Claude Code** get killed by its low-memory reaper. Run them in your own terminals, or start Claude Code with `CLAUDE_CODE_DISABLE_BG_SHELL_PRESSURE_REAP=1`.

## Committed (latest first)
- **`f986ec0`:** backend tests in every app, an `API.md` per app, `role=admin` blocked at sign-up.
- **`cb40e9e`:**
  - Google sign-up from the login page asks for a role (`User.role_confirmed`, `POST /api/v1/auth/choose-role/`, page `/auth/choose-role`).
  - `ProductionProfile.username`: shares one namespace with artist usernames via `profiles.serializers.username_taken`.
  - Like / comment / share icons in `post-icons.tsx`.
- **`cf2d99f`:** people search on the artist home (`/api/v1/users/search/`), follower and following pop-ups (`/api/v1/users/<id>/followers|following/`), first name in the header, Profile strength hidden at 100%, documents Upload button.
- **`c49df36`:**
  - Messaging and connections.
  - Share menu: "Send in a Bharini message" first, then copy link and the device share sheet.
  - Opportunities: casting calls lead the artist feed, ones in the artist's own city first.
  - About me shown beside the follower counts; click a profile photo to change it.
  - Production profile restyled; cinematographer role (5 images + 5 × 30 s videos).
  - Casting-photo pose outlines; upload cards with a bin icon.
  - Group photos allowed as the profile photo (only casting shots must be solo).
  - Google-only social login.
  - A single root `.gitignore`.
- **Earlier:** profiles and onboarding, portfolio and face check, artist posts, the other developer's productions and production posts (commits `2adea4b`, `03b5e8e`, `e60acd5`).
- **Past pitfall:** commit `03b5e8e` came from a stale copy and silently reverted finished work, including instruments for musicians (still removed). Check diffs from other developers for silent reverts.

## Done but UNCOMMITTED (as of 2026-10-28)
All migrations below are applied to the dev database. `manage.py check` and the frontend checks are clean.

### Delete account (90-day grace period)
- New fields `User.deletion_requested_at` and `User.terms_accepted_at` (migration `accounts/0004`).
- **`backend/accounts/deletion.py`:**
  - `request_deletion` deactivates the account and revokes its sessions.
  - `send_restore_link` emails `{FRONTEND_URL}/auth/restore-account?uid=&token=`.
  - `restore` brings the account back.
  - `purge` deletes the user and their media files; `purge_expired` purges accounts past 90 days.
  - `RestoreTokenGenerator` has its own salt and stops working once used.
- **Endpoints:**
  - `DELETE /api/v1/auth/me/` schedules the deletion.
  - `POST /api/v1/auth/restore/ {uid, token}` restores the account and logs in.
- **Logging in during the grace period:** a password or Google login emails a restore link.
  - The password login returns 403 `account_pending_deletion`.
  - Google redirects to `/auth/login?social_error=pending_deletion`.
- **Purging:** management command `purge_deleted_accounts`. **Not scheduled yet.**
- **Web:**
  - `app/settings/page.tsx`: delete with a `ConfirmDialog` pop-up, plus the blocked-users list.
  - `app/auth/restore-account/page.tsx`.
  - Settings link in `app-header.tsx`.

### Block users
- `connections.Block(blocker, blocked)` (migration `connections/0002`). `blocked_ids(user)` covers both directions.
- **Endpoints:**
  - `POST/DELETE /api/v1/users/<id>/block/`.
  - `GET /api/v1/users/me/blocked/`.
- Blocking removes the connection and follows in both directions.
- **Blocked users are hidden from:** feeds, comments, profiles (404 if they blocked you), search, follow, connect, conversations and unread counts.
- `is_blocked` is returned on `PublicProfile` and `Production`.
- **Web:** `components/block-button.tsx` and `components/confirm-dialog.tsx`, used on `app/u/[id]/page.tsx` and `components/productions/production-profile-view.tsx`.

### Terms and minors
- **`app/terms/page.tsx`:** 13 sections covering Indian law (IT Act 2000, IT Rules 2021, DPDP Act 2023, Contract Act 1872, Child and Adolescent Labour Act 1986, POCSO 2012).
  - `#minors`: under 16 = the parent manages the account; 16–17 = guardian consent and supervision.
- Registering requires `accept_terms`. Google sign-in sets `terms_accepted_at` and shows a terms note.
- **Guardian fields:** `ArtistProfile.guardian_name` and `guardian_consent_at` (migration `profiles/0006`).
  - A date of birth under 18 requires a guardian name and `guardian_consent`.
  - The onboarding About step shows a guardian box.
  - `ageFrom` lives in `dob-input.tsx`.
- **Tests added:** `AccountDeletionTests`, `BlockTests`, `test_minors_need_guardian_consent`. They passed when written; re-run them before committing.

## Open items / next steps
- **Commit** the uncommitted work above, only when the user asks. Pushing needs a GitHub login with write access to `Sandeep4510/Bharini`; `gh` is not installed.
- **Schedule** `python manage.py purge_deleted_accounts` daily (cron or Windows Task Scheduler).
- **Terms page:** fill in the Grievance Officer's name, email and address (still "[to be added]"). The terms need a lawyer's review.
- **Existing users** have a null `terms_accepted_at` and are not yet asked to accept.
- **Blocked users** can still appear in other people's follower and following lists.
- **Tests:** grant `CREATEDB` so the full suite runs on an isolated database.
- **Leftover folder:** `backend/posts/` holds only stale `__pycache__` from before the `artist_posts` rename. Safe to delete.
- **Uploaded media** for wiped users is still in `backend/media/`; only the database rows were removed.
- **Not yet built:**
  - Casting application flow.
  - Moderation and reporting.
  - Notifications (messages poll every 5 s; the unread badge every 30 s).
  - Expo mobile app, which also needs a native Google token endpoint and storage-agnostic `packages/auth`.
  - CI.
- **Never clicked through in a real browser:** settings, restore, terms, block, choose-role, share menu.

## User preferences
- Respond using the caveman (terse) and ponytail (smallest complete change) skills.
- Commit only when asked. Commit trailer: `Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>`.
- When merging other developers' work, prioritise the pulled version and follow its structure.