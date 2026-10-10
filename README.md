# kubeseal-ui-frontend

Vue 3 single-page app for kubeseal-ui: browse namespaces and Secrets, review a key change as an
encrypted diff, and deliver the sealed result to Git.

## Repository Structure

- `src/` - Application source (components, views, stores, composables)
- `src/style.css` - The design layer: light and dark palettes, the `@theme` bridge that exposes the
  `--app-*` tokens as Tailwind utilities, and the `glass` and `field` utilities with their fallbacks
- `src/components/ui/` - Native-element primitives (`AppCard`, `AppButton`, `AppInput`, `AppAlert`, ...)
- `index.html` - Vite entry point; loads `src/main.ts`
- `vite.config.ts` - Vite configuration (dev server on port 3000, `/api` proxied to `:8080`)
- `vitest.config.ts` - Test configuration (happy-dom, specs colocated under `src/`)
- `tsconfig.json` - TypeScript configuration
- `package.json` - Dependencies and scripts
- `Dockerfile` + `nginx.conf` - Production image: `npm run build`, served by nginx with an SPA
  fallback and `/api/` proxied to the `kubeseal-ui-api` service
- `.github/workflows/ci.yml` - GitHub Actions CI/CD pipeline
- `.gitignore` - Files to exclude from version control

`tailwind.config.js` is present but unused: Tailwind 4 is configured CSS-first, in `src/style.css`.

## Key Features

- Vue 3 Composition API with TypeScript, built by Vite
- Tailwind CSS 4 over a runtime token layer: `--app-*` custom properties bridged into utilities with
  `@theme inline`, so a theme swap needs no rebuild
- Light, dark, and system themes — an explicit choice wins over the OS setting in both directions
- A three-tier glass material (blurred fill, optional edge refraction, opaque fallbacks) that degrades
  to opaque without `backdrop-filter` support and honours `prefers-reduced-transparency` and
  `prefers-reduced-motion`
- OIDC authentication with PKCE
- Protected routes with capability-based authorization
- Encrypted diff visualization, with per-key reveal
- GitOps workflow support (direct and proposal modes)
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
- Test: `npm run test` (Vitest with happy-dom; specs live beside the code as `*.spec.ts`)
- Watch mode: `npm run test:watch`
- Coverage: `npm run test:coverage`

## Architecture

The frontend is a Single Page Application (SPA) built with:

- Vue 3 Composition API (`<script setup>`)
- Pinia for state management
- Vue Router for navigation
- Vite as build tool and dev server
- Tailwind CSS 4 for styling, over the token layer in `src/style.css`

## Security

- OIDC authentication with PKCE flow
- HttpOnly cookies for session management
- CSRF protection for state-changing requests
- No plaintext secrets in browser storage
- Security events for auditability

## License

MIT License
