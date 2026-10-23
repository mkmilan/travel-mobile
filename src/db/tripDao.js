import uuid from "react-native-uuid";
import { openDatabase } from "./openDatabase";

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
export const buildTripJsonForUpload = async (tripId, userSettings = {}, userId) => {
	const db = await openDatabase();
	const trip = await getOwnedTrip(db, tripId, userId);
	if (trip.status !== "stopped") throw new Error("Stop this recording before uploading.");
	if (!hasConfirmedTripMetadata(trip)) throw metadataRequired();

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

	const recommendations = await db.getAllAsync(`SELECT * FROM recommendations WHERE trip_id = ?`, [tripId]);

	return createTripPayload(trip, segments, pois, recommendations, userSettings);
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
	await getOwnedTrip(db, tripId, userId);
	await db.runAsync(`UPDATE trips SET status = 'stopped', end_time = COALESCE(end_time, ?), metadata_confirmed = CASE WHEN metadata_confirmed IS NULL AND status IN ('recording','paused') THEN -1 ELSE metadata_confirmed END WHERE id = ? AND user_id = ? AND status IN ('recording','paused','stopped')`, [endTime, tripId, userId]);
};

export const finishTrip = async (
	tripId,
	{ endTime, title, description, startName, endName, defaultTransportMode, defaultTripVisibility },
	userId
) => {
	const db = await openDatabase();
	const trip = await getOwnedTrip(db, tripId, userId);
	if (trip.status !== "stopped") throw new Error("Stop this recording before saving its details.");
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

export const startSegment = () => uuid.v4();

export const insertTrackPoint = async (tripId, segmentId, { lat, lon, timestamp, speed, accuracy }) => {
	const db = await openDatabase();
	await db.runAsync(
		`INSERT INTO track_points
       (trip_id, segment_id, lat, lon, timestamp, speed, accuracy)
     VALUES (?, ?, ?, ?, ?, ?, ?)`,
		[tripId, segmentId, lat, lon, timestamp, speed, accuracy]
	);
};

// ─────── POIs & recommendations (unchanged) ───────────────────────────────
export const addPoi = async (tripId, { lat, lon, note }) => {
	const db = await openDatabase();
	const timestamp = new Date().toISOString();
	await db.runAsync(
		`INSERT INTO pois (trip_id, lat, lon, timestamp, note)
         VALUES (?, ?, ?, ?, ?)`,
		[tripId, lat, lon, timestamp, note]
	);
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

export const markTripUploaded = async (tripId, userId) => {
	requireUserId(userId);
	const db = await openDatabase();
	await db.runAsync(`UPDATE trips SET status = 'uploaded' WHERE id = ? AND user_id = ?`, [tripId, userId]);
};

export const deleteTrip = async (tripId, userId) => {
	const db = await openDatabase();
	await getOwnedTrip(db, tripId, userId);
	await db.runAsync(`DELETE FROM trips WHERE id = ?`, [tripId]);
	await db.runAsync(`DELETE FROM track_points WHERE trip_id = ?`, [tripId]);
	await db.runAsync(`DELETE FROM pois WHERE trip_id = ?`, [tripId]);
	await db.runAsync(`DELETE FROM recommendations WHERE trip_id = ?`, [tripId]);
};
