import { openDatabase } from "./openDatabase";

/**
 * Run once on app launch.
 * - Creates tables if they don’t exist
 * - Adds new columns (safe to run repeatedly)
 */
export const runMigrations = async () => {
	const db = await openDatabase();

	// ─────── base tables ────────────────────────────────────────────────────
	await db.execAsync(`
    CREATE TABLE IF NOT EXISTS trips (
      id   TEXT PRIMARY KEY,
      user_id TEXT,
      start_time TEXT,
      status TEXT
    );

    CREATE TABLE IF NOT EXISTS track_points (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      trip_id   TEXT,
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
      primaryCategory TEXT,
      attributeTags TEXT,
      rating INTEGER,
      note TEXT
    );
  `);

	// ─────── additive columns (ignore “duplicate column” errors) ────────────
	const alters = [
		// Trip table additions
		`ALTER TABLE trips ADD COLUMN title TEXT;`,
		`ALTER TABLE trips ADD COLUMN start_name TEXT;`,
		`ALTER TABLE trips ADD COLUMN end_name TEXT;`,
		`ALTER TABLE trips ADD COLUMN default_transport_mode TEXT DEFAULT 'car';`,
		`ALTER TABLE trips ADD COLUMN default_trip_visibility TEXT DEFAULT 'public';`,
		`ALTER TABLE trips ADD COLUMN description TEXT;`,
		`ALTER TABLE trips ADD COLUMN end_time TEXT;`, // Add missing end_time

		// Recommendations table additions - add name and description columns
		`ALTER TABLE recommendations ADD COLUMN name TEXT;`,
		`ALTER TABLE recommendations ADD COLUMN description TEXT;`,
		// `ALTER TABLE recommendations ADD COLUMN primaryCategory TEXT;`,
		// `ALTER TABLE recommendations ADD COLUMN attributeTags TEXT;`,
	];

	for (const sql of alters) {
		try {
			await db.execAsync(sql);
		} catch (err) {
			if (!err?.message?.includes("duplicate column")) {
				console.warn("[migrations] " + err.message);
			}
		}
	}
};
