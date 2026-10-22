# Mobile test issues — 2026-10-22

Scope: review-branch fixes, one focused commit per issue, with local automated checks.
**No builds, deployments, OTA updates, production changes, or deletion of local recordings.**
Private screenshots, identities, locations and account data must not be added here.

## Issue register

| ID | Priority / status | Evidence and intended fix | Checks / commit |
| --- | --- | --- | --- |
| MOB-001 | High — investigating | Reported Save Trip form cannot be operated. Screenshot confirms footer overlaps Android system navigation; the background dimming itself is expected. Code uses a swipe-enabled third-party modal, two keyboard-avoidance layers, no safe-area inset and no Android-back close callback. Replace only the recording form's presentation with a native, safe-area-aware modal; keep content and backdrop separate, one keyboard layer, explicit cancel/back, and wait for save before dismissal. Audit selected transport metadata. | Component/lifecycle fixtures; Android three-button and gesture navigation, keyboard, cancel/reopen and retry are device gates. Commit: pending. |
| MOB-002 | High — confirmed | Save POI calls `onSubmit`, but the recording screen supplies none. Connect existing local POI persistence with a valid recording/location snapshot, retain note on failure, guard duplicate saves and use the corrected recording-form presentation. | Fixtures for callback wiring, persistence payload, no GPS/no active trip, duplicate taps, failure/retry and cancel. Device gate remains. Commit: pending. |
| MOB-003 | Medium — confirmed | Profile Trips focus effect depends on a fetch callback whose identity changes with loading/hasNext; empty/error results can refetch repeatedly. Initial state shows empty text before the request. Stabilize request lifecycle, loading/empty/error UI and retry; guard concurrent/stale requests. | Deferred-response fixtures: success, empty, error, refresh, pagination, focus changes and profile changes. Commit: pending. |
| MOB-004 | Medium — confirmed | Profile Recommendations has the same focus loop and lets replacement requests bypass its loading guard. Gallery navigation can also ask for the first page. Apply bounded, deduplicated loading and truthful initial state without breaking gallery-to-detail navigation. | Deferred-response fixtures plus gallery navigation and edit/delete refresh. Commit: pending. |
| MOB-005 | Medium — review next | Gallery refetches on every focus and can overlap requests. Its GET requests a CSRF token unnecessarily. Review request lifetime/caching and remove redundant token request if read-only API contract permits. | Request-count/error/refocus/account-change fixtures; no photo upload/data mutation changes. Commit: pending. |
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
