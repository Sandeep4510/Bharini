# Accounts API

Base URL: `/api/v1/auth/`. Written for the Android and iOS apps.

## Envelope

Most responses use this shape:

```json
{ "code": "ok", "message": "...", "request_id": "<echo of X-Request-ID, or empty>", "data": { } }
```

Errors use the same shape with a machine-readable `code`. Invalid input adds `field_errors`, a map of field name to a list of messages.

Two cases do not use the envelope. They use DRF's default body:
- `401` on protected routes: `{"detail": "Authentication credentials were not provided."}` or `{"detail": "Given token not valid for any token type", ...}`.
- `429` when throttled: `{"detail": "Request was throttled. Expected available in N seconds."}`.

Handle both by checking the HTTP status first, then reading `code` if present or `detail` otherwise.

## Headers

| Header | Direction | Purpose |
|---|---|---|
| `Authorization: Bearer <access>` | request | Required on protected routes (`me/`, `sessions/...`). |
| `X-Request-ID` | request | Optional. Echoed back in `request_id`. Useful for logs. |
| `X-Device-Label` | request | Optional, max 128 chars. Stored with the session, e.g. `Pixel 8` or `iPhone 15`. |
| `X-Forwarded-For` | request | Used for the session IP when present (first entry). |

## Tokens and sessions

- Login, register, and social exchange return `data.tokens.access` (15 min) and `data.tokens.refresh` (7 days).
- Each login creates a session. `refresh/` rotates the refresh token, and the old one stops working.
- Mobile apps should store both tokens in secure storage (Android Keystore / iOS Keychain) and send `refresh` in the JSON body.
- Browsers also receive the refresh token as an HTTP-only cookie named `refresh_token` (path `/api/v1/auth/`). Native apps can ignore it.
- `refresh/` and `logout/` accept the token from the JSON body (`refresh`) or from that cookie. The body wins if both are sent.
- A user must verify their email before logging in.

## Throttling

Per client IP, per minute. Exceeding the limit returns `429`.

| Scope | Limit | Endpoints |
|---|---|---|
| `auth_register` | 5 | `register/` |
| `auth_login` | 10 | `login/`, `social/exchange/` |
| `auth_verify` | 20 | `verify-email/`, `verify/` |
| `auth_refresh` | 30 | `refresh/` |
| `auth_logout` | 20 | `logout/` |
| `auth_password_reset` | 5 | `password/reset/`, `password/reset/confirm/` |

## Error codes

| `code` | HTTP | Meaning |
|---|---|---|
| `ok` | 200 / 201 | Success. |
| `validation_error` | 400 | Input failed validation. See `field_errors`. |
| `invalid_credentials` | 400 | Login failed (wrong password, unverified, or unknown email). |
| `invalid_verification_token` | 400 | Email verification link is bad or expired. |
| `invalid_reset_link` | 400 | Password reset link is bad or expired. |
| `invalid_social_code` | 400 | Social sign-in code is missing, expired, unknown, or already used. |
| `social_account` | 400 | Password reset for a social-only account. Message names the provider. |
| `missing_refresh_token` | 400 | `logout/` called without a token. |
| `invalid_refresh_token` | 401 | Token is missing, malformed, wrong type, rotated, or logged out. |
| `invalid_refresh_session` | 401 | Token is valid but has no session record. |
| `revoked_refresh_session` | 401 | Session was revoked or has expired. |
| `session_not_found` | 404 | Session does not exist or belongs to someone else. |
| `account_not_found` | 404 | No account uses this email. |

---

## POST `register/`

Creates an unverified account, signs it in, and emails a verification link. Throttle: `auth_register`.

Request:
```json
{
  "email": "artist@example.com",
  "first_name": "Asha",
  "last_name": "Rao",
  "role": "artist",
  "password": "StrongPass123!",
  "password_confirm": "StrongPass123!"
}
```

- `role` is optional, defaults to `artist`. Allowed: `artist`, `production_house`. `admin` cannot be chosen at sign-up; it returns `400` `validation_error`.
- `first_name` and `last_name` are required.
- Password: at least 8 characters, with an uppercase letter, a lowercase letter, a number, and a special character. It must also pass Django's common-password and similarity checks.
- Email is case-insensitive for uniqueness.

Responses:
- `201`:
```json
{
  "code": "ok",
  "message": "User registered successfully. Please verify your email.",
  "request_id": "",
  "data": {
    "user": { "id": 12, "email": "artist@example.com", "username": null, "first_name": "Asha", "last_name": "Rao",
              "role": "artist", "is_verified": false, "email_verified_at": null,
              "date_joined": "2026-10-26T10:00:00Z", "onboarding_complete": false, "completion_percent": null },
    "tokens": { "access": "...", "refresh": "..." }
  }
}
```
- `400` `validation_error`, message `Please fix the highlighted fields.`. `field_errors` keys can be `email`, `first_name`, `last_name`, `role`, `password` (list of rules), `password_confirm`.
- `400` `validation_error`, message `This email is already registered. Please sign in.`, when the email is taken.

## POST `login/`

Throttle: `auth_login`.

Request: `{"email": "artist@example.com", "password": "StrongPass123!"}`

Responses:
- `200`: `message: "Login successful."`. `data` has `user` (same shape as above) and `tokens`.
- `400` `invalid_credentials`, message `Login failed.`. `field_errors.detail` is one of:
  - `Invalid email or password.` (wrong password, unknown email, or disabled account)
  - `Please verify your email before logging in.` (email not yet verified)

Disabled accounts always get the generic `Invalid email or password.` message.

## POST `verify-email/` (alias `verify/`)

Throttle: `auth_verify`. Called when the user opens the link from the email (`?uid=...&token=...`). Parse those query params in the app and POST them here.

Request: `{"uid": "<base64 user id>", "token": "<token>"}`

Responses:
- `200`: `message: "Email verified successfully."`, or `"Email is already verified."` if already verified. No `data`.
- `400` `invalid_verification_token`: `field_errors.detail` is `Invalid or expired verification token.` or `Invalid verification link.`.

## POST `refresh/`

Throttle: `auth_refresh`. Rotates the refresh token. Call it when an access token returns `401`, then retry the original request.

Request: `{"refresh": "<refresh token>"}`, or no body if the cookie is present.

Responses:
- `200`: `message: "Token refreshed successfully."`, `data: {"access": "...", "refresh": "..."}`. Save the new refresh token. The old one is invalid after this call.
- `401` `invalid_refresh_token`: missing, malformed, an access token, or already rotated. Sign the user out.
- `401` `invalid_refresh_session`: no session record. Sign the user out.
- `401` `revoked_refresh_session`: session revoked (logout, or revoked from another device) or expired. Sign the user out.

Reusing an old refresh token after rotation returns `401 invalid_refresh_token`.

## POST `logout/`

Throttle: `auth_logout`. Revokes the session and blacklists the refresh token. Delete the stored tokens on the device.

Request: `{"refresh": "<refresh token>"}`, or the cookie.

Responses:
- `200`: `message: "Logged out successfully."`. Clears the cookie.
- `400` `missing_refresh_token`: no token given.
- `401` `invalid_refresh_token`: token invalid or already logged out.

## POST `password/reset/`

Throttle: `auth_password_reset`. Emails a reset link to `/auth/reset-password?uid=...&token=...`. Email is case-insensitive.

Request: `{"email": "artist@example.com"}`

Responses:
- `200`: `message: "Password reset link sent to artist@example.com."`.
- `400` `validation_error`: not a valid email.
- `404` `account_not_found`: `field_errors.email` is `No account found with this email.`.
- `400` `social_account`: account signs in with Google only. Message: `This account signs in with Google. Use that button on the login page.`

## POST `password/reset/confirm/`

Throttle: `auth_password_reset`. Uses `uid` and `token` from the reset link.

Request:
```json
{ "uid": "...", "token": "...", "password": "NewStrongPass123!", "password_confirm": "NewStrongPass123!" }
```

Responses:
- `200`: `message: "Password reset successful."`.
- `400` `invalid_reset_link`: bad uid or token, or the link was already used (the token changes when the password changes).
- `400` `validation_error`: mismatched or weak password. `field_errors` has `password` or `password_confirm`.

## Social sign-in (Google)

This is a browser flow. Native apps should open it in a browser or web view (Custom Tabs / ASWebAuthenticationSession) and read the result from the redirect.

### GET `social/<provider>/start/?role=artist|production_house`

Browser redirect to the provider. Only `google` is supported. `role` is optional and only applies to new accounts.
- Unknown provider: redirects to `FRONTEND_URL/auth/login?social_error=unknown_provider`.
- Provider not configured: redirects to `...?social_error=not_configured`.
- Provider error: redirects to `...?social_error=<reason>`.

### GET `social/complete/`

Final step after Google. Redirects to `FRONTEND_URL/auth/social?code=<one-time code>`. Without a valid provider login it redirects with `social_error=unknown`. The code is valid for 60 seconds and works once.

### POST `social/exchange/`

Throttle: `auth_login`. Trade the code for JWTs.

Request: `{"code": "<one-time code>"}`

Responses:
- `200`: same shape as login (`data.user` and `data.tokens`).
- `400` `invalid_social_code`: message `Sign-in link expired. Please try again.`

Social sign-ups are email-verified automatically.

---

## GET `me/` (auth required)

Responses:
- `200`: `message: "Current user profile."`, `data`:

| Field | Type | Notes |
|---|---|---|
| `id` | int | |
| `email` | string | |
| `username` | string or null | Artist username. `null` for non-artists or no profile. |
| `first_name`, `last_name` | string | |
| `role` | string | `artist`, `production_house`, or `admin` |
| `is_verified` | bool | |
| `email_verified_at` | datetime or null | |
| `date_joined` | datetime | |
| `onboarding_complete` | bool | Always `true` for non-artists. For artists, `true` once the profile is complete. |
| `completion_percent` | int or null | Artist profile completion, 0-100. `null` if no profile. |

- `401` `{"detail": ...}` if the bearer token is missing or invalid.

## GET `sessions/` (auth required)

Lists the caller's sessions, most recently used first.

Response `200`: `data.sessions` is a list of:

```json
{ "id": "3f1c...-uuid", "device_label": "Pixel 8", "user_agent": "okhttp/4.12",
  "ip_address": "203.0.113.5", "created_at": "...", "last_used_at": "...",
  "expires_at": "...", "revoked_at": null, "is_active": true }
```

`is_active` is `false` once the session is revoked or expired.

## POST `sessions/<uuid>/revoke/` (auth required)

Signs out one device. Its refresh token stops working. Revoking an already revoked session returns `200` again.

Responses:
- `200`: `message: "Session revoked successfully."`
- `404` `session_not_found`: no such session, or it belongs to another user.

---

## Example: sign in and call a protected route

```bash
curl -s -X POST https://<host>/api/v1/auth/login/ \
  -H 'Content-Type: application/json' -H 'X-Device-Label: Pixel 8' \
  -d '{"email":"artist@example.com","password":"StrongPass123!"}'

curl -s https://<host>/api/v1/auth/me/ \
  -H "Authorization: Bearer <access token>"
```

## Mobile integration checklist

1. Register, then tell the user to verify. Login is blocked until verified.
2. Store `access` and `refresh` securely. Send `refresh` in the body, never rely on the cookie.
3. On `401` from a protected route, call `refresh/`. If that fails with `401`, log the user out locally.
4. Treat `429` as "try again later", and show `Request was throttled` details from `detail` if useful.
5. Call `logout/` before deleting local tokens.
