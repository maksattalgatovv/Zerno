# ZERNO

**Smart Agriculture. Smarter Future.**

ZERNO is an AI-powered smart agriculture platform for farmers in Kazakhstan. It brings field records, an interactive map, drone missions, crop photo checks, analytics, a farm assistant and PDF reports into one application, in Kazakh, Russian and English.

This is a working MVP: every screen talks to a real API and PostgreSQL database.

## What is real and what is simulated

| Area | Status |
| --- | --- |
| Accounts, farms, fields, decisions, reports, settings | Real and saved in PostgreSQL |
| Livestock counts | The drone counts the animals on each pasture after a counting flight. **The count is simulated**: no livestock detector is included. Births, purchases and sales are entered by hand. Every change is saved with its history |
| NDVI calculation | Real formula, run on **generated sample bands** in the demo |
| Drone | **Simulated in software.** Nothing flies. The DJI adapter is a disabled placeholder |
| Crop photo analysis | **Demo rules** that measure colours in the photo with OpenCV. No trained AI model is included |
| Assistant | **Demo templates** filled with your farm data, or Claude if `ANTHROPIC_API_KEY` is set |
| Weather | **Sample data**. No weather service is connected |
| Emergency panel | Alarm record, map marker, siren, call and SMS links are real. **It never contacts services by itself**, and drone inspection or water drops are **simulated** |
| Password reset email | Not sent. With `EXPOSE_RESET_TOKENS=true`, the link appears on screen for local development |

Every simulated source is labelled in the interface and in PDF reports.

## Requirements

- Node.js 20.9 or newer
- Python 3.12
- PostgreSQL 16

## Setup

**1. Create the database**

```sql
CREATE ROLE zerno LOGIN PASSWORD 'choose-a-password';
CREATE DATABASE zerno OWNER zerno ENCODING 'UTF8' TEMPLATE template0;
```

**2. Backend**

```powershell
cd backend
python -m venv .venv
.\.venv\Scripts\python -m pip install -r requirements-dev.txt
copy .env.example .env      # then set DATABASE_URL and JWT_SECRET
.\.venv\Scripts\alembic upgrade head
.\.venv\Scripts\python -m app.seed
.\.venv\Scripts\python -m uvicorn app.main:app --port 8000
```

API docs are at http://localhost:8000/docs.

**3. Frontend**

```powershell
cd frontend
npm install
npm run dev
```

Open http://localhost:3000. It goes straight into the demo farm, without an account. To use your own account, choose **Sign in to your account** at the top, or open http://localhost:3000/login. The product page is at http://localhost:3000/about.

On Windows, double-click `Запустить ZERNO.bat` to start both servers. It also prints the address to open on a phone connected to the same Wi-Fi.

## Demo script

1. **Dashboard:** farm statistics, alerts and activity for ZERNO Demo Farm.
2. **Field Map:** click a coloured marker to see a problem area.
3. **Drone Control:** plan a route, confirm supervision, start the simulated mission and watch it fly. A notification arrives at the end.
4. **AI Crop Doctor:** upload a crop photo, read the report, then approve or reject it.
5. **Livestock:** total animals by species. Press **Count with drone**, fly the counting mission over River Pasture, and see the new count, the flight and any difference with the records.
6. **Analytics:** NDVI trend, map and field comparison.
7. **AI Assistant:** ask "Which field requires additional inspection?"
8. **Reports:** create and download a PDF.
9. Switch the language with the globe icon.

To restore the original demo data, use **Settings → Demo and system → Reset demo farm**.

## Tests

```powershell
cd backend;  .\.venv\Scripts\python -m pytest    # unit and API flows, needs the database
cd frontend; npm test; npm run lint; npm run typecheck
```

After changing an API schema, run `npm run gen:api` with the backend running to refresh the frontend's types.

## Configuration

All settings are environment variables, documented in [backend/.env.example](backend/.env.example). The ones most likely to matter:

| Variable | Purpose |
| --- | --- |
| `ANTHROPIC_API_KEY` | Turns on the real assistant |
| `VISION_MODEL`, `YOLO_WEIGHTS_PATH` | Switch to a trained detector. Install `requirements-ai.txt` first |
| `SIM_MISSION_SECONDS` | Length of a simulated flight |
| `DEMO_MODE` | Enables demo login and reset |
| `EXPOSE_RESET_TOKENS` | Local development only. Never enable it on a shared server |

## Project layout

```
backend/    FastAPI API, database models, adapters, migrations, tests
frontend/   Next.js application
scripts/    Developer helpers
```

See [ARCHITECTURE.md](ARCHITECTURE.md) for how the parts fit together and [ROADMAP.md](ROADMAP.md) for what comes next.
