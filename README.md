# FlowBolt

AI-powered web app builder. The backend is a FastAPI service; the frontend is a Vite/React app.

---

## Prerequisites

| Tool                                        | Purpose                                                            |
| ------------------------------------------- | ------------------------------------------------------------------ |
| [uv](https://docs.astral.sh/uv/)            | Python package/environment manager (backend)                       |
| [pnpm](https://pnpm.io/)                    | Node package manager (frontend & mocks)                            |
| [Docker](https://www.docker.com/) + Compose | Full-stack / production mode                                       |
| GNU Make                                    | Dev shortcuts (`make dev`, etc.) — optional on Windows (see below) |

---

## Quick start — local development

### 1. Install dependencies

# Apply all pending migrations

`uv run alembic upgrade head`

```bash
make install
```

**Windows (no Make):** run the two commands separately:

```powershell
cd frontend; pnpm install; cd ..
cd backend; uv sync; cd ..
```

This runs `pnpm install` in `frontend/` and `uv sync` in `backend/`.

### 2. Configure the backend environment

```bash
cp backend/.env.example backend/.env
```

Edit `backend/.env` and set at minimum:

| Variable          | Description                                                        |
| ----------------- | ------------------------------------------------------------------ |
| `AIB_AI_MODEL`    | LLM model identifier (see comments in `.env.example` for providers) |
| `AIB_AI_BASE_URL` | OpenAI-compatible API base URL                                     |
| `AIB_AI_API_KEY`  | API key for the chosen provider                                    |
| `AIB_DB_*`        | PostgreSQL connection settings (defaults match Docker Compose)     |

> **Tip:** If you use Docker Compose for Postgres (see below), the default DB values work without changes.

### 3. Start everything at once

```bash
make dev
```

This launches three processes in parallel:

| Process                  | Command                                   | URL                   |
| ------------------------ | ----------------------------------------- | --------------------- |
| Backend (FastAPI)        | `uv run uvicorn flow44.main:app --reload` | http://localhost:8000 |
| Frontend (Vite)          | `pnpm dev`                                | http://localhost:5173 |
| Mock server (flapi-mock) | `pnpm dev`                                | http://localhost:4000 |

Or start each service individually:

```bash
make dev-backend    # FastAPI only
make dev-frontend   # Vite only
make dev-mocks      # flapi-mock only
```

> `make dev` (and each individual target) automatically kills any processes occupying ports **4000**, **8000**, and **5173** before starting.

**No make:** open three separate terminals and run one command in each:

```powershell
# Terminal 1 — Backend
cd backend
uv run --no-sync python -m uvicorn --app-dir src flow44.main:app --host 0.0.0.0 --port 8000 --reload --reload-dir src/flow44 --log-level info
```

```powershell
# Terminal 2 — Frontend
cd frontend
pnpm dev
```

```powershell
# Terminal 3 — Mock server
cd mocks/flapi-mock
pnpm install
pnpm dev
```

---

## Backend only — without Make

```bash
cd backend
uv sync                        # install/sync deps (first time or after changes)
cp .env.example .env           # copy and edit env vars
uv run --no-sync python -m uvicorn --app-dir src flow44.main:app \
  --host 0.0.0.0 --port 8000 --reload --reload-dir src/flow44
```

API docs are available at http://localhost:8000/docs once the server is running.

---

## Docker Compose (full-stack / production-like)

Docker Compose brings up all services: backend, frontend, Postgres, MinIO (S3-compatible storage), the flapi-mock, and an nginx reverse proxy.

```bash
# Build images
make build

# Start all containers (detached)
make run

# Stop containers
make stop
```

The app is served by nginx at **http://localhost:8888**.

For the Render + GitHub Pages deployment path, see `DEPLOYMENT.md`.

### Services and ports

| Service             | Port(s) |
| ------------------- | ------- |
| nginx (entry point) | 8888    |
| Postgres            | 5432    |
| MinIO API           | 9000    |
| MinIO Console       | 9001    |
| flapi-mock          | 6001    |

---

## Database migrations

Migrations are managed with Alembic (config in `backend/alembic.ini`).

```bash
cd backend

# Apply all pending migrations
uv run alembic upgrade head

# Create a new migration
uv run alembic revision --autogenerate -m "describe change"
```

---

## Running tests

```bash
cd backend
uv run pytest
```

Or via the taskipy shortcut:

```bash
cd backend
uv run task tests
```

For linting, run:

```bash
cd backend
uv run task lint
```

---

## AI provider options

Edit `AIB_AI_MODEL` and `AIB_AI_BASE_URL` in `backend/.env` to switch providers:

| Provider           | Model example                            | Base URL                       |
| ------------------ | ---------------------------------------- | ------------------------------ |
| Self-hosted vLLM   | `qwen/qwen3-coder-30b-a3b-instruct`      | Your vLLM endpoint             |
| OpenRouter         | `minimax/minimax-m2.5`                   | `https://openrouter.ai/api/v1` |
| OpenAI             | `gpt-4.1-mini`                           | `https://api.openai.com/v1`    |
| Ollama (local)     | `qwen3:30b`                              | `http://localhost:11434/v1`    |
| Anthropic (direct) | `anthropic:claude-sonnet-4-5-20250514`   | _(uses `ANTHROPIC_API_KEY`)_   |
| AWS Bedrock        | `bedrock:us.anthropic.claude-sonnet-4-6` | _(native provider)_            |

---

## Observability (optional)

Set the following in `backend/.env` to enable Langfuse tracing:

```env
AIB_LANGFUSE_PUBLIC_KEY=pk-lf-...
AIB_LANGFUSE_SECRET_KEY=sk-lf-...
AIB_LANGFUSE_HOST=https://cloud.langfuse.com
```

A self-hosted Langfuse stack is available under `mocks/langfuse/docker-compose.yaml`.
