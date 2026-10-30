// Saved GeoJSON points are [longitude, latitude]. Do not coerce missing or
// string values into a real destination; zero is a valid coordinate.
export function getPlaceCoordinate(location) {
	const coordinates = location?.coordinates;
	if (!Array.isArray(coordinates) || coordinates.length !== 2) return null;
	const [lon, lat] = coordinates;
	if (!Number.isFinite(lat) || !Number.isFinite(lon) || Math.abs(lat) > 90 || Math.abs(lon) > 180) return null;
	return { lat, lon };
}

// Maps URLs need no API key or Places/geocoding request. Leave origin and
// travel mode unset so Google Maps lets the user choose their route.
export function getGoogleMapsDirectionsUrl(location) {
	const point = getPlaceCoordinate(location);
	return point ? `https://www.google.com/maps/dir/?api=1&destination=${encodeURIComponent(`${point.lat},${point.lon}`)}` : null;
}
