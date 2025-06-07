import { useAuthStore } from "@/src/stores/auth";
import { Ionicons } from "@expo/vector-icons";
import { useRouter } from "expo-router";
import { StyleSheet, Text, TouchableOpacity, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { theme } from "../theme";
import Avatar from "./ui/Avatar";

const NAVBAR_HEIGHT = 56; // px – adjust once here if you ever change the design

export default function TopNavBar() {
	const insets = useSafeAreaInsets();
	const router = useRouter();
	const { user } = useAuthStore();
	// console.log("TopNavBar avatarUrl:", avatarUrl, "username:", username);
	const username = user?.username || "Me"; // fallback to "Me" if no user
	return (
		<View style={[styles.container, { paddingTop: insets.top, height: NAVBAR_HEIGHT + insets.top }]}>
			{/* LEFT – avatar + username */}
			<TouchableOpacity
				style={styles.left}
				onPress={() => router.push("/(tabs)/me")} // ↖︎ points to your existing user tab
			>
				<Avatar user={user} photoId={user?.profilePictureUrl} size={32} style={{ marginRight: theme.space.sm }} />
				<Text style={styles.username} numberOfLines={1}>
					{username}
				</Text>
			</TouchableOpacity>

			{/* RIGHT – search icon */}
			<Ionicons
				name="search-outline"
				size={24}
				style={styles.icon}
				onPress={() => router.push("/search")} // ↗︎ points to your Search page
			/>
		</View>
	);
}

const styles = StyleSheet.create({
	container: {
		flexDirection: "row",
		alignItems: "center",
		paddingHorizontal: 14,
		backgroundColor: "#fff",
		borderBottomWidth: StyleSheet.hairlineWidth,
		borderColor: "#d0d0d0",
	},
	left: { flexDirection: "row", alignItems: "center", flexShrink: 1 },
	avatar: { width: 32, height: 32, borderRadius: 16, marginRight: 8 },
	username: { fontWeight: "600", maxWidth: 140 },
	icon: { marginLeft: "auto" },
});
