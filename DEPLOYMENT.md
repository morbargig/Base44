# Render + GitHub Pages Deployment

This deployment runs the backend, FLAPI mock, PostgreSQL, and private MinIO service on Render, and includes a GitHub Pages workflow for the Vite frontend.

This fork-preserving version avoids application source changes. Because the current frontend still uses same-origin `/api`, `/ws`, and `/shared` paths, a plain GitHub Pages deployment cannot fully talk to a separate Render backend without either upstream code support for configurable URLs or an external same-origin proxy/custom domain setup.

## Phase 1: FLAPI + GitHub Pages

Use `render.flapi-frontend.yaml` to deploy only `flowbolt-flapi-mock` on Render's free web service tier.

Render only auto-detects a root `render.yaml`, so either create the service manually from the Render dashboard or temporarily copy `render.flapi-frontend.yaml` to `render.yaml` when creating the Blueprint.

Manual Render settings for FLAPI:

- Service type: Web Service
- Root directory: `mocks/flapi-mock`
- Runtime: Node
- Instance type: Free
- Build command: `corepack enable && pnpm install --frozen-lockfile --prod=false`
- Start command: `MOCK_PORT=$PORT pnpm start`
- Health check path: `/health`

After deploy, verify:

- `https://<flapi-service>.onrender.com/health`
- `https://<flapi-service>.onrender.com/sso`
- `https://<flapi-service>.onrender.com/api-docs`

For GitHub Pages, enable Pages with GitHub Actions as the source and run `.github/workflows/github-pages.yml`. Set repository variable `VITE_BASE_PATH` to `/<repo-name>/` for project Pages, for example `/Base44/`.

With source unchanged, the Pages frontend can be published as static assets, but authenticated app functionality still needs the backend on the same origin or upstream support for configurable backend URLs.

## Render Blueprint

Create the Render stack from `render.yaml`. The blueprint provisions:

- `flowbolt-backend`: Docker web service using `backend/Dockerfile`, `/health`, and a persistent workspace disk at `/var/lib/flow-44/workspaces`.
- `flowbolt-flapi-mock`: Node web service from `mocks/flapi-mock`.
- `flowbolt-minio`: private MinIO service with persistent `/data`.
- `flowbolt-postgres`: managed PostgreSQL database.

Set these backend environment variables in Render:

- `AIB_AUTH_JWT_PUBLIC_KEY`
- `AIB_AI_MODEL`
- `AIB_AI_BASE_URL`
- `AIB_AI_API_KEY`
- Optional: `AIB_LANGFUSE_PUBLIC_KEY`, `AIB_LANGFUSE_SECRET_KEY`, `AIB_LANGFUSE_HOST`, `AIB_SYSTEM_ADMIN_IDS`

The blueprint wires Render Postgres into the existing `AIB_DB_*` variables and points S3 settings at the private MinIO service. It also sets `AIB_SANDBOX_MODE=local`, because Render does not provide the container privileges required by the namespaced sandbox mode used in Docker Compose.

If you use the FLAPI mock outside development, set `MOCK_JWT_PRIVATE_KEY` and configure the backend `AIB_AUTH_JWT_PUBLIC_KEY` with the matching public key.

## GitHub Pages

The `.github/workflows/github-pages.yml` workflow builds `frontend` and deploys `frontend/dist` to Pages.

Configure these GitHub repository variables if the upstream frontend gains support for split-origin deployment:

- `VITE_API_BASE_URL`: `https://flowbolt-backend.onrender.com/api`
- `VITE_WS_BASE_URL`: `wss://flowbolt-backend.onrender.com`
- `VITE_AUTH_PROVIDER_URL`: `https://flowbolt-flapi-mock.onrender.com/sso`
- `VITE_AUTH_STORAGE_KEY`: `Auth`
- `VITE_AUTH_USE_IFRAME`: `true`
- Optional `VITE_BASE_PATH`: `/Base44/` for project Pages, or `/` for a user/org Pages site or custom domain.

With the current source unchanged, only `VITE_BASE_PATH` affects the build.

## Verification Checklist

- Render backend `/health` returns `{"status":"ok"}`.
- Render deploy logs show Alembic migrations completed and the S3 bucket setup check ran.
- FLAPI mock `/health` and `/sso` load.
- If using an external same-origin proxy or upstream URL configuration, the frontend can sign in and perform an authenticated API request.
- If using an external same-origin proxy or upstream URL configuration, chat, terminal, server log, and error WebSockets connect.
- Preview iframe loads and refreshes when same-origin backend routing is available.
- Export ZIP and single HTML downloads open when same-origin backend routing is available.
- Publish creates/updates an object in MinIO and `/shared/{handle}` serves through the backend.
