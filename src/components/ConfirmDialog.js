import { theme } from "@/src/theme";
import { Modal, StyleSheet, Text, TouchableOpacity, View } from "react-native";

export default function ConfirmDialog({
	visible,
	title,
	message,
	onYes,
	onNo,
}) {
	if (!visible) return null;

	return (
		<Modal
			transparent
			animationType="fade"
		>
			<View style={styles.backdrop}>
				<View style={styles.card}>
					<Text style={styles.title}>{title}</Text>
					<Text style={styles.msg}>{message}</Text>

					<View style={styles.row}>
						<TouchableOpacity
							style={styles.btnNo}
							onPress={onNo}
						>
							<Text style={styles.txtNo}>Cancel</Text>
						</TouchableOpacity>
						<TouchableOpacity
							style={styles.btnYes}
							onPress={onYes}
						>
							<Text style={styles.txtYes}>Yes</Text>
						</TouchableOpacity>
					</View>
				</View>
			</View>
		</Modal>
	);
}

const styles = StyleSheet.create({
	backdrop: {
		flex: 1,
		backgroundColor: "#0008",
		justifyContent: "center",
		alignItems: "center",
	},
	card: {
		width: "85%",
		backgroundColor: theme.colors.surface,
		borderRadius: 12,
		padding: 20,
	},
	title: {
		fontSize: 18,
		fontWeight: "600",
		color: theme.colors.text,
		marginBottom: 8,
	},
	msg: { color: theme.colors.text, marginBottom: 16 },
	row: { flexDirection: "row", justifyContent: "flex-end", gap: 12 },
	btnNo: { paddingVertical: 8, paddingHorizontal: 16 },
	btnYes: {
		paddingVertical: 8,
		paddingHorizontal: 16,
		backgroundColor: theme.colors.primary,
		borderRadius: 6,
	},
	txtNo: { color: theme.colors.text },
	txtYes: { color: "#fff", fontWeight: "600" },
});
