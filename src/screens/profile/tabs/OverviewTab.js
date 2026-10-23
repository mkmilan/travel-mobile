import { RefreshControl, ScrollView } from "react-native";
import { useFocusEffect } from "expo-router/react-navigation";
import { useCallback, useRef } from "react";
import ProfileSummary from "../ProfileSummary";

export default function OverviewTab({ summaryData, onStatPress }) {
	const visited = useRef(false);
	useFocusEffect(useCallback(() => {
		// Parent loads on entry; returning from Trips/Recs can follow an edit.
		if (visited.current) void summaryData.onRefresh();
		visited.current = true;
	}, [summaryData.onRefresh]));
	return (
		<ScrollView style={{ flex: 1, backgroundColor: summaryData.colors.background }} contentContainerStyle={{ paddingBottom: 120 }}
			refreshControl={<RefreshControl refreshing={summaryData.refreshing} onRefresh={summaryData.onRefresh} />}>
			<ProfileSummary {...summaryData} onStatPress={onStatPress} />
		</ScrollView>
	);
}
