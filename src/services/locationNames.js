import { reverseGeocode } from "../utils/geo";

const cache = new Map();

/**
 * Resolve start & end place-names (parallel & cached).
 * @param {{ lat:number, lon:number }} start
 * @param {{ lat:number, lon:number }} end
 */
export async function getTripLocationNames({ start, end }) {
	console.log("getTripLocationNames from locationNames.js", start, end);
	const lookup = async ({ lat, lon }) => {
		const key = `${lat.toFixed(4)},${lon.toFixed(4)}`;
		if (cache.has(key)) return cache.get(key);
		const name = await reverseGeocode(lat, lon);
		cache.set(key, name);
		return name;
	};

	const [startName, endName] = await Promise.all([lookup(start), lookup(end)]);
	return { startName, endName };
}
