import { reverseGeocode } from "../utils/geo";

const cache = new Map();
const inFlight = new Map();

const lookup = (point) => {
	const { lat, lon } = point || {};
	if (!Number.isFinite(lat) || !Number.isFinite(lon)) return Promise.resolve(null);
	const key = `${lat.toFixed(4)},${lon.toFixed(4)}`;
	if (cache.has(key)) return Promise.resolve(cache.get(key));
	if (inFlight.has(key)) return inFlight.get(key);
	const request = Promise.resolve().then(() => reverseGeocode(lat, lon))
		.then((value) => {
			const name = typeof value === "string" ? value.trim() : null;
			if (!name || name === "Unknown") return null;
			cache.set(key, name);
			return name;
		})
		.catch(() => null)
		.finally(() => { if (inFlight.get(key) === request) inFlight.delete(key); });
	inFlight.set(key, request);
	return request;
};

/** Resolve optional endpoint names; retain either success within the Save deadline. */
export async function getTripLocationNames({ start, end }) {
	const names = { startName: null, endName: null };
	let timeout;
	try {
		await Promise.race([
			Promise.all([
				lookup(start).then((name) => { names.startName = name; }),
				lookup(end).then((name) => { names.endName = name; }),
			]),
			new Promise((resolve) => { timeout = setTimeout(resolve, 5000); }),
		]);
		// Late responses may warm the cache, never mutate an already returned draft.
		return { ...names };
	} finally {
		clearTimeout(timeout);
	}
}
