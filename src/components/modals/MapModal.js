import { theme } from "@/src/theme";
import { StyleSheet, View } from "react-native";
import InteractiveTripMap from "../map/InteractiveTripMap";
import BottomModal from "./BottomModal";
import ModalHeader from "./ModalHeader";

export default function MapModal({ visible, onClose, routeCoords = [], pois = [] }) {
	return (
		<BottomModal visible={visible} onClose={onClose} style={styles.modal}>
			<ModalHeader title="Route Map" onClose={onClose} />
			<View style={styles.mapContainer}>
				<InteractiveTripMap routeCoords={routeCoords} pois={pois} style={{ flex: 1 }} />
			</View>
		</BottomModal>
	);
}

const styles = StyleSheet.create({
	modal: {
		padding: 0,
	},
	mapContainer: {
		// height: 400,
		height: "100%",
		width: "100%",
		borderRadius: theme.radius.md,
		overflow: "hidden",
		backgroundColor: theme.colors.inputBorder,
	},
});
