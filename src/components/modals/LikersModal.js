// filepath: /home/mkmilan/Documents/my/travel-2/mobile/src/components/LikersModal.js
import { theme } from "@/src/theme";
import { Feather } from "@expo/vector-icons";
import { useRouter } from "expo-router";
import { ActivityIndicator, FlatList, Image, StyleSheet, Text, TouchableOpacity, View } from "react-native";
import BottomModal from "./BottomModal";
import ModalHeader from "./ModalHeader";

// Assuming you have or will create a ProfilePicture component
// If not, you can use Image directly or the placeholder logic from TripDetailScreen
const ProfilePicture = ({ uri, size = 40, style }) => {
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

export default function LikersModal({ isVisible, onClose, likers = [], isLoading, error }) {
	const router = useRouter();

	const handleUserPress = (userId) => {
		onClose(); // Close modal before navigating
		router.push(`/user/${userId}`);
	};

	const renderLikerItem = ({ item }) => (
		<TouchableOpacity style={styles.likerItem} onPress={() => handleUserPress(item._id)}>
			<ProfilePicture uri={item.profilePictureUrl} size={40} />
			<Text style={styles.likerUsername}>{item.username}</Text>
		</TouchableOpacity>
	);

	return (
		<BottomModal visible={isVisible} onClose={onClose} style={styles.modalHeight}>
			<ModalHeader title="Liked By" onClose={onClose} />
			<View style={styles.contentContainer}>
				{isLoading ? (
					<ActivityIndicator size="large" color={theme.colors.primary} style={styles.centeredView} />
				) : error ? (
					<View style={styles.centeredView}>
						<Text style={styles.errorText}>{error}</Text>
					</View>
				) : likers.length === 0 ? (
					<View style={styles.centeredView}>
						<Text style={styles.emptyText}>No likes yet.</Text>
					</View>
				) : (
					<FlatList
						data={likers}
						renderItem={renderLikerItem}
						keyExtractor={(item) => item._id.toString()}
						contentContainerStyle={styles.listContentContainer}
					/>
				)}
			</View>
		</BottomModal>
	);
}

const styles = StyleSheet.create({
	modalHeight: {
		maxHeight: "70%", // Control max height of the bottom modal
	},
	contentContainer: {
		flex: 1, // Allows FlatList to scroll if content exceeds modal height
	},
	likerItem: {
		flexDirection: "row",
		alignItems: "center",
		paddingVertical: theme.space.sm,
		paddingHorizontal: theme.space.xs, // Add some horizontal padding if needed
		borderBottomWidth: 1,
		borderBottomColor: theme.colors.inputBorder,
	},
	likerUsername: {
		marginLeft: theme.space.sm,
		fontSize: theme.fontSize.md,
		color: theme.colors.text,
	},
	listContentContainer: {
		paddingBottom: theme.space.md,
	},
	centeredView: {
		paddingVertical: theme.space.lg,
		alignItems: "center",
		justifyContent: "center",
		flex: 1,
	},
	errorText: {
		color: theme.colors.error,
		textAlign: "center",
		fontSize: theme.fontSize.md,
	},
	emptyText: {
		color: theme.colors.textMuted,
		textAlign: "center",
		fontSize: theme.fontSize.md,
	},
});
