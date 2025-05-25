// import { theme } from "@/src/theme";
// import { StyleSheet, View } from "react-native";
// import MapView, { Polyline } from "react-native-maps";

// /**
//  * coords = [{ latitude, longitude }, …]  (min 2 points)
//  */
// export default function TripMapThumbnail({ coords = [] }) {
// 	if (coords.length < 2) {
// 		return <View style={[styles.box, styles.empty]} />;
// 	}

// 	/* simple bounds calc */
// 	const lats = coords.map((c) => c.latitude);
// 	const lngs = coords.map((c) => c.longitude);
// 	const region = {
// 		latitude: (Math.min(...lats) + Math.max(...lats)) / 2,
// 		longitude: (Math.min(...lngs) + Math.max(...lngs)) / 2,
// 		latitudeDelta: Math.max(...lats) - Math.min(...lats) + 0.1,
// 		longitudeDelta: Math.max(...lngs) - Math.min(...lngs) + 0.1,
// 	};

// 	return (
// 		<MapView
// 			style={styles.box}
// 			pointerEvents="none"
// 			initialRegion={region}
// 			scrollEnabled={false}
// 			zoomEnabled={false}
// 			pitchEnabled={false}
// 			rotateEnabled={false}
// 			liteMode // Android perf boost
// 		>
// 			<Polyline
// 				coordinates={coords}
// 				strokeColor={theme.colors.primary}
// 				strokeWidth={3}
// 			/>
// 		</MapView>
// 	);
// }

// const styles = StyleSheet.create({
// 	box: {
// 		width: "100%",
// 		height: 180,
// 		borderTopLeftRadius: theme.radius.md,
// 		borderTopRightRadius: theme.radius.md,
// 		marginBottom: theme.space.sm,
// 		overflow: "hidden",
// 	},
// 	empty: { backgroundColor: theme.colors.inputBorder },
// });
import { theme } from "@/src/theme";
// import { getFitRegion } from "@/src/utils/geo";
import { useMemo } from "react";
import { StyleSheet, View } from "react-native";
import MapView, { Polyline } from "react-native-maps";

/** Normalise each point to { lat, lon } and ensure it's finite */
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

/** Compute a safe region that fits all points with padding */
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

export default function TripMapThumbnail({ coords = [], style }) {
	/** 1️⃣  Clean & normalise */
	const clean = useMemo(() => sanitize(coords), [coords]);

	/** 2️⃣  Region to show */
	const region = useMemo(() => getFitRegion(clean), [clean]);

	/** 3️⃣  Render */
	return (
		<View style={[styles.wrapper, style]}>
			<MapView
				key={clean.length} // remount when data changes
				initialRegion={region}
				style={StyleSheet.absoluteFill}
				scrollEnabled={false}
				pitchEnabled={false}
				rotateEnabled={false}
				zoomEnabled={false}
				pointerEvents="none"
			>
				{clean.length >= 2 && (
					<Polyline
						coordinates={clean.map((p) => ({
							latitude: p.lat,
							longitude: p.lon,
						}))}
						strokeWidth={3}
						strokeColor={theme.colors.primary}
					/>
				)}
			</MapView>
		</View>
	);
}

/* ------------------------------------------------------------------ *
 * styles                                                             *
 * ------------------------------------------------------------------ */
const styles = StyleSheet.create({
	wrapper: {
		overflow: "hidden",
		borderRadius: theme.radius.sm,
		backgroundColor: theme.colors.inputBorder, // neutral grey fallback
	},
});
