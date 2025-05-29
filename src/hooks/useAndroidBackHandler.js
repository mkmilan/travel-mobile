// plain-JS, Expo 53
import { useNavigation } from "@react-navigation/native";
import { useEffect } from "react";
import { BackHandler } from "react-native";

export default function useAndroidBackHandler() {
	const navigation = useNavigation();

	useEffect(() => {
		// Called when the physical back button is pressed
		function onBackPress() {
			if (navigation.canGoBack()) {
				navigation.goBack();
				return true; // We consumed the event (stay in the app)
			}
			return false; // Let Android close the app
		}

		BackHandler.addEventListener("hardwareBackPress", onBackPress);
		return () => BackHandler.removeEventListener("hardwareBackPress", onBackPress);
	}, [navigation]);
}
