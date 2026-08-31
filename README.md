# kubeseal-ui-frontend

Vue 3 + Naive UI frontend for kubeseal-ui

## Repository Structure

- `frontend/` - Vue 3 source code
- `public/` - Static assets
- `src/` - Main source directory
- `vite.config.ts` - Vite configuration
- `tailwind.config.js` - Tailwind CSS configuration
- `tsconfig.json` - TypeScript configuration
- `package.json` - Dependencies and scripts
- `.github/workflows/ci.yml` - GitHub Actions CI/CD pipeline
- `.gitignore` - Files to exclude from version control

## Key Features

- Vue 3 composition API with TypeScript
- Naive UI component library with Tailwind CSS
- OIDC authentication with PKCE
- Protected routes with capability-based authorization
- Encrypted diff visualization
- GitOps workflow support (direct and proposal modes)
- Responsive design with mobile-first approach

## Development

### Prerequisites

- Node.js 26 (LTS)
- npm 10.x
- Vite 8.x

### Running Locally

```bash
cd frontend
npm install
npm run dev
```

The development server runs on port 3000 and proxies API requests to http://localhost:8080.

### Building for Production

```bash
cd frontend
npm run build
```

The production build creates a `dist/` directory with static files that can be served by nginx.

### Linting and Testing

- Lint: `npm run lint`
- Test: `npm run test`
- Watch mode: `npm run test:watch`

## Architecture

The frontend is a Single Page Application (SPA) built with:

- Vue 3 Composition API
- Naive UI component library
- Tailwind CSS for styling
- Vite as build tool
- Pinia for state management
- Vue Router for navigation

## Security

- OIDC authentication with PKCE flow
- HttpOnly cookies for session management
- CSRF protection for state-changing requests
- No plaintext secrets in browser storage
- Security events for auditability

## License

MIT License