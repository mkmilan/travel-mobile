export const lineStringToCoords = (line) => {
	/* expects { type:"LineString", coordinates:[[lon,lat],…] } */
	if (!line?.coordinates?.length) return [];
	return line.coordinates.map(([lon, lat]) => ({
		latitude: lat,
		longitude: lon,
	}));
};
