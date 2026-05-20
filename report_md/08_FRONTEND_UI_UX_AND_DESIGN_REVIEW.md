# Frontend UI UX And Design Review

Date: 2026-05-13  
Scope: Next.js dashboard, DESIGN.md compliance, app shell, feature pages, safety visibility, states, responsiveness, and UI test coverage.  
Verdict/status: UI_REDESIGN_COMPLETE with remaining QA/build validation debt.

## Current Dashboard State

Dashboard is implemented at `apps/web/app/(app)/dashboard/page.tsx`. It renders a Raycast-style dark hero band, metric grid, queue health, system safety, recent activity, approval exposure note, risk limits, and scheduler controls.

## DESIGN.md Compliance

`DESIGN.md` defines dark canvas `#07080a`, subtle surfaces, hairline borders, Inter with `ss03`, restrained accents, and semantic red/yellow/green/blue use. `apps/web/app/globals.css`, Tailwind config, and `components/ui/index.tsx` largely follow this.

## Raycast-Style UI Implementation Status

Implemented: compact cards, dark canvas, badges, command-like tables, dense operational layout, restrained gradients/accent stripe, consistent border radius, and safety-first copy. Remaining debt: some inline SVG arrows remain where icon library could be standardized.

## App Shell / Sidebar / Topbar

`apps/web/components/app-shell.tsx` protects app routes through `api.getAuthMe()` and renders sidebar/mobile drawer plus top runtime badges:
- DEMO MODE
- DRY RUN or LIVE
- VAULT state
- EMERGENCY PAUSED when active
- Base chain
- block/RPC status
- quote provider
- logout

## Page Coverage

| Page | Status | Evidence |
| --- | --- | --- |
| Login | IMPLEMENTED | `apps/web/app/login/page.tsx` |
| Dashboard | IMPLEMENTED | `dashboard/page.tsx` |
| Wallets | IMPLEMENTED | `wallets/page.tsx`, `wallets-table.tsx`, `wallet-import-card.tsx` |
| Wallet detail | IMPLEMENTED | `wallets/[id]/page.tsx` |
| Transactions | IMPLEMENTED | `transactions/page.tsx`, `transactions-table.tsx`, detail page |
| Tokens | IMPLEMENTED | `tokens/page.tsx`, `tokens-management.tsx` |
| Pairs/routers | IMPLEMENTED | `pairs/page.tsx`, management components |
| Settings security | IMPLEMENTED | `settings/security/page.tsx` |
| Settings Telegram | IMPLEMENTED | `settings/telegram/page.tsx`, `telegram-settings-form.tsx` |
| Docs | IMPLEMENTED | `docs/page.tsx` |

## Dangerous Action Confirmations

`apps/web/components/confirmation-modal.tsx` supports typed confirmations. Execute-once uses typed `EXECUTE`; global emergency pause uses typed enable/disable confirmation; wallet bulk/status actions use confirmation-gated flows.

## Runtime / Vault / Emergency Visibility

Runtime safety appears in the topbar, dashboard safety panel, settings security panel, vault controls, and execute-once warning. Live mode warning remains visible when `DRY_RUN=false`.

## Error / Empty / Loading States

Centralized `ErrorState`, `EmptyState`, `SkeletonCard`, and `SkeletonRow` exist in `apps/web/components/ui/index.tsx`. Legacy `error-card.tsx` and `loading-card.tsx` are thin wrappers only, not separate visual systems. Server-rendered pages use `ErrorState` for API read failures.

## Mobile / Responsive Quality

Mobile drawer exists, layout uses responsive grids and wrapping badges. This audit did not run a fresh visual screenshot pass because E2E/build were not executed under the report-only boundary.

## E2E / UI Test Coverage

Playwright files exist:
- `e2e/helpers.ts`
- `e2e/ui-redesign-qa.spec.ts`
- `e2e/operator-safety.spec.ts`
- `playwright.config.ts`

Covered flows include login dark canvas, app shell runtime badges, dashboard metrics/safety/scheduler, wallets/import/bulk confirmation, seeded wallet detail, transactions filters/empty/rows/demo badge, settings security typed confirmation, Telegram warning/form/test button, execute-once dry-run safety, and failed wallet read ErrorState.

## Remaining UI Debt

| Severity | Debt | Status |
| --- | --- | --- |
| MEDIUM | Fresh `pnpm e2e` not run during this audit due artifact mutation boundary | NOT_TESTED |
| MEDIUM | Fresh `pnpm build` not run during this audit due artifact mutation boundary | NOT_TESTED |
| LOW | Legacy wrapper files remain for compatibility | IMPLEMENTED |
| LOW | Some SVG/icon use could be standardized | PARTIAL |
| LOW | Full responsive screenshot matrix not captured in this audit | NOT_TESTED |

