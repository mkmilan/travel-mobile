// UI-only gate. Set true to restore POI controls, lists and markers.
// Stored data, API contracts and upload validation remain independent.
const ENABLE_POI_UI = false;

// Fail closed until the coordinated server deletion workflow is verified.
// This gates the API helper itself, not just the visible control.
const ENABLE_SAFE_TRIP_DELETE = false;

module.exports = { ENABLE_POI_UI, ENABLE_SAFE_TRIP_DELETE };
