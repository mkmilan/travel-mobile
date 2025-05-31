import RecommendationCard from "@/src/components/RecommendationCard";
import RecommendationDetailModal from "@/src/components/modals/RecommendationDetailModal";
import useTripSocial from "@/src/hooks/useTripSocial";
import { theme } from "@/src/theme";
import { lineStringToCoords } from "@/src/utils/geo";
import React from "react";
import { ActivityIndicator, FlatList, Text } from "react-native";
import BaseSheet from "./BaseSheet";

export default function RecommendationsSheet({ trip, visible, onClose, userId }) {
	const { recommendations, loadRecommendations } = useTripSocial(trip || {});

	const [selectedRec, setSelectedRec] = React.useState(null);

	/* fetch list when sheet opens */
	React.useEffect(() => {
		if (visible && trip?._id) loadRecommendations();
	}, [visible, trip?._id]);
	// console.log(`[RecommendationsSheet] TRIP`, trip);

	/* ---------- handlers ---------- */
	const openDetail = (rec) => setSelectedRec(rec);
	const closeDetail = () => setSelectedRec(null);

	/* treat undefined as “loading”; [] as empty list */
	const list = recommendations;

	return (
		<>
			<BaseSheet title="Recommendations" visible={visible} onClose={onClose}>
				{list === undefined ? (
					<ActivityIndicator style={{ marginTop: 40 }} color={theme.colors.primary} />
				) : list.length === 0 ? (
					<Text style={{ textAlign: "center", marginTop: 40 }}>No recommendations.</Text>
				) : (
					<FlatList
						data={list}
						keyExtractor={(r) => r._id}
						renderItem={({ item }) => <RecommendationCard rec={item} onPress={() => openDetail(item)} />}
						contentContainerStyle={{ paddingBottom: 16 }}
					/>
				)}
			</BaseSheet>

			{/* full-screen rec detail (reuses component from Trip Detail) */}
			<RecommendationDetailModal
				isVisible={!!selectedRec}
				onClose={closeDetail}
				recommendation={selectedRec}
				tripUserId={userId}
				tripRouteCoordinates={lineStringToCoords(trip?.simplifiedRoute) || []}
			/>
		</>
	);
}
