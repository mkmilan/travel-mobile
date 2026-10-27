import { theme } from "@/src/theme";
import { StyleSheet, View } from "react-native";
import InteractiveTripMap from "../map/InteractiveTripMap";
import BottomModal from "./BottomModal";
import ModalHeader from "./ModalHeader";

export default function MapModal({ visible, onClose, routeCoords = [], pois = [], recommendations = [] }) {
	const recommendationMarkers = (Array.isArray(recommendations) ? recommendations : [])
		.filter((rec) => Array.isArray(rec?.location?.coordinates) && rec.location.coordinates.length === 2)
		.map((rec) => ({ _id: rec._id, name: rec.name, lat: rec.location.coordinates[1], lon: rec.location.coordinates[0] }));
	return (
		<BottomModal visible={visible} onClose={onClose} style={styles.modal}>
			<ModalHeader title="Route Map" onClose={onClose} />
			<View style={styles.mapContainer}>
				<InteractiveTripMap routeCoords={routeCoords} pois={pois} recommendationMarkers={recommendationMarkers} style={{ flex: 1 }} />
			</View>
		</BottomModal>
	);
}

const styles = StyleSheet.create({
	modal: {
		padding: 0,
	},
	mapContainer: {
		// Fill only the space left below the header, not the entire sheet.
		flex: 1,
		width: "100%",
		borderRadius: theme.radius.md,
		overflow: "hidden",
		backgroundColor: theme.colors.inputBorder,
	},
});
