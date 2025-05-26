import { theme } from "@/src/theme"; // Assuming you have a theme file for consistent styling
import { Feather } from "@expo/vector-icons"; // Using Feather for the arrow icon
import { Pressable, StyleSheet, Text, View } from "react-native";

export default function Section({ title, children, onSeeAll, isExpanded }) {
	return (
		<View style={styles.sectionContainer}>
			<View style={styles.sectionHeader}>
				<Text style={styles.sectionTitle}>{title}</Text>
				{onSeeAll && (
					<Pressable onPress={onSeeAll} style={styles.seeAllButton}>
						<Feather
							name={isExpanded ? "arrow-up-circle" : "arrow-down-circle"} // Dynamically change icon
							size={20}
							color={theme.colors.textMuted}
						/>
					</Pressable>
				)}
			</View>
			{children}
		</View>
	);
}

const styles = StyleSheet.create({
	sectionContainer: {
		marginBottom: theme.space.lg,
	},
	sectionHeader: {
		flexDirection: "row",
		justifyContent: "space-between",
		alignItems: "center",
		marginBottom: theme.space.sm,
	},
	sectionTitle: {
		fontSize: theme.fontSize.md,
		fontWeight: "600",
		color: theme.colors.text,
	},
	seeAllButton: {
		// Style for the Pressable area around the icon
		padding: theme.space.xs, // Add some padding to make it easier to press
	},
	seeAllText: {
		// This style is no longer needed if using an icon
		fontSize: theme.fontSize.sm,
		color: theme.colors.primary,
		fontWeight: "500",
	},
});
