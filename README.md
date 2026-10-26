# kubeseal-ui-frontend

Vue 3 single-page app for kubeseal-ui: browse namespaces and Secrets, review a key change as an
encrypted diff, and deliver the sealed result to Git.

## Repository Structure

- `src/views/` - The four screens: **Home**, **Namespace**, **NewSecret**, and **SecretSurface** (the
  edit-and-deliver flow)
- `src/components/` - Feature components (the shell, the key rows, the document editor, the workflow
  rail and press bar, search, the destination spine)
- `src/components/ui/` - Native-element primitives: `AppAlert`, `AppButton`, `AppEmpty`, `AppIcon`,
  `AppPageFacts`, `AppPageHeader`, `AppRadioGroup`, `AppSelect`, `AppSpinner`, `AppTextarea`
- `src/stores/` - Pinia stores: `auth`, `secrets`, `ui`
- `src/api/index.ts` - The HTTP client: the CSRF header, error shaping, and one function per endpoint
- `src/utils/` - Pure helpers (capabilities, drift, delivery, Git paths, reveal, search index,
  return paths, formatting, telemetry)
- `src/composables/useColorScheme.ts` - Theme resolution across an explicit choice and the OS setting
- `src/router.ts`, `src/pinia.ts`, `src/main.ts` - Routing, store registration, and bootstrap
- `src/types/index.ts` - Shared API types
- `src/style.css` - The design layer: light and dark palettes, and the `@theme inline` bridge that
  exposes the `--app-*` tokens as Tailwind utilities
- `src/__tests__/` - Vitest specs, one file per surface
- `index.html` - Vite entry point; loads `src/main.ts`
- `vite.config.ts` - Vite configuration (dev server on port 3000, `/api` proxied to `:8080`)
- `vitest.config.ts` - Test configuration (happy-dom)
- `eslint.config.js` - ESLint flat config
- `tsconfig.json` - TypeScript configuration
- `package.json` - Dependencies and scripts
- `Dockerfile` + `nginx.conf` - Production image: `npm run build`, served by nginx with an SPA
  fallback and `/api/` proxied to the `kubeseal-ui-api` service
- `.env.example` - Every `VITE_` variable the app reads, all off by default
- `.github/workflows/ci-cd.yml` - GitHub Actions CI/CD pipeline
- `.gitignore` - Files to exclude from version control

There is no `tailwind.config.js`: Tailwind 4 is configured CSS-first, in `src/style.css`.

## Key Features

- Vue 3 Composition API with TypeScript, built by Vite
- Tailwind CSS 4 over a runtime token layer: `--app-*` custom properties bridged into utilities with
  `@theme inline`, so a theme swap needs no rebuild
- Light, dark, and system themes — an explicit choice wins over the OS setting in both directions
- Every text token is contrast-checked in `theme-contrast.spec.ts`, except `--app-faint`, which is
  decorative only — the concealed dots and keycap glyphs — and never carries a label
- OIDC authentication with PKCE
- Protected routes with capability-based authorization
- Encrypted diff visualization, with per-key reveal
- GitOps workflow support (direct and proposal modes)
- A search index over every Secret you can read, reachable from anywhere with <kbd>⌘K</kbd>
- Responsive layout

## Development

### Prerequisites

- Node.js 26 (LTS)
- npm 10.x
- A running API (see the `kubeseal-ui-api` repository)

### Running Locally

Run from the repository root:

```bash
npm install
npm run dev
```

The development server runs on port 3000 and proxies `/api` requests to http://localhost:8080.

### Building for Production

```bash
npm run build
```

`vue-tsc --noEmit` type-checks the project first; the static output is written to `dist/`, which the
Dockerfile serves through nginx.

### Linting and Testing

- Lint: `npm run lint`
- Test: `npm run test` (Vitest with happy-dom; specs live in `src/__tests__/` as `*.spec.ts`)
- Watch mode: `npm run test:watch`
- Coverage: `npm run test:coverage`

## Architecture

The frontend is a Single Page Application (SPA) built with:

- Vue 3 Composition API (`<script setup>`)
- Pinia for state management
- Vue Router for navigation
- Vite as build tool and dev server
- Tailwind CSS 4 for styling, over the token layer in `src/style.css`

The browser holds no long-lived credential and no plaintext: the session is an HttpOnly cookie the
script cannot read, a revealed value is scoped to the key it was revealed for and cleared on patch,
timeout, logout, or navigation, and any outbound request that would carry an identifier sits behind a
`VITE_` flag that is unset by default.

## Security

- OIDC authentication with PKCE flow
- HttpOnly cookies for session management
- CSRF protection for state-changing requests
- No plaintext secrets in browser storage
- Security events for auditability

## License

MIT License
