# Isolated mobile development

Use the review branch. No production account, database, EAS build or map key is required for the fixture tests below.

1. Copy `.env.example` to `.env.development`; keep all `.env` files out of Git. App config's `extra` and Google Maps settings become visible in the app: never put database passwords, signing secrets or backend tokens here.
2. Run a separate development backend with a test Mongo database and development email stub. Set `API_URL` explicitly. Android emulators use `http://10.0.2.2:5001/api`; a physical phone requires the development machine's reachable LAN address. Cloud localhost is not your phone's localhost. iOS simulators on the same host typically use localhost. Do not point to Render/production.
3. `npm test` runs dependency-free fixture tests. `npm ci --ignore-scripts` installs the locked stack without lifecycle scripts if registry access is available. Inspect any further native setup steps before execution.
4. Native testing is a separate gate: login, feed, start/pause/resume/stop recording, background/relaunch, upload, logout while recording, and switch between two test accounts. Confirm account A's pending trips remain available only to A and that no points are collected after logout. These tests have not been run on a device by this change.

EAS development/preview/testing profiles now select development, not production, and no longer contain a production API URL. Production is explicit. Do not run EAS builds until their environment has been deliberately configured and approved. No build or deployment is part of this patch. Existing native binaries need rebuilding to pick up transport-security configuration; this patch does not update already installed apps.

The current branch uses Expo 57 / React Native 0.86. See the migration checkpoint below. Local unsynced SQLite trips are preserved at logout, scoped by owner, not deleted. Legacy records with no known owner are not automatically reassigned. This is account isolation, not encryption at rest.

Private media now uses native image request Authorization headers, never token-bearing URLs. Photo and avatar components remount with a non-secret session-specific cache identity, request reloads, and close viewers on account changes. Verify private/public/follower photo thumbnails and fullscreen viewing on a real device, including logout/account switching; native image-cache behavior is not proven by fixture tests. No mobile GPX downloader was found; mobile uses JSON trip endpoints.

## Targeted tooling and lifecycle hardening (2026-10-21)

The lockfile updates `tar` to 7.5.22, `undici` to 6.29.1, and `shell-quote` to 1.12.0 within their existing dependency ranges. At that earlier checkpoint, Expo and React Native were unchanged; no forced overrides were added. The accompanying `minizlib` transitive update is 3.1.0. `npm audit` changed from 216 package findings (3 critical) to 212 (0 critical, 94 high, 27 moderate, 91 low) at this checkpoint. Many counts represent inherited Expo/Metro/Babel tooling paths, not separate demonstrated native exploits. This is not a clean audit: completing a supported SDK migration and reviewing remaining findings is still necessary.

Automatic logout now checks that a 401 belongs to the current request session, so a delayed failure from the previous account does not ordinarily clear a newer login. Public unauthenticated 401 responses do not trigger logout. Background GPS delivery checks that its persisted recording marker is still active before each write and ignores corrupt stored user data. A native database write already underway when stopping may still finish; fixture tests do not establish operating-system lifecycle guarantees.

Verification: 18 fixture tests passed, offline Expo public configuration loaded, and Android JavaScript/Hermes export succeeded (1,513 modules). The export used only a loopback API URL and no credentials or production service. It is not a native Android build or device test. Native foreground/background/logout races, image cache behavior, permissions and physical GPS remain device-validation gates.

## Expo 57 migration checkpoint (2026-10-21)

Target: Expo 57.0.31, React Native 0.86.3, React 19.2.3 and SDK-matched native modules. Use Node 24 (`.nvmrc`); the toolchain supports Node 22.13+ as well. SDK 58 was released October 15, but this migration deliberately chooses the established SDK 57 patch line rather than combining additional SDK 58 API removals with the old-project migration. SDK 57 fixes the SDK 56 Hermes/worklets memory regression. Dependencies were aligned at SDK 54, 55 and 56 checkpoints before 57; fixture tests and compatibility checks ran at intermediate stages. No application/device acceptance is implied by those checks.

Sources: https://docs.expo.dev/workflow/upgrading-expo-sdk-walkthrough/ ; https://expo.dev/changelog/sdk-57 ; https://expo.dev/changelog/sdk-58 ; https://docs.expo.dev/router/migrate/sdk-55-to-56/

Migration changes:
- All active React Navigation imports use Expo Router's SDK 56+ navigation contexts, including nested profile top tabs. Removed separate React Navigation dependencies.
- Existing cache-copy image helper explicitly uses the supported filesystem legacy entry point. Multipart photo uploads use native Expo File multipart parts because the new Expo fetch implementation rejects React Native URI-object FormData parts. Native file/content URI upload behavior still requires device testing.
- Reanimated/worklets are explicit SDK-matched dependencies. OS chrome uses the current edge-to-edge APIs.
- Native plugins explicitly configure location background modes, maps, SQLite, SecureStore, image picker and other installed Expo modules. Camera/microphone permissions are disabled because current photo flows only select library images. No map key was supplied or generated.
- Recording start/resume checks foreground and background permission before creating a trip/recording marker, explains the background request, handles refusal, and rechecks account session while permission prompts are pending.

Validation commands (development loopback API only): `npm test`; `npx expo-doctor`; `npx expo install --check`; `npx expo config --type introspect`; `npx expo export --platform android --platform ios --output-dir dist`. CLI diagnostics may require network access to official compatibility services; exports do not constitute native builds.

At this checkpoint 36 automated tests and 21/21 Expo Doctor checks pass. Android and iOS JavaScript/Hermes exports pass. Native config introspection confirms background permissions and plugins, but no Gradle/Xcode compilation, emulator, phone, EAS build, production access or real credentials were used. New native development binaries are required; the old SDK 53 binary cannot validate this bundle. Do not publish it as an OTA update to an old runtime.

`npm audit` reports 23 affected package nodes: 20 high, 3 moderate, 0 critical (down from 212 before migration). These propagate from three advisories: `braces` <=3.0.3 (Metro pattern processing), `node-forge` <=1.4.0 (Expo signing/tooling chain), and `decode-uri-component` <=0.4.2 (Router/query-string). At review time the first two packages had no newer stable registry release; Router's decoder cannot be bumped compatibly within its existing range. No incompatible forced downgrade or override was used to make the count look clean. This is NOT a clean security audit, and exposure must be assessed before release.

Release gates: actual Android/iOS development build; background location allow/deny/settings/kill/relaunch; start/pause/resume/stop and account switching; SQLite existing-trip persistence; maps, gestures and bottom sheets; Gallery→Recs navigation; photo picking/resizing/upload and private image caching; production cookie/HTTPS behavior. The app still has no explicit iOS bundle identifier configured: confirm the intended identifier before an iOS build. Unused `src/services/imageUploader.js` remains a historical placeholder, not an active upload path.

## Separate Android Travel Test APK (configuration only)

The explicit `travel-test` EAS profile produces a standalone internal **release APK**, not a development client: it runs its embedded JS without Metro or Android Studio. Its EAS environment is `preview`; `APP_ENV=production` selects release transport behavior but `extra.APP_ENV=test` identifies the isolated backend. Do not set `NODE_ENV=development` for this build—Expo's release export uses production JS semantics.

| Setting | Travel Test | Existing app (unchanged) |
| --- | --- | --- |
| Android package | `com.mkmilanmilan.travelmobile.test` | `com.mkmilanmilan.travelmobile` |
| Launcher name | Travel Test | Travel mobile |
| Deep-link scheme | `travel-test` | `mobile` |
| Runtime | `travel-test-sdk57-v1` | Existing config |
| OTA updates | Disabled; embedded bundle only | Existing config |
| API | `https://travel-server-test.onrender.com/api` (fixed, ignores API_URL overrides) | Existing environment setting |

The test variant skips this config's dotenv loading and never falls back to `GOOGLE_MAPS_KEY`. The extra generated `exp+travel-mobile` dev-client scheme is disabled for this standalone variant, avoiding a shared deep-link handler. Project slug/EAS project linking are retained; no new Expo project is created. The original production profile is untouched. A separate Android package isolates app-private SQLite and credentials: keep the working old app installed, do not clear its storage, and do not migrate or import its routes yet. This test app starts with its own local data and the separate staging database, not old production users/routes.

### Before an APK build (not performed by this change)

1. Approve the cloud build and use the existing authorized Expo account/project. Verify the exact review commit and select **Android / travel-test**, not `testing`, `preview`, or `production`. Review any signing-credential prompt before proceeding; no key or account permission has been created here.
2. Select/approve a signing certificate for the new test package. Configure a test-only Android Google Maps key as `TEST_GOOGLE_MAPS_KEY` in the approved EAS **preview** environment. Restrict it to package `com.mkmilanmilan.travelmobile.test` plus the actual APK signing certificate's SHA-1, and to Maps SDK for Android. No fingerprint is known yet. Do not relax the original key's restrictions or copy database/Render secrets into the app. The Maps key is embedded in the APK (not a confidential server secret); configure billing/API access only with approval. A cloud test build fails early if the test key is absent.
3. After the above approval/setup, the intended command is `eas build --platform android --profile travel-test`. **Do not run it as part of config checks.** No APK has been built or installed by this change.
4. Arrange synthetic staging login accounts through an approved process. Staging email delivery is disabled; do not assume signup email verification is usable or that old production logins exist there.
5. Verify the delivered APK package/name/certificate before installation. Check both apps remain installed and old local routes remain intact. Then test staging login, maps, existing route loading, recording start/pause/resume/stop, background permissions/relaunch, uploads and account switching. Real GPS/routing remains a phone acceptance gate.

Safe local checks: `npm test`; `APP_VARIANT=test APP_ENV=production EXPO_NO_DOTENV=1 npx expo config --type introspect`; same environment with `npx expo-doctor` and `npx expo export --platform android --output-dir /tmp/travel-test-export`. These checks require no real Maps key and prove configuration/JS compatibility only, not native compilation or device behavior. Use a writable CLI HOME if the execution environment has no home directory.

References: https://docs.expo.dev/build-reference/variants/ ; https://docs.expo.dev/eas/json/ ; https://docs.expo.dev/build-reference/apk/ ; https://docs.expo.dev/versions/latest/config/app/ ; https://docs.expo.dev/versions/latest/sdk/map-view/

Validation for this variant: 41/41 automated tests pass, including actual Android manifest introspection (test package, sole test scheme, cleartext disabled, updates disabled, dummy Maps key wiring); Expo Doctor 21/21; Android JS/Hermes export passes. No APK compilation, signing, install, emulator or physical-device check was performed. Existing dependency-audit exceptions above remain open.
