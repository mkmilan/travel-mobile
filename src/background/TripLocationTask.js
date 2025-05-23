// src/background/TripLocationTask.js
import { insertTrackPoint } from "@/src/db/tripDao";
import { getActiveTrip } from "@/src/utils/activeTrip";
import * as TaskManager from "expo-task-manager";

export const TASK_NAME = "trip-location-task";

/**
 * Runs in the OS even if the app is killed.
 * Inserts every delivered location into SQLite for the current trip.
 */
TaskManager.defineTask(TASK_NAME, async ({ data, error }) => {
	if (error || !data) return;

	const { tripId, segmentId } = await getActiveTrip();
	if (!tripId) return; // nothing active → ignore

	for (const loc of data.locations) {
		const { latitude: lat, longitude: lon, speed, accuracy } = loc.coords;

		await insertTrackPoint(tripId, segmentId, {
			lat,
			lon,
			timestamp: new Date(loc.timestamp).toISOString(),
			speed,
			accuracy,
		});
	}
});
