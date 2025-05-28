import NavBar from "@/components/NavBar";
import { NavigationContainer } from "@react-navigation/native";
import { createStackNavigator } from "@react-navigation/native-stack";

const Stack = createStackNavigator();

export default function RootNavigator() {
	return (
		<NavigationContainer>
			<Stack.Navigator
				screenOptions={{
					header: (props) => <NavBar {...props} />,
					headerTransparent: false, // avoid edge-to-edge bleed
				}}
			>
				{/* your screens – keep each feature in its own Stack if you use Tabs */}
				<Stack.Screen name="Feed" component={FeedScreen} />
				<Stack.Screen name="TripDetail" component={TripDetailScreen} />
				<Stack.Screen name="RecordTrip" component={RecordTripScreen} />
				{/* ... */}
			</Stack.Navigator>
		</NavigationContainer>
	);
}
