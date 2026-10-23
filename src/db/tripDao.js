import uuid from "react-native-uuid";
import { openDatabase } from "./openDatabase";
import { getActiveTrip } from "../utils/activeTrip";
import { validatePoiNote } from "../utils/poiNote";

/**
 * Creates the standardized payload structure for backend API
 * This ensures consistency between what we store and what we send
 */
const TRIP_MODES = ["motorhome", "campervan", "car", "motorcycle", "bicycle", "walking"];
const TRIP_VISIBILITIES = ["public", "followers_only", "private"];
const hasValidMetadata = (trip) => TRIP_MODES.includes(trip.default_transport_mode)
	&& TRIP_VISIBILITIES.includes(trip.default_trip_visibility);

// Before this column existed, finishTrip was the only writer of stopped/end_time.
// Preserve those explicitly saved legacy choices without backfilling any rows.
export const hasConfirmedTripMetadata = (trip) => hasValidMetadata(trip) && (
	trip.metadata_confirmed === 1 || (trip.metadata_confirmed == null
		&& ["stopped", "uploaded"].includes(trip.status) && Boolean(trip.end_time))
);
export const tripMetadataDefaults = (trip, settings = {}) => ({
	mode: ([0, 1].includes(trip.metadata_confirmed) || hasConfirmedTripMetadata(trip))
		? trip.default_transport_mode : settings.defaultTravelMode || trip.default_transport_mode || "car",
	visibility: ([0, 1].includes(trip.metadata_confirmed) || hasConfirmedTripMetadata(trip))
		? trip.default_trip_visibility : settings.defaultTripVisibility || trip.default_trip_visibility || "public",
});
const requireInactiveTrip = async (trip) => {
	const active = await getActiveTrip();
	if (active?.tripId && active.tripId === trip.id) throw new Error("Stop this recording before uploading, editing or deleting it.");
};
const requireStoppedTrip = async (trip) => {
	await requireInactiveTrip(trip);
	if (trip.status !== "stopped") throw new Error("Stop or recover this recording before uploading or deleting it.");
};
const metadataRequired = () => Object.assign(new Error("Review and save this trip's details before uploading."), { code: "TRIP_METADATA_REQUIRED" });

const createTripPayload = (trip, segments, pois = [], recommendations = [], userSettings = {}) => {
	// Reliable ISO for fallbacks
	const isoStart = trip.start_time || segments[0]?.startTime || new Date().toISOString();

	return {
		title: trip.title || `Trip on ${isoStart.substring(0, 10)}`,
		description: trip.description || "", // Now we store this in DB
		startLocationName: trip.start_name || null,
		endLocationName: trip.end_name || null,
		startTime: isoStart,
		segments,
		pois: pois.map((poi) => ({
			lat: poi.lat,
			lon: poi.lon,
			timestamp: poi.timestamp,
			note: poi.note,
		})),
		recommendations: recommendations.map((rec) => ({
			latitude: rec.lat,
			longitude: rec.lon,
			primaryCategory: rec.primaryCategory || rec.category, // <-- FIXED
			attributeTags: rec.attributeTags
				? Array.isArray(rec.attributeTags)
					? rec.attributeTags
					: rec.attributeTags.split(",")
				: rec.tags
				? rec.tags.split(",")
				: [],
			rating: rec.rating,
			name: rec.name,
			description: rec.description || rec.note || "",
		})),
		defaultTripVisibility: trip.default_trip_visibility || userSettings.defaultTripVisibility || "public",
		defaultTravelMode: trip.default_transport_mode || userSettings.defaultTravelMode || "car",
	};
};

// ─────── helpers for upload ───────────────────────────────────────────────
export const buildTripJsonForUpload = async (tripId, userSettings = {}, userId, reliableUpload = false) => {
	const db = await openDatabase();
	const trip = await getOwnedTrip(db, tripId, userId);
	await requireStoppedTrip(trip);
	if (!hasConfirmedTripMetadata(trip)) throw metadataRequired();
	// Freeze the first request before network dispatch. Retries across restarts
	// must use the same identity AND contents, even after ambiguous responses.
	if (reliableUpload && trip.upload_payload) return JSON.parse(trip.upload_payload);

	// ---- points → segments --------------------------------------------------
	const rows = await db.getAllAsync(`SELECT * FROM track_points WHERE trip_id = ? ORDER BY timestamp ASC`, [tripId]);

	const segmentMap = {};
	for (const p of rows) {
		if (!segmentMap[p.segment_id]) segmentMap[p.segment_id] = [];
		segmentMap[p.segment_id].push(p);
	}

	const segments = Object.values(segmentMap).map((pts) => ({
		startTime: pts[0].timestamp,
		endTime: pts[pts.length - 1].timestamp,
		track: pts.map((p) => ({
			lat: p.lat,
			lon: p.lon,
			t: p.timestamp,
			spd: p.speed,
			acc: p.accuracy,
		})),
	}));

	// ---- trip row -----------------------------------------------------------


	// ---- pois and recommendations -------------------------------------------
	const pois = await db.getAllAsync(`SELECT * FROM pois WHERE trip_id = ? ORDER BY timestamp ASC`, [tripId]);

	for (const poi of pois) {
		try {
			validatePoiNote(poi.note ?? "");
		} catch (error) {
			// Return the local row identity so the owner can explicitly repair it.
			// Never truncate text, discard the POI, or send a doomed whole-trip request.
			throw Object.assign(error, { code: "POI_NOTE_NEEDS_EDIT", poiId: poi.id });
		}
	}
	const recommendations = await db.getAllAsync(`SELECT * FROM recommendations WHERE trip_id = ?`, [tripId]);

	const payload = createTripPayload(trip, segments, pois, recommendations, userSettings);
	if (!reliableUpload) return payload;
	payload.uploadProtocol = 1;
	payload.uploadId = trip.id;
	payload.recommendations = payload.recommendations.map((rec, index) => ({ ...rec, uploadId: String(recommendations[index].id) }));
	await db.runAsync(`UPDATE trips SET upload_payload = ? WHERE id = ? AND user_id = ? AND upload_payload IS NULL`, [JSON.stringify(payload), tripId, userId]);
	// A concurrent packaging attempt must use the first durable snapshot.
	const frozen = await getOwnedTrip(db, tripId, userId);
	if (!frozen.upload_payload) throw new Error("Could not preserve upload details. Your recording is still on this phone.");
	return JSON.parse(frozen.upload_payload);
};

// Fail closed for legacy unowned records; never claim them for the next login.
const requireUserId = (userId) => {
	if (typeof userId !== "string" || !userId) throw new Error("Sign in to access local trips");
};
const getOwnedTrip = async (db, tripId, userId) => {
	requireUserId(userId);
	const [trip] = await db.getAllAsync(`SELECT * FROM trips WHERE id = ? AND user_id = ?`, [tripId, userId]);
	if (!trip) throw new Error("Local trip not found for this account");
	return trip;
};
export const ownsLocalTrip = async (tripId, userId) => {
	if (!userId || !tripId) return false;
	const db = await openDatabase();
	const [trip] = await db.getAllAsync(`SELECT id FROM trips WHERE id = ? AND user_id = ?`, [tripId, userId]);
	return Boolean(trip);
};

// ─────── lifecycle helpers ────────────────────────────────────────────────
export const getLocalTrip = async (tripId, userId) => getOwnedTrip(await openDatabase(), tripId, userId);

export const startTrip = async (userId, settings = {}) => {
	requireUserId(userId);
	try {
		const db = await openDatabase();
		const tripId = uuid.v4();
		const startTime = new Date().toISOString();
		console.log("About to insert trip TRIP DAO", tripId, userId, startTime);
		await db.runAsync(
			`INSERT INTO trips (id, user_id, start_time, status, default_transport_mode, default_trip_visibility, metadata_confirmed)
     VALUES (?, ?, ?, ?, ?, ?, 0)`,
			[tripId, userId, startTime, "recording",
				TRIP_MODES.includes(settings.defaultTravelMode) ? settings.defaultTravelMode : "car",
				TRIP_VISIBILITIES.includes(settings.defaultTripVisibility) ? settings.defaultTripVisibility : "public"]
		);
		console.log("TRIP DAO Trip insert successful");
		return tripId;
	} catch (err) {
		console.error("startTrip error:", err);
		throw err;
	}
};

// Persist the stop independently of the optional metadata form. Cancel must not
// leave a stopped collector represented as an active recording after relaunch.
export const stopTrip = async (tripId, endTime, userId) => {
	const db = await openDatabase();
	const trip = await getOwnedTrip(db, tripId, userId);
	if (!["recording", "paused", "stopped"].includes(trip.status)) throw new Error("This trip is already uploaded");
	await requireInactiveTrip(trip);
	await db.runAsync(`UPDATE trips SET status = 'stopped', end_time = COALESCE(end_time, ?), metadata_confirmed = CASE WHEN metadata_confirmed IS NULL AND status IN ('recording','paused') THEN -1 ELSE metadata_confirmed END WHERE id = ? AND user_id = ? AND status IN ('recording','paused','stopped')`, [endTime, tripId, userId]);
};

export const finishTrip = async (
	tripId,
	{ endTime, title, description, startName, endName, defaultTransportMode, defaultTripVisibility },
	userId
) => {
	const db = await openDatabase();
	const trip = await getOwnedTrip(db, tripId, userId);
	await requireStoppedTrip(trip);
	if (trip.upload_payload) throw new Error("Upload already started. Retry the saved upload, then edit the online trip.");
	if (!TRIP_MODES.includes(defaultTransportMode) || !TRIP_VISIBILITIES.includes(defaultTripVisibility)) throw metadataRequired();
	await db.runAsync(
		`UPDATE trips
       SET status = 'stopped',
           end_time = ?,
           title = ?,
           description = ?,
           start_name = ?,
           end_name = ?,
           default_transport_mode = ?,
           default_trip_visibility = ?,
           metadata_confirmed = 1
     WHERE id = ? AND user_id = ? AND status = 'stopped'`,
		[endTime, title, description, startName, endName, defaultTransportMode, defaultTripVisibility, tripId, userId]
	);
};

export const setTripRecordingStatus = async (tripId, status, userId) => {
	if (!["recording", "paused"].includes(status)) throw new Error("Invalid recording status");
	const db = await openDatabase();
	const trip = await getOwnedTrip(db, tripId, userId);
	if (!["recording", "paused"].includes(trip.status)) throw new Error("This trip is already stopped");
	await requireInactiveTrip(trip);
	await db.runAsync(`UPDATE trips SET status = ? WHERE id = ? AND user_id = ? AND status IN ('recording','paused')`, [status, tripId, userId]);
};

export const startSegment = () => uuid.v4();

export const insertTrackPoint = async (tripId, segmentId, { lat, lon, timestamp, speed, accuracy }) => {
	const db = await openDatabase();
	await db.runAsync(
		`INSERT INTO track_points
       (trip_id, segment_id, lat, lon, timestamp, speed, accuracy)
     SELECT ?, ?, ?, ?, ?, ?, ?
       WHERE EXISTS (SELECT 1 FROM trips WHERE id = ? AND status = 'recording')`,
		[tripId, segmentId, lat, lon, timestamp, speed, accuracy, tripId]
	);
};

// ─────── POIs & recommendations ───────────────────────────────
export const addPoi = async (tripId, { lat, lon, note }) => {
	note = validatePoiNote(note);
	const db = await openDatabase();
	const timestamp = new Date().toISOString();
	await db.runAsync(
		`INSERT INTO pois (trip_id, lat, lon, timestamp, note)
         VALUES (?, ?, ?, ?, ?)`,
		[tripId, lat, lon, timestamp, note]
	);
};
export const getPoiForEdit = async (tripId, poiId, userId) => {
	const db = await openDatabase();
	const trip = await getOwnedTrip(db, tripId, userId);
	await requireStoppedTrip(trip);
	if (trip.upload_payload) throw new Error("Upload already started. Retry the saved upload before editing.");
	const [poi] = await db.getAllAsync(`SELECT * FROM pois WHERE id = ? AND trip_id = ?`, [poiId, tripId]);
	if (!poi) throw new Error("POI not found for this trip");
	return poi;
};
export const updatePoiNote = async (tripId, poiId, note, userId) => {
	note = validatePoiNote(note);
	const db = await openDatabase();
	await getPoiForEdit(tripId, poiId, userId);
	await db.runAsync(`UPDATE pois SET note = ? WHERE id = ? AND trip_id = ?`, [note, poiId, tripId]);
};

export const addRecommendation = async (
	tripId,
	{ latitude, longitude, primaryCategory, attributeTags, rating, name, description }
) => {
	const db = await openDatabase();
	const tagsString = Array.isArray(attributeTags) ? attributeTags.join(",") : "";

	const res = await db.runAsync(
		`INSERT INTO recommendations (trip_id, lat, lon, primaryCategory, attributeTags, rating, name, description)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
		[tripId, latitude, longitude, primaryCategory, tagsString, rating, name, description]
	);
	return res?.lastInsertRowId || null;
};

// ─────── queries ──────────────────────────────────────────────────────────
export const getPendingTrips = async (userId) => {
	if (!userId) return [];
	const db = await openDatabase();
	return await db.getAllAsync(`
    SELECT t.*, COUNT(p.id) AS pointsCount
    FROM trips t
    LEFT JOIN track_points p ON p.trip_id = t.id
    WHERE t.user_id = ? AND t.status IN ('recording','paused','stopped')
    GROUP BY t.id
    ORDER BY t.start_time DESC
  `, [userId]);
};

export const markTripUploaded = async (tripId, userId, result, sentPayload) => {
	requireUserId(userId);
	const db = await openDatabase();
	const trip = await getOwnedTrip(db, tripId, userId);
	await requireStoppedTrip(trip);
	if (!hasConfirmedTripMetadata(trip)) throw metadataRequired();
	if (trip.upload_payload && sentPayload?.uploadProtocol !== 1) throw new Error("A confirmed upload receipt is required.");
	if (sentPayload?.uploadProtocol === 1) {
		const expected = new Set(sentPayload.recommendations.map(rec => rec.uploadId));
		const outcomes = result?.recommendationsOutcome;
		const validId = value => typeof value === "string" && /^[a-f0-9]{24}$/i.test(value);
		if (result?.uploadProtocol !== 1 || result.uploadId !== sentPayload.uploadId
			|| !validId(result?.trip?._id) || (trip.upload_server_id && trip.upload_server_id !== result.trip._id) || !Array.isArray(outcomes)
			|| outcomes.length !== expected.size || new Set(outcomes.map(item => item.uploadId)).size !== expected.size
			|| outcomes.some(item => !expected.has(item.uploadId) || !["created", "failed", "skipped"].includes(item.status)
				|| (item.status === "created" && !validId(item.id)))) {
			throw new Error("Upload receipt was not confirmed. Keep this recording and retry; it will use the same upload identity.");
		}
		await db.runAsync(`UPDATE trips SET upload_server_id = ?, upload_result = ? WHERE id = ? AND user_id = ?`, [result.trip._id, JSON.stringify(result), tripId, userId]);
		if (result.uploadComplete !== true || outcomes.some(item => item.status !== "created")) {
			throw Object.assign(new Error("The trip is saved online, but some recommendations are not. Keep this recording and tap Upload again to retry only missing recommendations."), { code: "TRIP_UPLOAD_INCOMPLETE" });
		}
	}
	await db.runAsync(`UPDATE trips SET status = 'uploaded' WHERE id = ? AND user_id = ? AND status = 'stopped'`, [tripId, userId]);
};

export const deleteTrip = async (tripId, userId) => {
	const db = await openDatabase();
	const trip = await getOwnedTrip(db, tripId, userId);
	await requireStoppedTrip(trip);
	await db.runAsync(`DELETE FROM trips WHERE id = ?`, [tripId]);
	await db.runAsync(`DELETE FROM track_points WHERE trip_id = ?`, [tripId]);
	await db.runAsync(`DELETE FROM pois WHERE trip_id = ?`, [tripId]);
	await db.runAsync(`DELETE FROM recommendations WHERE trip_id = ?`, [tripId]);
};

// Only an explicit matching pre-insert rejection may unlock the first snapshot.
// A timeout, lost response or partial receipt must never take this path.
export const releaseRejectedTripUpload = async (tripId, userId, payload, rejection) => {
	if (rejection?.uploadRejected !== true || rejection.uploadId !== payload?.uploadId) return false;
	const db = await openDatabase();
	const trip = await getOwnedTrip(db, tripId, userId);
	if (trip.upload_server_id || trip.status !== "stopped" || trip.upload_payload !== JSON.stringify(payload)) return false;
	await db.runAsync(`UPDATE trips SET upload_payload = NULL WHERE id = ? AND user_id = ? AND upload_server_id IS NULL AND upload_payload = ?`, [tripId, userId, trip.upload_payload]);
	return true;
};
