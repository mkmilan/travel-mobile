# Mobile test issues — 2026-10-22

Scope: review-branch fixes, one focused commit per issue, with local automated checks.
**No builds, deployments, OTA updates, production changes, or deletion of local recordings.**
Private screenshots, identities, locations and account data must not be added here.

## Issue register

| ID | Priority / status | Evidence and intended fix | Checks / commit |
| --- | --- | --- | --- |
| MOB-001 | High — implemented; device validation pending | Reported Save Trip form cannot be operated. Screenshot confirms footer overlaps Android system navigation; the background dimming itself is expected. Code uses a swipe-enabled third-party modal, two keyboard-avoidance layers, no safe-area inset and no Android-back close callback. Replace only the recording form's presentation with a native, safe-area-aware modal; keep content and backdrop separate, one keyboard layer, explicit cancel/back, and wait for save before dismissal. Preserve selected transport metadata (caller key corrected from `defaultTravelMode` to `defaultTransportMode`). | 5 component/lifecycle/persistence fixtures passed; full suite 60/60 passed. Android three-button/gesture navigation, keyboard, cancel/reopen and retry remain device gates. Commit: `478f4c0`. |
| MOB-002 | High — implemented; device validation pending | Save POI calls `onSubmit`, but the recording screen supplies none. Connect existing local POI persistence with a valid recording/location snapshot, retain note on failure, guard duplicate saves and use the corrected recording-form presentation. | 4 added fixtures cover callback wiring, captured GPS point, persistence payload, no GPS/no active trip, stale/unowned sessions, duplicate taps, failure/retry and cancel. Full suite 64/64 passed. Device gate remains. Commit: `b76b17b`. |
| MOB-003 | Medium — implemented; device validation pending | Profile Trips focus effect depends on a fetch callback whose identity changes with loading/hasNext; empty/error results can refetch repeatedly. Initial state shows empty text before the request. Stabilize request lifecycle, loading/empty/error UI and retry; guard concurrent/stale requests. | 9 lifecycle/hook/UI fixtures cover success, empty, error, malformed data, refresh coalescing, pagination, repeated focus and profile/session changes. Full suite 73/73 passed. Commit: `f26d8ff`. |
| MOB-004 | Medium — implemented; device validation pending | Profile Recommendations has the same focus loop and lets replacement requests bypass its loading guard. Gallery navigation can also ask for the first page. Apply bounded, deduplicated loading and truthful initial state without breaking gallery-to-detail navigation. | 5 additional component fixtures cover gallery/focus overlap, repeat-ID intents, empty/error outcomes, detail-response races, identity isolation, edit refresh and deletion racing an older request. Full suite 78/78 passed. Commit: `b098eed`. |
| MOB-005 | Medium — implemented; device validation pending | Gallery refetches on every focus and can overlap requests. Its GET requests a CSRF token unnecessarily. Review request lifetime/caching and remove redundant token request if read-only API contract permits. | 4 component/API fixtures cover request counts, pagination, error/retry, cached refocus, source-return refresh and profile/session changes. Full suite 82/82 passed. No photo-upload/data mutation changes. Commit: this MOB-005 commit (see `git log --grep=MOB-005`). |
| MOB-006 | Low — deferred | Profile update navigation can push another copy of the user profile. Separate navigation UX investigation; do not mix with loading fixes. | Review back-stack behavior before changing. |
| MOB-007 | Low — deferred | Test registration messaging suggests email delivery despite the isolated test service having delivery disabled. Separate test-environment UX task. | Keep production account flows unchanged. |

## Baseline and acceptance boundaries

- Baseline: `07c7b8e` on `review/modernization-2026-10-21`.
- User reports recording and later upload from the recording page work; preserve both.
- The later screenshot shows a successfully uploaded trip with a map polyline. It does not prove the stop/save form works.
- Root/login navigation is intentionally outside these fixes.
- Existing fixture runner: `npm test` (Node tests, no native build).
- Native emulator/device interaction is unavailable in this checkout. Automated checks can prove handler, request and component contracts, not actual Android touch dispatch or keyboard geometry.
- Follow-up native acceptance must include stop → edit metadata → save; POI during recording/paused state; typing, scrolling and chip selection; Android Back, backdrop and explicit cancel; reopen; repeated taps; failure/retry; pending-trip upload; login/root navigation smoke test.

## Implementation history

- `8b31217`: initial issue register before implementation.
- MOB-001: native recording-form wrapper, explicit dismissal routes and stopped-screen draft reopening, bottom safe-area protection, asynchronous save/error/double-tap handling and transport-key correction. Exact native touch-lock cause is not proven by screenshots or fixtures; device verification remains required. No login, recording collector or upload-path changes.
- `478f4c0` (MOB-001): trip save fix, including cancel → stopped screen → reopen retained draft and a stable trip end timestamp across metadata edits.
- MOB-002: wired Save POI to existing local append-only persistence with captured point/session and ownership checks; shared safe-area form, pending/error feedback and duplicate-tap protection. No DB schema/collector/upload code changed.
- `b76b17b` (MOB-002): connected guarded POI persistence and recoverable form.
- MOB-003: shared bounded list-request controller and stable profile/session hook; Trips uses explicit loading/empty/error states, user-triggered retry, and identity-scoped detail sheets. Empty/error results no longer cause automatic repeated page-one requests.
- `f26d8ff` (MOB-003): bounded Trips requests, state/retry UI and identity-gated detail sheets.
- MOB-004: Recommendations uses the same lifecycle; gallery/focus initialization shares one request, details/editor are identity-scoped and old route-map responses are ignored. Existing gallery intents still find records in loaded pages only; off-page direct lookup is a separate enhancement, not an automatic paging loop.
- `b098eed` (MOB-004): bounded Recommendations requests, identity-safe details/editor, and replacement refresh after deletion races an older response.
- MOB-005: Gallery reuses loaded pages on ordinary tab switches, supports pull-to-refresh/retry and refreshes once on returning from a photo source; viewer is profile/session scoped. Its authenticated GET no longer fetches an unnecessary CSRF token. Server middleware uses default GET/HEAD/OPTIONS exclusions; write-method CSRF behavior is unchanged.
