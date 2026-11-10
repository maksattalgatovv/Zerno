# ZERNO architecture

```
Browser (Next.js App Router, React, TanStack Query)
   │  REST/JSON + Bearer JWT · Accept-Language selects the response language
   ▼
FastAPI  app/api/*  →  app/services/*  →  app/db (SQLAlchemy) → PostgreSQL
                            │
                            ▼
                     app/adapters/*
       drone · vision · llm · storage · weather
```

The rule that shapes the backend: **application code depends on adapter interfaces, never on a vendor.** Replacing the simulator, the demo vision rules or the storage backend doesn't touch routers or services.

## Frontend

| Path | Role |
| --- | --- |
| `app/` | Routes: landing `/`, `(auth)` pages, `(app)` signed-in pages |
| `components/` | `shared` (states, badges), `layout` (shell) and one folder per feature. `ui` is shadcn/ui |
| `providers/` | Auth, selected farm, language |
| `lib/api/client.ts` | The only place that calls `fetch` |
| `lib/api/hooks.ts` | One React Query hook per resource |
| `lib/api/schema.d.ts` | Generated from the backend's OpenAPI schema. Don't edit by hand |
| `lib/i18n/` | Dictionaries. `Dictionary` is a full `Record`, so a missing translation fails the build |

Pages are client components that fetch through hooks. The JWT lives in `localStorage`, and the `(app)` layout redirects signed-out users. Authorization itself is enforced only by the API.

## Backend

| Path | Role |
| --- | --- |
| `app/api/` | Routers. Thin: authorize, call a service, serialize |
| `app/api/deps.py` | Auth and `owned_*` lookups. Every lookup checks ownership and returns 404 otherwise |
| `app/services/` | Business logic and read models |
| `app/domain/` | Pure logic with no I/O: NDVI, geometry, flight planning, pre-flight rules |
| `app/adapters/` | Integrations behind interfaces |
| `app/core/` | Config, errors, security, translations |
| `app/seed.py` | Demo farm. Also used by the reset endpoint |
| `alembic/` | Migrations |

### Language

Rows store stable keys such as `issue.water_stress`, not sentences. `app/core/i18n_catalog.py` translates them per request using `Accept-Language`, so one record reads correctly in every language and in PDF reports. Literal text passes through unchanged, which lets user-created names and seeded keys share a column.

## Drone flow

```
POST /missions              plan: lawnmower route, estimate, pre-flight checks
POST /missions/{id}/start   authorize_start(): operator confirmation, adapter availability,
                            nothing else flying, pre-flight rechecked
   └─ MissionRunner         background task per flight
        └─ adapter.fly()    async stream of Telemetry
             ├─ each event  saved to DroneMission.flight_data, polled by the UI
             └─ landed      ingest_results(): photos, NDVI record, zones, anomalies, notification
POST /missions/{id}/return-home   sets MissionControl.return_requested
```

Safety rules live in `domain/flight.py` and `services/missions.authorize_start`, outside any adapter, so they apply to all aircraft. A drone also returns on its own when battery reaches the point needed to get home.

**Adding a manufacturer:** subclass `DroneAdapter` in `adapters/drone/`, yield `Telemetry` from `fly()`, and register it in `adapters/drone/__init__.py`. `DjiDroneAdapter` is a placeholder with `available = False`, which `authorize_start` refuses. Real flight also needs legal authorization, the manufacturer's SDK and failsafes, and a licensed operator.

**Limitation:** `MissionRunner` keeps tasks in one process. On startup, missions left active are marked failed. Running several API workers would need a shared queue such as Redis.

## Emergency flow

`POST /emergencies` commits the incident first, then marks a fire on the map, creates an urgent notification that ignores notification preferences, and can send a drone. Drone trouble is logged and never fails the alarm.

Emergency flights use the normal `authorize_start` gate. The result is written to the incident timeline, and only a person can close an incident: no flight outcome does. The app has no link to emergency services, so the interface always tells the user to call them. Calls and SMS use `tel:` and `sms:` links, which the person completes on the phone.

## Crop analysis flow

`POST /images` checks the file's real content and size, then stores it. `POST /analyses` runs `get_vision_model().analyze()`, which returns a `VisionResult`. `POST /analyses/{id}/actions` saves the farmer's decision once.

`DemoVisionModel` measures colour shares and blotches, then applies fixed rules. Confidence is capped at 60%, because rules aren't a diagnosis. To use a real model, install `requirements-ai.txt`, supply weights trained on crop symptoms, and set `VISION_MODEL=yolo`. If the model can't load, the app logs a warning and falls back to the labelled demo.

## NDVI

`domain/ndvi.compute_ndvi` takes separate NIR and RED bands, and no function accepts RGB, so NDVI can't be computed from an ordinary photo by accident. Zero or invalid denominators become NaN, and are returned to the client as `null`. Demo rasters come from `services/sample_data.py`, which synthesizes bands and runs them through the real formula.

## Assistant

`services/analytics.assistant_context` gathers farm facts. `get_assistant()` returns `ClaudeAssistant` when `ANTHROPIC_API_KEY` is set, otherwise `DemoAssistant`. If a live call fails, the request falls back to the demo, and the saved message records which provider answered.

## Storage

Keys under `public/` are served at `/media` by unguessable filenames. Keys under `private/` (reports) are only available through authenticated endpoints. `S3Storage` is the integration point for S3-compatible services and isn't implemented yet.

## Data model

Core entities match the product spec: User, Farm, Field, Drone, DroneMission, Image, AIAnalysis, Notification, FarmerAction. Added to support the features: Zone, Anomaly, NdviRecord, ChatMessage, Report, PasswordResetToken, Emergency, LivestockGroup, LivestockEvent.

A livestock group can be assigned to a pasture. A mission planned with `purpose: "livestock"` flies over that field, and when it completes, `ingest_results` calls `livestock.count_from_flight`, which writes a `drone_count` event for every group on the field, with the mission and the detector's confidence. Only a completed flight counts, because a partial one would miss animals. The number itself comes from `simulated_count` until a trained livestock detector is connected. A drone can't tell why a number changed, so births, purchases, sales and deaths stay manual.

A livestock group's `head_count` only changes through `services/livestock.apply_event`, which writes a `LivestockEvent` (birth, purchase, sale, death or recount) with the signed change and the new total. The count can't go below zero, and editing a group never touches its count, so the history always adds up to the current number.

Deleting a user or farm cascades through the database. Images and analyses keep existing if their field is deleted, with the link set to null.

## Known gaps before production

- No rate limiting on sign-in
- JWTs in `localStorage` and no server-side revocation
- No email delivery
- Uploaded images are public to anyone with the URL
- A demo reset leaves old demo files in storage
- Field boundaries can't be drawn yet: a rectangle is generated from centre and area
