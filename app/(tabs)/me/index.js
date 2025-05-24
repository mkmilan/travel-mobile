import { useAuthStore } from "@/src/stores/auth";
import { darkTheme, theme as lightTheme } from "@/src/theme";
import { Feather } from "@expo/vector-icons";
import { Link, useRouter } from "expo-router";
import { useEffect, useState } from "react";
import {
	ActivityIndicator,
	Image,
	Platform,
	Pressable,
	ScrollView,
	StyleSheet,
	Text,
	TouchableOpacity,
	View,
	useColorScheme,
} from "react-native";

// Placeholder for API_URL - you'll need to import/define this
const API_URL = "YOUR_API_BASE_URL"; // Replace with your actual API URL
const FUTURE_TOP_NAVBAR_HEIGHT = 60;

// A simple component for stat display - can be customized further or moved
const StatItem = ({ label, value, onPress }) => {
	const storedThemePreference = useAuthStore((state) => state.theme);
	const systemColorScheme = useColorScheme();
	const activeTheme =
		storedThemePreference === "system"
			? systemColorScheme === "dark"
				? darkTheme
				: lightTheme
			: storedThemePreference === "light"
			? lightTheme
			: darkTheme;

	return (
		<TouchableOpacity
			onPress={onPress}
			style={[
				styles.statItem,
				{ backgroundColor: activeTheme.colors.inputBackground },
			]}
		>
			<Text style={[styles.statValue, { color: activeTheme.colors.text }]}>
				{value}
			</Text>
			<Text style={[styles.statLabel, { color: activeTheme.colors.textMuted }]}>
				{label}
			</Text>
		</TouchableOpacity>
	);
};

export default function MeScreen() {
	const router = useRouter();
	const user = useAuthStore((state) => state.user);
	const logoutAction = useAuthStore((state) => state.logout);
	const loading = useAuthStore((state) => state.loading);
	const storedThemePreference = useAuthStore((state) => state.theme);

	const systemColorScheme = useColorScheme();
	const [activeTheme, setActiveTheme] = useState(lightTheme);

	useEffect(() => {
		if (storedThemePreference === "system") {
			setActiveTheme(systemColorScheme === "dark" ? darkTheme : lightTheme);
		} else {
			setActiveTheme(storedThemePreference === "dark" ? darkTheme : lightTheme);
		}
	}, [storedThemePreference, systemColorScheme]);

	const handleLogout = async () => {
		await logoutAction();
		router.replace("/(auth)/login");
	};

	// Placeholder for fetching extended user stats
	const [userStats, setUserStats] = useState({
		totalDistance: 0,
		totalTrips: 0,
		recommendationCount: 0,
		points: 0,
	});

	useEffect(() => {
		if (user) {
			// Example: setUserStats(prev => ({ ...prev, totalTrips: user.trips?.length || 0 }));
		}
	}, [user]);

	if (loading && !user) {
		return (
			<View
				style={[
					styles.container,
					{
						backgroundColor: activeTheme.colors.background,
						paddingTop: FUTURE_TOP_NAVBAR_HEIGHT,
					},
					styles.centered,
				]}
			>
				<ActivityIndicator size="large" color={activeTheme.colors.primary} />
			</View>
		);
	}

	if (!user) {
		return (
			<View
				style={[
					styles.container,
					{
						backgroundColor: activeTheme.colors.background,
						paddingTop: FUTURE_TOP_NAVBAR_HEIGHT,
					},
					styles.centered,
				]}
			>
				<Text style={[styles.messageText, { color: activeTheme.colors.text }]}>
					User not found.
				</Text>
				<Link href="/(auth)/login" asChild>
					<Pressable
						style={[
							styles.loginButton,
							{ backgroundColor: activeTheme.colors.primary },
						]}
					>
						<Text style={styles.loginButtonText}>Go to Login</Text>
					</Pressable>
				</Link>
			</View>
		);
	}

	const profilePictureFullUrl =
		user.profilePictureUrl && API_URL !== "YOUR_API_BASE_URL"
			? `${API_URL}/photos/${user.profilePictureUrl}`
			: null;

	const openStatDetailModal = (statName) => {
		alert(`Modal for ${statName} (User ID: ${user._id}) - To be implemented`);
	};

	return (
		<>
			<ScrollView
				style={[
					styles.container,
					{ backgroundColor: activeTheme.colors.background },
				]}
				contentContainerStyle={styles.contentContainer}
				showsVerticalScrollIndicator={false}
			>
				{/* Profile Header */}
				<View
					style={[
						styles.profileHeader,
						{ borderBottomColor: activeTheme.colors.inputBorder },
					]}
				>
					{profilePictureFullUrl ? (
						<Image
							source={{ uri: profilePictureFullUrl }}
							style={styles.profilePicture}
						/>
					) : (
						<View
							style={[
								styles.profilePicture,
								styles.placeholderImage,
								{
									backgroundColor: activeTheme.colors.inputBorder,
									borderColor: activeTheme.colors.inputBorder,
								},
							]}
						>
							<Text
								style={[
									styles.placeholderText,
									{ color: activeTheme.colors.textMuted },
								]}
							>
								{user.username ? user.username.charAt(0).toUpperCase() : "U"}
							</Text>
						</View>
					)}
					<Text style={[styles.username, { color: activeTheme.colors.text }]}>
						{user.username}
					</Text>
					{user.bio ? (
						<Text style={[styles.bio, { color: activeTheme.colors.textMuted }]}>
							{user.bio}
						</Text>
					) : null}
				</View>

				{/* Stats Section */}
				<View style={styles.statsSection}>
					<StatItem
						label="Trips"
						value={userStats.totalTrips}
						onPress={() => openStatDetailModal("Trips")}
					/>
					<StatItem
						label="Distance"
						value={userStats.totalDistance}
						onPress={() => openStatDetailModal("Distance")}
					/>
					<StatItem
						label="Followers"
						value={user.followers?.length || 0}
						onPress={() => openStatDetailModal("Followers")}
					/>
					<StatItem
						label="Following"
						value={user.following?.length || 0}
						onPress={() => openStatDetailModal("Following")}
					/>
					<StatItem
						label="Recommendations"
						value={userStats.recommendationCount}
						onPress={() => openStatDetailModal("Recommendations")}
					/>
					<StatItem
						label="Points"
						value={userStats.points}
						onPress={() => openStatDetailModal("Points")}
					/>
				</View>

				{/* EDIT AND SETTINGS BUTTONS - SIDE BY SIDE */}
				<View style={styles.buttonRow}>
					<Link href="/(tabs)/me/edit-profile" asChild>
						<TouchableOpacity style={styles.editButton}>
							<Feather
								name="edit-2"
								size={18}
								color="#FFFFFF"
								style={styles.buttonIcon}
							/>
							<Text style={styles.buttonText}>Edit Profile</Text>
						</TouchableOpacity>
					</Link>

					<Link href="/(tabs)/me/settings" asChild>
						<TouchableOpacity style={styles.settingsButton}>
							<Feather
								name="settings"
								size={18}
								color="#333333"
								style={styles.buttonIcon}
							/>
							<Text style={[styles.buttonText, { color: "#333333" }]}>
								Settings
							</Text>
						</TouchableOpacity>
					</Link>
				</View>

				{/* Gallery Section Placeholder */}
				<View style={styles.gallerySection}>
					<Text
						style={[styles.sectionTitle, { color: activeTheme.colors.text }]}
					>
						My Gallery
					</Text>
					<View
						style={[
							styles.galleryPlaceholder,
							{
								backgroundColor: activeTheme.colors.inputBackground,
								borderColor: activeTheme.colors.inputBorder,
							},
						]}
					>
						<Feather
							name="image"
							size={48}
							color={activeTheme.colors.textMuted}
						/>
						<Text
							style={[
								styles.galleryPlaceholderText,
								{ color: activeTheme.colors.textMuted },
							]}
						>
							Gallery coming soon
						</Text>
					</View>
				</View>
			</ScrollView>

			{/* Logout Icon Button */}
			<TouchableOpacity
				onPress={handleLogout}
				style={[
					styles.logoutIconContainer,
					{
						top: (Platform.OS === "ios" ? 44 : 10) + FUTURE_TOP_NAVBAR_HEIGHT,
					},
				]}
			>
				<Feather name="log-out" size={24} color={activeTheme.colors.error} />
			</TouchableOpacity>
		</>
	);
}

const styles = StyleSheet.create({
	container: {
		flex: 1,
	},
	contentContainer: {
		paddingBottom: Platform.OS === "ios" ? 50 : 80,
	},
	centered: {
		justifyContent: "center",
		alignItems: "center",
		padding: lightTheme.space.lg,
		flex: 1,
	},
	messageText: {
		fontSize: lightTheme.fontSize.md,
		marginBottom: lightTheme.space.md,
	},
	loginButton: {
		paddingVertical: lightTheme.space.sm,
		paddingHorizontal: lightTheme.space.lg,
		borderRadius: lightTheme.radius.md,
	},
	loginButtonText: {
		color: "#FFFFFF",
		fontSize: lightTheme.fontSize.md,
		fontWeight: "600",
	},
	profileHeader: {
		alignItems: "center",
		paddingTop:
			lightTheme.space.lg + lightTheme.space.md + FUTURE_TOP_NAVBAR_HEIGHT,
		paddingBottom: lightTheme.space.lg,
		borderBottomWidth: 1,
	},
	profilePicture: {
		width: 100,
		height: 100,
		borderRadius: 50,
		marginBottom: lightTheme.space.md,
	},
	placeholderImage: {
		justifyContent: "center",
		alignItems: "center",
		borderWidth: 1,
	},
	placeholderText: {
		fontSize: 40,
		fontWeight: "bold",
	},
	username: {
		fontSize: lightTheme.fontSize.lg + 2,
		fontWeight: "bold",
		marginBottom: lightTheme.space.sm / 2,
	},
	bio: {
		fontSize: lightTheme.fontSize.sm,
		textAlign: "center",
		paddingHorizontal: lightTheme.space.lg,
		lineHeight: lightTheme.fontSize.sm + 6,
	},
	statsSection: {
		flexDirection: "row",
		flexWrap: "wrap",
		justifyContent: "space-around",
		paddingVertical: lightTheme.space.md,
		paddingHorizontal: lightTheme.space.sm,
		marginTop: lightTheme.space.md,
	},
	statItem: {
		alignItems: "center",
		width: "30%",
		minWidth: 100,
		paddingVertical: lightTheme.space.sm,
		marginBottom: lightTheme.space.sm,
		borderRadius: lightTheme.radius.md,
		shadowColor: "#000",
		shadowOffset: { width: 0, height: 1 },
		shadowOpacity: 0.05,
		shadowRadius: 2,
		elevation: 1,
	},
	statValue: {
		fontSize: lightTheme.fontSize.lg,
		fontWeight: "600",
	},
	statLabel: {
		fontSize: lightTheme.fontSize.sm - 2,
		marginTop: 2,
	},
	// NEW BUTTON STYLES - SIDE BY SIDE
	buttonRow: {
		flexDirection: "row",
		justifyContent: "space-between",
		paddingHorizontal: lightTheme.space.md,
		marginTop: lightTheme.space.lg,
		marginBottom: lightTheme.space.md,
		gap: lightTheme.space.sm, // Space between buttons
	},
	editButton: {
		flex: 1,
		flexDirection: "row",
		alignItems: "center",
		justifyContent: "center",
		backgroundColor: "#4A90E2", // Light blue
		paddingVertical: lightTheme.space.md,
		paddingHorizontal: lightTheme.space.sm,
		borderRadius: lightTheme.radius.md,
		shadowColor: "#000",
		shadowOffset: { width: 0, height: 2 },
		shadowOpacity: 0.1,
		shadowRadius: 3,
		elevation: 2,
	},
	settingsButton: {
		flex: 1,
		flexDirection: "row",
		alignItems: "center",
		justifyContent: "center",
		backgroundColor: "#CCCCCC", // Light grey
		paddingVertical: lightTheme.space.md,
		paddingHorizontal: lightTheme.space.sm,
		borderRadius: lightTheme.radius.md,
		shadowColor: "#000",
		shadowOffset: { width: 0, height: 2 },
		shadowOpacity: 0.1,
		shadowRadius: 3,
		elevation: 2,
	},
	buttonIcon: {
		marginRight: lightTheme.space.sm - 2,
	},
	buttonText: {
		fontSize: lightTheme.fontSize.sm,
		fontWeight: "600",
		color: "#FFFFFF", // Default white, overridden for settings button
	},
	gallerySection: {
		marginTop: lightTheme.space.lg,
		paddingHorizontal: lightTheme.space.md,
	},
	sectionTitle: {
		fontSize: lightTheme.fontSize.lg,
		fontWeight: "600",
		marginBottom: lightTheme.space.md,
	},
	galleryPlaceholder: {
		height: 150,
		borderRadius: lightTheme.radius.md,
		justifyContent: "center",
		alignItems: "center",
		borderWidth: 1,
		borderStyle: "dashed",
	},
	galleryPlaceholderText: {
		marginTop: lightTheme.space.sm,
		fontSize: lightTheme.fontSize.sm,
	},
	logoutIconContainer: {
		position: "absolute",
		right: 20,
		padding: 8,
		zIndex: 10,
	},
});
