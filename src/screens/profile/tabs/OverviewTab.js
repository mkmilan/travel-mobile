import { ScrollView } from "react-native";
import ProfileSummary from "../ProfileSummary";

/** Shows the header + stats one time inside the Overview tab */
export default function OverviewTab({ summaryData, onStatPress }) {
	return (
		<ScrollView style={{ flex: 1 }} contentContainerStyle={{ paddingBottom: 120 }}>
			<ProfileSummary {...summaryData} onStatPress={onStatPress} />
		</ScrollView>
	);
}
