import { ENABLE_POI_UI } from "@/src/constants/featureFlags";
import { theme } from "@/src/theme";
import { useMemo } from "react";
import { StyleSheet, View } from "react-native";
import MapView, { Marker, Polyline } from "react-native-maps";

/* ------------------------------------------------------------------ *
 * Helpers                                                            *
 * ------------------------------------------------------------------ */

/** Normalise any point to { lat, lon } and discard invalid values */
function sanitize(raw = []) {
	return (Array.isArray(raw) ? raw : [])
		.map((p) => ({
			...p,
			lat: p?.lat ?? p?.latitude,
			lon: p?.lon ?? p?.longitude,
		}))
		.filter((p) => Number.isFinite(p.lat) && Number.isFinite(p.lon) && Math.abs(p.lat) <= 90 && Math.abs(p.lon) <= 180);
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
	// const latitude = (minLat + maxLat) / 2;
	// const longitude = (minLon + maxLon) / 2;
	// const latSpan = maxLat - minLat;
	// const lonSpan = maxLon - minLon;

	// // Dynamic padding: less for long routes, more for short
	// let dynamicPad = pad;
	// const maxSpan = Math.max(latSpan, lonSpan);
	// if (maxSpan > 2) dynamicPad = 1.05;
	// else if (maxSpan > 0.5) dynamicPad = 1.15;
	// else if (maxSpan > 0.1) dynamicPad = 1.25;

	// const latitudeDelta = Math.max(0.01, latSpan * dynamicPad);
	// const longitudeDelta = Math.max(0.01, lonSpan * dynamicPad);

	return { latitude, longitude, latitudeDelta, longitudeDelta };
}

/* ------------------------------------------------------------------ *
 * Component                                                          *
 * ------------------------------------------------------------------ */

/**
 * Props
 *  • routeCoords      [{ lat, lon } | { latitude, longitude }]
 *  • pois             [{ lat, lon, note, _id }]
 *  • recommendationMarkers  [{ lat, lon, _id, name }] (independent of POI visibility)
 *  • focusCoordinate  { lat, lon } (optional place-focused view; trip framing is unchanged)
 *  • style            ViewStyle (optional)
 */
export default function InteractiveTripMap({ routeCoords = [], pois = [], recommendationMarkers = [], focusCoordinate, style }) {
	const cleanRoute = useMemo(() => sanitize(routeCoords), [routeCoords]);
	const cleanPois = useMemo(() => sanitize(ENABLE_POI_UI ? pois : []), [pois]);
	const cleanRecommendations = useMemo(() => sanitize(recommendationMarkers), [recommendationMarkers]);

	const cleanFocus = useMemo(() => sanitize([focusCoordinate]), [focusCoordinate]);
	const initialRegion = useMemo(() => getFitRegion(cleanFocus.length ? cleanFocus : cleanRoute.length ? cleanRoute : cleanRecommendations), [cleanFocus, cleanRoute, cleanRecommendations]);
	// initialRegion is only read on mount. Place changes must reset its camera,
	// while ordinary trip maps retain their existing route-length key/controls.
	const mapKey = cleanFocus.length ? `place-${cleanFocus[0].lat}-${cleanFocus[0].lon}` : cleanRoute.length;

	return (
		<View style={[styles.wrapper, style]}>
			<MapView
				key={mapKey}
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

				{/* POIs are gated independently of recommendation locations. */}
				{cleanPois.map((p, index) => (
					<Marker
						key={`poi-${p._id ?? index}-${index}`}
						coordinate={{ latitude: p.lat, longitude: p.lon }}
						pinColor={theme.colors.warning}
						tracksViewChanges={false}
					/>
				))}
				{cleanRecommendations.map((p, index) => (
					<Marker
						key={`recommendation-${p._id ?? index}-${index}`}
						coordinate={{ latitude: p.lat, longitude: p.lon }}
						title={typeof p.name === "string" && p.name.trim() ? p.name.trim() : "Place"}
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
		// height: 300 /* ≈ half a phone screen */,
		flex: 1,
		borderRadius: theme.radius.md,
		overflow: "hidden",
		backgroundColor: theme.colors.inputBorder,
	},
});
