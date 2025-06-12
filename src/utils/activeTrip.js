// src/utils/activeTrip.js
import * as SecureStore from "expo-secure-store";

/** Persist { tripId, segmentId } while background service runs */
export async function setActiveTrip(tripId, segmentId) {
	console.log("Setting active trip:", { tripId, segmentId });

	await SecureStore.setItemAsync("activeTrip", JSON.stringify({ tripId, segmentId }));
}
export async function clearActiveTrip() {
	await SecureStore.deleteItemAsync("activeTrip");
}
export async function getActiveTrip() {
	try {
		const json = await SecureStore.getItemAsync("activeTrip");
		return json ? JSON.parse(json) : {};
	} catch {
		return {};
	}
}
