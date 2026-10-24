// UI-only gate. Set true to restore POI controls, lists and markers.
// Stored data, API contracts and upload validation remain independent.
const ENABLE_POI_UI = false;

// Opt in only for the coordinated test build; absent/invalid values fail closed.
// This gates the API helper itself, not just the visible control.
const ENABLE_SAFE_TRIP_DELETE = process.env.EXPO_PUBLIC_ENABLE_SAFE_TRIP_DELETE === "true";

module.exports = { ENABLE_POI_UI, ENABLE_SAFE_TRIP_DELETE };
