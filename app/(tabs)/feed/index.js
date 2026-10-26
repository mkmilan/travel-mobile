import { useRouter } from "expo-router";
import { useEffect, useRef, useState, useSyncExternalStore } from "react";
import { ActivityIndicator, FlatList, Pressable, RefreshControl, StyleSheet, Text, View } from "react-native";

import useProfileList from "@/src/hooks/useProfileList";
import ProfileListStatus from "@/src/components/ProfileListStatus";
import { useAuthStore } from "@/src/stores/auth";
import { getFollowRevision, subscribeFollowChanges } from "@/src/utils/followActions";
import TripCardContainer from "@/src/components/TripCardContainer";
import CommentsSheet from "@/src/components/sheets/CommentsSheet";
import LikersSheet from "@/src/components/sheets/LikersSheet";
import RecommendationsSheet from "@/src/components/sheets/RecommendationsSheet";

import { getDiscoverTripJson, getFeedTripJson } from "@/src/services/api";
import { useTripSocialStore } from "@/src/stores/tripSocialStore";
import { theme } from "@/src/theme";

const loadFeedPage = async (_userId, page, limit) => {
	const { items } = await getFeedTripJson(page, limit);
	return { data: items, hasNext: items.length > 0 };
};
const loadDiscoverPage = async (_userId, page, limit) => {
	const { items, totalPages } = await getDiscoverTripJson(page, limit);
	return { data: items, totalPages };
};

/* ------------------------------------------------------------------ */
/* screen                                                              */
/* ------------------------------------------------------------------ */
export default function FeedScreen() {
	const userId = useAuthStore((state) => state.user?._id);
	const sessionEpoch = useAuthStore((state) => state.sessionEpoch);
	const [selection, setSelection] = useState(null);
	// Keep this choice local to the current login, not a persisted preference.
	const mode = selection && selection.userId === userId && selection.sessionEpoch === sessionEpoch ? selection.mode : "following";
	const followRevision = useSyncExternalStore(subscribeFollowChanges, getFollowRevision, getFollowRevision);
	const { identity, items, loading, initialLoading, refreshing, error, refresh, loadMore, refreshOnNextFocus } = useProfileList(
		userId, mode === "discover" ? loadDiscoverPage : loadFeedPage, 10, mode === "following" ? followRevision : "discover"
	);
	// A changed relationship replaces privacy-dependent data immediately. Ordinary
	// tab returns retain the same list, pages and scroll position. Switching feed
	// modes creates a fresh list: late responses and sheets stay with the old one.
	const [sheet, setSheet] = useState(null);
	const selectedTrip = sheet?.identity === identity ? sheet.trip : null;
	const sheetType = selectedTrip ? sheet.type : null;
	const router = useRouter();
	const { primeCounts } = useTripSocialStore();
	const primed = useRef({ identity: null, items: new Map() });
	useEffect(() => {
		if (primed.current.identity !== identity) primed.current = { identity, items: new Map() };
		items.forEach(item => {
			// Only a newly returned server object is authoritative. Reusing an old
			// page/card/sheet must not overwrite social changes made since loading it.
			if (primed.current.items.get(item._id) !== item) primeCounts(item);
			primed.current.items.set(item._id, item);
		});
	}, [items, identity, primeCounts]);

	/* -------------------------------------------------------------- */
	/* sheet helpers                                                  */
	/* -------------------------------------------------------------- */
	const openSheet = (type, trip) => {
		setSheet({ identity, trip, type });
	};
	const closeSheet = () => setSheet(null);

	/* -------------------------------------------------------------- */
	/* render                                                         */
	/* -------------------------------------------------------------- */
	return (
		<View style={styles.container}>
			<View style={styles.selector} accessibilityRole="tablist" accessibilityLabel="Feed source">
				{["following", "discover"].map((option) => (
					<Pressable
						key={option}
						accessibilityRole="tab"
						accessibilityState={{ selected: mode === option }}
						onPress={() => { if (mode !== option) setSelection({ userId, sessionEpoch, mode: option }); }}
						style={[styles.segment, mode === option && styles.selectedSegment]}
					>
						<Text style={[styles.segmentText, mode === option && styles.selectedSegmentText]}>{option === "following" ? "Following" : "Discover"}</Text>
					</Pressable>
				))}
			</View>
			<FlatList
				key={`${sessionEpoch}:${userId ?? "signed-out"}:${mode}`}
				data={items}
				keyExtractor={(t, i) => t._id ?? `idx-${i}`}
				renderItem={({ item }) => (
					<TripCardContainer
						primeOnMount={false}
						user={item.user}
						trip={item}
						onOpenSheet={openSheet}
						onPress={() => { refreshOnNextFocus(); router.push(`/trip/${item._id}`); }}
					/>
				)}
				contentContainerStyle={{
					flexGrow: 1,
					paddingHorizontal: theme.space.md,
					paddingTop: theme.space.sm,
					paddingBottom: theme.space.sm,
				}}
				onEndReached={loadMore}
				onEndReachedThreshold={0.3}
				ListFooterComponent={items.length > 0 ? loading ? <ActivityIndicator /> : error ? <ProfileListStatus error={error} onRetry={refresh} /> : null : null}
				refreshControl={<RefreshControl refreshing={refreshing} onRefresh={refresh} />}
				ListEmptyComponent={<ProfileListStatus loading={initialLoading || loading} error={error} onRetry={refresh} emptyMessage={mode === "discover" ? "No public trips to discover yet." : "No trips in your feed yet."} />}
			/>

			{/* shared bottom sheets */}
			<LikersSheet primeOnMount={false} trip={selectedTrip} visible={sheetType === "likers"} onClose={closeSheet} />
			<CommentsSheet primeOnMount={false} trip={selectedTrip} visible={sheetType === "comments"} onClose={closeSheet} />
			<RecommendationsSheet
				primeOnMount={false}
				trip={selectedTrip}
				userId={selectedTrip?.user?._id}
				visible={sheetType === "recs"}
				onClose={closeSheet}
			/>
		</View>
	);
}

/* ------------------------------------------------------------------ */
/* styling                                                            */
/* ------------------------------------------------------------------ */
const styles = StyleSheet.create({
	container: { flex: 1, backgroundColor: theme.colors.background },
	selector: {
		flexDirection: "row",
		marginHorizontal: theme.space.md,
		marginTop: theme.space.sm,
		padding: theme.space.xs,
		borderWidth: 1,
		borderColor: theme.colors.inputBorder,
		borderRadius: theme.radius.lg,
	},
	segment: { flex: 1, minHeight: 44, paddingVertical: theme.space.sm, alignItems: "center", justifyContent: "center", borderRadius: theme.radius.md },
	selectedSegment: { backgroundColor: theme.colors.primary },
	segmentText: { color: theme.colors.primary, fontSize: theme.fontSize.md, fontWeight: "600" },
	selectedSegmentText: { color: theme.colors.inputBackground },
});
