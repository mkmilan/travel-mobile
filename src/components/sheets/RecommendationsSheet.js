import ProfileListStatus from "@/src/components/ProfileListStatus";
import useSocialSheetLoader from "@/src/hooks/useSocialSheetLoader";
import RecommendationCard from "@/src/components/RecommendationCard";
import RecommendationDetailModal from "@/src/components/modals/RecommendationDetailModal";
import useTripSocial from "@/src/hooks/useTripSocial";
import { theme } from "@/src/theme";
import { lineStringToCoords } from "@/src/utils/geo";
import React, { useEffect, useState } from "react";
import { ActivityIndicator, FlatList, Text } from "react-native";
import BaseSheet from "./BaseSheet";

export default function RecommendationsSheet({ trip, visible, onClose, userId, primeOnMount = true }) {
	const { recommendations, loadRecommendations } = useTripSocial(trip || {}, primeOnMount);
	const loader = useSocialSheetLoader({ tripId: trip?._id, visible, load: loadRecommendations });

	const [selection, setSelection] = useState(null);
	const selectedRec = visible && selection?.identity === loader.identity ? selection.rec : null;
	useEffect(() => { setSelection(null); }, [loader.identity]);

	/* Ordinary Back returns to the list; navigation dismisses both layers. */
	const openDetail = (rec) => setSelection({ identity: loader.identity, rec });
	const closeDetail = () => setSelection(null);
	const closeAll = () => { setSelection(null); onClose(); };

	/* treat undefined as “loading”; [] as empty list */
	const list = recommendations;

	return (
		<>
			<BaseSheet title="Recommendations" visible={visible} onClose={closeAll}>
				{loader.error ? <ProfileListStatus error={loader.error} onRetry={loader.retry} /> : null}
				{list === undefined ? (
					loader.loading ? <ActivityIndicator style={{ marginTop: 40 }} color={theme.colors.primary} /> : null
				) : list.length === 0 ? (
					<Text style={{ textAlign: "center", marginTop: 40 }}>No recommendations.</Text>
				) : (
					<FlatList
						data={list}
						keyExtractor={(r) => r._id}
						renderItem={({ item }) => <RecommendationCard rec={item} photoRefreshIdentity={loader.refreshIdentity} onPress={() => openDetail(item)} />}
						contentContainerStyle={{ paddingBottom: 16 }}
					/>
				)}
			</BaseSheet>

			{/* full-screen rec detail (reuses component from Trip Detail) */}
			<RecommendationDetailModal
				isVisible={!!selectedRec}
				onClose={closeDetail}
				onNavigateClose={closeAll}
				recommendation={selectedRec}
				tripUserId={userId}
				tripRouteCoordinates={lineStringToCoords(trip?.simplifiedRoute) || []}
				readOnly={true}
			/>
		</>
	);
}
