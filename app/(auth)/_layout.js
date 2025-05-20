import { Stack } from "expo-router";

export default function AuthLayout() {
	return (
		<Stack
			screenOptions={{ headerShown: false }}
			// initialRouteName="register"
		>
			{/* every file in (auth) is auto-registered */}
		</Stack>
	);
}
