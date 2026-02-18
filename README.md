# Voice AI Chat

A real-time voice and text chat powered by [OpenAI Realtime API](https://platform.openai.com/docs/guides/realtime). Speak through your microphone or type — the AI responds with voice and text simultaneously.

All communication with OpenAI passes through the backend. The API key never reaches the browser.

---

## Architecture

```
Browser (Mic / Speaker)
        |
        | WebSocket  (ws://localhost/ws)
        |
  ┌─────▼──────┐        WebSocket
  │   nginx    │ ──────────────────────► OpenAI Realtime API
  │  (website) │        (relay)          wss://api.openai.com/v1/realtime
  └─────┬──────┘
        | HTTP proxy  /ws → api:8000
  ┌─────▼──────┐
  │  FastAPI   │
  │   (api)    │
  └────────────┘
```

- **nginx** — serves static frontend files, proxies `/ws` to the API container with WebSocket upgrade headers
- **FastAPI** — WebSocket relay: accepts browser connections, opens a connection to OpenAI Realtime API, and forwards messages bidirectionally

---

## Project Structure

```
aichat/
├── config/
│   └── nginx.conf              # nginx: static files + /ws proxy
├── services/
│   ├── api/
│   │   ├── Dockerfile          # python:3.12-slim
│   │   ├── main.py             # FastAPI WebSocket relay
│   │   └── requirements.txt
│   └── website/
│       ├── index.html          # UI
│       ├── style.css           # ChatGPT-style dark theme
│       ├── app.js              # WebSocket client + audio pipeline
│       └── audio-processor.js  # AudioWorklet: Float32 → PCM16
├── Dockerfile                  # nginx:alpine (website container)
├── docker-compose.yml          # website + api services
├── Makefile                    # dev / deploy commands
├── .env.example                # environment variables template
└── README.md
```

---

## Prerequisites

- Python 3.12+ (for local dev)
- Docker + Docker Compose (for Docker dev / production)
- OpenAI API key with Realtime API access
- A modern browser (Chrome / Edge recommended — required for `AudioWorklet`)
- `localhost` or HTTPS (browser requires secure context for microphone access)

---

## Environment Variables

Copy the template and fill in your values:

```bash
cp .env.example .env
```

| Variable | Required | Description |
|---|---|---|
| `OPENAI_API_KEY` | **Yes** | Your OpenAI API key (`sk-...`) |
| `REMOTE_USER` | Deploy only | SSH username on the remote server |
| `REMOTE_HOST` | Deploy only | Remote server hostname or IP |
| `REMOTE_PORT` | Deploy only | SSH port (default: `22`) |
| `REMOTE_WWW_PATH` | Deploy only | Absolute path on server where app lives (e.g. `/var/www/aichat`) |
| `REMOTE_TMP_PATH` | Deploy only | Temp path for upload artifact (e.g. `/root/tmp`) |
| `REMOTE_ARTIFACT_DIR` | Deploy only | Artifact folder name (e.g. `www-artifact-aichat`) |

`.env` is never committed and never sent to the browser.

---

## Running Locally (without Docker)

```bash
# 1. Create virtualenv, install dependencies, generate .env
make setup

# 2. Add your OpenAI API key to .env
#    OPENAI_API_KEY=sk-...

# 3. Start the dev server
make run
```

App available at **http://localhost:8000**

> The FastAPI dev server also serves the frontend from `services/website/` via `StaticFiles`, so no separate web server is needed locally.

---

## Running with Docker

```bash
# 1. Generate .env (if not done yet)
cp .env.example .env
# Add your OPENAI_API_KEY to .env

# 2. Build and start containers
make docker-up

# 3. View logs
make docker-logs

# 4. Stop
make docker-down
```

App available at **http://localhost:40238**

Two containers are started:

| Container | Image | Role |
|---|---|---|
| `website` | `nginx:alpine` | Serves `services/website/` on port 80, proxies `/ws` to `api:8000` |
| `api` | `python:3.12-slim` | FastAPI WebSocket relay on port 8000 (internal only) |

---

## Deploying to a Remote Server

The server must have Docker and Docker Compose installed. On the first deploy, create `.env` on the server manually:

```bash
# On the remote server
mkdir -p /var/www/aichat
echo "OPENAI_API_KEY=sk-..." > /var/www/aichat/.env
```

Then deploy from your local machine:

```bash
make deploy
```

This runs three steps:
1. **`deploy-codebase`** — uploads `services/`, `config/`, `docker-compose.yml`, `Dockerfile`, `Makefile`, `.env.example` via SCP
2. **`deploy-docker-reload`** — SSHes in, runs `docker compose stop && docker compose up --build --remove-orphans -d`
3. **`deploy-clean`** — removes the temporary upload folder from the server

---

## All Make Commands

```
make setup              Create venv, install dependencies, copy .env
make run                Run app locally (requires setup first)

make docker-up          Run app locally via Docker
make docker-stop        Stop Docker containers locally
make docker-down        Stop and remove Docker containers locally
make docker-restart     Restart Docker containers locally
make docker-rebuild     Rebuild and restart Docker containers locally

make deploy             Deploy codebase + reload Docker on remote server
make deploy-codebase    Copy codebase to remote server
make deploy-clean       Remove temporary deploy folder on remote server
make deploy-docker-reload  Restart Docker containers on remote server

make ssh                Open SSH session to remote server
make help               Show available commands
```

---

## Features

- **Voice input** — microphone captured via `getUserMedia`, converted Float32 → PCM16 in an `AudioWorklet`, streamed as base64 chunks over WebSocket
- **Voice output** — AI audio deltas decoded PCM16 → Float32 and scheduled via Web Audio API with gap-free playback
- **Text input** — type messages in the same session; AI responds with both voice and text
- **Streaming transcript** — AI text streamed token-by-token with a blinking cursor
- **Server VAD** — OpenAI detects end of speech automatically (no push-to-talk)
- **Voice selection** — choose from: `alloy`, `ash`, `ballad`, `cedar`, `coral`, `echo`, `marin`, `sage`, `shimmer`, `verse`
- **Mute** — disables the microphone track without closing the WebSocket connection

---

## Notes

- `getUserMedia` requires `localhost` or an HTTPS origin — production deployments need TLS
- The nginx WebSocket proxy sets `proxy_read_timeout 3600s` to keep long voice sessions alive
- `StaticFiles` in `main.py` is only activated when `services/website/` exists on the filesystem (local dev). In Docker, nginx serves static files directly
- The `audio-processor.js` AudioWorklet **must** be a separate file — it cannot be inlined
