import { theme } from "@/src/theme";
import { Pressable, StyleSheet, Text, View } from "react-native";

export default function Section({ title, children, onSeeAll }) {
	return (
		<View style={styles.sectionContainer}>
			<View style={styles.sectionHeader}>
				<Text style={styles.sectionTitle}>{title}</Text>
				{onSeeAll && (
					<Pressable onPress={onSeeAll}>
						<Text style={styles.seeAllText}>See All</Text>
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
		fontSize: theme.fontSize.lg,
		fontWeight: "600",
		color: theme.colors.text,
	},
	seeAllText: {
		fontSize: theme.fontSize.sm,
		color: theme.colors.primary,
		fontWeight: "500",
	},
});
