import TransportIcon from "@/src/components/TransportIcon";
import TripMapThumbnail from "@/src/components/TripMapThumbnail";
import { theme } from "@/src/theme";
import { Feather } from "@expo/vector-icons";
import { StyleSheet, Text, TouchableOpacity, View } from "react-native";

export default function TripCard({
	userName,
	title,
	date, // Expecting a pre-formatted date string
	distanceKm,
	durationStr,
	avgSpeed,
	likes,
	comments,
	coords,
	travelMode,
	visibility, // 'public', 'followers_only', 'private'
	onPress,
}) {
	let visibilityIconName = "eye";
	let visibilityTooltip = "Public";

	if (visibility === "followers_only") {
		visibilityIconName = "users";
		visibilityTooltip = "Followers only";
	} else if (visibility === "private") {
		visibilityIconName = "lock";
		visibilityTooltip = "Private";
	}
	return (
		<TouchableOpacity onPress={onPress} style={styles.card} activeOpacity={0.7}>
			{/* Header: User, Title, Visibility */}
			<View style={styles.headerContainer}>
				<View style={styles.titleUserContainer}>
					<Text style={styles.userName} numberOfLines={1}>
						{userName}
					</Text>
					<Text style={styles.title} numberOfLines={2}>
						{title}
					</Text>
				</View>
				<View style={styles.visibilityIconContainer}>
					<Feather
						name={visibilityIconName}
						size={18}
						color={theme.colors.textMuted}
						accessibilityLabel={visibilityTooltip}
					/>
				</View>
			</View>

			{/* Date */}
			<View style={styles.metaRow}>
				<Feather name="calendar" size={14} color={theme.colors.textMuted} />
				<Text style={styles.dateText}>{date}</Text>
			</View>

			{/* Map Thumbnail */}
			<TripMapThumbnail coords={coords} style={styles.mapStyle} />

			{/* Stats Row */}
			<View style={styles.statsRow}>
				<View style={styles.transportIconContainer}>
					<TransportIcon mode={travelMode} size={22} />
				</View>
				<IconStat
					iconName="map-pin"
					value={distanceKm}
					// unit="km"
				/>
				<IconStat iconName="clock" value={durationStr} />
				<IconStat iconName="activity" value={avgSpeed} unit="km/h" />
			</View>

			{/* Footer Actions */}
			<View style={styles.footer}>
				<FooterIcon icon="heart" value={likes} />
				<FooterIcon icon="message-circle" value={comments} />
				<Feather name="share-2" size={18} color={theme.colors.text} />
			</View>
		</TouchableOpacity>
	);
}

// New sub-component for stats with icons
function IconStat({ iconName, value, unit = "", iconSize = 16 }) {
	return (
		<View style={styles.iconStat}>
			<Feather name={iconName} size={iconSize} color={theme.colors.textMuted} />
			<Text style={styles.iconStatText} numberOfLines={1}>
				{value}
				{unit ? ` ${unit}` : ""}
			</Text>
		</View>
	);
}

// Existing sub-component for footer icons
function FooterIcon({ icon, value }) {
	return (
		<View style={styles.footerItem}>
			<Feather name={icon} size={18} color={theme.colors.text} />
			<Text style={styles.footerText}>{value}</Text>
		</View>
	);
}

/* --- styles --- */
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
	headerContainer: {
		flexDirection: "row",
		justifyContent: "space-between",
		alignItems: "flex-start",
		marginBottom: theme.space.sm,
	},
	titleUserContainer: {
		flex: 1,
		marginRight: theme.space.sm,
	},
	userName: {
		fontSize: theme.fontSize.sm,
		color: theme.colors.textMuted,
		fontWeight: "500",
		marginBottom: 2,
	},
	title: {
		fontSize: theme.fontSize.lg,
		fontWeight: "600",
		color: theme.colors.text,
	},
	visibilityIconContainer: {
		paddingLeft: theme.space.sm, // Space from title
	},
	metaRow: {
		flexDirection: "row",
		alignItems: "center",
		marginBottom: theme.space.md,
	},
	dateText: {
		fontSize: 12,
		color: theme.colors.textMuted,
		marginLeft: theme.space.sm,
	},
	mapStyle: {
		height: 150, // Or your desired height
		borderRadius: theme.radius.sm,
		marginBottom: theme.space.md,
	},
	statsRow: {
		flexDirection: "row",
		justifyContent: "space-around", // Distribute items evenly
		alignItems: "center",
		marginBottom: theme.space.md,
	},
	transportIconContainer: {
		alignItems: "center", // Center the transport icon
		flex: 0.8, // Give it a bit less space
	},
	iconStat: {
		flexDirection: "row",
		alignItems: "center",
		flex: 1, // Allow other stats to take more space
		justifyContent: "center", // Center content within its flex space
	},
	iconStatText: {
		marginLeft: theme.space.sm,
		fontSize: theme.fontSize.sm,
		color: theme.colors.text,
		fontWeight: "500",
	},
	footer: {
		flexDirection: "row",
		justifyContent: "space-between", // Keep space-between for footer
		alignItems: "center",
		borderTopWidth: 1,
		borderTopColor: theme.colors.inputBorder, // Subtle separator
		paddingTop: theme.space.sm,
	},
	footerItem: {
		flexDirection: "row",
		alignItems: "center",
	},
	footerText: {
		marginLeft: 4,
		fontSize: 12,
		color: theme.colors.text,
	},
});
