# Profiles API

Base URL: `/api/v1/profile/`. Written for the Android and iOS apps.

Only artist accounts (`role: artist`) can edit a profile. Other roles get `403`. Every endpoint needs `Authorization: Bearer <access token>` (see the accounts API doc).

## Envelope

Success and error responses use the same envelope as the accounts API:

```json
{ "code": "ok", "message": "...", "request_id": "", "data": { } }
```

Invalid input returns `400` with `code: "validation_error"` and `field_errors` (field name to list of messages). Login-required and throttle responses use DRF's default body (`{"detail": "..."}`); check the HTTP status first.

## Uploads

Photos, media, and documents use `multipart/form-data`. Everything else uses `application/json`.

Uploads are checked on the server, not by file name. Photos are re-encoded to JPEG, which also strips EXIF data such as GPS location.

## Media slots

Each discipline gets fixed upload slots. `GET /` returns them under `media_slots`, so clients should render from the response and not hardcode them.

| Discipline | Slots | Type | Max length | Max size |
|---|---|---|---|---|
| `actor` | `love`, `laughter`, `sorrow`, `anger`, `courage`, `fear`, `disgust`, `wonder`, `peace` | video | 10 s | 30 MB |
| `singer` | `video_1`–`video_5`, `audio_1`–`audio_5` | video 60 s / audio 180 s | | 100 MB / 40 MB |
| `musician` | `video_1`–`video_5`, `audio_1`–`audio_5` | video 60 s / audio 180 s | | 100 MB / 40 MB |
| `choreographer` | `video_1`–`video_5` | video | 120 s | 200 MB |
| `director` | `reel_1`–`reel_3` | video | 120 s | 200 MB |
| `cinematographer` | `image_1`–`image_5` | image | | 8 MB |
| `cinematographer` | `video_1`–`video_5` | video | 30 s | 60 MB |

- Video: `.mp4`, `.mov`, `.webm`. Audio: `.mp3`, `.m4a`, `.wav`, `.ogg`, `.flac`. Images: JPG, PNG, or WebP.
- A slot can only be filled if its discipline is in `disciplines`. Otherwise: `400` `discipline_not_selected`.
- Actors have 9 emotion slots. Clip length is checked on upload.

---

## GET `options/`

Lists the choices for dropdowns. Use this instead of hardcoding them.

Response `data`: `disciplines`, `genders`, `languages`, `language_levels`, `document_kinds`. Each item is `{ "value": "...", "label": "..." }`.

---

## GET `/`

Returns the current user's profile. Creates an empty profile on first call.

Response `data`:
```json
{
  "username": "asha.rao",
  "disciplines": ["actor"],
  "profile_photo": "https://.../media/artists/7/photos/ab12.jpg",
  "bio": "Theatre actor from Mangaluru.",
  "gender": "female",
  "date_of_birth": "1998-04-12",
  "height_cm": 165,
  "location": "Mangaluru, Karnataka",
  "phone": "+919876543210",
  "alt_email": "asha.alt@example.com",
  "alt_email_verified": false,
  "instagram_url": "",
  "facebook_url": "",
  "showreel_links": [],
  "languages": [{ "language": "kannada", "level": "native" }],
  "documents": [{ "id": 3, "kind": "certificate", "title": "Diploma", "file": "https://...", "uploaded_at": "..." }],
  "photos": { "center": null, "left": null, "right": null, "full_length": null },
  "media_slots": [
    {
      "discipline": "actor",
      "label": "Actor",
      "slots": [
        { "key": "love", "label": "Love", "kind": "video", "max_seconds": 10, "max_mb": 30,
          "file": { "url": "https://...", "duration_seconds": 4.2 } }
      ]
    }
  ],
  "missing_fields": ["height_cm"],
  "onboarding_complete": false,
  "completion_percent": 35
}
```

- `file` is `null` until something is uploaded for that slot.
- `missing_fields` lists what blocks onboarding: `username`, `profile_photo`, `bio`, `gender`, `date_of_birth`, `location`, `phone`, `disciplines`, `height_cm` (actors only), `languages`.
- `onboarding_complete` is true when `missing_fields` is empty.
- `completion_percent` counts required fields, casting photos (actors and choreographers), and media slots. Use it for the progress bar.

---

## PATCH `/`

Partial update. Send only the fields you change. Use `multipart` when sending `profile_photo`, otherwise `json`. Returns the full profile.

| Field | Type | Rules |
|---|---|---|
| `username` | string | 3–30 chars, lowercase letters, digits, `.` or `_`. Stored lowercase. Must be unique. Send `""` to clear. |
| `disciplines` | string[] | At least one. Values from `options/`. Duplicates are removed. |
| `profile_photo` | file | Face is checked. Max 8 MB. Re-encoded. Old file is deleted on replace. |
| `bio` | string | Max 1000 chars. |
| `gender` | string | `male`, `female`, `non_binary`. |
| `date_of_birth` | `YYYY-MM-DD` | Before today, on or after 1900-01-01. |
| `height_cm` | int | 50–250. Required when `actor` is in `disciplines`. |
| `location` | string | Max 100 chars, e.g. `Mangaluru, Karnataka`. |
| `phone` | string | Indian mobile: `+91` followed by 10 digits, first digit 6–9. |
| `alt_email` | email | Must differ from the login email. Changing it resets verification. |
| `instagram_url` | URL | Host must be `instagram.com`. |
| `facebook_url` | URL | Host must be `facebook.com` or `fb.com`. |
| `showreel_links` | URL[] | Up to 5. Host must be YouTube, Vimeo, or Google Drive. |

Errors come back in `field_errors`, e.g. `{"phone": ["Enter a 10-digit Indian mobile number."]}`.

---

## GET `username-check/?username=<name>`

Checks a username before the user saves it.

Response `data`: `username` (normalized), `available` (bool), `suggestions` (up to 4 free names when taken, empty when available).

Use this to show suggestions as the user types. Still handle `username_taken` on save: someone else can claim the name in the meantime.

---

## PUT `languages/`

Replaces the full language list. Send at least one item. Each language can appear once.

Request:
```json
{ "languages": [{ "language": "hindi", "level": "fluent" }, { "language": "english", "level": "basic" }] }
```

- `language`: from `options/`, e.g. `hindi`, `english`, `kannada`.
- `level`: `native`, `fluent`, `conversational`, `basic`.

Returns the full profile.

---

## PUT `photos/<slot>/`

Uploads a casting photo. `slot` is `center`, `left`, `right`, or `full_length`. Multipart field: `file`.

Face checks: `left` and `right` need a side profile or a three-quarter view. `full_length` needs a visible face. `center` needs a face, and only one person may be visible. Returns the full profile.

Unknown slot: `404` `not_found`. Missing file: `400` `validation_error`. Bad image: `400` `invalid_upload`.

## DELETE `photos/<slot>/`

Removes a casting photo. Returns the full profile.

---

## PUT `media/<discipline>/<slot_key>/`

Uploads a portfolio file for one slot. Multipart field: `file`. Replaces any file already in that slot. Returns the full profile.

Errors:
- `400` `discipline_not_selected`: add the discipline first.
- `404` `not_found`: unknown discipline or slot key.
- `400` `invalid_upload`: wrong type, too long, too large, or unreadable. The `message` gives the reason.

## DELETE `media/<discipline>/<slot_key>/`

Removes the file in that slot. Returns the full profile.

---

## POST `documents/`

Adds a certificate or achievement. Multipart fields: `kind` (`certificate` or `achievement`), `title` (max 120 chars), `file`.

- File: PDF, JPG, PNG, or WebP. Max 10 MB. The content is checked, not only the extension.
- Limit: 20 documents per profile. Above that, `400` `document_limit`.

Returns the full profile.

## DELETE `documents/<id>/`

Deletes one document. Returns the full profile. Documents owned by other artists are not deleted, and the response is still `200`.

---

## POST `alt-email/send-pin/`

Emails a 6-digit PIN to `alt_email`. The PIN expires in 10 minutes. Throttle: 5 requests per minute per user.

- No `alt_email` saved: `400` `validation_error`.
- Already verified: `200` with message "This email is already verified." No email sent.
- Throttled: `429` with `detail`.

## POST `alt-email/verify/`

Request: `{ "pin": "123456" }`.

- Correct PIN: `200`, and `alt_email_verified` becomes `true`.
- Wrong PIN: `400` `invalid_pin`. The attempt counter goes up. After 5 wrong tries, the PIN is dead.
- Expired, never sent, or too many attempts: `400` `pin_expired`. Request a new PIN.
- Malformed PIN (not 6 digits): `400` `validation_error`.

---

## Error codes

| `code` | HTTP | Meaning |
|---|---|---|
| `ok` | 200 | Success. |
| `validation_error` | 400 | Input failed validation. See `field_errors`. |
| `invalid_upload` | 400 | File failed type, size, duration, or content checks. `message` says why. |
| `discipline_not_selected` | 400 | Uploading to a discipline not in `disciplines`. |
| `document_limit` | 400 | More than 20 documents. |
| `invalid_pin` | 400 | Wrong PIN. |
| `pin_expired` | 400 | PIN expired, never sent, or too many attempts. |
| `not_found` | 404 | Unknown photo slot, media discipline, or slot key. |

Non-artist accounts get `403` on every endpoint in this doc. Anonymous requests get `401`.

## Mobile checklist

1. Call `options/` once and cache it.
2. Load `GET /` after sign-in. Show `missing_fields` and `completion_percent`.
3. Use `username-check/` as the user types, with a debounce.
4. Upload media with multipart, one slot at a time. Show progress per slot.
5. Each upload response is the full profile, so you can replace local state with it.
6. Handle `429` by waiting for the `detail` seconds before retrying.
