# Bharini: Product, System Design, and Delivery Plan

## Executive direction

Bharini should begin as a **modular monolith**, not a set of microservices: one Django/DRF codebase, one PostgreSQL database, one Next.js web application, and one Flutter mobile application sharing a versioned REST API. This gives a small team clear module boundaries without the deployment, tracing, data-consistency, and local-development overhead of microservices.

The first release should optimize for one complete business journey: **a verified production house publishes a casting call, a discoverable artist finds it, applies with a selected portfolio, and both sides can communicate safely**. Generic social-media behavior is secondary; likes, comments, and sharing may support discovery, but they must not displace casting search, applications, profile quality, verification, and moderation.

Recommended planning assumption: a 2–3 developer team, a 12–16 week MVP, and deployment to GCP in `asia-south1`. The user already has Django and GCP experience, so Django/DRF and managed GCP services reduce context switching while preserving a clean path to scale.

## Product definition

### User roles

| Role | Primary goal | Important permissions |
|---|---|---|
| Artist | Build a credible portfolio and find work | Manage own profile/media, search opportunities, apply, message authorized contacts |
| Production house | Discover talent and fill roles | Manage organization page, publish casting calls, search artists, review applications, start conversations |
| Organization member | Work on behalf of a production house | Permissions based on organization role: owner, recruiter, reviewer |
| Moderator | Keep content genuine and safe | Review reports, media, casting calls, and verification evidence |
| Administrator | Operate the platform | User suspension, taxonomy management, audit access, feature controls |

Do not implement separate authentication tables for artists and production houses. Use one custom Django `User` model from the first migration, then attach artist profiles and organization memberships to it. A user may later be both an artist and a member of a production house, which this model supports without duplicate accounts.

### MVP boundary

| Include in MVP | Defer until evidence supports it |
|---|---|
| Registration, login, logout, email/phone verification, password reset | Social login beyond one high-value provider |
| Artist profile, structured attributes, skills, languages, credits, availability | AI-based casting recommendations |
| Up to 15 images and eight emotion/performance videos | Live streaming and reels-style feed |
| Production-house page and verification workflow | Subscription billing and paid promotion |
| Casting-call creation, moderation, search, expiry, and status | Complex audition scheduling/calendar sync |
| Search and filters for artists and casting calls | Dedicated search cluster |
| Apply, withdraw, shortlist, reject, and application status | Automated candidate ranking |
| Save/bookmark, like, comment, share-link | Complex feed-ranking algorithm |
| Basic one-to-one messaging and unread counts | Voice/video calling, group chat, disappearing messages |
| In-app and email notifications | Full push-notification orchestration at first web release |
| Report/block, admin moderation, audit trail | Automated moderation as the sole decision-maker |

The original brief does not explicitly list **applications**, but it is the transaction that closes the marketplace loop. Without it, Bharini risks becoming another profile-and-post feed rather than a casting platform.

### Core journeys

1. **Artist onboarding:** register → verify contact → choose artist type → complete structured profile → upload portfolio → submit for verification/publish.
2. **Production onboarding:** register → create organization → add business details and proof → moderator review → invite team members.
3. **Casting:** verified organization creates a draft → adds role requirements and deadline → publishes → candidates discover and apply → recruiter shortlists/rejects/closes.
4. **Discovery:** search by profession, skills, location, languages, age range, experience, availability, and verified status → open portfolio → save or contact when policy permits.
5. **Messaging:** an application, accepted connection, or recruiter privilege opens a conversation → messages persist → unread notifications update → participants can block/report.
6. **Moderation:** user reports a profile, casting call, comment, or message → a moderation case is created → moderator records action and reason → audit event remains immutable.

### Product rules

- Store date of birth privately and expose only an age or age band when appropriate.
- Make height, weight, complexion, gender, and similar casting attributes configurable and optional where possible; document why each field exists and let the artist control visibility.
- Require a closing date, location/work mode, compensation visibility, role description, eligibility criteria, and contact policy for each casting call.
- Only verified organizations should receive unrestricted artist-search and outreach privileges.
- Rate-limit unsolicited messages, comments, applications, password attempts, and verification requests.
- Keep soft-delete and moderation states separate from public visibility: `draft`, `pending_review`, `published`, `rejected`, `suspended`, and `archived`.

## Technology choices

| Layer | Recommendation | Reason |
|---|---|---|
| Web | Next.js with TypeScript | It remains React but adds conventions for routing, rendering, data fetching, caching, and build tooling rather than requiring the team to assemble them independently.[^1] |
| Mobile | Flutter | It supports Android and iOS from a shared codebase; platform-specific setup is still required, especially macOS/Xcode for iOS builds.[^2][^3] |
| API | Django + Django REST Framework | Fits the chosen stack, supports mature ORM/admin/auth patterns, and enables explicit authentication, permission, and throttling policies.[^4][^5] |
| Realtime | Django Channels + Redis | Channels communicates across application instances; its production Redis channel layer supports distributed and sharded configurations.[^6] |
| Primary database | PostgreSQL | Strong relational fit for users, organizations, casting roles, applications, and conversations; built-in full-text search and GIN indexes are sufficient for MVP discovery.[^7][^8] |
| Cache/realtime | Redis / Memorystore | Cache hot reads, counters, rate-limit state, and distribute WebSocket events across API instances.[^9][^10] |
| Media | Cloud Storage | Keep binaries out of PostgreSQL and use short-lived signed URLs for controlled read/write access.[^11] |
| Async work | Cloud Tasks plus a private worker endpoint | Managed queues move email, notifications, thumbnails, and cleanup outside request latency.[^12] |
| Video processing | Transcoder API when standardized/adaptive output is needed | It can produce MP4, HLS, and MPEG-DASH renditions for web and mobile delivery.[^13][^14] |
| Runtime | Cloud Run | Container-based deployment with autoscaling; WebSockets are supported but clients must reconnect because streams remain subject to request timeouts.[^9] |
| Managed database | Cloud SQL for PostgreSQL | Start zonal for a cost-sensitive beta; enable regional HA, backups, and point-in-time recovery before a business-critical launch.[^15][^16] |
| Secrets | Secret Manager | Cloud Run can mount secrets or expose pinned versions as environment variables through the runtime service identity.[^17] |
| Infrastructure | Terraform | Repeatable dev, staging, and production environments with reviewed infrastructure changes |
| CI/CD | GitHub Actions + Artifact Registry | Test, scan, build immutable images, run migrations, and deploy revisions |

### Why not a React SPA alone?

A plain React SPA can work, but Bharini has public-facing artist and casting pages that benefit from stable routes, metadata, server rendering, and search-engine discoverability. Next.js supplies these conventions while retaining React, so it is a better default for the web client.[^1]

### Why not Flutter web?

Flutter is a strong choice for the mobile clients, but the public web product should prioritize accessible document-like pages, SEO, link previews, and conventional browser behavior. Keep Next.js for web and Flutter for Android/iOS; share API contracts and design tokens rather than trying to share UI code between these fundamentally different surfaces.

## Logical architecture

```text
 Web browser                 Android / iOS
 Next.js                     Flutter
      | HTTPS / REST             | HTTPS / REST
      | WebSocket                | WebSocket
      +-------------+------------+
                    |
             HTTPS Load Balancer
             Cloud Armor / CDN
                    |
        +-----------+------------+
        |                        |
 Next.js Cloud Run         Django ASGI Cloud Run
 web service               REST + WebSockets
                                 |
              +------------------+------------------+
              |                  |                  |
       Cloud SQL/Postgres   Memorystore/Redis  Cloud Storage
       source of truth      cache + channels    images/videos
              |                  |                  |
              +------------ Cloud Tasks -----------+
                              worker service
                       email / media / notifications
                                 |
                         Transcoder API (video)

 Supporting plane: Secret Manager, Artifact Registry, Cloud Logging,
 Monitoring, Error Reporting/Sentry, Terraform, GitHub Actions
```

Cloud Run supports WebSockets without special protocol configuration, but a connection is still an HTTP request subject to the configured timeout. Clients therefore need heartbeat, exponential-backoff reconnection, and resubscription; Redis synchronizes events between instances.[^9][^10]

### Architectural rules

- **PostgreSQL is authoritative.** Redis may cache and distribute but must not be the only store for messages, applications, permissions, or moderation actions.
- **Clients never upload large files through Django.** The API validates intent and issues a short-lived signed upload URL; the client uploads directly to Cloud Storage.[^11]
- **Async work is idempotent.** Every task has a stable idempotency key and can be retried without duplicate email, media, or notification records.
- **Every protected query is scoped server-side.** Never rely on a hidden UI control to prevent access.
- **REST is the business interface; WebSocket is a delivery optimization.** Message history and unread state remain available over REST after reconnect.
- **Modules communicate through service functions and domain events.** They must not freely modify one another's tables.

## Django module design

```text
backend/
  config/              settings, ASGI, URLs, logging
  apps/
    accounts/          custom User, credentials, sessions/tokens
    profiles/          artist profile, skills, languages, credits
    organizations/     production houses, membership, verification
    media/             assets, upload sessions, moderation, renditions
    casting/           casting calls, roles, applications, shortlists
    social/            posts, likes, comments, bookmarks, shares
    messaging/         conversations, participants, messages, receipts
    notifications/     in-app/email/push preferences and deliveries
    moderation/        reports, cases, decisions, blocks
    taxonomy/          professions, skills, languages, locations
    audit/             security and administrative events
  api/v1/              routers and API schemas
  common/              base models, permissions, pagination, exceptions
```

This remains one deployable application. Module boundaries make it possible to extract media processing, messaging, or search later only when measured load or team ownership justifies it.

## Data model

### Principal entities

| Domain | Core tables | Key relationships and constraints |
|---|---|---|
| Identity | `users`, `auth_identities`, `refresh_sessions` | Unique normalized email/phone; token/session revocation metadata |
| Artist | `artist_profiles`, `profile_skills`, `profile_languages`, `credits`, `availability` | One artist profile per user; normalized many-to-many taxonomies |
| Organization | `organizations`, `organization_members`, `verification_requests` | Membership unique by organization/user; role-based permissions |
| Media | `media_assets`, `media_renditions`, `portfolio_items`, `upload_sessions` | Owner, purpose, storage key, checksum, status, sort order; enforce portfolio limits transactionally |
| Casting | `casting_calls`, `casting_roles`, `applications`, `application_events`, `saved_castings` | One application per artist/role unless reapplication is explicitly supported |
| Social | `posts`, `comments`, `reactions`, `shares` | Generic target references should be constrained; prefer explicit foreign keys where practical |
| Messaging | `conversations`, `conversation_participants`, `messages`, `message_receipts` | Participant authorization on every read/write; server-generated sequence/order |
| Moderation | `reports`, `moderation_cases`, `moderation_actions`, `user_blocks` | Preserve actor, reason, timestamps, and before/after state |
| Notification | `notifications`, `notification_preferences`, `delivery_attempts` | Unique event-recipient key prevents duplicates |
| Operations | `audit_events`, `outbox_events`, `feature_flags` | Append-only security events and reliable event publication |

### Important indexes

- `artist_profiles(status, city_id, profession_id)` and selective indexes for verified/public profiles.
- GIN indexes for profile and casting full-text vectors; PostgreSQL supports precomputed `tsvector` columns and GIN indexes for faster text search.[^7][^8]
- `casting_calls(status, published_at DESC)` and `casting_roles(deadline, status)`.
- Unique `applications(artist_id, casting_role_id)`.
- `messages(conversation_id, created_at, id)` for keyset pagination.
- `notifications(user_id, read_at, created_at DESC)`.
- Unique reaction constraints such as `(user_id, post_id, reaction_type)`.

Use UUID or ULID public identifiers so sequential internal IDs are not exposed. This does not replace authorization; OWASP identifies object-level, property-level, and function-level authorization as distinct API risks.[^18][^19]

## REST API shape

Publish an OpenAPI contract for `/api/v1`. Generate a TypeScript client and a Dart client from the same contract where practical, but keep generated code behind a small application-specific client layer.

### Endpoint groups

```text
POST   /api/v1/auth/register
POST   /api/v1/auth/login
POST   /api/v1/auth/refresh
POST   /api/v1/auth/logout
POST   /api/v1/auth/verify
POST   /api/v1/auth/password/reset

GET    /api/v1/me
PATCH  /api/v1/me
GET    /api/v1/artists
GET    /api/v1/artists/{artist_id}
PATCH  /api/v1/artists/{artist_id}

POST   /api/v1/media/upload-sessions
POST   /api/v1/media/{media_id}/complete
DELETE /api/v1/media/{media_id}

POST   /api/v1/organizations
GET    /api/v1/organizations/{organization_id}
PATCH  /api/v1/organizations/{organization_id}
POST   /api/v1/organizations/{organization_id}/members
POST   /api/v1/organizations/{organization_id}/verification

GET    /api/v1/casting-calls
POST   /api/v1/casting-calls
GET    /api/v1/casting-calls/{casting_id}
PATCH  /api/v1/casting-calls/{casting_id}
POST   /api/v1/casting-roles/{role_id}/applications
GET    /api/v1/casting-roles/{role_id}/applications
PATCH  /api/v1/applications/{application_id}/status

POST   /api/v1/posts/{post_id}/reactions
GET    /api/v1/posts/{post_id}/comments
POST   /api/v1/posts/{post_id}/comments
POST   /api/v1/bookmarks

GET    /api/v1/conversations
POST   /api/v1/conversations
GET    /api/v1/conversations/{conversation_id}/messages
POST   /api/v1/conversations/{conversation_id}/messages
WS     /ws/v1/conversations

GET    /api/v1/notifications
POST   /api/v1/notifications/read
POST   /api/v1/reports
POST   /api/v1/blocks
```

### API conventions

- Return a consistent error envelope: `code`, `message`, `field_errors`, `request_id`.
- Use cursor/keyset pagination for feeds, search results, messages, and notifications.
- Accept `Idempotency-Key` for applications, messages, and other retry-sensitive creates.
- Use explicit serializer fields; never expose Django models wholesale.
- Apply object-level permission checks after authentication. DRF authentication only identifies credentials; authorization still requires permission policy.[^5]
- Throttle anonymous and authenticated traffic differently, but do not treat DRF throttling as DDoS or brute-force protection; its documentation describes it as policy/basic overuse control rather than a security boundary.[^4]
- Maintain OpenAPI deprecation metadata and an endpoint inventory because improper API inventory is itself an OWASP risk.[^18]

## Authentication and authorization

Use short-lived access tokens and rotating refresh sessions. Store the web refresh token in a `Secure`, `HttpOnly`, `SameSite` cookie; store mobile credentials in OS-provided secure storage. Record refresh-session family, device label, creation time, last use, expiry, revocation, and hashed token identifier so logout and compromised-session invalidation are possible.

Suggested permission matrix:

| Action | Artist | Verified production member | Moderator/Admin |
|---|---:|---:|---:|
| Edit own artist profile | Yes | If same user also owns profile | Override with audit |
| Publish casting call | No | Yes, by organization role | Review/suspend |
| View public artist fields | Yes | Yes | Yes |
| View restricted contact fields | Own only | According to consent/outreach policy | Only for legitimate moderation |
| Apply for role | Yes | No | No |
| Review role applications | No | Organization-scoped | Yes with audit |
| Start unsolicited conversation | Restricted | Rate-limited and verified only | No routine use |
| Resolve reports | No | No | Yes |

Authorize by object ownership and organization membership at the queryset and service layers. OWASP specifically warns that endpoints accepting object identifiers are a broad object-level authorization surface, while complex role hierarchies can produce function-level authorization failures.[^19]

## Media pipeline

```text
1. Client asks API for an upload session with purpose, size, and MIME type.
2. API checks identity, quota, portfolio limits, and allowed type.
3. API creates `media_asset(status=pending)` and returns a short-lived signed URL.
4. Client uploads directly to a private quarantine bucket.
5. Client calls complete, or a storage event starts processing.
6. Worker verifies actual file signature, checksum, dimensions/duration, and malware status.
7. Image worker strips metadata, rewrites image, and creates thumbnail/web sizes.
8. Video worker standardizes codecs and creates poster/rendition outputs.
9. Moderation approves or rejects when required.
10. Asset changes to `ready`; API exposes controlled delivery URLs.
```

Signed URLs provide time-limited access to a specific Cloud Storage operation, but anyone possessing one can use it until expiry, so keep upload URLs short-lived and bind them to generated object keys. OWASP recommends an extension allowlist, actual file-type validation rather than trusting `Content-Type`, generated filenames, size limits, authorization, separate/out-of-webroot storage, and malware inspection.[^20][^21][^11]

Store media metadata—not video bytes—in PostgreSQL. Enforce the eight-video and 15-image limits in a database transaction to prevent concurrent uploads bypassing a simple count check. Strip image EXIF/location metadata by default, preserve original uploads privately only if there is a clear operational need, and define retention for rejected or abandoned uploads.

For the first beta, standard MP4 and responsive image renditions may be enough. Add HLS/DASH and Media CDN when playback telemetry shows buffering or geographic delivery needs; GCP's documented VOD path uses Cloud Storage, Transcoder API, and CDN-delivered renditions.[^13]

## Messaging design

- Persist each message before broadcasting it.
- Use REST for conversation creation, history, and reconciliation; use WebSockets for new-message, typing, presence, and read-state events.
- Allocate each message a client-generated idempotency key so reconnect/retry does not duplicate it.
- Use Redis channel groups keyed by conversation, but verify membership from PostgreSQL before joining.
- Store `last_read_message_id` per participant instead of a receipt row for every message unless detailed receipts become a hard requirement.
- Begin with text and controlled portfolio/casting references; defer arbitrary attachments.
- Add block/report flows at launch and prevent blocked users from creating or continuing conversations.

Django Channels' Redis layer is the production-supported mechanism for communication between distributed application instances. On Cloud Run, configure the WebSocket timeout, heartbeat, reconnection, and cross-instance synchronization explicitly.[^6][^9]

## Search and feed

Begin with PostgreSQL, not Elasticsearch/OpenSearch. Use structured SQL filters for location, language, age band, profession, skill, verified status, availability, and role status, then combine them with weighted PostgreSQL full-text ranking. PostgreSQL provides normalized `tsvector`/`tsquery` types, relevance ranking, and GIN indexing suitable for this first stage.[^22][^8][^7]

Use deterministic feed ordering in MVP:

- Relevant and still-open casting calls first.
- Followed/saved organization activity where applicable.
- Recently published verified content.
- Cursor based on `(rank, published_at, id)`.

Extract search only when telemetry shows PostgreSQL cannot meet relevance, typo tolerance, language, indexing latency, or latency targets. Define that migration behind a `SearchService` interface so API resources do not change.

## Security and privacy

### Mandatory controls

- Run all production traffic over HTTPS, disable `DEBUG`, validate hosts, isolate the database from public access, protect the production secret key, and configure logging. These are direct items in Django's deployment checklist.[^23]
- Check authorization for every object and writable field, not just the endpoint; OWASP's API list highlights broken object-, property-, and function-level authorization.[^19][^18]
- Apply request, payload, upload, query-complexity, message, and per-user quotas because unrestricted resource consumption can become both denial-of-service and cost exposure.[^19]
- Use Cloud Armor or an equivalent edge layer for coarse rate limits and abusive traffic; do not depend solely on DRF throttling.[^4]
- Keep buckets private, use signed URLs, validate uploads, rewrite images, scan files, and serve correct content types.[^21][^11][^20]
- Store secrets in Secret Manager, grant a dedicated runtime service account only necessary permissions, and avoid long-lived service-account JSON keys.[^17]
- Add CSP, HSTS, secure cookies, CSRF protection where cookies authenticate requests, strict CORS, and safe response headers.
- Log login, refresh, password reset, organization membership, verification, moderation, export, and administrative access without logging tokens or message bodies.
- Encrypt in transit and at rest, document retention/deletion, support account export/delete, and minimize collection of sensitive personal attributes.

### Trust and safety

Bharini's value proposition depends on genuine artists and legitimate opportunities. Build verification and moderation into the data model—not as an afterthought:

- Production-house verification evidence and decision history.
- Artist verification levels that distinguish contact verification, identity review, and professional evidence.
- Report reasons for scam, harassment, impersonation, discrimination, explicit content, copyright, and unsafe work requests.
- Moderator queues with assignment, SLA, evidence, decision, appeal, and audit event.
- Automated signals may prioritize a case but should not silently make high-impact final decisions.
- Public safety guidance and visible report/block controls.

## Environments and repositories

Recommended monorepo:

```text
bharini/
  backend/             Django/DRF/Channels
  web/                 Next.js/TypeScript
  mobile/              Flutter/Dart
  contracts/           OpenAPI, schemas, generated-client config
  infrastructure/      Terraform modules and environment stacks
  docs/                ADRs, diagrams, runbooks, API conventions
  .github/workflows/   CI/CD
  docker-compose.yml   PostgreSQL, Redis, local mail/storage emulator
```

Use separate GCP projects for at least `bharini-dev`, `bharini-staging`, and `bharini-prod`; do not simulate isolation only through name prefixes. Production access should be least-privilege, audited, and separate from everyday developer credentials.

Local development should run Django, Next.js, PostgreSQL, Redis, and a local object-storage substitute through Docker Compose. Flutter runs on an emulator/device and points to the local or dev API. Seed commands should create taxonomies and safe demonstration accounts without using production data.

## Delivery roadmap

### Phase 0: discovery — week 1

- Interview 5–10 artists and 3–5 casting/production users.
- Validate the casting application lifecycle, required profile fields, verification expectations, privacy concerns, and how opportunities are currently shared.
- Write one-page product goals, non-goals, personas, success metrics, and risk register.
- Produce wireframes for onboarding, artist profile, production page, casting creation/search/application, inbox, and moderation.
- Decide policy for sensitive casting attributes, minors, compensation, contact exposure, and content ownership.

**Exit gate:** clickable flow reviewed by representative users; MVP backlog prioritized; unresolved policy risks have owners.

### Phase 1: foundation — weeks 2–3

- Create monorepo, branching and pull-request policy, linters, formatters, pre-commit hooks, conventional migrations, and architecture decision records.
- Implement custom user model before the first production migration.
- Add environment-based settings, health/readiness endpoints, structured logs, request IDs, exception envelope, OpenAPI generation, Docker Compose, and test factories.
- Provision dev infrastructure with Terraform: Cloud Run, Cloud SQL, Storage, Secret Manager, Artifact Registry, and required service accounts.
- Build CI for linting, type checks, unit tests, migration checks, dependency scan, image build, and staging deployment.

**Exit gate:** an authenticated `/api/v1/me` call works from a minimal web page and Flutter shell in the dev environment.

### Phase 2: identity and profiles — weeks 4–6

- Registration, verification, login, refresh, logout, reset, session management, and role-aware permissions.
- Artist structured profile and taxonomies.
- Organization page, memberships, and verification request.
- Direct media upload pipeline, portfolio ordering, image variants, video validation/processing, and quotas.
- Admin and moderator interfaces for verification and media review.

**Exit gate:** an artist and production house can independently onboard, publish an approved page, and pass authorization tests.

### Phase 3: casting marketplace — weeks 7–9

- Casting-call and role authoring, drafts, review, publish, close, archive, and expiry jobs.
- Artist and casting search with filters and PostgreSQL indexes.
- Application creation, withdrawal, status timeline, shortlist/reject, and saved opportunities.
- Notifications and email templates for important lifecycle changes.

**Exit gate:** the complete publish → discover → apply → shortlist journey passes API, web, and mobile acceptance tests.

### Phase 4: engagement — weeks 10–11

- One-to-one conversations, message persistence, WebSocket delivery, unread state, reconnect/reconciliation, block/report.
- Minimal posts, comments, likes, bookmarks, and shareable links.
- Notification centre and user preferences.

**Exit gate:** messaging survives refresh, duplicate sends, multi-instance delivery, temporary network loss, and blocked-user scenarios.

### Phase 5: hardening — weeks 12–13

- Object/field/function authorization test matrix using multiple roles and organizations.
- Upload abuse, quota, rate-limit, malformed payload, token expiry/rotation, and account recovery tests.
- Query plans, N+1 detection, load tests for search, profile reads, applications, media completion, and messaging.
- Accessibility, responsive UI, slow-network/mobile testing, backup restore drill, and moderation runbook.
- Run `python manage.py check --deploy`; Django explicitly recommends production review of security, performance, operations, secrets, HTTPS, and logging.[^23]

**Exit gate:** no open critical/high security defect; performance objectives met; rollback and restore demonstrated.

### Phase 6: launch — week 14

- Seed production taxonomies and initial moderator/admin roles through audited commands.
- Deploy database migrations as a one-off job before routing traffic to the new revision.
- Run smoke tests against production, verify storage CORS, signed uploads, email, WebSockets, error alerts, dashboards, and backups.
- Start with invited organizations and artists; use feature flags and quotas.
- Hold daily launch review for errors, latency, failed uploads, user reports, conversion, and cost.

If there is only one developer, release **responsive web first** and start Flutter after the API and web journeys stabilize. Trying to deliver two clients, media, realtime messaging, and moderation concurrently is the largest schedule risk.

## Testing strategy

| Layer | What to test | Examples |
|---|---|---|
| Unit | Domain rules and permission decisions | Portfolio limits, age visibility, casting status transitions |
| API integration | Database, serializer, permissions, transactions | Cross-organization access, duplicate application, token rotation |
| Contract | OpenAPI compatibility with clients | Breaking field removal, enum changes, pagination envelope |
| Component/UI | Forms and state handling | Profile editor, media progress, casting filters |
| End-to-end | Critical journeys | Onboard → publish → search → apply → shortlist → message |
| Security | Abuse and isolation | BOLA/IDOR, mass assignment, rate limits, malicious uploads |
| Performance | Target workloads and queries | Search p95, profile p95, concurrent sockets, upload completion |
| Resilience | Dependency failure and retry | Redis loss, duplicate task delivery, WebSocket reconnect |
| Operations | Recovery | Point-in-time restore, rollback, secret rotation |

Set practical initial service objectives after baseline testing rather than inventing them. A reasonable starting design target is fast cached profile/search reads, asynchronous media/email work, no data loss after acknowledged message/application writes, and clear degraded behavior when Redis or the notification worker is unavailable.

## CI/CD and deployment

### Pull-request pipeline

1. Install pinned dependencies and restore caches.
2. Run Python/Ruff formatting and linting, mypy/pyright as selected, Django system checks, migration drift checks, and pytest.
3. Run TypeScript lint/type checks and web tests.
4. Run Dart analysis and Flutter tests.
5. Validate OpenAPI and check backward compatibility.
6. Scan dependencies, secrets, containers, and Terraform.
7. Build immutable images tagged with commit SHA.

### Staging pipeline

1. Push images to Artifact Registry.
2. Apply reviewed Terraform changes separately from application deployment.
3. Run database migration as a Cloud Run Job using the candidate image.
4. Deploy API and web revisions with no production traffic.
5. Run smoke and end-to-end tests.
6. Promote traffic if healthy; otherwise keep the previous revision active.

### Production pipeline

- Require approval and a change record.
- Back up before destructive migrations.
- Use expand/migrate/contract schema changes so old and new application revisions can overlap.
- Deploy migration job, API, worker, then web; deploy Flutter separately through store release tracks.
- Shift traffic gradually and watch errors, latency, database connections, queue age, and business health.
- Roll back application traffic quickly; roll database changes forward unless the migration is explicitly reversible.

Django production settings must keep `DEBUG` off, use a production-only secret, validate hosts, enforce HTTPS, isolate the database, and verify logging. Cloud Run should obtain secrets through Secret Manager using a dedicated service identity rather than embedding secrets in the image.[^17][^23]

## Operations

### Dashboards

- API request rate, p50/p95/p99 latency, 4xx/5xx rate, and endpoint breakdown.
- Cloud Run instance count, cold starts, CPU/memory, concurrency, and WebSocket connections.
- Cloud SQL connections, CPU, storage, slow queries, locks, replication/backup health.
- Redis memory, evictions, connection count, and channel errors.
- Cloud Tasks queue depth, oldest-task age, attempts, and dead-letter count.
- Upload starts/completions/failures, processing duration, rejected files, transcoding failures.
- Registrations, completed profiles, verified organizations, casting publications, applications, shortlists, and conversations.
- Reports, moderation backlog, action time, blocks, and suspected spam.

### Alerts and runbooks

Create actionable alerts for sustained 5xx errors, high latency, exhausted DB connections, task backlog, failed backup, media-processing failure spikes, and unusually high registration/message/application activity. Every page must link to a runbook containing impact, checks, mitigation, rollback, escalation, and post-incident steps.

### Backups

Enable automated backups and point-in-time recovery from the beginning. For a public launch where downtime materially affects the business, use regional Cloud SQL HA; regional instances automatically fail over to a secondary zone while retaining the same IP. Run restore drills—an untested backup is not a demonstrated recovery capability.[^15][^16]

## Success metrics

Focus on marketplace outcomes rather than vanity engagement:

| Funnel | Metric |
|---|---|
| Supply quality | Percentage of artists completing a publishable profile and approved portfolio |
| Demand quality | Verified production houses and approved casting calls per week |
| Matching | Search-to-profile-view and profile-view-to-application conversion |
| Marketplace result | Applications per valid role, shortlist rate, and time to first qualified application |
| Trust | Report rate, verified-organization coverage, moderation turnaround, scam removal time |
| Reliability | Successful upload rate, failed message rate, API availability, and p95 latency |
| Retention | Artists returning to apply and organizations returning to publish another role |

Do not optimize likes or raw screen time as primary goals. Bharini succeeds when credible opportunities and suitable artists find each other safely.

## Main risks

| Risk | Mitigation |
|---|---|
| Scope becomes “LinkedIn + Instagram + WhatsApp” | Define the casting transaction as the north star; defer advanced feed/calling/social features |
| Fake production houses or scam roles | Organization verification, moderation queue, reporting, audit trail, outreach limits |
| Sensitive profile information causes privacy or discrimination harm | Data minimization, optional fields, field-level visibility, consent, policy/legal review |
| Video storage and delivery cost grows quickly | Upload quotas, duration/size limits, lifecycle rules, standard renditions, CDN only when justified |
| Authorization leaks across organizations | Central permission services, scoped querysets, multi-role API security tests |
| Two frontend codebases slow a small team | Responsive web first if staffing is thin; generated API clients and shared design tokens |
| WebSocket behavior fails under autoscaling | Redis-backed channel layer, reconnect/reconcile protocol, load testing, REST fallback |
| Search overengineering | PostgreSQL filters/FTS first; instrument and extract only against measured limits |
| Unsafe uploads | Private quarantine, signed URLs, signature validation, size/type limits, rewrite/scan pipeline[^11][^20] |
| Irreversible schema deployments | Expand/migrate/contract migrations, backups, staged rollout, forward-fix plan |

## First ten implementation tickets

1. Create monorepo, CI skeleton, Docker Compose, coding standards, and architecture decision record template.
2. Bootstrap Django with custom `User`, UUID public IDs, split settings, health endpoint, structured error envelope, and OpenAPI.
3. Bootstrap Next.js TypeScript and Flutter applications with environment configuration and generated API client wrappers.
4. Implement registration, verification, login, refresh rotation, logout, password reset, and session list/revoke.
5. Create taxonomy models and seed commands for profession, skill, language, location, and casting categories.
6. Implement artist profile schema, visibility controls, validation, and profile-completion calculation.
7. Implement organization, membership roles, verification request, moderator decision, and audit events.
8. Implement media asset/upload-session models, signed upload initiation/completion, quotas, and private quarantine bucket.
9. Implement image/video worker flow, renditions, status state machine, retries, and moderator preview.
10. Implement casting call, casting role, lifecycle transitions, search filters, and the first end-to-end publish/search page.

## Recommended decision

Proceed with **Django/DRF + PostgreSQL + Redis + Cloud Storage + Next.js web + Flutter mobile**, deployed as a modular monolith on Cloud Run. Build responsive web and API foundations first, then Flutter against the stabilized contract. Treat casting applications, verification, media safety, authorization, and moderation as core MVP capabilities; treat broad social networking as controlled supporting functionality.

The architecture should remain deliberately simple until usage proves a bottleneck. The first extraction candidates are media processing, search, and realtime messaging—not identity, profiles, casting, or applications, whose transactions are closely related and benefit from remaining in one relational boundary.

---

## References

1. [Next.js](https://nextjs.org/)

2. [Platform integration](https://docs.flutter.dev/platform-integration) - Learn how to develop for different platforms and integrate with platform-specific features in Flutte...

3. [Development - Flutter](https://flutter.dev/development) - Flutter allows you to build apps for mobile, web, desktop, and embedded devices — all from a single ...

4. [Throttling - Django REST framework](https://www.django-rest-framework.org/api-guide/throttling/) - Throttling is similar to permissions, in that it determines if a request should be authorized. Throt...

5. [Authentication - Django REST framework](https://www.django-rest-framework.org/api-guide/authentication/) - Authentication always runs at the very start of the view, before the permission and throttling check...

6. [Channel Layers — Channels 4.3.2 documentation](https://channels.readthedocs.io/en/latest/topics/channel_layers.html)

7. [PostgreSQL: Documentation: 18: 12.1. Introduction](https://www.postgresql.org/docs/current/textsearch-intro.html) - 12.1. Introduction # 12.1.1. What Is a Document? 12.1.2. Basic Text Matching 12.1.3. Configurations ...

8. [PostgreSQL: Documentation: 18: 12.2. Tables and Indexes](https://www.postgresql.org/docs/current/textsearch-tables.html) - 12.2. Tables and Indexes # 12.2.1. Searching a Table 12.2.2. Creating Indexes The examples in the pr...

9. [Using WebSockets | Cloud Run](https://docs.cloud.google.com/run/docs/triggering/websockets)

10. [Building a WebSocket Chat service for Cloud Run tutorial](https://docs.cloud.google.com/run/docs/tutorials/websockets)

11. [Signed URLs | Cloud Storage | Google Cloud](https://docs.cloud.google.com/storage/docs/access-control/signed-urls)

12. [Cloud Tasks documentation | Google Cloud Documentation](https://docs.cloud.google.com/tasks/docs) - Enables developers to manage large numbers of distributed tasks, small units of asynchronous computi...

13. [Video On Demand | Google Cloud](https://cloud.google.com/use-cases/video-on-demand) - Video on demand (VOD) is a media distribution system that allows users to watch video content on the...

14. [Transcoder API documentation - Google Cloud](https://docs.cloud.google.com/transcoder/docs) - Transcodes videos into modern and next generation formats for broadcasters, production companies, an...

15. [Availability in Cloud SQL | Cloud SQL for PostgreSQL - Google Cloud](https://docs.cloud.google.com/sql/docs/postgres/availability)

16. [Enable and disable high availability | Cloud SQL for PostgreSQL](https://docs.cloud.google.com/sql/docs/postgres/configure-ha)

17. [Configure secrets for services | Cloud Run | Google Cloud](https://docs.cloud.google.com/run/docs/configuring/services/secrets)

18. [Table of Contents - OWASP API Security Top 10](https://owasp.org/API-Security/editions/2023/en/0x00-toc/) - The Ten Most Critical API Security Risks

19. [OWASP Top 10 API Security Risks – 2023](https://owasp.org/API-Security/editions/2023/en/0x11-t10/) - APIs tend to expose endpoints that handle object identifiers, creating a wide attack surface of Obje...

20. [File Content Validation](https://cheatsheetseries.owasp.org/cheatsheets/File_Upload_Cheat_Sheet.html) - Website with the collection of all the cheat sheets of the project.

21. [Input Validation - OWASP Cheat Sheet Series](https://cheatsheetseries.owasp.org/cheatsheets/Input_Validation_Cheat_Sheet.html) - Website with the collection of all the cheat sheets of the project.

22. [Documentation: 18: 12.3. Controlling Text Search - PostgreSQL](https://www.postgresql.org/docs/current/textsearch-controls.html) - 12.3. Controlling Text Search # 12.3.1. Parsing Documents 12.3.2. Parsing Queries 12.3.3. Ranking Se...

23. [Deployment checklist | Django documentation](https://docs.djangoproject.com/en/6.0/howto/deployment/checklist/) - The web framework for perfectionists with deadlines.

