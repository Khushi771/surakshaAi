# SurakshaAI

SurakshaAI is a construction-site safety dashboard that helps teams capture hazards, assess risk, and follow up on corrective actions. Workers can submit a photo for AI-assisted review or record a spoken report. Safety staff review findings, manage incidents and actions, and track resolution.

**Live demo:** [surakshasafety.com](https://surakshasafety.com/)

## Features

- Gemini-assisted hazard analysis for uploaded site photos, with editable findings and recommended actions.
- Voice notes with live transcription through Sarvam Saaras v4.
- Incident creation with required assignee name and email, evidence preview, status and severity filters, and five-item pagination.
- Action tracking with owner, due date, status, search, filters, and five-item pagination.
- Email notifications for incident assignment and action status changes, plus a contact form.
- Responsive React dashboard backed by FastAPI, SQLite, and local media storage.

AI output is a triage aid. A competent site safety officer should verify hazards and decide on corrective actions.

## Tech stack

- Frontend: React, TypeScript, Vite, Nginx
- Backend: Python, FastAPI, SQLAlchemy
- Data and media: SQLite, Docker named volume
- Integrations: Google Gemini, Sarvam Saaras v4, SMTP email
- VPS HTTPS: Docker Compose and Caddy

## Run locally

Requirements: Python 3.11+, Node.js 20+, and npm.

1. Start the API:

   ```sh
   cd backend
   python3 -m venv .venv
   source .venv/bin/activate       # Windows: .venv\\Scripts\\activate
   pip install -r requirements.txt
   cp .env.example .env            # Windows: copy .env.example .env
   uvicorn app.main:app --reload
   ```

   API docs: http://127.0.0.1:8000/docs

2. In another terminal, start the frontend:

   ```sh
   cd frontend
   npm install
   npm run dev
   ```

   Open the URL printed by Vite (normally http://localhost:5173). Vite proxies `/api` and `/media` to the backend.

## Configure integrations

Copy `backend/.env.example` to `backend/.env`. Add `GEMINI_API_KEY` and `SARVAM_API_KEY` to enable photo analysis and voice transcription. SMTP settings are optional for email notifications and the contact form; for GoDaddy Professional Email powered by Titan, use `smtpout.secureserver.net` on port `465` and fill in the mailbox credentials and contact recipient.

Keep credentials only in `backend/.env`. Never put keys in frontend variables, source control, screenshots, or a submission archive. The checked-in environment examples contain blank secrets. `ANTHROPIC_API_KEY` is accepted as a legacy name for the Gemini key.

## Run with Docker

Requirements: Docker Engine/Desktop and Docker Compose v2.

```sh
cp .env.example .env
cp backend/.env.example backend/.env
# Add provider keys and optional SMTP settings to backend/.env.
docker compose up -d --build
```

Open http://localhost:8080. Persistent SQLite data and uploaded media use the `suraksha-data` named volume.

For a domain with HTTPS, set `DOMAIN` in the root `.env`, point its DNS A record at the VPS, ensure inbound ports 80 and 443 are open, and run:

```sh
docker compose --profile tls up -d --build
```

Caddy obtains and renews certificates when DNS and network access are ready. To deploy updated source, copy it to the VPS and run the same Compose command. Avoid `docker compose down -v`: it deletes the persistent database and media volume.

## API overview

- `GET /api/health` — service health
- `GET`, `POST /api/incidents` — list and create incidents
- `PATCH /api/incidents/{incident_id}` — update incident status
- `POST /api/incidents/{incident_id}/actions` — add an action
- `PATCH /api/actions/{action_id}` — update action owner, due date, or status
- `POST /api/media` — upload image or audio evidence
- `POST /api/ai/image-analysis` — analyze an uploaded image with Gemini
- `WS /api/transcribe/ws` — proxy realtime audio and transcription to Sarvam
- `POST /api/contact` — send a contact message through configured SMTP

Interactive API documentation is available at `/docs` when the backend is running.

## Source submission

Submit the project source, including this README, the Docker files, frontend, backend, and blank `.env.example` templates. Exclude `.env`, API keys, mailbox passwords, databases, uploaded media, `.venv`, `node_modules`, and build output. The demo URL is https://surakshasafety.com/.
