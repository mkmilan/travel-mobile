import { theme } from "@/src/theme";
import { useMemo } from "react";
import { StyleSheet, View } from "react-native";
import MapView, { Marker, Polyline } from "react-native-maps";

/* ------------------------------------------------------------------ *
 * Helpers                                                            *
 * ------------------------------------------------------------------ */

/** Normalise any point to { lat, lon } and discard invalid values */
function sanitize(raw = []) {
	return raw
		.map((p) => ({
			lat: p.lat ?? p.latitude,
			lon: p.lon ?? p.longitude,
		}))
		.filter(
			(p) =>
				Number.isFinite(p.lat) &&
				Number.isFinite(p.lon) &&
				Math.abs(p.lat) <= 90 &&
				Math.abs(p.lon) <= 180
		);
}

/** Derive a region that fits all points with padding */
function getFitRegion(points, pad = 1.35) {
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

/* ------------------------------------------------------------------ *
 * Component                                                          *
 * ------------------------------------------------------------------ */

/**
 * Props
 *  • routeCoords      [{ lat, lon } | { latitude, longitude }]
 *  • pois             [{ lat, lon, note, _id }]
 *  • style            ViewStyle (optional)
 */
export default function InteractiveTripMap({
	routeCoords = [],
	pois = [],
	style,
}) {
	const cleanRoute = useMemo(() => sanitize(routeCoords), [routeCoords]);
	const cleanPois = useMemo(() => sanitize(pois), [pois]);

	const initialRegion = useMemo(() => getFitRegion(cleanRoute), [cleanRoute]);

	return (
		<View style={[styles.wrapper, style]}>
			<MapView
				key={cleanRoute.length} /* re-mount when route changes */
				initialRegion={initialRegion}
				style={StyleSheet.absoluteFill}
				showsUserLocation={false}
				showsMyLocationButton={false}
				toolbarEnabled={false}
			>
				{/* Polyline for the route */}
				{cleanRoute.length >= 2 && (
					<Polyline
						coordinates={cleanRoute.map((p) => ({
							latitude: p.lat,
							longitude: p.lon,
						}))}
						strokeWidth={4}
						strokeColor={theme.colors.primary}
					/>
				)}

				{/* Markers for POIs */}
				{cleanPois.map((p) => (
					<Marker
						key={p._id ?? `${p.lat}-${p.lon}`}
						coordinate={{ latitude: p.lat, longitude: p.lon }}
						pinColor={theme.colors.warning}
						tracksViewChanges={false}
					/>
				))}
			</MapView>
		</View>
	);
}

const styles = StyleSheet.create({
	wrapper: {
		height: 300 /* ≈ half a phone screen */,
		borderRadius: theme.radius.md,
		overflow: "hidden",
		backgroundColor: theme.colors.inputBorder,
	},
});
