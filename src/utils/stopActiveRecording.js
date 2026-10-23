import * as Location from "expo-location";
import { getActiveTrip } from "./activeTrip";
import { stopAbandonedRecording } from "./recordingAttempt";

// Disable point writes before native shutdown, retaining a cleanup-only marker
// if shutdown fails. Never delete the owner's unsynced trips.
export async function stopActiveRecording() {
	const active = await getActiveTrip();
	let outcome = await stopAbandonedRecording({ ...active, location: Location, taskName: "trip-location-task" });
	// A screen's in-flight recovery may have cancelled when logout began.
	// Re-read once under logout's authority instead of treating cancellation as shutdown.
	if (outcome === "cancelled") {
		const current = await getActiveTrip();
		const expected = active.cleanupTarget || active;
		const target = current.cleanupTarget || current;
		if (target.tripId && (target.tripId !== expected.tripId || target.segmentId !== expected.segmentId || target.userId !== expected.userId)) {
			throw new Error("Recording changed during shutdown. Try signing out again.");
		}
		outcome = await stopAbandonedRecording({ ...current, location: Location, taskName: "trip-location-task" });
	}
	const latest = await getActiveTrip();
	if (outcome !== "stopped" || latest.tripId || latest.cleanupId) throw new Error("Recording changed during shutdown. Try signing out again.");
}
