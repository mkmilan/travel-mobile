import { Stack } from "expo-router";

export const unstable_settings = { initialRouteName: "login" };
export default function AuthLayout() {
	return <Stack initialRouteName="login" screenOptions={{ headerShown: false }} />;
}
