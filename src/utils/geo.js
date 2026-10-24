export const lineStringToCoords = (line) => {
	/* expects { type:"LineString", coordinates:[[lon,lat],…] } */
	if (!line?.coordinates?.length) return [];
	return line.coordinates.map(([lon, lat]) => ({
		latitude: lat,
		longitude: lon,
	}));
};

/**
 * Fetches a human-readable address for given latitude and longitude using Nominatim.
 * @param {number} lat Latitude
 * @param {number} lon Longitude
 * @returns {Promise<string|null>} A formatted address string or null if an error occurs.
 */
export async function reverseGeocode(lat, lon) {
	if (!Number.isFinite(lat) || !Number.isFinite(lon)) {
		console.error("Invalid coordinates for reverse geocoding:", lat, lon);
		return null;
	}

	// Be mindful of Nominatim's usage policy: https://operations.osmfoundation.org/policies/nominatim/
	const url = `https://nominatim.openstreetmap.org/reverse?format=jsonv2&lat=${lat}&lon=${lon}&zoom=10`; // Zoom level 10 often gives city/town level

	const controller = new AbortController();
	let timeout;
	try {
		const request = async () => {
			const response = await fetch(url, {
				signal: controller.signal,
				headers: {
					"User-Agent": "motorhome-mapper/0.1 (support@my-app.com)",
					"Accept-Language": "en",
				},
			});
			if (!response.ok) return null;
			const data = await response.json();
			const { city, town, village, county } = data?.address || {};
			return city || town || village || county || null;
		};
		return await Promise.race([request(), new Promise((resolve) => {
			timeout = setTimeout(() => { controller.abort(); resolve(null); }, 5000);
		})]);
	} catch {
		// Optional metadata: offline/failed requests must not prevent Save.
		return null;
	} finally {
		clearTimeout(timeout);
	}
}

/**
 * Compute a MapView region that fits all coordinates with padding.
 * coords: [{ lat, lon }]
 * returns { latitude, longitude, latitudeDelta, longitudeDelta }
 */
export function getFitRegion(points, pad = 1.35) {
	if (points.length === 0) {
		return {
			latitude: 0,
			longitude: 0,
			latitudeDelta: 0.2,
			longitudeDelta: 0.2,
		};
	}
	let minLat = points[0].lat,
		maxLat = points[0].lat,
		minLon = points[0].lon,
		maxLon = points[0].lon;

	points.forEach((p) => {
		if (p.lat < minLat) minLat = p.lat;
		if (p.lat > maxLat) maxLat = p.lat;
		if (p.lon < minLon) minLon = p.lon;
		if (p.lon > maxLon) maxLon = p.lon;
	});

	const latitude = (minLat + maxLat) / 2;
	const longitude = (minLon + maxLon) / 2;
	const latitudeDelta = Math.max(0.002, (maxLat - minLat) * pad);
	const longitudeDelta = Math.max(0.002, (maxLon - minLon) * pad);

	return { latitude, longitude, latitudeDelta, longitudeDelta };
}
