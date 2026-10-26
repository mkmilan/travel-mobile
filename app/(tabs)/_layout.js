// app/(tabs)/_layout.js
import { IconSymbol } from "@/src/components/ui/IconSymbol";
import { Tabs } from "expo-router";
import { useNavigationState, useRoute } from "expo-router/react-navigation";
import { Platform } from "react-native";

export default function TabLayout() {
	const route = useRoute();
	const fromSearch = useNavigationState(state => {
		const index = state.routes.findIndex(frame => frame.key === route.key);
		return index > 0 && state.routes[index - 1].name === "search/index";
	});
	return (
			<Tabs
				initialRouteName="trips/index"
				// Search pushes a new root Tabs frame. Do not seed it with an
				// unvisited Feed route: its first Back must bubble to Search.
				// Select by this frame's key, including on its very first render.
				backBehavior={fromSearch ? "history" : "firstRoute"}
				screenOptions={{
					headerShown: false /* the root header handles top bar */,
					tabBarActiveTintColor: "dark-blue",
					tabBarInactiveTintColor: "gray",
					tabBarStyle: {
						backgroundColor: "#fff",
						height: Platform.OS === "android" ? 120 : 80,
						paddingBottom: Platform.OS === "android" ? 20 : 0,
						paddingTop: Platform.OS === "android" ? 20 : 0,
					},
				}}
			>
				{/* —— MAIN TABS —— */}
				<Tabs.Screen
					name="feed/index"
					options={{
						title: "Feed",
						tabBarIcon: ({ color }) => <IconSymbol size={30} name="house.fill" color={color} />,
					}}
				/>
				<Tabs.Screen
					name="trips/index"
					options={{
						title: "Trips",
						tabBarIcon: ({ color }) => <IconSymbol size={30} name="map.fill" color={color} />,
					}}
				/>
				<Tabs.Screen
					name="record/index"
					options={{
						title: "Record",
						tabBarIcon: ({ color }) => <IconSymbol size={30} name="circle" color={color} />,
					}}
				/>
				<Tabs.Screen
					name="me/index"
					options={{
						title: "Profile",
						tabBarIcon: ({ color }) => <IconSymbol size={30} name="person.fill" color={color} />,
					}}
				/>

				{/* —— HIDDEN ROUTES —— */}
				{["trip/[id]", "trip/[id]/edit", "me/edit-profile", "me/settings", "user/[userId]/index"].map((name) => (
					<Tabs.Screen key={name} name={name} options={{ href: null, headerShown: false }} />
				))}
			</Tabs>
	);
}
