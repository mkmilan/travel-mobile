import { theme } from "@/src/theme";
import { StyleSheet, View } from "react-native";
import InteractiveTripMap from "../map/InteractiveTripMap";
import BottomModal from "./BottomModal";
import ModalHeader from "./ModalHeader";

// Shared content can live inside an existing detail sheet without opening a
// second native Modal. Its Close and Android Back then return to that detail.
export function MapModalContent({ onClose, title = "Route Map", routeCoords = [], pois = [], recommendations = [], focusCoordinate }) {
	const recommendationMarkers = (Array.isArray(recommendations) ? recommendations : [])
		.filter((rec) => Array.isArray(rec?.location?.coordinates) && rec.location.coordinates.length === 2)
		.map((rec) => ({ _id: rec._id, name: rec.name, lat: rec.location.coordinates[1], lon: rec.location.coordinates[0] }));
	return (
		<View style={{ flex: 1 }}>
			<ModalHeader title={title} onClose={onClose} />
			<View style={styles.mapContainer}>
				<InteractiveTripMap routeCoords={routeCoords} pois={pois} recommendationMarkers={recommendationMarkers} focusCoordinate={focusCoordinate} style={{ flex: 1 }} />
			</View>
		</View>
	);
}

export default function MapModal({ visible, onClose, ...mapProps }) {
	return (
		<BottomModal visible={visible} onClose={onClose} style={styles.modal}>
			<MapModalContent {...mapProps} onClose={onClose} />
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
