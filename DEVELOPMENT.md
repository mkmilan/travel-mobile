# Isolated mobile development

Use the review branch. No production account, database, EAS build or map key is required for the fixture tests below.

1. Copy `.env.example` to `.env.development`; keep all `.env` files out of Git. App config's `extra` and Google Maps settings become visible in the app: never put database passwords, signing secrets or backend tokens here.
2. Run a separate development backend with a test Mongo database and development email stub. Set `API_URL` explicitly. Android emulators use `http://10.0.2.2:5001/api`; a physical phone requires the development machine's reachable LAN address. Cloud localhost is not your phone's localhost. iOS simulators on the same host typically use localhost. Do not point to Render/production.
3. `npm test` runs dependency-free fixture tests. `npm ci --ignore-scripts` installs the locked stack without lifecycle scripts if registry access is available. Inspect any further native setup steps before execution.
4. Native testing is a separate gate: login, feed, start/pause/resume/stop recording, background/relaunch, upload, logout while recording, and switch between two test accounts. Confirm account A's pending trips remain available only to A and that no points are collected after logout. These tests have not been run on a device by this change.

EAS development/preview/testing profiles now select development, not production, and no longer contain a production API URL. Production is explicit. Do not run EAS builds until their environment has been deliberately configured and approved. No build or deployment is part of this patch. Existing native binaries need rebuilding to pick up transport-security configuration; this patch does not update already installed apps.

The Expo 53 / React Native 0.79 stack is intentionally unchanged. A compatible SDK migration is a later task. Local unsynced SQLite trips are preserved at logout, scoped by owner, not deleted. Legacy records with no known owner are not automatically reassigned. This is account isolation, not encryption at rest.

Private media now uses native image request Authorization headers, never token-bearing URLs. Photo and avatar components remount with a non-secret session-specific cache identity, request reloads, and close viewers on account changes. Verify private/public/follower photo thumbnails and fullscreen viewing on a real device, including logout/account switching; native image-cache behavior is not proven by fixture tests. No mobile GPX downloader was found; mobile uses JSON trip endpoints.
