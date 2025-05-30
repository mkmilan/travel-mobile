import TransportIcon from "@/src/components/TransportIcon";
import TripMapThumbnail from "@/src/components/TripMapThumbnail";
import { theme } from "@/src/theme";
import { Feather } from "@expo/vector-icons";
import { StyleSheet, Text, TouchableOpacity, View } from "react-native";

export default function TripCard({
	userName,
	title,
	date,
	distanceKm,
	durationStr,
	avgSpeed,
	likes, // This is likesCount
	comments, // This is commentsCount
	coords,
	travelMode,
	visibility,
	onPress,
	tripId,
	isLikedByCurrentUser = false,
	recommendationsCount = 0,
	onLikePress = () => console.log("Like action pressed"), // For the like/unlike ACTION
	onOpenLikersModalPress = () => console.log("Open likers modal pressed"), // To open the modal showing who liked
	onCommentPress = () => console.log("Comment pressed"),
	onRecommendPress = () => console.log("Recommend pressed"),
	onSharePress = () => console.log("Share pressed"),
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

	// Handler for the heart icon (like/unlike ACTION)
	const handleLikeAction = (event) => {
		event.stopPropagation();
		if (tripId) {
			onLikePress(tripId); // Parent handles API call and state update
		}
	};

	// Handler for the new "Likers" text section (opens modal)
	const handleOpenLikersList = (event) => {
		event.stopPropagation();
		if (tripId) {
			onOpenLikersModalPress(tripId);
		}
	};

	const handleComment = (event) => {
		event.stopPropagation();
		if (tripId) {
			onCommentPress(tripId);
		}
	};

	const handleRecommend = (event) => {
		event.stopPropagation();
		if (tripId) {
			onRecommendPress(tripId);
		}
	};

	const handleShare = (event) => {
		event.stopPropagation();
		if (tripId) {
			onSharePress(tripId);
		}
	};

	return (
		<TouchableOpacity onPress={onPress} style={styles.card} activeOpacity={0.9}>
			{/* Top Padded Content: Header, Date */}
			<View style={styles.paddedContent}>
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
			</View>

			{/* Map Thumbnail (Full Width) */}
			<TripMapThumbnail coords={coords} style={styles.mapStyle} />

			{/* Bottom Padded Content: Likers, Stats, Footer Actions */}
			<View style={styles.paddedContent}>
				{/* Stats Row */}
				<View style={styles.statsRow}>
					<View style={styles.transportIconContainer}>
						<TransportIcon mode={travelMode} size={20} />
					</View>
					<IconStat iconName="map-pin" value={distanceKm} />
					<IconStat iconName="clock" value={durationStr} />
					<IconStat iconName="activity" value={avgSpeed} unit="km/h" />
				</View>

				{/* New Likers Section - Touchable */}
				{(likes > 0 || isLikedByCurrentUser) && ( // Show if there are likes or if the current user liked it (even if count is 0 temporarily)
					<TouchableOpacity onPress={handleOpenLikersList} style={styles.likersSection}>
						<Text style={styles.likersText}>
							{likes > 0 ? `${likes} like${likes !== 1 ? "s" : ""}` : "Be the first to like"}
						</Text>
					</TouchableOpacity>
				)}
				{!likes &&
					!isLikedByCurrentUser && ( // Only show "Be the first to like" if no likes and user hasn't liked
						<TouchableOpacity onPress={handleOpenLikersList} style={styles.likersSection}>
							<Text style={styles.likersText}>Be the first to like</Text>
						</TouchableOpacity>
					)}

				{/* Footer Actions */}
				<View style={styles.footer}>
					<TouchableOpacity onPress={handleLikeAction} style={styles.footerActionItem}>
						<Feather
							name="heart"
							size={18}
							color={isLikedByCurrentUser ? theme.colors.error : theme.colors.text}
							fill={isLikedByCurrentUser ? theme.colors.error : "none"}
						/>
						{/* Text for likes count is REMOVED from here */}
						{likes > 0 && <Text style={styles.footerText}>{likes}</Text>}
					</TouchableOpacity>

					<TouchableOpacity onPress={handleComment} style={styles.footerActionItem}>
						<Feather name="message-circle" size={18} color={theme.colors.text} />
						{comments > 0 && <Text style={styles.footerText}>{comments}</Text>}
					</TouchableOpacity>

					<TouchableOpacity onPress={handleRecommend} style={styles.footerActionItem}>
						<Feather name="star" size={18} color={theme.colors.text} />
						{recommendationsCount > 0 && <Text style={styles.footerText}>{recommendationsCount}</Text>}
					</TouchableOpacity>

					<TouchableOpacity onPress={handleShare} style={styles.footerActionItem}>
						<Feather name="share-2" size={18} color={theme.colors.text} />
					</TouchableOpacity>
				</View>
			</View>
		</TouchableOpacity>
	);
}

// Sub-component for stats with icons (remains unchanged)
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

/* --- styles --- */
const styles = StyleSheet.create({
	card: {
		backgroundColor: theme.colors.inputBackground,
		marginBottom: theme.space.md,
		shadowColor: "#000",
		shadowOpacity: 0.05,
		shadowRadius: 4,
		elevation: 2,
	},
	paddedContent: {
		paddingHorizontal: theme.space.md,
		paddingVertical: theme.space.sm,
	},
	headerContainer: {
		flexDirection: "row",
		justifyContent: "space-between",
		alignItems: "flex-start",
		marginBottom: theme.space.sm,
		paddingTop: theme.space.xs,
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
		paddingLeft: theme.space.sm,
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
		height: 220,
	},
	// New styles for the likers section
	likersSection: {
		paddingVertical: theme.space.xs, // Small vertical padding
		marginBottom: theme.space.sm, // Space before the stats row
		alignSelf: "flex-start", // Align to the left
	},
	likersText: {
		fontSize: theme.fontSize.sm,
		color: theme.colors.textMuted, // Or theme.colors.text for more prominence
		fontWeight: "500",
	},
	statsRow: {
		flexDirection: "row",
		justifyContent: "space-around",
		alignItems: "center",
		marginTop: theme.space.md,
		marginBottom: theme.space.md,
	},
	transportIconContainer: {
		alignItems: "center",
		flex: 0.8,
	},
	iconStat: {
		flexDirection: "row",
		alignItems: "center",
		flex: 1,
		justifyContent: "center",
	},
	iconStatText: {
		marginLeft: theme.space.sm,
		fontSize: theme.fontSize.sm,
		color: theme.colors.text,
		fontWeight: "500",
	},
	footer: {
		flexDirection: "row",
		justifyContent: "space-around",
		alignItems: "center",
		borderTopWidth: 1,
		borderTopColor: theme.colors.inputBorder,
		paddingTop: theme.space.md,
		paddingBottom: theme.space.sm,
	},
	footerActionItem: {
		flexDirection: "row",
		alignItems: "center",
		paddingHorizontal: theme.space.sm,
		paddingVertical: theme.space.xs,
	},
	footerText: {
		// Now only for comment/recommendation counts
		marginLeft: 6,
		fontSize: 12,
		color: theme.colors.text,
	},
});
