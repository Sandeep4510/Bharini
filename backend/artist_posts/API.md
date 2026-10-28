# Posts, Follow and People API

Posts and social features. Written for the Android and iOS apps.

Base URLs:
- Posts: `/api/v1/posts/`
- Users, follow and search: `/api/v1/users/` (the `connections` app also uses this prefix for its own routes, see the connections doc)

Every endpoint needs `Authorization: Bearer <access token>` (see the accounts API doc). Anonymous requests get `401` with `{"detail": "..."}`.

## Envelope

Same shape as the other APIs:

```json
{ "code": "ok", "message": "...", "request_id": "", "data": { } }
```

Errors use a machine-readable `code`. Invalid input adds `field_errors`.

Two conventions to know:
- Post create, post update, and comment create return the object directly in `data`.
- A post by a deactivated account is hidden everywhere, and so is that account's profile. You get `404`.

## Shared shapes

**Author summary** (`author` on posts and comments; also list items for search and follow lists):
```json
{
  "id": 7,
  "name": "Asha Rao",
  "role": "artist",
  "username": "asha.rao",
  "profile_photo": "https://.../media/artists/7/photos/ab12.jpg",
  "production_id": null
}
```
- `name`: full name for artists, the production name for production houses, `Bharini member` if no name is set.
- `username`: artists only, otherwise `null`.
- `production_id`: production houses only. Use it to open their productions page. Otherwise `null`.
- No email, phone, or birth date is ever included.

**Post**:
```json
{
  "id": 12,
  "author": { "...": "author summary" },
  "body": "On set today!",
  "media": "https://.../media/posts/7/ab12.jpg",
  "media_kind": "image",
  "created_at": "2026-10-28T10:00:00+05:30",
  "like_count": 3,
  "comment_count": 1,
  "liked": true,
  "is_mine": false,
  "author_followed": true
}
```
- `media` is `null` for text-only posts. `media_kind` is `image`, `video`, or `""`.
- `liked`, `is_mine`, and `author_followed` are from the viewer's side.

**Comment**:
```json
{ "id": 4, "author": { "...": "author summary" }, "body": "Break a leg!", "created_at": "...", "can_delete": true }
```
`can_delete` is true for the comment's author and the post's author.

**Connection state** (`connection`, used on people lists): `none`, `pending_sent`, `pending_received`, or `connected`.

---

## Posts

### GET `/api/v1/posts/`

Feed. Returns `data.posts`, up to 50 items.

Order: your own posts and posts by accounts you follow come first, then everyone else. Newest first within each group.

### POST `/api/v1/posts/`

Create a post. Send `json` for text only, or `multipart` with `media`.

| Field | Rules |
|---|---|
| `body` | Required. Max 5000 chars. Blank or whitespace-only is rejected. |
| `media` | Optional file. Images: JPG, JPEG, PNG, WebP (re-encoded; location data is removed). Video: MP4, MOV, WebM, max 100 MB. |

Returns `201` with the post in `data`. Errors: `400` `validation_error`.

### GET `/api/v1/posts/<id>/`

Any signed-in user can read a post, so shared links work. Returns `data` as the post object. `404` `not_found` if missing or the author is deactivated.

### PATCH `/api/v1/posts/<id>/`

Only the author can edit. Send `body`, or a new `media` file, or `remove_media: "true"` to remove the attachment. Returns the updated post.

Replacing the media deletes the old file. Other users get `404`.

### DELETE `/api/v1/posts/<id>/`

Only the author can delete. Deletes the post, its media, likes, and comments. Returns `200` with `message` only (no `data`). Other users get `404`.

---

## Likes

### POST `/api/v1/posts/<id>/like/`

Likes the post. Liking twice is harmless. Returns:
```json
{ "liked": true, "like_count": 3 }
```

### DELETE `/api/v1/posts/<id>/like/`

Removes your like. Same response shape.

---

## Comments

### GET `/api/v1/posts/<id>/comments/`

Returns `data.comments`, oldest first, up to 200. Comments by inactive accounts are still listed.

### POST `/api/v1/posts/<id>/comments/`

Request: `{ "body": "Break a leg!" }`. Max 1000 chars. Blank is rejected.

Returns `201` with the comment in `data`.

### DELETE `/api/v1/posts/<id>/comments/<comment_id>/`

The comment's author or the post's author can delete it. Others get `404` `not_found`.

---

## Users

### GET `/api/v1/users/<id>/`

Public profile of any active account. Returns:

| Field | Notes |
|---|---|
| `id`, `name`, `role`, `username`, `profile_photo`, `production_id` | As in the author summary. |
| `bio`, `location` | Artists only. Empty string otherwise. |
| `disciplines` | Artists only. Human-readable labels, e.g. `Actor`. |
| `follower_count`, `following_count` | Counts. |
| `is_following` | Whether you follow them. |
| `is_me` | True on your own id. |
| `connection` | Connection state from your side. `"none"` on your own profile. |
| `posts` | Up to 20 of their posts, newest first. Same shape as feed posts. |
| `portfolio` | Artists only, otherwise `null`. See below. |

`portfolio` contains `photos` (casting photos; `null` unless the artist is an actor or choreographer), `media_slots`, `documents`, `showreel_links`, and `languages` (a list of `{"language": "English", "level": "Fluent"}` with display labels). It never includes contact details or birth date.

`404` `not_found` for missing or deactivated accounts.

### POST `/api/v1/users/<id>/follow/`

Follows the account. Repeating it is harmless. Returns:
```json
{ "is_following": true, "follower_count": 12 }
```
Errors: `400` `cannot_follow_self`, `404` `not_found`.

### DELETE `/api/v1/users/<id>/follow/`

Unfollows. Same response shape.

### GET `/api/v1/users/<id>/followers/` and `/following/`

People who follow `<id>`, or whom `<id>` follows. Returns `data.people` (author summaries), up to 200, ordered by account id, newest account first. Not in follow-date order. `404` if the account is missing or deactivated.

### GET `/api/v1/users/me/followers/?q=<text>`

Your followers, filtered by name or username. Every word in `q` must match. Returns `data.followers` (author summaries plus `connection`), up to 20.

### GET `/api/v1/users/search/?q=<text>`

Find any active artist or production house by name, username, or production name. Your own account is excluded. Empty `q` returns no results. Returns `data.results` (author summaries), up to 20.

---

## Error codes

| `code` | HTTP | Meaning |
|---|---|---|
| `ok` | 200 / 201 | Success. |
| `validation_error` | 400 | Input failed validation. See `field_errors`. |
| `cannot_follow_self` | 400 | You tried to follow yourself. |
| `not_found` | 404 | Post, comment, or profile missing, hidden, or not yours to change. |

## Mobile checklist

1. Load `GET /posts/` for the home feed. Use `is_mine` to show edit and delete menus.
2. Like and comment are optimistic. Update counts from the response.
3. Use `connection` to choose the button on people lists (connect, pending, message).
4. Use `production_id` to route production house taps to their productions page.
5. Upload media as `multipart`. Show the 100 MB video limit before upload.
