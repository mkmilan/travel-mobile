// A native start can finish after logout. Clean up only this attempt (or a
// markerless abandoned collector), never the target of a newer recording.
export async function stopAbandonedRecording({ tripId, segmentId, userId, location, taskName, getActiveTrip, clearActiveTrip }) {
	const belongsToAttempt = (active) => active?.tripId === tripId
		&& active.segmentId === segmentId && active.userId === userId;
	const active = await getActiveTrip();
	if (active?.tripId && !belongsToAttempt(active)) return;
	if (belongsToAttempt(active)) await clearActiveTrip();
	if (!(await location.hasStartedLocationUpdatesAsync(taskName))) return;
	// Do not stop a new owner's/segment's task after any awaited cleanup step.
	if ((await getActiveTrip())?.tripId) return;
	await location.stopLocationUpdatesAsync(taskName);
}
