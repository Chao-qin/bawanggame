# Web Development Backend Design

- Goal: Start the Web lobby and Node API together with `pnpm dev`. Flash archive requests and server JAR icons go through Vite to the Node API.
- Scope: Root dev script, Vite proxy targets, and local development instructions. The API destination uses the same `PORT` environment variable as the Node server, defaulting to 8080.
- Compatibility: Keep the production start command, API contracts, mobile packaging, and existing proxy routes, including the separate Dasong service.
- Acceptance: Verify the Web lobby, Flash search, and a server JAR icon through the Vite URL. Check startup with an alternate API port and shutdown of both processes. Verify that an upstream error remains a JSON API response.
