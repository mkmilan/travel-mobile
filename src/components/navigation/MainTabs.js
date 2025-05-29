// // src/navigation/MainTabs.js
// import FeedStack from "@/navigation/stacks/FeedStack";
// import RecordTripStack from "@/navigation/stacks/RecordTripStack";
// import TripsStack from "@/navigation/stacks/TripsStack";
// import UserStack from "@/navigation/stacks/UserStack";
// import { Ionicons } from "@expo/vector-icons";
// import { createBottomTabNavigator } from "@react-navigation/bottom-tabs";

// const Tab = createBottomTabNavigator();

// export default function MainTabs() {
// 	return (
// 		<Tab.Navigator screenOptions={{ headerShown: false }}>
// 			<Tab.Screen
// 				name="FeedTab"
// 				component={FeedStack}
// 				options={{
// 					title: "Feed",
// 					tabBarIcon: ({ focused, size }) => (
// 						<Ionicons name="home-outline" size={size} color={focused ? "#000" : "#666"} />
// 					),
// 				}}
// 			/>

// 			<Tab.Screen
// 				name="TripRecordTab"
// 				component={RecordTripStack}
// 				options={{
// 					title: "Record",
// 					tabBarIcon: ({ focused, size }) => (
// 						<Ionicons name="add-circle-outline" size={size} color={focused ? "#000" : "#666"} />
// 					),
// 				}}
// 			/>

// 			<Tab.Screen
// 				name="TripsTab"
// 				component={TripsStack}
// 				options={{
// 					title: "My Trips",
// 					tabBarIcon: ({ focused, size }) => (
// 						<Ionicons name="map-outline" size={size} color={focused ? "#000" : "#666"} />
// 					),
// 				}}
// 			/>

// 			<Tab.Screen
// 				name="UserTab"
// 				component={UserStack}
// 				options={{
// 					title: "Me",
// 					tabBarIcon: ({ focused, size }) => (
// 						<Ionicons name="person-circle-outline" size={size} color={focused ? "#000" : "#666"} />
// 					),
// 				}}
// 			/>
// 		</Tab.Navigator>
// 	);
// }
