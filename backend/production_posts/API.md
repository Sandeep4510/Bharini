# Production Posts API

Posts from production houses. Right now every post is a **casting call**: a role that producers are looking to fill. Artists browse them, like them, share them and comment. Written for the Android and iOS apps.

Base URL: `/api/v1/feed/` (plus `/api/v1/productions/<id>/posts/`)

Every endpoint needs `Authorization: Bearer <access token>`. Anonymous requests get `401 {"detail": "..."}`.

## Envelope

Successful responses:

```json
{ "code": "ok", "message": "...", "request_id": "", "data": { } }
```

Errors use the same envelope as the other apps:

```json
{ "code": "validation_error", "message": "Please fix the highlighted fields.", "request_id": "", "field_errors": { "casting": ["Casting details are required for a casting call."] } }
```

| HTTP | `code` | When |
|---|---|---|
| 400 | `validation_error` | Bad fields. `field_errors` lists them. |
| 403 | `forbidden` | Publishing when you do not own a production profile. |
| 404 | `not_found` | Unknown post or production id. |

A missing or invalid token returns `401 {"detail": "..."}`, the same as the rest of the API.

## Pagination

Feeds use cursor pagination. `data` looks like this:

```json
{ "next": "https://.../api/v1/feed/?cursor=cD0...", "previous": null, "results": [ ] }
```

- Pass the `next` URL as-is to get the next page. Stop when `next` is `null`.
- Feed: 20 posts per page, newest first.
- Comments: 50 per page, oldest first.
- Do not build cursors yourself.

## Post object

```json
{
  "id": 41,
  "post_type": "casting_call",
  "body": "Lead role in a Tamil serial #Casting #Tamil",
  "image": "https://.../media/casting/9f2c.jpg",
  "hashtags": ["casting", "tamil"],
  "share_count": 3,
  "like_count": 12,
  "comment_count": 4,
  "is_liked": false,
  "casting": {
    "age_min": 20,
    "age_max": 30,
    "gender": "female",
    "languages": "Hindi, Tamil",
    "location": "Chennai",
    "approx_pay": "50k per day"
  },
  "production": { "id": 3, "name": "Kumar Films", "kind": "house", "profile_picture": null },
  "created_at": "2026-10-28T10:00:00+05:30"
}
```

| Field | Notes |
|---|---|
| `post_type` | Always `casting_call` for now. Sending `update` is refused. |
| `body` | Required. 1 to 2000 characters. |
| `image` | Optional. Absolute URL, or `null`. |
| `hashtags` | Read only. Taken from `#tags` in `body`, lowercase, no duplicates, in order of first use. Set by the server. |
| `share_count`, `like_count`, `comment_count` | Read only counts. |
| `is_liked` | `true` if you liked this post. Per viewer. |
| `casting` | Required on create. See below. |
| `production` | Summary of the production that posted it. |

### Casting details

| Field | Rule |
|---|---|
| `age_min`, `age_max` | Non-negative integers. `age_min` must be less than or equal to `age_max`. |
| `gender` | `any` (default), `male`, `female` or `other`. |
| `languages` | Required text, max 200 characters. |
| `location` | Required text, max 200 characters. Used to rank opportunities by city. |
| `approx_pay` | Required text, max 200 characters. Free text, for example `"50k per day"`. |

---

## Feed

### GET `/api/v1/feed/`

All posts from all productions, newest first. Paginated (see above).

- `200` with a paginated list of post objects.

### POST `/api/v1/feed/`

Publish a casting call. Only the owner of a production profile can post. See the productions API doc to create a profile first.

JSON body:

```json
{
  "post_type": "casting_call",
  "body": "Looking for a lead actress #Casting",
  "casting": {
    "age_min": 20, "age_max": 30, "gender": "female",
    "languages": "Hindi", "location": "Mumbai", "approx_pay": "Paid"
  }
}
```

Multipart body (when you attach an image). Send `casting` as a JSON string, because multipart cannot nest objects:

```
post_type=casting_call
body=Poster call
image=<file>
casting={"age_min":20,"age_max":30,"gender":"any","languages":"Hindi","location":"Mumbai","approx_pay":"Paid"}
```

- `201` with the post object.
- `400` (`validation_error`) for a missing `casting`, a `casting` that is not a JSON object, bad casting values, `age_min > age_max`, an empty or over-long `body`, or an image that is not a valid picture.
- `403` with `code: "forbidden"` if you do not own a production profile.
- `401` without a token.

Images are re-encoded on upload. This removes EXIF data such as GPS location.

## Opportunities

### GET `/api/v1/feed/opportunities/`

Casting calls for the home screen. Up to 20 posts.

- Calls whose `casting.location` contains your city come first. Your city is the part of your artist profile location before the first comma, matched without case sensitivity. For example, "Mangaluru, Karnataka" gives "mangaluru".
- Then the rest, newest first.
- Each item is a post object plus `near_you: true|false`.
- If you have no artist location, `near_you` is `false` for every item.

```json
{ "code": "ok", "message": "Opportunities.", "request_id": "", "data": { "posts": [ { "...": "post object", "near_you": true } ] } }
```

---

## Likes

### POST `/api/v1/feed/<id>/like/`

Like a post. Liking twice has no extra effect.

```json
{ "code": "ok", "message": "Post liked.", "request_id": "", "data": { "like_count": 12, "is_liked": true } }
```

`404` for an unknown post.

### DELETE `/api/v1/feed/<id>/like/`

Remove your like. Safe to call when you have not liked the post.

```json
{ "code": "ok", "message": "Like removed.", "request_id": "", "data": { "like_count": 11, "is_liked": false } }
```

`404` for an unknown post.

## Shares

### POST `/api/v1/feed/<id>/share/`

Counts one share. Every call adds one. Send it when the user taps Share.

```json
{ "code": "ok", "message": "Post shared.", "request_id": "", "data": { "share_count": 4 } }
```

`404` for an unknown post.

## Comments

### GET `/api/v1/feed/<id>/comments/`

Comments on a post, oldest first, 50 per page.

Each item:

```json
{ "id": 9, "body": "Interested!", "author_name": "Asha Rao", "created_at": "2026-10-28T10:05:00+05:30" }
```

`author_name` is the author's full name. `404` for an unknown post.

### POST `/api/v1/feed/<id>/comments/`

```json
{ "body": "Interested!" }
```

- `201` with the new comment.
- `400` if `body` is empty or over 500 characters.
- `404` for an unknown post.

---

## Production feed

### GET `/api/v1/productions/<id>/posts/`

Posts from one production, newest first. Same post object and pagination as the main feed. Use it on the production's profile page.

`404` for an unknown production id.
