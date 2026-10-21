import * as Location from "expo-location";
import { clearActiveTrip } from "./activeTrip";

// Clear the persisted target first so an in-flight background callback cannot
// attach new points to a later login. Do not delete the owner's unsynced trips.
export async function stopActiveRecording() {
	await clearActiveTrip();
	const taskName = "trip-location-task";
	if (await Location.hasStartedLocationUpdatesAsync(taskName)) {
		await Location.stopLocationUpdatesAsync(taskName);
	}
}
