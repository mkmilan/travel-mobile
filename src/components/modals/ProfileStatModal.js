import { ActivityIndicator, FlatList, Pressable, Text, View } from "react-native";
import { useRouter } from "expo-router";
import { useEffect, useMemo, useSyncExternalStore } from "react";
import useProfileContext from "@/src/hooks/useProfileContext";
import { getUserPois } from "@/src/services/api";
import { createPagedList } from "@/src/utils/pagedList";
import { profileDistance } from "@/src/utils/profileData";
import { theme } from "@/src/theme";
import ProfileListStatus from "../ProfileListStatus";
import BottomModal from "./BottomModal";
import ModalHeader from "./ModalHeader";

export default function ProfileStatModal({ stat, userId, stats, onClose }) {
	const context = useProfileContext(`${userId}:${stat}`);
	const list = useMemo(() => createPagedList((page) => getUserPois(userId, page, 15), stat === "POIs"), [context, stat, userId]);
	const state = useSyncExternalStore(list.subscribe, list.getSnapshot, list.getSnapshot);
	const router = useRouter();
	useEffect(() => { void list.ensureLoaded(); }, [list]);
	return <BottomModal visible onClose={onClose}>
		<ModalHeader title={stat} onClose={onClose} />
		{stat === "Distance" ? <View style={{ padding: 24 }}>
			<Text style={{ color: theme.colors.text, fontSize: 24 }}>{profileDistance(stats.totalDistance)}</Text>
			<Text style={{ color: theme.colors.textMuted, marginTop: 12 }}>Total distance across {stats.totalTrips} visible trips.</Text>
		</View> : <FlatList data={state.items} keyExtractor={(item) => `${item.tripId}:${item._id}`}
			renderItem={({ item }) => <Pressable accessibilityRole="button" onPress={() => {
				if (!context.isCurrent()) return;
				onClose(); router.push(`/(tabs)/trip/${item.tripId}`);
			}} style={{ paddingVertical: 16, borderBottomWidth: 1, borderColor: theme.colors.inputBorder }}>
				<Text style={{ color: theme.colors.text, fontWeight: "600" }}>{item.name || "Point of interest"}</Text>
				{!!item.description && <Text style={{ color: theme.colors.text }}>{item.description}</Text>}
				<Text style={{ color: theme.colors.textMuted }}>{item.tripTitle || "View trip"}</Text>
			</Pressable>}
			onEndReached={list.loadMore} onEndReachedThreshold={0.4} refreshing={state.refreshing} onRefresh={list.refresh}
			ListEmptyComponent={<ProfileListStatus loading={!state.loaded || state.loading} error={state.error} onRetry={list.refresh} emptyMessage="No points of interest yet." />}
			ListFooterComponent={state.items.length ? state.loading ? <ActivityIndicator /> : state.error ? <ProfileListStatus error={state.error} onRetry={list.refresh} /> : null : null} />}
	</BottomModal>;
}
