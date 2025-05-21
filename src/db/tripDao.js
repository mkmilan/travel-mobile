// src/db/tripDao.js
import { v4 as uuidv4 } from "uuid";
import { openDatabase } from "./openDatabase";

// src/db/tripDao.js
export const buildTripJsonForUpload = async (tripId) => {
	const db = await openDatabase();

	// Get track points
	const points = await db.getAllAsync(
		`SELECT * FROM track_points WHERE trip_id = ? ORDER BY timestamp ASC`,
		[tripId]
	);

	// Group points by segment
	const segmentMap = {};
	for (const point of points) {
		if (!segmentMap[point.segment_id]) {
			segmentMap[point.segment_id] = [];
		}
		segmentMap[point.segment_id].push(point);
	}

	const segments = Object.values(segmentMap).map((trackPoints) => {
		const startTime = trackPoints[0].timestamp;
		const endTime = trackPoints[trackPoints.length - 1].timestamp;

		const track = trackPoints.map((p) => ({
			lat: p.lat,
			lon: p.lon,
			t: p.timestamp,
			spd: p.speed,
			acc: p.accuracy,
		}));

		return { startTime, endTime, track };
	});

	const trip = await db.getAllAsync(`SELECT * FROM trips WHERE id = ?`, [
		tripId,
	]);

	if (!trip || !trip[0]) throw new Error("Trip not found");

	return {
		tripId,
		userId: trip[0].user_id,
		startTime: trip[0].start_time,
		segments,
		pois: [],
		recommendations: [],
	};
};

export const startTrip = async (userId) => {
	const db = await openDatabase();
	const tripId = uuidv4();
	const startTime = new Date().toISOString();

	await db.runAsync(
		`INSERT INTO trips (id, user_id, start_time, status) VALUES (?, ?, ?, ?)`,
		[tripId, userId, startTime, "recording"]
	);

	return tripId;
};

export const startSegment = () => {
	return uuidv4();
};

export const insertTrackPoint = async (
	tripId,
	segmentId,
	{ lat, lon, timestamp, speed, accuracy }
) => {
	const db = await openDatabase();
	await db.runAsync(
		`INSERT INTO track_points (trip_id, segment_id, lat, lon, timestamp, speed, accuracy)
		 VALUES (?, ?, ?, ?, ?, ?, ?)`,
		[tripId, segmentId, lat, lon, timestamp, speed, accuracy]
	);
};

export const addPoi = async (tripId, { lat, lon, note }) => {
	const db = await openDatabase();
	const timestamp = new Date().toISOString();

	await db.runAsync(
		`INSERT INTO pois (trip_id, lat, lon, timestamp, note) VALUES (?, ?, ?, ?, ?)`,
		[tripId, lat, lon, timestamp, note]
	);
};

export const addRecommendation = async (
	tripId,
	{ lat, lon, category, tags, rating, note }
) => {
	const db = await openDatabase();
	await db.runAsync(
		`INSERT INTO recommendations (trip_id, lat, lon, category, tags, rating, note)
		 VALUES (?, ?, ?, ?, ?, ?, ?)`,
		[tripId, lat, lon, category, tags.join(","), rating, note]
	);
};

export const getTrip = async (tripId) => {
	const db = await openDatabase();
	const result = await db.getAllAsync(`SELECT * FROM trips WHERE id = ?`, [
		tripId,
	]);
	return result[0];
};

export const getTrackPoints = async (tripId) => {
	const db = await openDatabase();
	return await db.getAllAsync(
		`SELECT * FROM track_points WHERE trip_id = ? ORDER BY timestamp ASC`,
		[tripId]
	);
};

export const getPendingTrips = async () => {
	const db = await openDatabase();
	/* pointsCount so list can show size without extra query */
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
