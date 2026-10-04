# Bharini Auth API

This API is designed for both web and mobile clients. All auth endpoints live under `/api/v1/auth/`.

## Core behaviors

- Email is the primary login identifier.
- Registration creates a user with `is_verified = False` and sends an email verification link.
- Access tokens are short-lived JWTs.
- Refresh tokens rotate and are stored as secure `HttpOnly` cookies for web clients.
- The API returns JSON payloads for mobile clients and also sets the refresh cookie for browser-based clients.

## Endpoints

### 1) Register

POST `/api/v1/auth/register/`

Request JSON:

```json
{
  "email": "artist@example.com",
  "first_name": "Aisha",
  "last_name": "Sharma",
  "role": "artist",
  "password": "StrongPass123!",
  "password_confirm": "StrongPass123!"
}
```

Response `201`:

```json
{
  "message": "User registered successfully. Please verify your email to complete onboarding.",
  "user": {
    "id": 1,
    "email": "artist@example.com",
    "first_name": "Aisha",
    "last_name": "Sharma",
    "role": "artist",
    "is_verified": false,
    "date_joined": "2026-10-04T12:00:00Z"
  },
  "tokens": {
    "access": "eyJ...",
    "refresh": "eyJ..."
  }
}
```

### 2) Login

POST `/api/v1/auth/login/`

Request JSON:

```json
{
  "email": "artist@example.com",
  "password": "StrongPass123!"
}
```

Response `200`:

```json
{
  "message": "Login successful.",
  "user": {
    "id": 1,
    "email": "artist@example.com",
    "first_name": "Aisha",
    "last_name": "Sharma",
    "role": "artist",
    "is_verified": true,
    "date_joined": "2026-10-04T12:00:00Z"
  },
  "tokens": {
    "access": "eyJ...",
    "refresh": "eyJ..."
  }
}
```

### 3) Refresh token

POST `/api/v1/auth/refresh/`

Request body for mobile clients:

```json
{
  "refresh": "eyJ..."
}
```

For web clients, the refresh token is read from the `refresh_token` cookie automatically.

Response `200`:

```json
{
  "access": "eyJ...",
  "refresh": "eyJ..."
}
```

### 4) Logout

POST `/api/v1/auth/logout/`

Request body:

```json
{
  "refresh": "eyJ..."
}
```

Or for browser clients, send the cookie only. The server clears the refresh cookie and blacklists the refresh token.

### 5) Verify email

POST `/api/v1/auth/verify-email/`

Request JSON:

```json
{
  "uid": "NQ==",
  "token": "abc123..."
}
```

### 6) Request password reset

POST `/api/v1/auth/password/reset/`

Request JSON:

```json
{
  "email": "artist@example.com"
}
```

### 7) Confirm password reset

POST `/api/v1/auth/password/reset/confirm/`

Request JSON:

```json
{
  "uid": "NQ==",
  "token": "abc123...",
  "password": "NewStrongPass123!",
  "password_confirm": "NewStrongPass123!"
}
```

### 8) Fetch current user

GET `/api/v1/auth/me/`

Headers:

```http
Authorization: Bearer <access-token>
```

## Response conventions

- Success responses use HTTP `200` or `201`.
- Validation failures return `400` with field-level messages.
- Invalid or expired tokens return `400`.
- Protected routes return `401` when no valid JWT is provided.

## Security notes

- Access tokens expire after 15 minutes.
- Refresh tokens last 7 days and rotate on use.
- The web refresh token is stored as an `HttpOnly`, `Secure`, `SameSite=Lax` cookie.
- Passwords are validated with Django's default validators.
- Reset and verification links are sent via email and should be used immediately.
