import { IconSymbol } from "@/src/components/ui/IconSymbol";
import { Tabs } from "expo-router";
import { Platform } from "react-native";

export default function TabLayout() {
	return (
		<Tabs
			initialRouteName="trips/index"
			screenOptions={{
				headerShown: false,
				tabBarActiveTintColor: "dark-blue",
				tabBarInactiveTintColor: "gray",
				tabBarStyle: {
					backgroundColor: "#fff",
					height: Platform.OS === "android" ? 120 : 80, // bump up for Android
					paddingBottom: Platform.OS === "android" ? 20 : 0,
					paddingTop: Platform.OS === "android" ? 20 : 0,
				},
			}}
		>
			<Tabs.Screen
				name="feed/index"
				options={{
					title: "Feed",
					tabBarIcon: ({ color }) => (
						<IconSymbol size={30} name="house.fill" color={color} />
					),
				}}
			/>
			<Tabs.Screen
				name="trips/index"
				options={{
					title: "Trips",
					tabBarIcon: ({ color }) => (
						<IconSymbol size={30} name="map.fill" color={color} />
					),
				}}
			/>
			<Tabs.Screen
				name="record/index"
				options={{
					title: "Record",
					tabBarIcon: ({ color }) => (
						<IconSymbol size={30} name="circle" color={color} />
					),
				}}
			/>
			<Tabs.Screen
				name="me/index"
				options={{
					title: "Profile",
					tabBarIcon: ({ color }) => (
						<IconSymbol size={30} name="person.fill" color={color} />
					),
				}}
			/>
			<Tabs.Screen
				name="trip/[id]"
				options={{
					// Hide from tab bar
					href: null,
					headerShown: false,
				}}
			/>
			<Tabs.Screen
				name="trip/[id]/edit"
				options={{
					// Hide from tab bar
					href: null,
					headerShown: false,
				}}
			/>
			<Tabs.Screen
				name="me/edit-profile"
				options={{
					// Hide from tab bar
					href: null,
					headerShown: false,
				}}
			/>
			<Tabs.Screen
				name="me/settings"
				options={{
					// Hide from tab bar
					href: null,
					headerShown: false,
				}}
			/>
		</Tabs>
	);
}
