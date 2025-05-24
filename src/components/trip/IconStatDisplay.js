import { theme } from "@/src/theme";
import { Feather } from "@expo/vector-icons";
import { StyleSheet, Text, View } from "react-native";

export default function IconStatDisplay({
	iconName,
	value,
	label,
	iconSize = 18,
	customIcon,
}) {
	return (
		<View style={styles.iconStatDisplay}>
			{customIcon ? (
				customIcon
			) : (
				<Feather
					name={iconName}
					size={iconSize}
					color={theme.colors.textMuted}
				/>
			)}
			<View style={styles.iconStatDisplayContent}>
				<Text style={styles.iconStatValue}>{value}</Text>
				{label && <Text style={styles.iconStatLabel}>{label}</Text>}
			</View>
		</View>
	);
}

const styles = StyleSheet.create({
	iconStatDisplay: {
		alignItems: "center",
		width: "30%", // Adjust for 3 items per row, or '45%' for 2 items
		marginBottom: theme.space.md,
		paddingHorizontal: theme.space.xs,
	},
	iconStatDisplayContent: {
		alignItems: "center",
		marginTop: theme.space.xs,
	},
	iconStatValue: {
		fontSize: theme.fontSize.md,
		fontWeight: "600",
		color: theme.colors.text,
		textAlign: "center",
	},
	iconStatLabel: {
		fontSize: 12,
		color: theme.colors.textMuted,
		textAlign: "center",
	},
});
