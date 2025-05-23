import { v4 as uuidv4 } from "uuid";
import { openDatabase } from "./openDatabase";

/**
 * Creates the standardized payload structure for backend API
 * This ensures consistency between what we store and what we send
 */
const createTripPayload = (trip, segments, userSettings = {}) => {
	// Reliable ISO for fallbacks
	const isoStart =
		trip.start_time || segments[0]?.startTime || new Date().toISOString();

	return {
		title: trip.title || `Trip on ${isoStart.substring(0, 10)}`,
		description: trip.description || "", // Now we store this in DB
		startLocationName: trip.start_name || null,
		endLocationName: trip.end_name || null,
		startTime: isoStart,
		segments,
		pois: [], // to be filled in later phases
		recommendations: [], // to be filled in later phases
		defaultTripVisibility:
			trip.default_trip_visibility ||
			userSettings.defaultTripVisibility ||
			"public",
		defaultTravelMode:
			trip.default_transport_mode || userSettings.defaultTravelMode || "car",
	};
};

// ─────── helpers for upload ───────────────────────────────────────────────
export const buildTripJsonForUpload = async (tripId, userSettings = {}) => {
	const db = await openDatabase();

	// ---- points → segments --------------------------------------------------
	const rows = await db.getAllAsync(
		`SELECT * FROM track_points WHERE trip_id = ? ORDER BY timestamp ASC`,
		[tripId]
	);

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
	const [trip] = await db.getAllAsync(`SELECT * FROM trips WHERE id = ?`, [
		tripId,
	]);
	if (!trip) throw new Error("Trip not found in local DB");

	// // Reliable ISO for fallbacks
	// const isoStart =
	// 	trip.start_time || segments[0]?.startTime || new Date().toISOString();

	// return {
	// 	/* fields the Node controller reads --------------------------- */
	// 	title: trip.title || `Trip on ${isoStart.substring(0, 10)}`,
	// 	description: "", // no UI yet
	// 	startLocationName: trip.start_name || null,
	// 	endLocationName: trip.end_name || null,
	// 	startTime: isoStart,

	// 	defaultTravelMode:
	// 		trip.default_transport_mode ||
	// 		userSettings.defaultTravelMode ||
	// 		"motorhome",

	// 	defaultTripVisibility:
	// 		trip.default_trip_visibility ||
	// 		userSettings.defaultTripVisibility ||
	// 		"public",

	// 	segments,
	// 	pois: [], // to be filled in later phases
	// 	recommendations: [], // idem
	// };
	// Use centralized payload creation
	return createTripPayload(trip, segments, userSettings);
};

// ─────── lifecycle helpers ────────────────────────────────────────────────
export const startTrip = async (userId) => {
	const db = await openDatabase();
	const tripId = uuidv4();
	const startTime = new Date().toISOString();

	await db.runAsync(
		`INSERT INTO trips (id, user_id, start_time, status)
     VALUES (?, ?, ?, ?)`,
		[tripId, userId, startTime, "recording"]
	);
	return tripId;
};

export const finishTrip = async (
	tripId,
	{
		endTime,
		title,
		description = "", // Add description parameter
		startName,
		endName,
		defaultTransportMode = "car",
		defaultTripVisibility = "public",
	}
) => {
	const db = await openDatabase();
	await db.runAsync(
		`UPDATE trips
       SET status = 'stopped',
           end_time = ?,
           title = ?,
           description = ?,
           start_name = ?,
           end_name = ?,
           default_transport_mode = ?,
           default_trip_visibility = ?
     WHERE id = ?`,
		[
			endTime,
			title,
			description,
			startName,
			endName,
			defaultTransportMode,
			defaultTripVisibility,
			tripId,
		]
	);
};

export const startSegment = () => uuidv4();

export const insertTrackPoint = async (
	tripId,
	segmentId,
	{ lat, lon, timestamp, speed, accuracy }
) => {
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
	/* … */
};
export const addRecommendation = async (
	tripId,
	{ lat, lon, category, tags, rating, note }
) => {
	/* … */
};

// ─────── queries ──────────────────────────────────────────────────────────
export const getPendingTrips = async () => {
	const db = await openDatabase();
	return await db.getAllAsync(`
    SELECT t.*, COUNT(p.id) AS pointsCount
    FROM trips t
    LEFT JOIN track_points p ON p.trip_id = t.id
    WHERE t.status IN ('recording','paused','stopped')
    GROUP BY t.id
    ORDER BY t.start_time DESC
  `);
};

export const markTripUploaded = async (tripId) => {
	const db = await openDatabase();
	await db.runAsync(`UPDATE trips SET status = 'uploaded' WHERE id = ?`, [
		tripId,
	]);
};

export const deleteTrip = async (tripId) => {
	const db = await openDatabase();
	await db.runAsync(`DELETE FROM trips WHERE id = ?`, [tripId]);
	await db.runAsync(`DELETE FROM track_points WHERE trip_id = ?`, [tripId]);
	await db.runAsync(`DELETE FROM pois WHERE trip_id = ?`, [tripId]);
	await db.runAsync(`DELETE FROM recommendations WHERE trip_id = ?`, [tripId]);
};
