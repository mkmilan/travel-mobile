// src/db/migration.js
import { openDatabase } from "./openDatabase";

export const runMigrations = async () => {
	const db = await openDatabase();

	await db.execAsync(`
		CREATE TABLE IF NOT EXISTS trips (
			id TEXT PRIMARY KEY,
			user_id TEXT,
			start_time TEXT,
			status TEXT
		);

		CREATE TABLE IF NOT EXISTS track_points (
			id INTEGER PRIMARY KEY AUTOINCREMENT,
			trip_id TEXT,
			segment_id TEXT,
			lat REAL,
			lon REAL,
			timestamp TEXT,
			speed REAL,
			accuracy REAL
		);

		CREATE TABLE IF NOT EXISTS pois (
			id INTEGER PRIMARY KEY AUTOINCREMENT,
			trip_id TEXT,
			lat REAL,
			lon REAL,
			timestamp TEXT,
			note TEXT
		);

		CREATE TABLE IF NOT EXISTS recommendations (
			id INTEGER PRIMARY KEY AUTOINCREMENT,
			trip_id TEXT,
			lat REAL,
			lon REAL,
			category TEXT,
			tags TEXT,
			rating INTEGER,
			note TEXT
		);
	`);
};
