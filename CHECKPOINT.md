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

## Mobile app (`apps/mobile`, Expo SDK 58, development build) — slice 1 of 4
Build order agreed with the user: (1) Login → (2) Home feed, Profile, Messages → (3) Onboarding with camera + volume-button capture → (4) Push notifications. The user has an Apple Developer account. iOS dev builds are planned through EAS cloud later.
- **Dev build:** `expo-dev-client` is installed, so Expo Go is not used.
  - `npm run android` (`expo run:android`) builds and installs the app and starts Metro. Rebuild only when native dependencies change; otherwise `npm run start`.
  - `apps/mobile/android` and `apps/mobile/ios` are generated (Continuous Native Generation) and gitignored.
- **Java:** the system `JAVA_HOME` is a JRE 21 with no compiler. Builds need `JAVA_HOME=C:\Program Files\Android\Android Studio\jbr`, which the PyCharm run config sets.
- **PyCharm run configs** in `.run/`:
  - "Android emulator (Pixel 8 API 35)": `npm run emulator`, via `apps/mobile/scripts/start-emulator.js`.
  - "Mobile: build & run on Android (dev build)".
  - "Mobile: dev server".
- **Environment:** `apps/mobile/.env` (gitignored; copy of `.env.example`) sets `EXPO_PUBLIC_API_BASE_URL=http://10.0.2.2:8000` and `EXPO_PUBLIC_WEB_URL=http://10.0.2.2:3000`. `10.0.2.2` is the host computer as seen from the emulator; it is in Django's `ALLOWED_HOSTS` (settings default and `backend/.env`).
- **Shared code:**
  - `packages/auth` has pluggable storage (`setSessionStorage`): localStorage on the web, SecureStore on mobile, registered in `apps/mobile/src/lib/auth.tsx`.
  - `packages/api-client` reads `NEXT_PUBLIC_API_BASE_URL` or `EXPO_PUBLIC_API_BASE_URL`.
  - New `packages/theme` holds the colour, radius, spacing and font-size tokens.
- **Screens:**
  - Routing uses `Stack.Protected`: `src/app/(auth)/login.tsx` when signed out, `src/app/(tabs)` with NativeTabs (Home, Search, Messages, Profile) when signed in.
  - Home shows "Hi {first name}" and a Log out button; the other tabs are placeholders.
  - Register and forgot password open the website.
  - UI pieces live in `src/components/ui.tsx`.
- **Checks:** in `apps/mobile`, `npx tsc --noEmit`, `npx expo lint` and `npx expo-doctor`. expo-doctor wrongly says `.expo` is not ignored; it only reads a local `.gitignore`, but the root one covers it.
- **Routes:** `src/app/index.tsx` redirects to `/home` or `/login`. The Home tab is `(tabs)/home.tsx`. `Stack.Protected` with `redirectTo` cannot handle the very first URL on its own.
- **Windows long paths (required):** React Native's C++ builds exceed 260 characters.
  - `LongPathsEnabled=1` is set (done by the user as admin).
  - CMake 3.31.6 (ninja 1.12.1) is installed in the SDK. `apps/mobile/android/local.properties` holds `cmake.dir=…\cmake\3.31.6`.
  - The `android/` folder is generated: re-add that line after `expo prebuild --clean`. CMake 3.22.1 (ninja 1.10) fails with "Filename longer than 260 characters".
  - A `subst` short drive does not help, because Node resolves it back to `C:\`.
- **Fast build for the emulator:** in `apps/mobile/android`, with `JAVA_HOME` set to `jbr`, run `gradlew assembleDebug -PreactNativeArchitectures=x86_64` (≈3 min incremental; the first build was ≈13 min). Then `adb install -r app/build/outputs/apk/debug/app-debug.apk`, `adb reverse tcp:8081 tcp:8081`, and `npx expo start --dev-client`.
- **Never start Metro with `CI=1`:** it turns off file watching, so code changes and new routes are ignored.
- **Emulator on the NVIDIA GPU:**
  - The AVD `config.ini` has `hw.gpu.mode = host`; the original is backed up as `config.ini.bak`.
  - Windows "High performance" GPU preference (`HKCU\Software\Microsoft\DirectX\UserGpuPreferences`) is set for `emulator.exe` and `qemu-system-x86_64.exe`.
  - The GPU does not speed up Gradle.
- **Status (2026-10-28): slice 1 verified on the Pixel 8 API 35 emulator.**
  - Login with `test_actor` shows "Hi Test".
  - The session survives a force-close (SecureStore, `/auth/me` returns 200).
  - Log out returns to Login.
  - A wrong password shows "Invalid email or password." (the API's `field_errors.detail`).
  - Fast refresh works.
- **Slice 2 (done, verified on the emulator as `test_actor`, 2026-10-28):**
  - **Home (`(tabs)/home.tsx`):**
    - Feed order: casting calls first, then posts. Pull to refresh.
    - `components/post-card.tsx`: author → profile, image, tap-to-play video with `expo-video` (never autoplays), like.
    - `components/casting-card.tsx`: shows casting details and the "📍 Near you" badge.
  - **Post (`post/[id].tsx`):** the post with its comments, plus adding a comment.
  - **Profile (`(tabs)/profile.tsx`) and other people's profiles (`user/[id].tsx`):**
    - Both use the shared `components/profile-view.tsx`: header, follower/following counts, About me, casting photos, posts.
    - Your own profile has Log out.
    - Other profiles have Follow, and Message only when connected.
  - **Messages (`(tabs)/messages.tsx`):** conversation list that refreshes on focus, unread badges.
  - **Chat (`chat/[id].tsx`):** checks for new messages every 5 s, sends, shows shared-post cards and "Seen". Typing is disabled when not connected.
  - Detail screens are registered in the root `_layout.tsx`, behind the signed-in guard, with a themed header.
- **`plugins/with-android-cmake.js`:** config plugin that re-writes `cmake.dir` on every prebuild. Prebuild deletes `local.properties` even without `--clean`.
- **Slice 2 completion (verified on the emulator, 2026-10-28):**
  - **Search tab:** `/users/search/`.
  - **Composer on Home:** text plus photo or video from the system photo picker (`expo-image-picker`), posted to `/posts/`.
    - Uploads use an `expo-file-system` `File` (`lib/config.ts` `toUpload`). Expo's global fetch rejects React Native's old `{uri, name, type}` objects with "Unsupported FormDataPart implementation".
  - **Share sheet (`components/share-sheet.tsx`):** send to a connection in a Bharini message first, then the system share sheet with the website link. Casting-call shares bump `share_count`.
  - **Connect button (`components/connect-button.tsx`)** on other people's profiles.
  - **Connection requests** listed at the top of Messages, with Accept / Ignore.
  - **Delete comment** (`can_delete`).
  - **Unread badge** on the Messages tab (`NativeTabs.Trigger.Badge`, checks every 15 s).
  - **Deep links** such as `bharini://post/89` open the post.
- **Same backend as the website:** all calls go through `@bharini/api-client`. The only backend change for mobile is adding `10.0.2.2` to `ALLOWED_HOSTS`.
- **Metro:** restart it with `--clear` after installing a package; otherwise "Unable to resolve".
- **Slice 3 (done, verified on the emulator, 2026-10-28):** onboarding and Edit profile.
  - **Screen:** `src/app/onboarding.tsx`, 4 steps mirroring the web onboarding.
    - Required steps 1–3, optional portfolio.
    - `STEP_FIELDS` maps the API's `missing_fields` to steps; the current step has a silver outline.
    - New artists are redirected there from `(tabs)/_layout.tsx` and get no back arrow. Profile tab → "Edit profile".
  - **Steps (`components/profile/`):**
    - `about-step`: username check plus suggestions, discipline chips, profile photo (camera or gallery), bio, sex, date of birth, height (actors), guardian consent for under-18s.
    - `languages-step`.
    - `contact-step`: +91 phone, extra email with PIN, Instagram/Facebook normalisation.
    - `portfolio-step`: casting photos (actor/choreographer) with pose outlines; per-discipline video (record with the system camera capped at the slot length, or gallery), audio (document picker) and image slots; director showreel links; certificates.
  - **Form controls (`components/form.tsx`):**
    - `SelectField` is an app-styled bottom sheet; the `@expo/ui` Compose dropdown looked out of place.
    - `DateField` uses `@expo/ui/community/datetime-picker`: a native dialog on Android, inline on iOS.
  - **Camera:**
    - `src/app/camera.tsx` route, opened with `lib/camera.ts` `openCamera({pose, facing})` → Promise of the photo uri.
    - `components/camera-capture.tsx`: `expo-camera` with the SVG pose overlay (`components/pose-guide.tsx`, `react-native-svg`, same paths as the web).
    - **Volume keys take the photo**, using `react-native-volume-manager`: volume is held at 0.5 so every press registers, the system volume UI is hidden, and both are restored on close.
    - It must be a route, not a Modal: Android only sends volume keys to the main window.
  - **New native dependencies:** `expo-camera`, `react-native-volume-manager`, `react-native-svg`, `expo-document-picker`.
  - **Uploads:** `lib/config.ts` `toUpload({uri})` (expo-file-system File), plus `ageFrom`, `fieldErrors`, `messageOf`.
- **Not done:**
  - Audio slots show "Uploaded · N sec" but have no in-app player (would need `expo-audio`).
  - No city autocomplete list (the web has a datalist).
  - Production-house profile editing is not in the app yet.
  - A camera-taken casting photo is only checked against a real face on a physical device; the emulator scene has none.
- **Slice 4: push notifications (code done, 2026-10-28; real delivery waits on account setup):**
  - **Backend app `notifications`:**
    - Models: `PushDevice` (Expo token, unique per phone) and `NotificationSettings` (messages, connections, follows, casting; a missing row means all on).
    - API: `POST/DELETE /api/v1/notifications/devices/`, `GET/PATCH /api/v1/notifications/settings/`.
    - `push.notify(users, kind, title, body, data)`: skips muted users, sends after commit on a background thread to `https://exp.host/--/api/v2/push/send` in batches of 100, and deletes `DeviceNotRegistered` tokens. Optional env `EXPO_ACCESS_TOKEN`.
  - **Hooks:**
    - New message → the other person.
    - Connection request → them; accepted → the requester.
    - New follow (first time only).
    - Casting call → artists whose city is in the casting location (`production_posts.views.notify_local_artists`).
  - **Tests:** `notifications/tests/test_notifications_api.py` (5) pass.
  - **Also fixed:** production feed and comment cursor pagination now tie-break on `id`. The other developer's pagination tests were flaky, and real pages could skip or repeat posts.
  - **App:**
    - `src/lib/notifications.ts`: creates channel `default` before asking permission (Android 13+), gets the Expo push token with the EAS projectId and registers it; `unregisterForPush` runs on logout.
    - `openFromNotification` routes taps: chat, profile, or home.
    - `_layout.tsx` handles taps with `useLastNotificationResponse`.
    - `src/app/notification-settings.tsx` has toggles, linked from Profile → 🔔 Notifications.
  - **Verified on the emulator:** permission prompt, channel, `POST_NOTIFICATIONS` granted, settings load and save. Token registration stops with "no EAS projectId", as designed.
  - **To finish (user accounts needed):**
    1. `npx eas login` and `npx eas init` in `apps/mobile`. This writes `extra.eas.projectId` into `app.json`.
    2. Create a Firebase project and an Android app with package `com.bharini.app`. Put `google-services.json` in `apps/mobile` and set `expo.android.googleServicesFile`. Upload the FCM v1 service-account key with `eas credentials`.
    3. iOS: an APNs key through `eas credentials` (Apple Developer account).
    4. Rebuild the APK, then send a test message to see a push.
  - **Not built:** a web toggle UI for these settings; notifications for likes or comments; an in-app notification list.

## User preferences
- Respond using the caveman (terse) and ponytail (smallest complete change) skills.
- Commit only when asked. Commit trailer: `Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>`.
- When merging other developers' work, prioritise the pulled version and follow its structure.