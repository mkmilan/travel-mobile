import { createMaterialTopTabNavigator } from "@react-navigation/material-top-tabs";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import OverviewTab from "./tabs/OverviewTab";
import RecommendationsTab from "./tabs/RecommendationsTab";
import TripsTab from "./tabs/TripsTab";

const TopTabs = createMaterialTopTabNavigator();

/**
 * Re-usable top-tab layout for “My profile” and “Other profile”.
 */
export default function ProfileTabsLayout({ isSelf = false, userId, summaryData, topOffset = 0 }) {
	const insets = useSafeAreaInsets();

	return (
		<TopTabs.Navigator
			initialRouteName="Overview"
			screenOptions={{
				tabBarIndicatorStyle: { backgroundColor: "#4A90E2", height: 3 },
				tabBarActiveTintColor: "#111",
				tabBarInactiveTintColor: "#666",
				tabBarStyle: { paddingTop: insets.top ? insets.top / 2 : 4, marginTop: topOffset },
				tabBarLabelStyle: { fontWeight: "600", textTransform: "none" },
				swipeEnabled: false,
			}}
		>
			<TopTabs.Screen name="Overview" options={{ title: "Overview" }}>
				{() => <OverviewTab summaryData={summaryData} />}
			</TopTabs.Screen>

			<TopTabs.Screen name="Trips" options={{ title: "Trips" }}>
				{() => <TripsTab userId={userId} isSelf={isSelf} />}
			</TopTabs.Screen>

			<TopTabs.Screen name="Recs" options={{ title: "Recs" }}>
				{() => <RecommendationsTab userId={userId} isSelf={isSelf} />}
			</TopTabs.Screen>
		</TopTabs.Navigator>
	);
}
