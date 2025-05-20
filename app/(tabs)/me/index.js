import { Link } from "expo-router";
import { StyleSheet, Text, useColorScheme, View } from "react-native";

export default function Me() {
	const theme = useColorScheme(); // 'dark' or 'light'

	return (
		<View
			style={[
				styles.container,
				{ backgroundColor: theme === "dark" ? "#000" : "#fff" },
			]}
		>
			<Text style={{ color: theme === "dark" ? "#fff" : "#000" }}>
				MEEEE SCREEN
			</Text>

			<Link
				href="/(auth)/logout"
				style={styles.logoutButton}
			>
				<Text style={styles.logoutText}>Logout</Text>
			</Link>
		</View>
	);
}

const styles = StyleSheet.create({
	container: {
		flex: 1,
		justifyContent: "center",
		alignItems: "center",
	},
	logoutButton: {
		marginTop: 20,
		backgroundColor: "#ff3b30",
		padding: 10,
		borderRadius: 8,
	},
	logoutText: {
		color: "#fff",
		fontSize: 16,
	},
});
