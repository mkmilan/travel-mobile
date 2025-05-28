// import { useAuthStore } from "@/src/stores/auth";
// import { darkTheme, theme as lightTheme } from "@/src/theme";
// import { useNavigation } from "@react-navigation/native";
// import { ScrollView, useColorScheme } from "react-native";
// import ProfileSummary from "../ProfileSummary";

// export default function OverviewTab({ isSelf }) {
// 	const nav = useNavigation();
// 	const user = useAuthStore((s) => s.user);

// 	/* theme */
// 	const pref = useAuthStore((s) => s.theme);
// 	const sys = useColorScheme();
// 	const colors =
// 		pref === "system"
// 			? sys === "dark"
// 				? darkTheme.colors
// 				: lightTheme.colors
// 			: pref === "dark"
// 			? darkTheme.colors
// 			: lightTheme.colors;

// 	const stats = {
// 		totalTrips: user.totalTrips ?? 0,
// 		totalDistance: user.totalDistance ?? 0,
// 		recommendationCount: user.totalRecommendations ?? 0,
// 		followers: user.followersCount ?? 0,
// 		following: user.followingCount ?? 0,
// 		points: user.totalPois ?? 0,
// 	};

// 	return (
// 		<ScrollView style={{ flex: 1, backgroundColor: colors.background }}>
// 			<ProfileSummary
// 				user={user}
// 				stats={stats}
// 				colors={colors}
// 				showPois={isSelf}
// 				avatarSize={80}
// 				onStatPress={(label) => {
// 					if (label === "Trips" || label === "Recs") nav.navigate(label);
// 				}}
// 			/>
// 			{/* put extra “About me” etc here later */}
// 		</ScrollView>
// 	);
// }
// src/screens/profile/tabs/OverviewTab.js
import { ScrollView } from "react-native";
import ProfileSummary from "../ProfileSummary";

/** Shows the header + stats one time inside the Overview tab */
export default function OverviewTab({ summaryData }) {
	return (
		<ScrollView style={{ flex: 1 }} contentContainerStyle={{ paddingBottom: 120 }}>
			<ProfileSummary {...summaryData} />
		</ScrollView>
	);
}
