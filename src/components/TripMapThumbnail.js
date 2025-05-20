import { theme } from "@/src/theme";
import { StyleSheet, View } from "react-native";
import MapView, { Polyline } from "react-native-maps";

/**
 * coords = [{ latitude, longitude }, …]  (min 2 points)
 */
export default function TripMapThumbnail({ coords = [] }) {
	if (coords.length < 2) {
		return <View style={[styles.box, styles.empty]} />;
	}

	/* simple bounds calc */
	const lats = coords.map((c) => c.latitude);
	const lngs = coords.map((c) => c.longitude);
	const region = {
		latitude: (Math.min(...lats) + Math.max(...lats)) / 2,
		longitude: (Math.min(...lngs) + Math.max(...lngs)) / 2,
		latitudeDelta: Math.max(...lats) - Math.min(...lats) + 0.1,
		longitudeDelta: Math.max(...lngs) - Math.min(...lngs) + 0.1,
	};

	return (
		<MapView
			style={styles.box}
			pointerEvents="none"
			initialRegion={region}
			scrollEnabled={false}
			zoomEnabled={false}
			pitchEnabled={false}
			rotateEnabled={false}
			liteMode // Android perf boost
		>
			<Polyline
				coordinates={coords}
				strokeColor={theme.colors.primary}
				strokeWidth={3}
			/>
		</MapView>
	);
}

const styles = StyleSheet.create({
	box: {
		width: "100%",
		height: 180,
		borderTopLeftRadius: theme.radius.md,
		borderTopRightRadius: theme.radius.md,
		marginBottom: theme.space.sm,
		overflow: "hidden",
	},
	empty: { backgroundColor: theme.colors.inputBorder },
});
