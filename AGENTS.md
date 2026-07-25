# AGENTS.md - Manufacturing Management

Guidelines for agents and contributors working in `manufacturing-management/`. This app is a Next.js 16 manufacturing subsystem with a server-side BFF for Directus and Spring Boot.

## First Steps

1. Read this file and the repository-root `AGENTS.md`.
2. For Next.js behavior, check `node_modules/next/dist/docs/` before changing framework APIs. This project uses Next.js `^16.2.1`, which differs from older examples.
3. Review `../research-vault/manufacturing/Manufacturing-Management-Documentation.md` for route, module, API, and data-flow context. Keep project documentation and personal Markdown notes under `../research-vault/manufacturing/`, not inside the app repo.
4. Keep changes scoped to the active feature. Do not edit shared config, `package.json`, `package-lock.json`, or `src/components/ui/*` unless explicitly requested.

## Project Layout

- `src/app/(public)/` - public pages such as login, about, contact, forgot/reset password.
- `src/app/(manufacturing-management)/mm/` - protected manufacturing routes and page shells.
- `src/app/api/auth/` - Spring Boot auth proxy routes.
- `src/app/api/manufacturing/` - Directus-backed manufacturing BFF routes and `directus-api.ts` helper.
- `src/modules/manufacturing-management/` - feature modules, hooks, services, components, and types.
- `src/components/` - shared layout, dashboard, auth, PDF, command-center, and shadcn UI components.
- `public/` - logos, auth imagery, subsystem assets, GeoJSON, uploaded QR images.
- `../research-vault/manufacturing/` - project documentation, notes, diagrams, and other Markdown references.

## Architecture Rules

- Browser UI must call local BFF routes such as `/api/manufacturing/sales-order`; do not call Directus directly from client components.
- Keep Directus server logic in `src/app/api/manufacturing/*` or the server-only helper `src/app/api/manufacturing/directus-api.ts`.
- Auth routes proxy Spring Boot via `SPRING_API_BASE_URL`. Login sends `hashPassword` and receives/stores `vos_access_token`.
- New route handlers that depend on cookies, auth, or live backend data should declare:

```ts
export const runtime = "nodejs";
export const dynamic = "force-dynamic";
```

## Module Pattern

Follow `src/modules/README.md`:

```text
feature-name/
  components/
  hooks/
  services/
  types.ts
  FeatureNameModule.tsx
```

Keep page files thin. Put state, effects, and API calls in hooks or services. Put shared feature types in `types.ts`.

## Commands

Run from `manufacturing-management/`:

- `npm run dev` - start local Next.js dev server.
- `npm run build` - production build.
- `npm run start` - serve a built app.
- `npm run typecheck` - TypeScript verification.
- `npm run lint` - ESLint verification.

There is no configured test runner. Use `typecheck`, `lint`, and manual route checks.

## Environment

Expected local variables include:

- `NEXT_PUBLIC_API_BASE_URL` - Directus base URL.
- `NEXT_PUBLIC_DIRECTUS_URL` or `DIRECTUS_URL` - Directus asset/file fallback in some code paths.
- `DIRECTUS_STATIC_TOKEN` - server-to-server Directus token.
- `SPRING_API_BASE_URL` - Spring Boot auth/user API.
- `COOKIE_SECURE` - cookie security override when needed.
- `NEXT_PUBLIC_AUTH_DISABLED=true` - local-only auth bypass.

Never commit `.env.local` or tokens.

## Verification Checklist

Before handing off:

1. Run `npm run typecheck`.
2. Run `npm run lint`.
3. Manually check affected `/mm/*` pages and `/api/manufacturing/*` endpoints.
4. Append a short entry to `../research-vault/Task Execution Journal.md`.

## Git & PR Notes

Recent history uses short imperative or descriptive subjects, often with PR references, e.g. `Fix lint types (#6)`. Keep commits focused, describe affected module/API behavior, and include screenshots for UI changes.
