# Messaging API

One-to-one chat between connected users. Written for the Android and iOS apps.

Base URL: `/api/v1/messages/`

Every endpoint needs `Authorization: Bearer <access token>` (see the accounts API doc). Anonymous requests get `401` with `{"detail": "..."}`.

## Envelope

Same shape as the other APIs:

```json
{ "code": "ok", "message": "...", "request_id": "", "data": { } }
```

Errors use a machine-readable `code`. Invalid input adds `field_errors`.

## Rules

- You can only **start** or **send** in a chat with someone you are connected to. A pending request is not enough.
- If the connection is removed, the old chat stays readable, but `can_message` becomes `false` and sending returns `403 not_connected`.
- Chats with deactivated accounts are hidden everywhere (`404` on their thread).
- Each pair of users has exactly one chat, whichever side starts it.

## Shared shapes

**Other user** (`other` on a conversation): the author summary used across the app.
```json
{ "id": 7, "name": "Asha Rao", "role": "artist", "username": "asha.rao", "profile_photo": "https://.../photo.jpg", "production_id": null }
```
No email, phone, or birth date is included.

**Conversation**:
```json
{
  "id": 3,
  "other": { "...": "other user" },
  "last_message": { "...": "message" },
  "unread_count": 2,
  "updated_at": "2026-10-28T10:00:00+05:30",
  "can_message": true
}
```
- `last_message` is `null` if the chat is empty.
- `unread_count` counts messages from the other person that you have not read.

**Message**:
```json
{
  "id": 41,
  "is_mine": false,
  "body": "Hi, are you free Friday?",
  "shared": null,
  "created_at": "2026-10-28T10:01:00+05:30",
  "read": true
}
```
- `body` may be empty when the message only shares a post.
- `shared` is `null` unless a post was shared (see below).

**Shared post preview** (`shared` on a message):
```json
{
  "kind": "artist",
  "id": 12,
  "author_name": "Ravi K",
  "author_photo": "https://.../photo.jpg",
  "body": "Gig tonight at 8",
  "image": "https://.../media/posts/7/ab12.jpg",
  "url": "/posts/12"
}
```
- `kind` is `artist` (a post from `/posts/`) or `production` (a post from `/feed/`).
- `body` is cut to 200 characters. `image` is `null` for text or video posts.
- `url` is a web path. On mobile, open the post in-app using `id` and `kind`.
- If the post is later deleted, the message stays and `shared` becomes `null`.

---

## Conversations

### GET `/api/v1/messages/conversations/`

Your chats, most recently active first. Returns `data.conversations`, up to 50 items.

### POST `/api/v1/messages/conversations/`

Open the chat with someone, or reuse the existing one.

Request:
```json
{ "user_id": 7 }
```

- `201` when a new chat is created, `200` when it already existed.
- Returns the conversation object in `data`.
- Opening a chat with someone you are not connected to returns `403 not_connected` (unless a chat already exists).

Errors: `400 cannot_message_self`, `404 not_found` (unknown or deactivated user), `403 not_connected`.

Non-numeric `user_id` returns `404`.

---

## Messages

### GET `/api/v1/messages/conversations/<id>/messages/`

The latest 50 messages, oldest first. Returns:
```json
{ "conversation": { "...": "conversation" }, "messages": [ { "...": "message" } ] }
```

Loading the full thread marks the other person's messages as read.

**Polling for new messages:** pass `?after=<id of the newest message you have>`. You get only messages with a higher id, and polling never marks anything read. Use this instead of reloading the thread.

`404 not_found` if the chat does not exist, is not yours, or the other person is deactivated.

### POST `/api/v1/messages/conversations/<id>/messages/`

Send a message. Rate limit: 30 sends per minute per user. Above that you get `429`.

Request (JSON):
```json
{ "body": "Hi!", "shared_artist_post_id": 12 }
```

| Field | Rules |
|---|---|
| `body` | Optional if sharing a post. Trimmed. Max 2000 characters. |
| `shared_artist_post_id` | Optional. A post from `/posts/`. |
| `shared_production_post_id` | Optional. A post from `/feed/`. |

- At least one of `body`, `shared_artist_post_id`, or `shared_production_post_id` is required.
- You can share one post of each kind in the same message.
- Returns `201` with the new message in `data`.

Errors:
- `400 validation_error` with `field_errors.body`: empty, or over 2000 characters.
- `400 validation_error` with `field_errors.shared`: the shared post does not exist or is no longer available.
- `403 not_connected`: the connection was removed.
- `404 not_found`: chat not found or not yours.

---

## Unread count

### GET `/api/v1/messages/unread-count/`

Total unread messages across all your chats. Use it for the tab badge.

```json
{ "unread": 3 }
```

---

## Error codes

| `code` | HTTP | Meaning |
|---|---|---|
| `ok` | 200 / 201 | Success. |
| `validation_error` | 400 | Input failed validation. See `field_errors`. |
| `cannot_message_self` | 400 | You tried to open a chat with yourself. |
| `not_connected` | 403 | You are not connected to this person. |
| `not_found` | 404 | Chat or user not found, not yours, or deactivated. |

## Mobile checklist

1. Show `unread_count` on each row. Clear it by opening the thread.
2. While a thread is open, poll with `?after=<last id>` every few seconds.
3. Disable the input when `can_message` is `false`, and show the `403` message.
4. Use the `unread-count` endpoint for the tab badge, not the sum of rows.
5. Show a shared post card for `shared`. Hide the card when `shared` is `null`, but keep the message.
