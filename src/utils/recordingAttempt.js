import { getActiveTrip as readActiveTrip, claimRecordingCleanup as claimCleanup, finishRecordingCleanup as finishCleanup } from "./activeTrip";

const pendingStops = new Map();
const boundedWait = (work, timeoutMs) => new Promise((resolve, reject) => {
	const timer = setTimeout(() => reject(new Error("GPS shutdown is still pending. Try Stop again; new recording is blocked until shutdown is confirmed.")), timeoutMs);
	work.then(resolve, reject).finally(() => clearTimeout(timer));
});

export const readRecordingTaskState = (location, taskName, timeoutMs = 10000) =>
	boundedWait(location.hasStartedLocationUpdatesAsync(taskName), timeoutMs);

// A late native start, legacy marker or markerless task can outlive its screen.
// Claim a non-writable marker before stopping and retain it on every failure.
export async function stopAbandonedRecording({ tripId, segmentId, userId, cleanupId, location, taskName,
	getActiveTrip = readActiveTrip, claimRecordingCleanup = claimCleanup, finishRecordingCleanup = finishCleanup,
	isCurrent = () => true, timeoutMs = 10000 }) {
	if (pendingStops.has(taskName)) {
		// Do not launch overlapping native stops after a timeout/remount. The
		// previous operation may still settle; retry its outcome, then recheck.
		return boundedWait(pendingStops.get(taskName), timeoutMs);
	}
	const work = (async () => {
		const active = await getActiveTrip();
		const matches = active.tripId === tripId && active.segmentId === segmentId && active.userId === userId;
		if (!isCurrent()) return "cancelled";
		if (cleanupId ? active.cleanupId !== cleanupId : active.tripId && !matches) return "superseded";
		if (!cleanupId && tripId && active.cleanupId && active.cleanupTarget?.tripId
			&& (active.cleanupTarget.tripId !== tripId || active.cleanupTarget.segmentId !== segmentId || active.cleanupTarget.userId !== userId)) return "superseded";
		const cleanup = await claimRecordingCleanup(active, isCurrent);
		if (!cleanup) return "superseded";
		const running = await location.hasStartedLocationUpdatesAsync(taskName);
		const latest = await getActiveTrip();
		if (!isCurrent()) return "cancelled";
		if (latest.cleanupId !== cleanup.cleanupId) return "superseded";
		if (running) await location.stopLocationUpdatesAsync(taskName);
		if (await location.hasStartedLocationUpdatesAsync(taskName)) throw new Error("GPS is still running. Try Stop again.");
		return await finishRecordingCleanup(cleanup) ? "stopped" : "superseded";
	})();
	pendingStops.set(taskName, work);
	work.finally(() => { if (pendingStops.get(taskName) === work) pendingStops.delete(taskName); }).catch(() => {});
	return boundedWait(work, timeoutMs);
}
