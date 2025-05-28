import { useAuthStore } from "@/store/authStore"; // selector inside your existing store
import { Ionicons } from "@expo/vector-icons";
import { Image, StyleSheet, Text, TouchableOpacity, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

export default function NavBar({ navigation, back }) {
	const insets = useSafeAreaInsets();
	const { avatarUrl, username } = useAuthStore((s) => ({
		avatarUrl: s.user?.avatarUrl,
		username: s.user?.username ?? "Guest",
	}));

	return (
		<View style={[styles.container, { paddingTop: insets.top }]}>
			{/* LEFT – avatar + username */}
			<TouchableOpacity style={styles.left} onPress={() => navigation.navigate("UserProfile")}>
				<Image
					source={avatarUrl ? { uri: avatarUrl } : require("@/assets/avatar-placeholder.png")}
					style={styles.avatar}
				/>
				<Text style={styles.username} numberOfLines={1}>
					{username}
				</Text>
			</TouchableOpacity>

			{/* RIGHT – icons */}
			<View style={styles.right}>
				<Ionicons name="search-outline" size={24} style={styles.icon} onPress={() => navigation.navigate("Search")} />
				<Ionicons
					name="information-circle-outline"
					size={24}
					style={styles.icon}
					onPress={() => navigation.navigate("Info")}
				/>
				<Ionicons
					name="settings-outline"
					size={24}
					style={styles.icon}
					onPress={() => navigation.navigate("Settings")}
				/>
			</View>
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
	},
	left: { flexDirection: "row", alignItems: "center", flexShrink: 1 },
	avatar: { width: 32, height: 32, borderRadius: 16, marginRight: 8 },
	username: { fontWeight: "600", maxWidth: 140 },
	right: { flexDirection: "row", marginLeft: "auto" },
	icon: { marginLeft: 18 },
});
