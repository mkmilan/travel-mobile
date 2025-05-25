import { theme } from "@/src/theme";
import { Feather } from "@expo/vector-icons";
import { Pressable, StyleSheet, Text, View } from "react-native";

export default function ModalHeader({ title, onClose }) {
	return (
		<View style={styles.row}>
			<Text style={styles.title}>{title}</Text>
			<Pressable onPress={onClose} hitSlop={8}>
				<Feather name="x" size={22} color={theme.colors.textMuted} />
			</Pressable>
		</View>
	);
}

const styles = StyleSheet.create({
	row: {
		flexDirection: "row",
		justifyContent: "space-between",
		alignItems: "center",
		marginBottom: theme.space.md,
	},
	title: {
		fontSize: theme.fontSize.lg,
		fontWeight: "600",
		color: theme.colors.text,
	},
});
