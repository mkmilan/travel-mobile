import { ENABLE_POI_UI } from "@/src/constants/featureFlags";
import ProfileStatModal from "@/src/components/modals/ProfileStatModal";
import UserListModal from "@/src/components/modals/UserListModal";
import ProfileGallery from "@/src/components/ProfileGallery";
import { Feather } from "@expo/vector-icons";
import { createMaterialTopTabNavigator } from "expo-router/js-top-tabs";
import { useState } from "react";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import OverviewTab from "./tabs/OverviewTab";
import RecommendationsTab from "./tabs/RecommendationsTab";
import TripsTab from "./tabs/TripsTab";

const TopTabs = createMaterialTopTabNavigator();

/**
 * Re-usable top-tab layout for “My profile” and “Other profile”.
 */
export default function ProfileTabsLayout({
	isSelf = false,
	userId,
	summaryData,
	topOffset = 0,
	onProfileStatsChange,
}) {
	const insets = useSafeAreaInsets();
	const [modal, setModal] = useState({ open: false, stat: null });


	const handleStatPress = (label, navigation) => {
		if (label === "POIs" && !ENABLE_POI_UI) return;
		if (label === "Trips" || label === "Recs") navigation.navigate(label);
		else setModal({ open: true, stat: label });
	};

	return (
		<>
			<TopTabs.Navigator
				initialRouteName="Overview"
				screenOptions={{
					lazy: true,
					tabBarIndicatorStyle: { backgroundColor: "#4A90E2", height: 3 },
					tabBarActiveTintColor: "#111",
					tabBarInactiveTintColor: "#666",
					tabBarStyle: { paddingTop: insets.top ? insets.top / 3 : 3, marginTop: topOffset },
					tabBarLabelStyle: { fontSize: 10, fontWeight: "300", textTransform: "none" },
					// tabBarLabelStyle: false,
					swipeEnabled: false,
				}}
			>
				<TopTabs.Screen
					name="Overview"
					options={{ tabBarIcon: ({ color }) => <Feather name="user" size={22} color={color} /> }}
				>
					{({ navigation }) => <OverviewTab summaryData={summaryData} onStatPress={(label) => handleStatPress(label, navigation)} />}
				</TopTabs.Screen>

				<TopTabs.Screen
					name="Trips"
					options={{ tabBarIcon: ({ color }) => <Feather name="map" size={22} color={color} /> }}
				>
					{/* <TopTabs.Screen name="Trips" options={{ title: "Trips" }}> */}
					{() => <TripsTab key={summaryData.stats.totalTrips} userId={userId} isSelf={isSelf} />}
				</TopTabs.Screen>

				<TopTabs.Screen
					name="Recs"
					options={{ tabBarIcon: ({ color }) => <Feather name="star" size={22} color={color} /> }}
				>
					{/* <TopTabs.Screen name="Recs" options={{ title: "Recs" }}> */}
					{() => <RecommendationsTab key={summaryData.stats.recommendationCount} userId={userId} isSelf={isSelf} />}
				</TopTabs.Screen>
				<TopTabs.Screen
					name="Gallery"
					options={{ tabBarIcon: ({ color }) => <Feather name="image" size={22} color={color} /> }}
				>
					{() => <ProfileGallery userId={userId} />}
				</TopTabs.Screen>
			</TopTabs.Navigator>
			{modal.open && ["Followers", "Following"].includes(modal.stat) && <UserListModal
				visible={modal.open}
				stat={modal.stat}
				userId={userId}
				onClose={() => setModal({ open: false, stat: null })}
				onStatsUpdate={onProfileStatsChange}
			/>}
			{modal.open && (modal.stat === "Distance" || (ENABLE_POI_UI && modal.stat === "POIs")) && <ProfileStatModal
				stat={modal.stat} userId={userId} stats={summaryData.stats} onClose={() => setModal({ open: false, stat: null })} />}
		</>
	);
}
