import { theme } from "@/src/theme";
import { Ionicons } from "@expo/vector-icons";
import { Pressable, StyleSheet, Text, View } from "react-native";
import UserHeader from "../ui/UserHeader";

/** Single-trip presentation; navigation and owner actions stay with the screen. */
export default function TripRecommendationCard({ rec, onPress, onLongPress }) {
	const category = rec.primaryCategory
		? rec.primaryCategory.charAt(0).toUpperCase() + rec.primaryCategory.slice(1)
		: undefined;
	return (
		<Pressable style={styles.card} onPress={onPress} onLongPress={onLongPress}>
			<UserHeader user={rec.user || {}} showLocation={true} size={30} />
			<Text style={styles.name}>{rec.name || "Unnamed place"}</Text>
			<View style={styles.meta}>
				{category && <Text style={styles.category}>{category}</Text>}
				<View style={styles.stars} accessibilityLabel={`${rec.rating || 0} out of 5 stars`}>
					{[1, 2, 3, 4, 5].map((star) => (
						<Ionicons key={star} name={rec.rating >= star ? "star" : "star-outline"}
							size={14} color={rec.rating >= star ? "#FCD34D" : theme.colors.textMuted} />
					))}
				</View>
			</View>
			{rec.description ? <Text numberOfLines={2} style={styles.description}>{rec.description}</Text> : null}
		</Pressable>
	);
}

const styles = StyleSheet.create({
	card: { backgroundColor: theme.colors.inputBackground, borderRadius: theme.radius.md,
		padding: theme.space.md, marginBottom: theme.space.md, shadowColor: "#000",
		shadowOpacity: 0.05, shadowRadius: 4, elevation: 2 },
	name: { fontSize: theme.fontSize.md, fontWeight: "600", color: theme.colors.text },
	meta: { flexDirection: "row", flexWrap: "wrap", alignItems: "center", gap: 8, marginTop: 8 },
	category: { fontSize: theme.fontSize.xs, color: theme.colors.primary,
		backgroundColor: theme.colors.primary + "20", paddingHorizontal: theme.space.xs,
		borderRadius: theme.radius.sm, flexShrink: 1 },
	stars: { flexDirection: "row", gap: 1 },
	description: { fontSize: theme.fontSize.sm, color: theme.colors.textMuted, marginTop: 8 },
});
