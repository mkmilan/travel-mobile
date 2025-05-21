import { theme } from "@/src/theme";
import { isoToDate } from "@/src/utils/format";
import { StyleSheet, Text, TouchableOpacity, View } from "react-native";

export default function PendingTripItem({ trip, onUpload, onDelete }) {
	return (
		<View style={styles.row}>
			<View style={{ flex: 1 }}>
				<Text style={styles.title}>{isoToDate(trip.start_time)}</Text>
				<Text style={styles.sub}>points: {trip.pointsCount}</Text>
			</View>

			<TouchableOpacity
				style={styles.btn}
				onPress={() => onUpload(trip.id)}
			>
				<Text style={styles.btnTxt}>Upload</Text>
			</TouchableOpacity>
			<TouchableOpacity
				style={[styles.btn, { backgroundColor: theme.colors.error }]}
				onPress={() => onDelete(trip.id)}
			>
				<Text style={styles.btnTxt}>✕</Text>
			</TouchableOpacity>
		</View>
	);
}

const styles = StyleSheet.create({
	row: {
		flexDirection: "row",
		alignItems: "center",
		backgroundColor: theme.colors.card,
		padding: 12,
		borderRadius: 8,
		marginBottom: 8,
	},
	title: { fontWeight: "600", color: theme.colors.text },
	sub: { fontSize: 12, color: theme.colors.textMuted },
	btn: {
		marginLeft: 8,
		backgroundColor: theme.colors.primary,
		paddingHorizontal: 12,
		paddingVertical: 6,
		borderRadius: 6,
	},
	btnTxt: { color: "#fff", fontSize: 12 },
});
