# DeanOS

Portfolio risk and modeling engine: regime detection, GARCH volatility, Monte Carlo
simulation, Value at Risk, factor exposures, stress tests and scenario comparison, with
methodology pages that explain each model's assumptions and limitations.

Educational and analytical project. Not investment advice.

> Work in progress. The full README (features, models, validation, limitations,
> screenshots) lands with the first public release.

## Layout

```
web/       Next.js app, served under /deanos
engine/    Python model engine + FastAPI app (served under /deanos/api)
scripts/   Git hooks and data jobs
```

Both deploy as one Vercel project using [Services](https://vercel.com/docs/services)
(see `vercel.json`).

## Local development

Requirements: Node 24, Python 3.13, [uv](https://docs.astral.sh/uv/), gitleaks.

```bash
git config core.hooksPath scripts/hooks

# engine on :8100
cd engine && uv sync --extra dev && uv run uvicorn deanos_engine.api:app --port 8100

# web on :3100 (proxies /deanos/api to the engine in development)
cd web && npm install && npm run dev
```

Open http://localhost:3100/deanos.

## Checks

```bash
cd engine && uv run ruff check . && uv run mypy deanos_engine tests && uv run pytest
cd web && npm run typecheck && npm run lint && npm run build
```
