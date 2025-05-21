// src/db/openDatabase.js
import * as SQLite from "expo-sqlite";

let db = null;

export const openDatabase = async () => {
	if (!db) {
		db = await SQLite.openDatabaseAsync("trip_data.db");
	}
	return db;
};
