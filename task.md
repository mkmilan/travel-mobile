# Mobile App Roadmap: "Motorhome Mapper - Mobile Companion"

**App Concept:** A mobile companion for "Motorhome Mapper," allowing users to record trips via GPS, manage basic profile settings, view their trips, and interact with some social features on the go. The primary focus for the initial mobile version will be on robust trip recording and synchronization with the main web platform.

**Core Philosophy (Mobile):** Reliable trip tracking, ease of use for on-the-road scenarios, and seamless integration with the existing web platform.

**Technology Stack (Mobile):**

- **Framework:** Expo 53 (React Native)
- **State Management:** Zustand (v5.x as per your preference)
- **Internal DB for Trip Recording:** SQL-based (e.g., `expo-sqlite`)
- **Navigation:** Expo Router
- **Styling:** React Native StyleSheet, potentially with utility components.
- **Mapping (Display):** To be decided (e.g., `react-native-maps` if a native solution is preferred for display, or a webview-based solution for consistency with Leaflet if simpler for initial display).
- **Mapping (Recording):** Expo Location API for GPS.

---

### **Phase M1: Core Mobile Foundation & Authentication**

- **Goal:** Set up the basic Expo project, navigation, user authentication mirroring the web, and essential profile display.
- **Tasks:**
  1.  `[x]` **Expo Project Setup:** Initialize Expo 53 project, basic folder structure (`app`, `components`, `services`, `store`, `constants`).
  2.  `[x]` **Navigation Setup:** Implement basic tab navigation using Expo Router for main sections (e.g., Home/Feed, Record Trip, My Trips, Profile).
  3.  `[x]` **Zustand Auth Store (`authStore.js`):**
      - `[x]` Implement store for user state, CSRF token, loading, and authentication status. (Conceptualized, needs full implementation)
      - `[x]` Implement `login`, `logout`, `checkUserStatus`, `WorkspaceCsrfToken` actions. (Conceptualized)
      - `[x]` Use `AsyncStorage` (or `expo-secure-store`) for persisting user data/session tokens.
  4.  `[ ]` **Authentication Screens:**
      - `[x]` Create Login and Registration screens.
      - `[ ]` Implement API calls to backend auth endpoints (using `authStore` actions).
      - `[ ]` Handle navigation based on auth state (protected routes/screens).
  5.  `[x]` **User Profile Display Screen (`app/(tabs)/profile/index.js`):** (Conceptualized)
      - `[x]` Display basic authenticated user information from `authStore` (username, email, bio, profile picture).
      - `[ ]` Link to "Edit Profile & Settings" screen.
  6.  `[x]` **API Configuration (`constants/apiConfig.js`):** Set up base URL and essential API endpoints. (Partially done)

---

### **Phase M2: Trip Recording & Local Storage**

- **Goal:** Implement reliable GPS trip recording, local storage of track data using SQL, and preparation for upload.
- **Tasks:**
  1.  `[ ]` **GPS Tracking Service/Hook:**
      - `[x]` Utilize `expo-location` for foreground GPS tracking.
      - `[x]` Functions to start, pause, resume, and stop tracking.
      - `[x]` Collect track points (`lat`, `lon`, `timestamp`, `speed`, `accuracy`).
  2.  `[x]` **Local SQL Database Setup (`expo-sqlite`):**
      - `[x]` Define schemas for trips, segments, track points, POIs, and pending recommendations locally.
      - `[x]` Service/utility functions to save ongoing trip data (segments, points) to the local SQL database.
      - `[x]` Service/utility functions to save POIs and recommendations locally, associated with the current recording session.
  3.  `[ ]` **Trip Recording UI:**
      - `[x]` Screen to manage trip recording (Start/Stop/Pause buttons).
      - `[ ]` Display current trip stats (duration, distance - calculated from local data).
      - `[ ]` Interface to add POIs (mark current location, add name/note) during recording, saving them to the local SQL DB.
      - `[x]` Interface to add simple recommendations linked to locations during recording, saving them to the local SQL DB.
  4.  `[ ]` **Pre-Upload Trip Review/Edit:**
      - `[ ]` Screen to review a completed (but not yet uploaded) trip from local SQL storage.
      - `[x]` Allow editing of trip title, description.
      - `[ ]` Allow editing/deletion of locally saved POIs and recommendations for that trip.

---

### **Phase M3: Trip Upload & Synchronization**

- **Goal:** Enable users to upload locally recorded trips (including POIs and recommendations) to the backend.
- **Tasks:**
  1.  `[x]` **Trip Service (`services/TripService.js`):**
      - `[x]` Implement `createTripJson` function to send structured trip data (segments, POIs, recommendations) to the backend's `/api/v2/trips/json` endpoint. (Conceptualized and code provided)
      - `[x]` Ensure it correctly formats data retrieved from the local SQL DB into the JSON payload expected by the backend.
  2.  `[ ]` **Upload Manager/Logic:**
      - `[x]` Logic to retrieve a completed trip and its associated POIs/recommendations from the local SQL DB.
      - `[ ]` Construct the `TripJsonClientPayload` as defined.
      - `[ ]` Call `TripService.createTripJson` to upload.
      - `[ ]` Handle upload success (e.g., mark local trip as synced, potentially clear from local DB or keep as backup).
      - `[ ]` Handle upload failure (retry mechanism, user notification).
  3.  `[ ]` **"My Trips" Screen (Mobile):**
      - `[ ]` Initially, list trips recorded and stored locally (synced vs. unsynced status).
      - `[ ]` Later, fetch and display trips synced to the backend (from `GET /api/v2/trips/json/me`).

---

### **Phase M4: User Settings & Profile Management (Mobile)**

- **Goal:** Allow users to view and edit their profile and settings, synced with the backend.
- **Tasks:**
  1.  `[x]` **User Service (`services/UserService.js`):** (Conceptualized and code provided)
      - `[ ]` Implement `getUserProfile` (if needed for viewing other profiles, less priority for initial mobile).
      - `[ ]` Implement `updateMyProfile` (for bio, etc.).
      - `[ ]` Implement `updateMySettings` for all settings fields from `User.js` model.
  2.  `[x]` **Settings Options (`constants/settingsOptions.js`):** Define constants for picker values (visibility, travel mode, units, theme, date/time formats, language). (Done)
  3.  `[x]` **Edit Profile & Settings Screen (`app/(tabs)/profile/edit.js`):** (Conceptualized)
      - `[ ]` UI for editing bio.
      - `[ ]` UI for all user settings (defaultTripVisibility, defaultTravelMode, preferredUnits, themePreference, dateFormat, timeFormat, language) using appropriate input controls (Pickers, Switches).
      - `[ ]` Load initial values from `authStore.user.settings`.
      - `[ ]` Call `UserService.updateMyProfile` and `UserService.updateMySettings` on save.
      - `[ ]` Update `authStore` on successful save.
  4.  `[ ]` **Profile Picture Management (Simplified for Mobile Initial):**
      - `[ ]` Display existing `profilePictureUrl` from `authStore`.
      - `[ ]` Option to remove/clear profile picture (if backend supports setting it to null/empty).
      - _Full image upload deferred to dedicated Image Handling Phase._

---

### **Phase M5: Viewing Trips and Basic Social Interaction (Mobile)**

- **Goal:** Allow users to view their synced trips and basic details of other public trips.
- **Tasks:**
  1.  `[ ]` **Trip Detail Screen (Mobile):**
      - `[x]` Fetch full trip data (including segments for map display, POIs, recommendations) from backend (`GET /api/v2/trips/json/:tripId`).
      - `[x]` Display trip title, description, dates, distance, duration.
      - `[x]` Display trip route on a map (using `react-native-maps` or a webview with Leaflet).
      - `[ ]` Display POIs and Recommendations associated with the trip.
  2.  `[ ]` **Feed/Explore Screen (Simplified):**
      - `[ ]` Fetch a list of public trips from the backend (new endpoint needed, e.g., `GET /api/v2/trips/json/public`).
      - `[ ]` Display trips in a list/card format with basic info and a cover image (if available).
      - `[ ]` Navigate to Trip Detail screen on tap.
  3.  `[ ]` **Basic Like/Comment (Viewing Only):**
      - `[ ]` On Trip Detail screen, display like count and comments if provided by the backend trip data.
      - _Full interaction (liking/commenting) can be a later enhancement._

---

### **Phase M6: Image Handling for Mobile (Production Ready)**

- **Goal:** Implement robust image viewing and uploading for profile pictures, trip photos, and recommendation photos.
- **Tasks:**
  1.  `[ ]` **Image Display:**
      - `[ ]` Use `expo-image` for optimized image loading and caching throughout the app (profile pictures, trip cover images, recommendation photos).
      - `[ ]` Handle placeholders and loading states for images.
      - `[ ]` Ensure correct construction of full image URLs based on backend storage (GridFS direct links or S3 URLs).
  2.  `[ ]` **Image Picker:**
      - `[ ]` Integrate `expo-image-picker` to allow users to select images from their device gallery or take new photos.
  3.  `[ ]` **Image Upload Service:**
      - `[ ]` Create a generic `ImageUploadService.js`.
      - `[ ]` Function to upload an image (as `FormData`) to specific backend endpoints (e.g., `/api/users/me/profile-picture`, `/api/trips/:tripId/photos`, `/api/recommendations/:recId/photos`).
      - `[ ]` Handle progress indication (optional but good UX).
      - `[ ]` Return the URL/ID of the uploaded image from the backend.
  4.  `[ ]` **Integration:**
      - `[ ]` **Profile Picture:** Add upload functionality to the "Edit Profile" screen. Update `profilePictureUrl` in `authStore` and call `UserService.updateMyProfile`.
      - `[ ]` **Trip Photos:** Allow adding photos during trip review (before upload) or to already synced trips (if backend supports adding photos to existing trips). Photos would be uploaded, and their IDs/URLs associated with the trip.
      - `[ ]` **Recommendation Photos:** Similar to trip photos, allow adding photos when creating/editing recommendations locally, then upload and associate during trip sync or if recommendations are managed independently.
  5.  `[ ]` **Image Deletion:**
      - `[ ]` If users can delete their trips/recommendations or specific photos, ensure corresponding calls are made to backend endpoints to delete images from storage.

---

### **Phase M7: Offline Capabilities & Refinements**

- **Goal:** Enhance offline experience and polish the app.
- **Tasks:**
  1.  `[ ]` **Offline Trip Viewing:**
      - `[ ]` Cache synced trip data (metadata, simplified route, POIs, recommendations) in the local SQL DB for offline viewing in "My Trips".
      - `[ ]` Implement a sync strategy (e.g., on app start, manual refresh).
  2.  `[ ]` **Background GPS Tracking (Advanced):**
      - `[ ]` Investigate and implement `expo-location` background capabilities if reliable for longer trips. This often requires more complex setup and permissions.
  3.  `[ ]` **UI/UX Polish:** Review all screens for consistency, usability, and performance.
  4.  `[ ]` **Error Handling:** Comprehensive review of error handling and user feedback.
  5.  `[ ]` **Performance Optimization:** Identify and address any performance bottlenecks.

---

### **Phase M8: Expanded Social Features & Notifications (Future)**

- **Goal:** Bring more social features from the web to mobile.
- **Tasks:**
  1.  `[ ]` Following System: UI to follow/unfollow users.
  2.  `[ ]` Full Feed: Implement feed of followed users' trips with pagination.
  3.  `[ ]` Likes & Comments: Allow liking and commenting on trips from mobile.
  4.  `[ ]` Push Notifications (e.g., using `expo-notifications`): For new followers, comments on trips, etc. (requires backend support).

---

**Key Considerations for Mobile:**

- **Offline First for Recording:** The trip recording (Phase M2) should be robustly offline, saving all data to the local SQL database. Upload (Phase M3) is a separate step.
- **Battery Life:** GPS tracking can be battery-intensive. Provide clear feedback to the user and consider settings for tracking precision vs. battery usage.
- **Data Synchronization:** Carefully manage the state of local vs. server data, especially for trips and user settings.
- **Native Feel:** Leverage Expo and React Native components to create a user experience that feels native to each platform (iOS/Android).
- **Permissions:** Correctly handle permissions for location, camera, and photo library using Expo's modules.
