# Connections API

Two-way connections between users, similar to LinkedIn. One person sends a request, and the other accepts it. Connections are separate from follows, which are one-way. Written for the Android and iOS apps.

Base URL: `/api/v1/users/`

Every endpoint needs `Authorization: Bearer <access token>` (see the accounts API doc). Anonymous requests get `401` with `{"detail": "..."}`.

## Envelope

Same shape as the other APIs:

```json
{ "code": "ok", "message": "...", "request_id": "", "data": { } }
```

Errors use a machine-readable `code`.

## Connection status

Every connect response, and the `connection` field on profiles and follower lists, uses one of these values, seen from your side:

| Value | Meaning | Your button |
|---|---|---|
| `none` | No link | Connect |
| `pending_sent` | You sent a request | Cancel request |
| `pending_received` | They sent you a request | Accept (connect back) or Decline (delete) |
| `connected` | You are connected | Remove connection |

## Shared shapes

**Author summary** (used in lists):
```json
{
  "id": 7,
  "name": "Asha Rao",
  "role": "artist",
  "username": "asha.rao",
  "profile_photo": "https://.../photo.jpg",
  "production_id": null
}
```
No email, phone, or birth date is included.

**Connection request** (an author summary plus):
```json
{ "...": "author summary", "requested_at": "2026-10-28T10:00:00+05:30" }
```

---

## Connect, cancel, accept, remove

### POST `/api/v1/users/<id>/connect/`

Depends on the current state:

- **No link:** sends a request. Status becomes `pending_sent`.
- **They already sent you a request:** accepts it. Status becomes `connected`.
- **Already connected or already sent:** nothing changes. Safe to repeat.

Returns:
```json
{ "connection": "pending_sent" }
```

Rate limit: 30 requests per minute per user. Above that you get `429`.

Errors:
- `400 cannot_connect_self`: the id is your own.
- `404 not_found`: the user does not exist or is deactivated.

### DELETE `/api/v1/users/<id>/connect/`

Removes the link, whatever its state:

- Cancel a request you sent.
- Decline a request they sent.
- Remove a connection.

Returns the new status, which is `none` after a successful delete:
```json
{ "connection": "none" }
```

Safe to repeat when there is no link: it still returns `200` with `none`.

Unlike POST, DELETE also works for deactivated users, so stale links can be cleared.

**Follows are not affected.** Removing a connection keeps any follow you have. Connecting does not follow anyone.

---

## Lists

### GET `/api/v1/users/me/connection-requests/`

Requests waiting for your answer, newest first. Returns `data.requests` (connection requests), up to 50 items.

Requests from deactivated accounts are hidden.

Accept a request by calling POST on the sender's connect endpoint. Decline by calling DELETE.

### GET `/api/v1/users/me/connections/?q=<text>`

People you are connected with, sorted by first name, then last name. Returns `data.connections` (author summaries), up to 50 items.

- `q` is optional. Every word in `q` must match the person's first name, last name, username, or production name (case-insensitive). Up to 5 words are used.
- Deactivated accounts are hidden.

Use this list to pick people to send a post to, or to start a message.

---

## Error codes

| `code` | HTTP | Meaning |
|---|---|---|
| `ok` | 200 | Success. |
| `cannot_connect_self` | 400 | You tried to connect with yourself. |
| `not_found` | 404 | The user does not exist or is deactivated. |
| (none) | 429 | Too many connect requests in a minute. |

## Mobile checklist

1. Set the profile button from `connection` on `GET /api/v1/users/<id>/`. Then call POST or DELETE and use the returned value.
2. Show the request count from `me/connection-requests/` on the notifications badge.
3. Accepting = POST on the sender's connect endpoint. Declining = DELETE on it. Both return a new `connection` value, so update the UI from that.
4. Messaging needs `connected`. Use `me/connections/` to see who you can message.
