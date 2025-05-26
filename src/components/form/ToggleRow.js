import { theme } from "@/src/theme";
import { StyleSheet, Switch, Text, View } from "react-native";

export default function ToggleRow({ label, value, onValueChange }) {
	return (
		<View style={styles.row}>
			<Text style={styles.label}>{label}</Text>
			<Switch value={value} onValueChange={onValueChange} />
		</View>
	);
}

const styles = StyleSheet.create({
	row: {
		flexDirection: "row",
		justifyContent: "space-between",
		alignItems: "center",
		paddingVertical: theme.space.sm,
	},
	label: { fontSize: theme.fontSize.sm, color: theme.colors.text },
});
