import Avatar from "@/src/components/ui/Avatar";
import { theme as baseTheme } from "@/src/theme";
import { Feather } from "@expo/vector-icons";
import { Link } from "expo-router";
import { StyleSheet, Text, TouchableOpacity, View } from "react-native";

export default function ProfileSummary({ displayedUser, stats, colors, isSelf, onLogout, onStatPress }) {
	const statMeta = {
		Trips: { icon: "map", color: "#4A90E2" },
		Distance: { icon: "activity", color: "#50E3C2" },
		Followers: { icon: "users", color: "#F5A623" },
		Following: { icon: "user-plus", color: "#B8E986" },
		Recs: { icon: "star", color: "#F8E71C" },
		POIs: { icon: "map-pin", color: "#D0021B" },
	};

	return (
		<View>
			<View style={[styles.profileHeaderRow, { borderBottomColor: colors.inputBorder }]}>
				<Avatar user={displayedUser} photoId={displayedUser.profilePictureUrl} size={84} />
				<View style={styles.profileInfoCol}>
					<Text style={[styles.username, { color: colors.text }]} numberOfLines={2} ellipsizeMode="tail">
						{displayedUser.username}
					</Text>
					{(displayedUser.city || displayedUser.country) && (
						<Text style={[styles.location, { color: colors.textMuted }]} numberOfLines={1}>
							{displayedUser.city || ""}
							{displayedUser.city && displayedUser.country ? ", " : ""}
							{displayedUser.country || ""}
						</Text>
					)}
				</View>
			</View>
			{/* ----- bio row ----- */}
			{displayedUser?.bio?.length > 0 && (
				<View style={styles.bioSection}>
					<Text style={styles.bioTitle}>Bio</Text>
					<Text style={[styles.bio, { color: colors.text }]}>{displayedUser.bio}</Text>
				</View>
			)}

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
					.map(([label, val]) => {
						const meta = statMeta[label] || {};
						return (
							<TouchableOpacity
								key={label}
								style={[styles.statItem, { backgroundColor: colors.inputBackground }]}
								activeOpacity={0.7}
								onPress={() => onStatPress?.(label)}
							>
								<View
									style={{
										backgroundColor: meta.color || "#eee",
										borderRadius: 20,
										padding: 8,
										marginBottom: 4,
									}}
								>
									<Feather name={meta.icon} size={20} color="#fff" />
								</View>
								<Text style={[styles.statValue, { color: colors.text }]}>{val}</Text>
								<Text style={[styles.statLabel, { color: colors.textMuted }]}>{label}</Text>
							</TouchableOpacity>
						);
					})}
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
	// profileHeader: {
	// 	alignItems: "center",
	// 	paddingTop: base.space.lg,
	// 	paddingBottom: base.space.lg,
	// 	borderBottomWidth: 1,
	// },
	profileHeaderRow: {
		flexDirection: "row",
		alignItems: "center",
		paddingTop: base.space.lg,
		paddingBottom: base.space.md,
		paddingHorizontal: base.space.md,
		// borderBottomWidth: 1,
		gap: base.space.md,
	},
	profileInfoCol: {
		flex: 1,
		justifyContent: "center",
	},
	profilePicture: { width: 100, height: 100, borderRadius: 50, marginBottom: base.space.md },
	placeholder: { justifyContent: "center", alignItems: "center" },
	username: { fontSize: base.fontSize.lg, fontWeight: "bold", marginBottom: 2, flexWrap: "wrap" },
	location: { fontSize: base.fontSize.sm, color: base.colors.textMuted },
	bioSection: {
		paddingHorizontal: base.space.md,
		paddingTop: base.space.sm,
		paddingBottom: base.space.md,
		borderBottomWidth: 1,
		borderBlockColor: base.colors.inputBorder,
		marginBottom: base.space.md,
		// gap: base.space.md,
	},
	bioTitle: {
		fontSize: base.fontSize.sm,
		fontWeight: "bold",
		// color: base.colors.textMuted,
		marginBottom: 2,
		letterSpacing: 0.5,
	},
	bio: {
		fontSize: base.fontSize.sm,
		lineHeight: 20,
	},
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
	statItem: {
		alignItems: "center",
		width: "30%",
		minWidth: 90,
		paddingVertical: 8,
		marginBottom: 8,
		borderRadius: base.radius.md,
		// Add shadow for iOS
		shadowColor: "#000",
		shadowOffset: { width: 0, height: 2 },
		shadowOpacity: 0.1,
		shadowRadius: 4,
		// Add elevation for Android
		elevation: 2,
	},
});
