// filepath: /home/mkmilan/Documents/my/travel-2/mobile/src/components/CommentList.js
import { theme } from "@/src/theme";
import { isoToDate } from "@/src/utils/format"; // Assuming this formats date nicely
import { Feather } from "@expo/vector-icons";
import { useRouter } from "expo-router";
import { FlatList, Image, StyleSheet, Text, TouchableOpacity, View } from "react-native";

// Assuming ProfilePicture component from LikersModal or similar
const ProfilePicture = ({ uri, size = 32, style }) => {
	if (uri) {
		return <Image source={{ uri }} style={[{ width: size, height: size, borderRadius: size / 2 }, style]} />;
	}
	return (
		<View
			style={[
				{
					width: size,
					height: size,
					borderRadius: size / 2,
					backgroundColor: theme.colors.inputBorder,
					justifyContent: "center",
					alignItems: "center",
				},
				style,
			]}
		>
			<Feather name="user" size={size * 0.6} color={theme.colors.textMuted} />
		</View>
	);
};

export default function CommentList({ comments = [], currentUserId, onDeleteComment }) {
	const router = useRouter();

	const handleUserPress = (userId) => {
		if (userId) {
			router.push(`/user/${userId}`);
		} else {
			console.warn("User ID is missing for comment navigation");
		}
	};

	const renderCommentItem = ({ item }) => {
		// Guard against missing user object or user._id
		const userId = item.user?._id;
		const username = item.user?.username || "Unknown User";
		const profilePictureUrl = item.user?.profilePictureUrl; // Assuming this is the correct field name

		return (
			<View style={styles.commentItem}>
				<TouchableOpacity onPress={() => handleUserPress(userId)}>
					<ProfilePicture uri={profilePictureUrl} size={32} style={styles.commentAvatar} />
				</TouchableOpacity>
				<View style={styles.commentContent}>
					<View style={styles.commentHeader}>
						<TouchableOpacity onPress={() => handleUserPress(userId)}>
							<Text style={styles.commentUsername}>{username}</Text>
						</TouchableOpacity>
						<Text style={styles.commentDate}>{isoToDate(item.createdAt)}</Text>
					</View>
					<Text style={styles.commentText}>{item.text}</Text>
				</View>
				{currentUserId === userId && onDeleteComment && (
					<TouchableOpacity onPress={() => onDeleteComment(item._id)} style={styles.deleteButton}>
						<Feather name="trash-2" size={16} color={theme.colors.error} />
					</TouchableOpacity>
				)}
			</View>
		);
	};
	if (!comments || comments.length === 0) {
		return <Text style={styles.emptyText}>No comments yet. Be the first to comment!</Text>;
	}

	return (
		<FlatList
			data={comments}
			renderItem={renderCommentItem}
			keyExtractor={(item) => item._id.toString()}
			contentContainerStyle={styles.listContainer}
			scrollEnabled={false} // Keep this if the ScrollView in TripDetailScreen handles overall scroll
		/>
	);
}

const styles = StyleSheet.create({
	listContainer: {
		paddingVertical: theme.space.sm,
	},
	commentItem: {
		flexDirection: "row",
		padding: theme.space.md, // Use consistent padding like RecommendationCard
		// borderBottomWidth: 1, // Remove border
		// borderBottomColor: theme.colors.inputBorder, // Remove border
		alignItems: "flex-start",
		backgroundColor: theme.colors.inputBackground, // Add background color
		borderRadius: theme.radius.md, // Add border radius
		marginBottom: theme.space.sm, // Add margin between comment cards
		shadowColor: "#000", // Optional: match RecommendationCard shadow
		shadowOpacity: 0.05,
		shadowRadius: 4,
		elevation: 1, // Optional: match RecommendationCard elevation (slightly less for comments)
	},
	commentAvatar: {
		marginRight: theme.space.sm,
	},
	commentContent: {
		flex: 1,
	},
	commentHeader: {
		flexDirection: "row",
		justifyContent: "space-between",
		alignItems: "center",
		marginBottom: theme.space.xs,
	},
	commentUsername: {
		fontWeight: "600",
		color: theme.colors.text,
		fontSize: theme.fontSize.sm,
	},
	commentDate: {
		fontSize: theme.fontSize.xs,
		color: theme.colors.textMuted,
	},
	commentText: {
		fontSize: theme.fontSize.sm,
		color: theme.colors.text,
		lineHeight: theme.fontSize.sm * 1.4,
	},
	deleteButton: {
		paddingLeft: theme.space.sm, // Keep padding for touch target
		paddingVertical: theme.space.xs,
	},
	emptyText: {
		textAlign: "center",
		color: theme.colors.textMuted,
		paddingVertical: theme.space.md,
		fontSize: theme.fontSize.sm,
	},
});
