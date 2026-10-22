import Constants from "expo-constants";

// In-memory, test-variant only. No arbitrary payloads, route paths or errors.
// All values are fixed labels: credentials and server responses cannot enter.
const allowed = new Set([
  "login:mounted", "login:unmounted", "login:request", "login:success", "login:failure",
  "auth:signed-in", "auth:signed-out", "auth:busy", "auth:idle",
  "route:auth", "route:tabs", "route:other", "trips:layout",
  "transition:start", "transition:end", "app:active", "app:background", "app:inactive",
]);
const enabled = Constants.expoConfig?.extra?.AUTH_DIAGNOSTICS === true;
let sequence = 0;
let entries = [];
const listeners = new Set();
export function recordAuthDiagnostic(event) {
  if (!enabled || !allowed.has(event)) return;
  entries = [...entries.slice(-39), `${++sequence} ${event}`];
  listeners.forEach((listener) => listener(entries));
}
export function getAuthDiagnostics() { return [...entries]; }
export function subscribeAuthDiagnostics(listener) {
  listeners.add(listener);
  return () => listeners.delete(listener);
}
export const authDiagnosticsEnabled = enabled;
