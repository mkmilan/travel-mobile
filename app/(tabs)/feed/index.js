import { Text, useColorScheme, View } from "react-native";

export default function Feed() {
	const theme = useColorScheme(); // 'dark' or 'light'

	return (
		<View
			style={{
				flex: 1,
				backgroundColor: theme === "dark" ? "#000" : "#fff",
				justifyContent: "center",
				alignItems: "center",
			}}
		>
			<Text style={{ color: theme === "dark" ? "#fff" : "#000" }}>
				Feed Screen
			</Text>
		</View>
	);
}
