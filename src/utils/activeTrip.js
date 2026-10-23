// src/utils/activeTrip.js
import * as SecureStore from "expo-secure-store";

// Serialize marker changes only. Never hold this queue while awaiting native GPS.
let markerChange = Promise.resolve();
const changeMarker = (operation) => {
	const work = markerChange.then(operation);
	markerChange = work.catch(() => {});
	return work;
};
const sameTarget = (a, b) => a?.tripId === b?.tripId
	&& a?.segmentId === b?.segmentId && a?.userId === b?.userId
	&& a?.cleanupId === b?.cleanupId;

export async function getActiveTrip() {
	// A failed read is unknown, not proof that the singleton collector is unowned.
	const json = await SecureStore.getItemAsync("activeTrip");
	const marker = json ? JSON.parse(json) : {};
	if (!marker || typeof marker !== "object" || Array.isArray(marker)) throw new Error("Could not read the recording marker. Try Stop again.");
	return marker;
}

/** Persist the writable target only when no unresolved collector cleanup exists. */
export async function setActiveTrip(tripId, segmentId, userId) {
	if (!userId) throw new Error("Sign in before recording");
	return changeMarker(async () => {
		const current = await getActiveTrip();
		if (current.cleanupId) throw new Error("Stop the previous GPS collector before starting a recording.");
		if (current.tripId && !sameTarget(current, { tripId, segmentId, userId })) throw new Error("Another recording is already active.");
		await SecureStore.setItemAsync("activeTrip", JSON.stringify({ tripId, segmentId, userId }));
	});
}

export async function clearActiveTrip(expected) {
	return changeMarker(async () => {
		const current = await getActiveTrip();
		// Logout/ordinary stop cannot erase evidence of a failed native stop.
		if (current.cleanupId || (expected && !sameTarget(current, expected))) return false;
		await SecureStore.deleteItemAsync("activeTrip");
		return true;
	});
}

export async function claimRecordingCleanup(expected, isCurrent = () => true) {
	return changeMarker(async () => {
		const current = await getActiveTrip();
		if (!isCurrent() || !sameTarget(current, expected)) return null;
		if (current.cleanupId) return current;
		// No top-level tripId: even a background batch already in flight will
		// fail its next target check. Keep the old identity solely for recovery.
		const cleanup = { cleanupId: `${Date.now()}-${Math.random()}`, cleanupTarget: current };
		await SecureStore.setItemAsync("activeTrip", JSON.stringify(cleanup));
		return cleanup;
	});
}

export async function finishRecordingCleanup(cleanup) {
	return changeMarker(async () => {
		const current = await getActiveTrip();
		if (!cleanup?.cleanupId || current.cleanupId !== cleanup.cleanupId) return false;
		await SecureStore.deleteItemAsync("activeTrip");
		return true;
	});
}
