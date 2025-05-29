// import { useNavigation } from "@react-navigation/native";
// import { useEffect } from "react";
// import { BackHandler } from "react-native";

// export default function useAndroidBackHandler() {
// 	const navigation = useNavigation();

// 	// helper – walk up the tree
// 	function findNavigatorWithHistory(nav) {
// 		let current = nav;
// 		while (current && !current.canGoBack()) {
// 			current = current.getParent();
// 		}
// 		return current;
// 	}

// 	useEffect(() => {
// 		function onBackPress() {
// 			const navToPop = findNavigatorWithHistory(navigation);

// 			if (navToPop && navToPop.canGoBack()) {
// 				navToPop.goBack();
// 				return true; // we handled it
// 			}
// 			return false; // let Android close the app
// 		}

// 		BackHandler.addEventListener("hardwareBackPress", onBackPress);
// 		return () => BackHandler.removeEventListener("hardwareBackPress", onBackPress);
// 	}, [navigation]);
// }
