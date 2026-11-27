# Babel Compatibility and NestJS Server Migration

## Goal

Deliver browser compatibility and a NestJS server refactor together in one pull request. The web build targets the latest two releases of major browsers plus Android WebView. The server keeps the current HTTP, static file, download proxy, and WebSocket contracts.

## Scope

- Configure Babel-driven ES syntax transforms and local, browser-selected polyfill loading for production web builds.
- Migrate the Node HTTP server to NestJS modules and lifecycle-managed WebSocket/TCP resources.
- Preserve existing route paths, response shapes/status codes, CORS behavior, cache/compression headers, file path mappings, streaming limits, and `PORT`/upstream environment configuration.
- Keep Vite development proxy behavior and container deployment working.

## Design

Use Vite's legacy plugin, which uses Babel to create modern and legacy output and loads only the required polyfills for the configured browser targets. Polyfills are packaged with the site; no third-party runtime CDN is required. Browserslist will explicitly cover the latest two Chrome, Firefox, Safari, and Edge releases and Android WebView.

The NestJS application is divided into focused modules for catalog APIs, game downloads and archive inspection, static/runtime assets, and WebSocket proxy/Bluetooth services. The HTTP adapter and existing path contracts remain stable. WebSocket upgrade handling and TCP proxy sockets are attached through Nest lifecycle hooks and closed during shutdown.

## Acceptance

- Production build emits modern and legacy entry points, and the legacy entry dynamically loads its local polyfill chunk.
- Server tests and typecheck pass; Nest app starts with the existing environment variables.
- Smoke checks cover representative API success/error responses, static runtime files, gzip/ETag/immutable headers, download bounds and ZIP validation, WebSocket upgrade routes, and development proxy paths.
- Docker build/start remains valid.
- Desktop browser checks are recorded separately from real Android WebView checks; unavailable device validation is reported as a residual risk.
