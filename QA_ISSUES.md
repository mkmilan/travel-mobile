# Mobile test issues — 2026-10-22

Scope: review-branch fixes, one focused commit per issue, with local automated checks.
**No builds, deployments, OTA updates, production changes, or deletion of local recordings.**
Private screenshots, identities, locations and account data must not be added here.
Priority: resolve and validate existing major issues before deferred navigation or gallery-discoverability enhancements.

## Issue register

| ID | Priority / status | Evidence and intended fix | Checks / commit |
| --- | --- | --- | --- |
| MOB-001 | High — implemented; device validation pending | Reported Save Trip form cannot be operated. Screenshot confirms footer overlaps Android system navigation; the background dimming itself is expected. Code uses a swipe-enabled third-party modal, two keyboard-avoidance layers, no safe-area inset and no Android-back close callback. Replace only the recording form's presentation with a native, safe-area-aware modal; keep content and backdrop separate, one keyboard layer, explicit cancel/back, and wait for save before dismissal. Preserve selected transport metadata (caller key corrected from `defaultTravelMode` to `defaultTransportMode`). | 5 component/lifecycle/persistence fixtures passed; subsequent combined recording suite passed 64/64 tests. Android three-button/gesture navigation, keyboard, cancel/reopen and retry remain device gates. Commit: `478f4c0`. |
| MOB-002 | High — implemented; device validation pending | Save POI calls `onSubmit`, but the recording screen supplies none. Connect existing local POI persistence with a valid recording/location snapshot, retain note on failure, guard duplicate saves and use the corrected recording-form presentation. | 4 added fixtures cover callback wiring, captured GPS point, persistence payload, no GPS/no active trip, stale/unowned sessions, duplicate taps, failure/retry and cancel. Full suite 64/64 passed. Device gate remains. Commit: `b76b17b`. |
| MOB-003 | Medium — implemented; device validation pending | Profile Trips focus effect depends on a fetch callback whose identity changes with loading/hasNext; empty/error results can refetch repeatedly. Initial state shows empty text before the request. Stabilize request lifecycle, loading/empty/error UI and retry; guard concurrent/stale requests. | 9 lifecycle/hook/UI fixtures cover success, empty, error, malformed data, refresh coalescing, pagination, repeated focus and profile/session changes. Full suite 73/73 passed. Commit: `f26d8ff`. |
| MOB-004 | Medium — implemented; device validation pending | Profile Recommendations has the same focus loop and lets replacement requests bypass its loading guard. Gallery navigation can also ask for the first page. Apply bounded, deduplicated loading and truthful initial state without breaking gallery-to-detail navigation. | 5 additional component fixtures cover gallery/focus overlap, repeat-ID intents, empty/error outcomes, detail-response races, identity isolation, edit refresh and deletion racing an older request. Full suite 78/78 passed. Commit: `b098eed`. |
| MOB-005 | Medium — implemented; device validation pending | Gallery refetches on every focus and can overlap requests. Its GET requests a CSRF token unnecessarily. Review request lifetime/caching and remove redundant token request if read-only API contract permits. | 4 component/API fixtures cover request counts, pagination, error/retry, cached refocus, source-return refresh and profile/session changes. Full suite 82/82 passed. No photo-upload/data mutation changes. Commit: `d338ac4`. |
| MOB-006 | Low — deferred | Profile update navigation can push another copy of the user profile. Separate navigation UX investigation; do not mix with loading fixes. | Review back-stack behavior before changing. |
| MOB-007 | Low — deferred | Test registration messaging suggests email delivery despite the isolated test service having delivery disabled. Separate test-environment UX task. | Keep production account flows unchanged. |
| MOB-008 | Low — deferred | Gallery → recommendation opens an item only after it is present in loaded recommendation pages. A direct lookup for an off-page target is a separate enhancement; these fixes deliberately do not add unbounded auto-pagination. | Verify target access and missing-item UX before implementing. |
| MOB-009 | Low — deferred at user's request | Add swipe-left/right navigation to the later backlog. The affected screens and the action expected for each direction are unspecified; do not assume tab, item or history navigation. | Clarify screens and direction semantics when prioritized. No implementation requested now. |
| MOB-010 | Low — deferred at user's request | The gallery within a trip is reported as insufficiently visible/discoverable. This is a later UX enhancement, separate from the profile Gallery request fix in MOB-005. | Review the trip-gallery entry point and expected discoverability with the user when prioritized. No implementation requested now. |
| MOB-011 | High — implemented; device validation pending | Shared BottomModal uses fixed bottom padding without modal-window safe-area insets; affected screens include recommendation/comment forms, selectors and social/detail sheets. Keep the existing animation and sibling backdrop, add modal-local safe areas that consumer styles cannot erase, and size against available space. Route Map fills only the space below its header. This is a confirmed layout contract gap, not proof of the original native touch-lock cause. | Component fixtures cover Android/iOS structure, Back/backdrop callbacks, one keyboard layer, relative height and inset preservation with consumer overrides. Native keyboard/navigation-bar geometry remains a gate. Commit: `b0bcf2a`. |
| MOB-012 | High — implemented; device validation pending | Recommendation Save permits concurrent submissions and dismissal while pending; the profile edit caller swallows failure, allowing false success and dismissal. Add a synchronous save guard, pending feedback, blocked dismissal/reopen, retained draft/error and rejection propagation; remove the redundant keyboard layer. | 3 added component/callback fixtures cover duplicate saves, pending dismissal/reopen, failure/retry, unconfirmed edit result and failed profile update. Native category/tag selectors and keyboard behavior remain device gates. |
| MOB-013 | High — queued | Comment forms allow dismissal during pending submission; social-sheet submission can remain busy after rejection. | Verify both comment surfaces, duplicate taps, failure/retry and mutation-versus-refresh completion boundaries. |

## Baseline and acceptance boundaries

- Baseline: `07c7b8e` on `review/modernization-2026-10-21`.
- User reports recording and later upload from the recording page work; preserve both.
- The later screenshot shows a successfully uploaded trip with a map polyline. It does not prove the stop/save form works.
- Root/login navigation is intentionally outside these fixes.
- Existing fixture runner: `npm test` (Node tests, no native build).
- Native emulator/device interaction is unavailable in this checkout. Automated checks can prove handler, request and component contracts, not actual Android touch dispatch or keyboard geometry.
- Follow-up native acceptance must include stop → edit metadata → save; POI during recording/paused state; typing, scrolling and chip selection; Android Back, backdrop and explicit cancel; reopen; repeated taps; failure/retry; pending-trip upload; login/root navigation smoke test.

## User phone smoke test — 2026-10-23

- The user reports that limited testing of editing an existing trip, adding a photo and recommendations seems to work on the installed Travel Test build 3. This is a user-reported smoke observation, not an independently reproduced or comprehensive acceptance result.
- Installed build 3 does not contain the latest unbuilt fixes recorded at `a64e5c3`. This report does not validate MOB-001–005 or close their device gates.
- MOB-009/010 are recorded for later only; existing major issues take priority. No navigation or gallery-discoverability implementation is part of this backlog update.

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

- `d338ac4` (MOB-005): gallery cache/request/CSRF cleanup.

## Local verification checkpoint — 2026-10-22

- `npm test`: **82/82 passed** on the final code; includes existing auth/root-navigation, recording-permission, upload, account/privacy and configuration fixtures plus the new recording/profile regressions.
- Parsed all **139** application/source JavaScript/JSX files with the installed Babel parser; `git diff --check` passed. No lint/typecheck script is configured in this JavaScript project.
- Independent source review and a separate full test run found no source-level blockers. Fixtures use synthetic data and mocked native/SQLite/network boundaries; they are not device or real-backend acceptance.
- **No build, bundle export, deployment, OTA publication, production access or native emulator run was performed.** Publication is restricted to the explicitly authorized review branch; no main update or merge. No migrations, collector changes or destructive recording-data operations were added.
- Native acceptance remains pending: recording form hit testing, keyboard/scroll geometry, Android Back/Cancel/reopen/save, three-button versus gesture navigation, POI success/retry; gallery empty-list pull refresh, pagination scroll position (native visible-content anchoring retained), viewer close → source navigation; then recording/upload and login/root-navigation smoke tests.
- MOB-006–010 remain deferred. Preserve the working installed test app until a new build is separately authorized.
