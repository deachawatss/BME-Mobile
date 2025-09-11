# Repository Guidelines

## Project Structure & Module Organization
- backend: Rust Axum API (`backend/src/{handlers,services,models,database,utils}`), tests in `backend/src/tests`.
- frontend: Angular 20 app (`frontend/src/app/...`, components use `*.component.ts`, services `*.service.ts`).
- tests: Playwright E2E specs in `tests/` (run against local servers).
- docs: Additional architecture and process docs in `docs/`.

## Build, Test, and Development Commands
- Backend run: `cd backend && cargo run` — starts the Rust API.
- Backend build: `cargo build --release` — optimized build.
- Backend test: `cargo test` — runs Rust unit/integration tests.
- Frontend dev: `cd frontend && npm start` — loads env and serves on configured host/port.
- Frontend build: `npm run build:prod` — production build via Angular CLI.
- Frontend unit tests: `npm test` — Jasmine/Karma tests.
- Dev all (root): `npm run dev:all` — starts backend and frontend together.
- E2E tests (root): `npm run test:e2e` — starts services, waits for readiness, runs Playwright.

## Coding Style & Naming Conventions
- Rust: `cargo fmt` for formatting; `cargo clippy -D warnings` before PRs. Files/functions `snake_case`, types `CamelCase`, modules `snake_case`.
- Angular/TS: 2‑space indent, single quotes (see `frontend/.editorconfig`), Prettier settings in `frontend/package.json`. Files `kebab-case.ts`; components `*.component.ts`, services `*.service.ts`.
- Logs/config: never commit secrets; prefer structured logs and clear error messages.

## Testing Guidelines
- Rust: place unit tests alongside code or under `backend/src/tests`; prefer Tokio async tests where relevant; cover handlers/services logic.
- Angular: write specs next to components/services (`*.spec.ts`); keep tests deterministic.
- Playwright: specs in `tests/*.spec.js`; ensure servers run locally; keep scenarios idempotent and fast.

## Commit & Pull Request Guidelines
- Commits: follow Conventional Commits (e.g., `feat:`, `fix:`, `docs:`). Keep messages imperative and scoped (e.g., `feat(backend): add bulk run search`).
- PRs: include problem statement, summary of changes, test plan (commands/output), screenshots for UI, and links to issues. CI must pass (build, tests, lint/format).

## Security & Configuration Tips
- Env files: `backend/.env`, `frontend/.env`. Do not commit credentials. Example: `TFCPILOT3_SERVER`, `TFCPILOT3_DATABASE`, LDAP settings; frontend `FRONTEND_HOST`/`FRONTEND_PORT`.
- Validate inputs on API boundaries; avoid logging sensitive values; review logs before sharing.

## Architecture Notes
- Dual databases: maintain the established split.
  - Putaway: reads on `TFCPILOT3`, writes on `TFCMOBILE`.
  - Bulk picking: primary operations on `TFCPILOT3` with best‑effort replication to `TFCMOBILE` (`backend/src/database/replication.rs`).
- Transaction patterns:
  - Putaway: 8‑step atomic flow covering Mintxdh, LotTransaction (8/9), BinTransfer, replication, and sequence updates.
  - Bulk picking: 5‑table atomic operations (cust_BulkPicked, Cust_BulkLotPicked, LotMaster, LotTransaction, Cust_BulkPalletLotPicked) plus run completion update (`Cust_BulkRun` NEW→PRINT).
- Timezone: all timestamps use Bangkok (UTC+7). Backend helpers in `backend/src/utils/timezone.rs`.
- SPA serving: production can serve Angular assets from Rust binary (see `backend/src/main.rs`).

## Workflow & Docs
- Before coding: read `docs/task/context_session.md` for latest decisions and open items.
- Reference guides:
  - `CLAUDE.md` — deep architecture, DB strategy, and workflow rules.
  - `docs/architecture.md` — enhancement architecture and UI layout standards.
  - `docs/prd.md` — requirements and constraints for bulk picking completion.
  - `docs/actual-pick-workflow.md` — BME4 pick workflow and SQL sequences.
  - `frontend/PALLET_INTEGRATION_SUMMARY.md` — pallet tracking integration details.

## Bulk Picking Rules (Essentials)
- Ingredient set: only rows with `ToPickedBulkQty > 0` are pickable.
- Lot/bin filtering: use FEFO and exclude staging/partial bins (e.g., PWBE/PWBB/PWBA, or bins with `User4 = 'PARTIAL'`). Ensure available qty ≥ pack size.
- Progress updates: increment `PickedBulkQty` and related quantities; remaining updates only after confirmation.
- Completion: when all ingredients are complete, update `Cust_BulkRun.Status` to `PRINT` with modified timestamps.

## Frontend Standards
- Angular 20 standalone components; Tailwind v4 with `tw-` prefix utilities.
- Bulk picking UI: 6‑row PC layout with vertical label alignment; mobile wraps allowed. Use signals for state and strict error messaging.
- Bangkok time display: prefer a centralized service; avoid mixing UTC/local in UI.

## Commit Message Examples
- feat(frontend): add Ready to Pick confirmation flow
- fix(backend): align lot/bin suggestion filters with pack size and PWBE exclusions
- perf(db): optimize FEFO lot search query joins
- chore: update docs links and architecture notes

## Do/Don’t Quick List
- Do verify table/column names before coding; use parameterized SQL.
- Do keep putaway stable; avoid regressions when changing bulk picking.
- Don’t bypass pallet tracking (Cust_BulkPalletLotPicked) in pick transactions.
- Don’t log sensitive environment values or credentials.
