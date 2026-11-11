# Notifications API

All under `/api/v1/notifications/`, signed in. Every response uses the usual envelope.

`push.notify(users, kind, title, body, data, actor=None)` is the one entry point:
- It saves a row in each user's in-app list (every kind except `messages`, which have the chat unread badge).
- It then sends an Expo push after the transaction commits, unless the user muted that kind.
- Settings mute the push only; the list keeps everything.

Kinds: `likes`, `comments`, `follows`, `connections`, `casting`, `messages`.

| Method | Path | What it does |
|---|---|---|
| POST / DELETE | `devices/` | Register or remove this phone's Expo push token: `{token, platform}`. |
| GET / PATCH | `settings/` | Per-kind push switches: `{messages, connections, follows, casting, likes, comments}`, all booleans. |
| GET | `list/` | The newest 50: `{notifications: [{id, kind, title, body, data, actor, read, created_at}]}`. `actor` is a user summary, or null for casting calls. Blocked accounts are left out. |
| GET | `unread-count/` | `{unread}` |
| POST | `read/` | Mark all read. |

`data` is the routing payload, also sent in the push: `post_id` (likes, comments, casting) or `user_id` (follows, connections).

Old rows: `manage.py prune_notifications [--days 90]` deletes them. Run it daily.
