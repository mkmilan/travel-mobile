import { Ionicons } from "@expo/vector-icons";
import { StyleSheet, Text, TouchableOpacity } from "react-native";
import { theme } from "@/src/theme";

export default function RecordingButton({ icon, label, onPress, secondary = false, danger = false }) {
	return (
		<TouchableOpacity accessibilityRole="button" accessibilityLabel={label} onPress={onPress}
			style={[styles.button, secondary && styles.secondary, danger && styles.danger]}>
			<Ionicons name={icon} size={22} color={danger ? theme.colors.error : secondary ? theme.colors.primary : "#fff"} />
			<Text style={[styles.label, secondary && styles.secondaryLabel, danger && styles.dangerLabel]}>{label}</Text>
		</TouchableOpacity>
	);
}

const styles = StyleSheet.create({
	button: { backgroundColor: theme.colors.primary, minHeight: 48, padding: theme.space.md,
		borderRadius: theme.radius.md, flexDirection: "row", alignItems: "center", justifyContent: "center", gap: theme.space.sm },
	label: { color: "#fff", fontWeight: "600", fontSize: theme.fontSize.md, flexShrink: 1, textAlign: "center" },
	secondary: { backgroundColor: theme.colors.inputBackground, borderWidth: 1, borderColor: theme.colors.inputBorder },
	secondaryLabel: { color: theme.colors.primary },
	danger: { backgroundColor: theme.colors.inputBackground, borderWidth: 1, borderColor: theme.colors.error },
	dangerLabel: { color: theme.colors.error },
});
