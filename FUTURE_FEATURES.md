# Future features and reliability backlog

Brainstorming draft — 2026-10-23. For a Strava-like motorhome/traveler app, the first priority is trusting a saved journey, not adding more features. Order below is provisional: **v1 acceptance** means evidence needed for existing behavior; **post-v1 exploration** means possible future work, not a commitment or release promise. This document does not expand the fixes currently in progress.

## Starting point in this checkout

- Expo SDK 57 Android app; device acceptance remains separate from JavaScript/fixture tests (see [DEVELOPMENT.md](DEVELOPMENT.md) and the existing [QA tracker](QA_ISSUES.md)).
- `src/db/migrations.js` / `tripDao.js` store trips, segmented track points, POIs and recommendations in local SQLite. `buildTripJsonForUpload` loads all of a trip's points and creates one JSON payload; `src/services/api.js` posts it to `/v2/trips/json`. Splitting storage and splitting transport are different decisions.
- `TripLocationTask.js`, `activeTrip.js` and the recording screen coordinate delivered background points, a persisted active-trip marker and a foreground-service notification. Persisting a marker alone does not prove the collector is still running.
- `usePhotoManager.js` handles photo operations separately; `imageHelpers.js` creates cache-file copies. Durable offline photo drafts need their own design, not an assumption that photo bytes live in the trip database.
- Local trips are owner-scoped; uploaded trip rows are retained. `syncStore.js` is not yet a durable upload queue. Backend resumability/idempotency support has not been established by this mobile-code review.

**Guardrails:** preserve existing GPX behavior unchanged; no implementation, build, push or deployment is authorized by this list. Use synthetic data for experiments. Never include tokens, raw routes, personal photos or precise coordinates in diagnostic reports by default.

## A. V1 reliability acceptance — protect the existing journey

### A1 · Measure long-trip capacity before choosing a redesign

- **Problem:** multi-day travel can expose disk, memory, rendering or request-size limits. Do not assume SQLite is intrinsically a small database, or that splitting a trip automatically saves space.
- **Options/evidence:** measure actual bytes per point (including table/index overhead and database journal/WAL files when applicable), total database growth, photo/cache bytes, available device space, peak JS memory while packaging JSON, payload size, server limits and map-render time. Test synthetic multi-day/multi-week trips at the actual sampling settings on representative low-storage phones. A planning estimate can use `points/day × measured bytes/point × days`, with separately measured photos and headroom; it is not a promised capacity.
- **Acceptance:** record the supported tested envelope and low-space behavior; preserve committed points and pending trips when writes or uploads fail. No silent truncation or automatic deletion of unsynced data. Decide whether a warning, safe pause or another explicit recovery action is needed if space runs out.
- **Questions/dependencies:** how long must one continuous trip last, how many offline days/photos are typical, and which low-end phone is representative? Requires device measurements and backend request-limit confirmation. Optimize only the measured bottleneck; B1 is a candidate, not a prerequisite by assumption.

### A2 · Recording interruption and recovery, not “impossible to close”

- **Problem:** backgrounding, screen lock, battery restrictions, process death, reboot and user force-stop are different events. A foreground service cannot guarantee uninterrupted recording. Expo documents termination/vendor limits; Android permits users to stop an app with a foreground service and intentionally keeps force-stopped packages stopped until user action. [Expo background location](https://docs.expo.dev/versions/latest/sdk/location/#background-location), [Android foreground-service Stop](https://developer.android.com/develop/background-work/services/fgs/handle-user-stopping), [Android force-stop behavior](https://developer.android.com/about/versions/15/behavior-changes-all#stopped-state).
- **Options/evidence:** validate permissions and foreground-service notification, explain vendor battery settings without promising a cure, persist checkpoints and recording state, and reconcile saved state with the actual collector on relaunch. Offer a clear resume/save/discard decision for interrupted recordings; show gaps rather than inventing missing movement. Review any wording implying the app can always keep tracking after closure.
- **Acceptance:** test screen-off/background, denied/revoked permissions, battery saver, recent-app swipe, OS process death, foreground-service Stop, force-stop/reopen and reboot separately. Retain committed points; avoid duplicate collectors, cross-account recording or falsely showing an inactive collector as recording. Resume intentionally with a new segment where appropriate. No claim of recovering points never delivered to the app.
- **Questions/dependencies:** which Android versions/vendors are supported; how should an interruption be shown? Requires an approved native SDK-57 test binary, real-device matrix and checkpoint/recovery verification. Keep Android's intentional stop controls effective; do not design a force-stop bypass.

### A3 · Honest save/upload status and retry behavior

- **Problem:** losing connectivity after the server saves but before its response arrives can leave success uncertain; repeated taps, account switches and partial photo failures add confusion.
- **Options/evidence:** validate the current recording/save/upload guards and local preservation on failure; distinguish “saved on this phone,” “uploading,” “confirmed on server” and “needs attention.” Test dropped connections both before and after server acceptance, double taps, relaunch, expired sessions and partial photo success. Treat an unknown server outcome as unknown, not automatically failed or safely repeatable.
- **Acceptance:** active recordings cannot be uploaded/deleted accidentally; failed operations retain recoverable local data; confirmed photo successes are not knowingly uploaded again. Establish the remaining duplicate-on-uncertain-success risk rather than claiming the UI lock solves it. Any unmet reliability requirement stays an explicit release decision in the QA tracker.
- **Questions/dependencies:** can the backend look up a stable client trip/operation ID and return the prior result? Requires coordinated API evidence; durable retry/idempotency belongs in B1. Current fixes are not automatically a complete offline-sync system.

### A4 · Account isolation and supportable failures

- **Problem:** local drafts, private media and stale sessions must not leak between travelers/accounts; silent failures make lost-journey reports hard to diagnose.
- **Options/evidence:** exercise logout/login, session expiry and account switching with pending trips, photo retries and viewer caches. Verify visibility throughout feed/detail/gallery and server authorization. Record redacted error categories, app/OS version, storage pressure and operation state; let the user preview an optional support report.
- **Acceptance:** only the owner can access pending local trips; logout does not silently destroy unsynced work; stale requests cannot apply to the new session. Distinguish network, permission, disk and server failures with a usable recovery action. Validate on native devices as well as fixtures.
- **Questions/dependencies:** which diagnostics are genuinely needed and for how long? Requires server authorization checks and a clear data-retention/support policy. Account isolation is not a claim of local database encryption; stronger protections need separate threat-model review.

## B. Post-v1 exploration — choose from evidence and traveler demand

### B1 · Resumable long journeys and durable synchronization — first candidate

- **Problem:** a single large JSON upload is fragile on campsite Wi-Fi or roaming data, even if the local database fits comfortably.
- **Options:** compare paged reads/streamed packaging, bounded upload chunks, and day/stage presentation under one parent journey. Transport chunks should not silently become new journeys or overwrite meaningful pause/resume segments. Consider a durable owner-scoped queue with retry/backoff, progress, cancel/resume and Wi-Fi-only preferences; coordinate photo retries separately.
- **Questions:** should uploads wait until Stop or send only sealed segments during a journey? What is the smallest protocol that solves the measured bottleneck? How should edits interact with queued versions and partial server uploads?
- **Dependencies/decision evidence:** mobile + backend contract with stable trip/chunk/operation IDs, idempotent retries, checksums/counts, durable acknowledgments and an explicit finalize step. Reassembly must preserve segment boundaries, timestamps, point order (including tied timestamps), metadata, POIs and photo associations. Test lost acknowledgments, reordered/duplicate chunks, restart, account change and finalize failure against the original synthetic dataset: no missing or duplicated points. Keep the authoritative local data until complete server confirmation and the agreed retention policy permit cleanup. No blind splitting, silent simplification or premature deletion.

### B2 · External GPS devices — feasibility before a universal connector

- **Problem:** travelers may record on a dedicated GPS or want a more accurate external receiver.
- **Options:** start with user-selected track-file import (GPX/FIT/TCX candidates) or a vendor export/share flow; investigate vendor APIs or direct Bluetooth/BLE/USB recording only for named devices and documented protocols. File import and live GPS replacement are separate products.
- **Questions:** which exact devices/models, live recording or after-trip import, and which fields matter? How should duplicates, device clock errors, missing timestamps, disconnects and phone/GPS switching be handled?
- **Dependencies/decision evidence:** sample synthetic files, vendor protocol/API permission and licensing, SDK-57 native-module feasibility, Android permissions and physical hardware testing. Preserve source/segment/time provenance and preview imports before saving. Do not assume every Bluetooth GPS exposes the same protocol. Existing GPX behavior remains unchanged unless separately approved.

### B3 · Offline maps and motorhome-aware navigation

- **Problem:** a recorded track alone is not an offline map or a safe route for a tall/heavy vehicle.
- **Options:** evaluate downloadable map areas and saved campsites first; compare handoff to an existing navigation app with in-app routing later. Show download size, freshness, offline availability and removable map-cache storage separately from irreplaceable trip data.
- **Questions:** map viewing or turn-by-turn guidance; which countries; are height, weight, width, ferries and restricted roads essential?
- **Dependencies/decision evidence:** map-provider offline rights/costs, routing-data coverage and storage budget from A1. Validate restrictions and stale-data behavior; do not present a route as guaranteed vehicle-safe. Avoid building a navigation engine just to display a journey.

### B4 · Safer sharing, following and discovery

- **Problem:** discovering travelers/campsites is useful, but public endpoints, home locations and unwanted contact can expose people.
- **Options:** explore start/end privacy zones or trimming, delayed sharing rather than live location, visibility previews, follow approval, block/report/mute and focused filters for relevant trips/recommendations.
- **Questions:** who should see precise routes, media and recommendations; should visibility changes apply to existing shares; which discovery filters help motorhome travelers most?
- **Dependencies/decision evidence:** consistent backend authorization across maps, feed, search, photos and any exports; privacy-zone semantics and moderation capacity. Validate that thumbnails, metadata and photo geotags do not undo the privacy setting. Prefer safe defaults over engagement features.

### B5 · A usable journey gallery and accessible controls

- **Problem:** long journeys need an understandable story, and recording controls must remain usable with large text, screen readers, bright sun and limited connectivity.
- **Options:** explore day/segment grouping, captions, explicit photo ordering, upload-state badges and a deliberate offline photo-draft flow. Audit core controls for TalkBack labels, touch-target size, contrast, large-text layout and non-color-only state before adding richer gallery tools.
- **Questions:** one album per journey or daily chapters; what must be editable offline; which accessibility issues block the current core flow?
- **Dependencies/decision evidence:** durable media storage and sync design, timestamp/time-zone handling, device accessibility testing and measured image memory. Any accessibility defect blocking recording/save/upload belongs in v1 acceptance, not deferred merely because gallery enhancements are later.

### B6 · Backup, export and a storage/retention center

- **Problem:** phone loss, reinstall or storage cleanup can destroy the only copy of an unsynced journey; retained uploaded data and caches can also accumulate.
- **Options:** investigate explicit backup/restore and user-controlled exports, with a storage view separating pending trips, confirmed uploads, offline maps and disposable caches. Consider retention choices only after confirmation of a restorable server copy; explain what is local-only versus backed up.
- **Questions:** what can the user take to another app/device, is offline encrypted backup needed, how long should uploaded local copies remain, and how should deletion propagate?
- **Dependencies/decision evidence:** versioned export/restore format, integrity checks, ownership/encryption design and tested restore—not merely successful backup creation. Cleanup must never silently remove unsynced trips or their only photos. Review cache eviction separately from durable drafts. Any future GPX work needs a separate compatibility review; this backlog changes no GPX path.

## Suggested next discussion

Agree the longest expected offline journey, two or three representative Android phones, and the first external GPS device people actually use. Use A1/A2 results to decide whether B1 is necessary for the intended v1 envelope or can wait. Then select one post-v1 experiment at a time; leave the rest as questions, not simultaneous projects.

Platform references above were consulted on 2026-10-23. Expo's `latest` documentation can move beyond this checkout's SDK 57; recheck version-specific behavior before implementation and rely on native-device evidence for support claims.
