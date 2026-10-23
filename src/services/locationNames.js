import { reverseGeocode } from "../utils/geo";

const cache = new Map();

/**
 * Resolve start & end place-names (parallel & cached).
 * @param {{ lat:number, lon:number }} start
 * @param {{ lat:number, lon:number }} end
 */
export async function getTripLocationNames({ start, end }) {
	const lookup = async (point) => {
		const { lat, lon } = point || {};
		if (!Number.isFinite(lat) || !Number.isFinite(lon)) return null;
		const key = `${lat.toFixed(4)},${lon.toFixed(4)}`;
		if (cache.has(key)) return cache.get(key);
		const name = await reverseGeocode(lat, lon);
		cache.set(key, name);
		return name;
	};

	let timeout;
	try {
		// Naming is optional metadata: an offline/hung lookup cannot block Save.
		return await Promise.race([
			Promise.all([lookup(start), lookup(end)]).then(([startName, endName]) => ({ startName, endName })),
			new Promise((resolve) => { timeout = setTimeout(() => resolve({ startName: null, endName: null }), 5000); }),
		]);
	} finally {
		clearTimeout(timeout);
	}
}
