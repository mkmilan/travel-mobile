import { theme } from "@/src/theme";
import { Feather, Ionicons } from "@expo/vector-icons";
import { Pressable, StyleSheet, Text, View } from "react-native";
import Avatar from "./ui/Avatar";
const avatar = 26;

/** static display – parent decides what happens onPress */
export default function RecommendationCard({ rec, onPress, onLongPress }) {
	const category = rec.primaryCategory
		? rec.primaryCategory.charAt(0).toUpperCase() + rec.primaryCategory.slice(1)
		: undefined;

	return (
		<Pressable style={styles.card} onPress={onPress} onLongPress={onLongPress}>
			{/* ---- first row: star + name ---- */}
			<View style={styles.headerRow}>
				<Feather name="star" size={18} color={theme.colors.warning} style={{ marginRight: 6 }} />
				<Text numberOfLines={1} style={styles.name}>
					{rec.name || "Unnamed place"}
				</Text>
			</View>

			{/* ---- author + meta row ---- */}
			<View style={styles.metaRow}>
				{/* author */}
				{rec.user && (
					<View style={styles.author}>
						{rec.user?.profilePictureUrl ? (
							<Avatar
								user={rec.user}
								profilePictureUrl={rec.user.profilePictureUrl}
								size={26}
								style={{ marginRight: theme.space.sm }}
							/>
						) : (
							<View style={styles.avatarFallback}>
								<Text style={styles.avatarTxt}>{rec.user.username?.[0]?.toUpperCase() || "?"}</Text>
							</View>
						)}
						<Text style={styles.authorTxt} numberOfLines={1}>
							{rec.user.username}
						</Text>
					</View>
				)}

				{/* rating & category at right side */}
				<View style={styles.rightMeta}>
					{category && (
						<Text style={styles.cat} numberOfLines={1}>
							{category}
						</Text>
					)}
					<Stars rating={rec.rating} />
				</View>
			</View>

			{/* ---- short description (optional) ---- */}
			{rec.description ? (
				<Text numberOfLines={2} style={styles.desc}>
					{rec.description}
				</Text>
			) : null}
		</Pressable>
	);
}

/* small helper */
function Stars({ rating = 0, size = 14 }) {
	return (
		<View style={{ flexDirection: "row" }}>
			{[1, 2, 3, 4, 5].map((s) => (
				<Ionicons
					key={s}
					name={rating >= s ? "star" : "star-outline"}
					size={size}
					color={rating >= s ? "#FCD34D" : theme.colors.textMuted}
					style={{ marginRight: 1 }}
				/>
			))}
		</View>
	);
}

const styles = StyleSheet.create({
	card: {
		backgroundColor: theme.colors.inputBackground,
		borderRadius: theme.radius.md,
		padding: theme.space.md,
		marginBottom: theme.space.md,
		shadowColor: "#000",
		shadowOpacity: 0.05,
		shadowRadius: 4,
		elevation: 2,
	},
	headerRow: { flexDirection: "row", alignItems: "center" },
	name: { fontWeight: "600", flex: 1, fontSize: theme.fontSize.md, color: theme.colors.text },
	metaRow: {
		flexDirection: "row",
		justifyContent: "space-between",
		alignItems: "center",
		marginTop: 6,
	},
	/* author */
	author: { flexDirection: "row", alignItems: "center", flexShrink: 1 },
	avatarFallback: {
		width: avatar,
		height: avatar,
		borderRadius: avatar / 2,
		backgroundColor: theme.colors.inputBorder,
		alignItems: "center",
		justifyContent: "center",
		marginRight: 6,
	},
	avatarTxt: { fontSize: 12, fontWeight: "600", color: theme.colors.text },
	authorTxt: { fontSize: theme.fontSize.xs, color: theme.colors.textMuted, maxWidth: 120 },
	/* right meta */
	rightMeta: { flexDirection: "row", alignItems: "center", gap: 8 },
	cat: {
		fontSize: theme.fontSize.xs,
		color: theme.colors.primary,
		backgroundColor: theme.colors.primary + "20",
		paddingHorizontal: theme.space.xs,
		borderRadius: theme.radius.sm,
	},
	desc: { fontSize: theme.fontSize.sm, color: theme.colors.textMuted, marginTop: 6 },
});
