import { StyleSheet, Text, useColorScheme, View } from "react-native";

export default function HomeScreen() {
	const colorScheme = useColorScheme();
	const isDark = colorScheme === "dark";

	return (
		<View
			style={[styles.container, { backgroundColor: isDark ? "#000" : "#fff" }]}
		>
			<Text style={{ color: isDark ? "#fff" : "#000" }}>Welcome to Home!</Text>
		</View>
	);
}

const styles = StyleSheet.create({
	container: {
		flex: 1,
		justifyContent: "center",
		alignItems: "center",
	},
});
