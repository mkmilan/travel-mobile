import { theme as baseTheme } from "@/src/theme";
import { Feather } from "@expo/vector-icons";
import { Link } from "expo-router";
import { Image, StyleSheet, Text, TouchableOpacity, View } from "react-native";

const API_URL = "YOUR_API_BASE_URL"; // or import from env

export default function ProfileSummary({ displayedUser, stats, colors, isSelf, onLogout }) {
	const avatarUri =
		displayedUser.profilePictureUrl && API_URL !== "YOUR_API_BASE_URL"
			? `${API_URL}/photos/${displayedUser.profilePictureUrl}`
			: null;

	return (
		<View>
			{/* ----- header ----- */}
			<View style={[styles.profileHeader, { borderBottomColor: colors.inputBorder }]}>
				{avatarUri ? (
					<Image source={{ uri: avatarUri }} style={styles.profilePicture} />
				) : (
					<View style={[styles.profilePicture, styles.placeholder, { backgroundColor: colors.inputBorder }]}>
						<Text style={{ fontSize: 40, color: colors.textMuted }}>
							{displayedUser.username.charAt(0).toUpperCase()}
						</Text>
					</View>
				)}
				<Text style={[styles.username, { color: colors.text }]}>{displayedUser.username}</Text>
				{displayedUser.bio?.length > 0 && (
					<Text style={[styles.bio, { color: colors.textMuted }]}>{displayedUser.bio}</Text>
				)}
			</View>

			{/* ----- stats grid ----- */}
			<View style={styles.statsSection}>
				{[
					["Trips", stats.totalTrips],
					["Distance", stats.totalDistance],
					["Followers", stats.followers],
					["Following", stats.following],
					["Recs", stats.recommendationCount],
					["POIs", stats.poi],
				]
					.filter(Boolean)
					.map(([label, val]) => (
						<View key={label} style={[styles.statItem, { backgroundColor: colors.inputBackground }]}>
							<Text style={[styles.statValue, { color: colors.text }]}>{val}</Text>
							<Text style={[styles.statLabel, { color: colors.textMuted }]}>{label}</Text>
						</View>
					))}
			</View>

			{/* ----- own profile buttons ----- */}
			{isSelf && (
				<View style={styles.buttonRow}>
					<Link href="/(tabs)/me/edit-profile" asChild>
						<TouchableOpacity style={styles.editBtn}>
							<Feather name="edit-2" size={18} color="#fff" style={styles.btnIcon} />
							<Text style={styles.btnTxt}>Edit profile</Text>
						</TouchableOpacity>
					</Link>
					<Link href="/(tabs)/me/settings" asChild>
						<TouchableOpacity style={styles.settingsBtn}>
							<Feather name="settings" size={18} color="#333" style={styles.btnIcon} />
							<Text style={[styles.btnTxt, { color: "#333" }]}>Settings</Text>
						</TouchableOpacity>
					</Link>
				</View>
			)}

			{/* ----- logout icon (own profile) ----- */}
			{isSelf && (
				<TouchableOpacity onPress={onLogout} style={styles.logoutBtn}>
					<Feather name="log-out" size={24} color={colors.error} />
				</TouchableOpacity>
			)}
		</View>
	);
}

/* ---------- styles ---------- */
const base = baseTheme;
const styles = StyleSheet.create({
	profileHeader: {
		alignItems: "center",
		paddingTop: base.space.lg,
		paddingBottom: base.space.lg,
		borderBottomWidth: 1,
	},
	profilePicture: { width: 100, height: 100, borderRadius: 50, marginBottom: base.space.md },
	placeholder: { justifyContent: "center", alignItems: "center" },
	username: { fontSize: base.fontSize.lg + 2, fontWeight: "bold", marginBottom: 4 },
	bio: { fontSize: base.fontSize.sm, textAlign: "center", paddingHorizontal: base.space.lg },
	statsSection: {
		flexDirection: "row",
		flexWrap: "wrap",
		justifyContent: "space-around",
		paddingVertical: base.space.md,
		paddingHorizontal: base.space.sm,
	},
	statItem: {
		alignItems: "center",
		width: "30%",
		minWidth: 90,
		paddingVertical: 8,
		marginBottom: 8,
		borderRadius: base.radius.md,
	},
	statValue: { fontSize: base.fontSize.lg, fontWeight: "600" },
	statLabel: { fontSize: base.fontSize.xs, marginTop: 2 },
	buttonRow: {
		flexDirection: "row",
		justifyContent: "space-between",
		paddingHorizontal: base.space.md,
		marginTop: base.space.lg,
		gap: base.space.sm,
	},
	editBtn: {
		flex: 1,
		flexDirection: "row",
		alignItems: "center",
		justifyContent: "center",
		backgroundColor: "#4A90E2",
		paddingVertical: base.space.md,
		borderRadius: base.radius.md,
	},
	settingsBtn: {
		flex: 1,
		flexDirection: "row",
		alignItems: "center",
		justifyContent: "center",
		backgroundColor: "#CCC",
		paddingVertical: base.space.md,
		borderRadius: base.radius.md,
	},
	btnIcon: { marginRight: base.space.sm - 2 },
	btnTxt: { fontSize: base.fontSize.sm, fontWeight: "600", color: "#fff" },
	logoutBtn: { position: "absolute", right: 20, top: 10 + 24, padding: 8, zIndex: 10 },
});
