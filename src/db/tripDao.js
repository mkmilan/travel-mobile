import { v4 as uuidv4 } from "uuid";
import { openDatabase } from "./openDatabase";

// ─────── helpers for upload (unchanged) ───────────────────────────────────
export const buildTripJsonForUpload = async (tripId) => {
	const db = await openDatabase();

	const points = await db.getAllAsync(
		`SELECT * FROM track_points WHERE trip_id = ? ORDER BY timestamp ASC`,
		[tripId]
	);

	const segmentMap = {};
	for (const p of points) {
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

	const trip = await db.getAllAsync(`SELECT * FROM trips WHERE id = ?`, [
		tripId,
	]);
	if (!trip?.[0]) throw new Error("Trip not found");

	return {
		tripId,
		userId: trip[0].user_id,
		startTime: trip[0].start_time,
		segments,
		pois: [],
		recommendations: [],
	};
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
	{ endTime, title, startName, endName, defaultTransportMode = "car" }
) => {
	const db = await openDatabase();
	await db.runAsync(
		`UPDATE trips
       SET status = 'stopped',
           end_time = ?,
           title = ?,
           start_name = ?,
           end_name = ?,
           default_transport_mode = ?
     WHERE id = ?`,
		[endTime, title, startName, endName, defaultTransportMode, tripId]
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
