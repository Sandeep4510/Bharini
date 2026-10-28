# Productions API

A production profile is the page of a production house or an individual producer/director. Each account can own one profile. Written for the Android and iOS apps.

Base URL: `/api/v1/productions/`

Every endpoint needs `Authorization: Bearer <access token>` (see the accounts API doc).

## Envelope

Successful responses:

```json
{ "code": "ok", "message": "...", "request_id": "", "data": { } }
```

Errors use the same envelope as the other apps, with a `code`:

```json
{ "code": "validation_error", "message": "Please fix the highlighted fields.", "request_id": "", "field_errors": { "name": ["This field may not be blank."] } }
```

| HTTP | `code` | When |
|---|---|---|
| 400 | `validation_error` | Bad fields. `field_errors` lists them. Also used for "already have a profile", under `field_errors.non_field_errors`. |
| 403 | `forbidden` | Editing a profile you do not own. |
| 404 | `not_found` | Unknown profile id. |

A missing or invalid token returns `401 {"detail": "..."}`, the same as the rest of the API.

## Profile object

```json
{
  "id": 3,
  "kind": "house",
  "name": "Kumar Films",
  "profile_picture": "https://.../media/productions/pictures/abc.jpg",
  "title_credits": [
    {
      "id": 12,
      "name": "Night Train",
      "kind": "movie",
      "release_year": 2024,
      "poster": "https://.../media/productions/posters/night.jpg",
      "role": "made"
    }
  ],
  "is_owner": true,
  "created_at": "2026-10-28T10:00:00+05:30",
  "owner_id": 7,
  "follower_count": 120,
  "following_count": 4,
  "is_following": false,
  "connection": "none"
}
```

| Field | Notes |
|---|---|
| `kind` | `house` (Production House) or `individual`. |
| `name` | Required on create. Max 150 characters. Cannot be blank on update. |
| `profile_picture` | Optional image URL, or `null`/empty when not set. |
| `title_credits` | Titles linked to this production. Read only. Added by staff in the Django admin, not through this API. |
| `title_credits[].role` | `made` (produced it) or `part_of` (took part in it). |
| `title_credits[].release_year` | May be `null`. |
| `is_owner` | `true` when the signed-in user owns this profile. |
| `owner_id` | The user who owns the profile. Read only. |
| `follower_count`, `following_count`, `is_following` | Follow counts of the **owner's account**, the same follows used for artists. |
| `connection` | `none`, `pending_sent`, `pending_received` or `connected`, seen from your side. Always `none` on your own profile. See the connections API doc for what each value means. |

---

## Create your profile

### POST `/api/v1/productions/`

Body (JSON):

```json
{ "name": "Kumar Films", "kind": "house" }
```

`profile_picture` can be sent as a multipart file instead of JSON.

Responses:
- `201` with the profile object (`is_owner: true`).
- `400` if `name` or `kind` is missing, `kind` is not `house` or `individual`, or `name` is over 150 characters. Also `400` when you already have a profile. The `message` is "You already have a production profile.".
- `400` if `profile_picture` is not an image.
- `401` without a token.

Each account can have one profile. Creating a second one is refused.

## Get my profile

### GET `/api/v1/productions/me/`

Returns your own profile.

- `200` with the profile object when you have one.
- `200` with `"data": null` when you have none. Use this to decide whether to show the "Create production" screen. Treat `null` as "no profile yet", not as an error.

## Get a profile

### GET `/api/v1/productions/<id>/`

Any signed-in user can view any profile.

- `200` with the profile object.
- `404` for an unknown id.

## Edit a profile

### PATCH `/api/v1/productions/<id>/`

Partial update. Send only the fields you change, for example `{ "name": "Kumar Studios" }`.

- Only the owner can edit. Other users get `403` with `code: "forbidden"`, `message: "Only the owner can edit this profile."`.
- `owner_id`, `id`, `is_owner` and the counts cannot be changed. They are ignored.
- `400` for a blank `name`, an unknown `kind`, or a non-image `profile_picture`.
- `404` for an unknown id.

`PUT` is not supported. Use `PATCH`.

---

## Production posts

The feed of a production's posts is documented in the production posts API doc, at `GET /api/v1/productions/<id>/posts/`.
