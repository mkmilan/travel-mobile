import { followUser, getUserFollowers, getUserFollowing, unfollowUser } from "@/src/services/api";
import useProfileContext from "@/src/hooks/useProfileContext";
import { createPagedList } from "@/src/utils/pagedList";
import { createFollowActions, followsUser } from "@/src/utils/followActions";
import { theme } from "@/src/theme";
import { useRouter } from "expo-router";
import { useEffect, useMemo, useSyncExternalStore } from "react";
import { ActivityIndicator, FlatList, Text, TouchableOpacity, View } from "react-native";
import ProfileListStatus from "../ProfileListStatus";
import Avatar from "../ui/Avatar";
import BottomModal from "./BottomModal";
import ModalHeader from "./ModalHeader";

export default function UserListModal(props) {
	// Unmount on close: reopening owns a new request/action lifetime.
	return props.visible && ["Followers", "Following"].includes(props.stat) ? <UserListContent {...props} /> : null;
}

function UserListContent({ stat, userId, onClose, onStatsUpdate }) {
	const context = useProfileContext(`${userId}:${stat}`);
	const list = useMemo(() => createPagedList((page) => {
		if (!context.isCurrent()) throw new Error("Profile changed; request cancelled");
		return (stat === "Followers" ? getUserFollowers : getUserFollowing)(userId, page, 15);
	}), [context, stat, userId]);
	const state = useSyncExternalStore(list.subscribe, list.getSnapshot, list.getSnapshot);
	const actions = useMemo(() => createFollowActions({
		context, follow: followUser, unfollow: unfollowUser,
		getFollowing: (targetId) => followsUser(list.getSnapshot().items.find((user) => user._id === targetId) || {}, context.userId),
		onChange: async (targetId, isFollowing) => {
			list.setItems((users) => users.map((user) => user._id === targetId ? { ...user, isFollowing } : user));
			await Promise.all([list.refresh(), onStatsUpdate?.()]);
		},
		reconcile: () => Promise.all([list.refresh(), onStatsUpdate?.()]),
	}), [context, list, onStatsUpdate]);
	const actionState = useSyncExternalStore(actions.subscribe, actions.getSnapshot, actions.getSnapshot);
	const router = useRouter();
	useEffect(() => { void list.ensureLoaded(); }, [list]);
	return <BottomModal visible onClose={onClose}>
		<ModalHeader title={stat} onClose={onClose} />
		{actionState.error && <Text accessibilityRole="alert" style={{ color: theme.colors.error, paddingVertical: 12 }}>{actionState.error}</Text>}
		<FlatList data={state.items} keyExtractor={(user) => user._id}
			renderItem={({ item }) => {
				const isFollowing = followsUser(item, context.userId);
				const busy = !!actionState.pending[item._id];
				return <View style={{ flexDirection: "row", alignItems: "center", paddingVertical: 10 }}>
					<TouchableOpacity accessibilityRole="button" onPress={() => {
						if (!context.isCurrent()) return;
						onClose(); router.push(`/(tabs)/user/${item._id}`);
					}} style={{ flexDirection: "row", alignItems: "center", flex: 1 }}>
						<Avatar user={item} size={48} style={{ marginRight: 12 }} />
						<Text style={{ flex: 1, fontSize: 16, color: theme.colors.text }}>{item.username}</Text>
					</TouchableOpacity>
					{item._id !== context.userId && <TouchableOpacity accessibilityRole="button" accessibilityLabel={`${isFollowing ? "Unfollow" : "Follow"} ${item.username}`}
						disabled={busy} onPress={() => actions.toggle(item._id, isFollowing)}
						style={{ padding: 10, borderRadius: 14, marginLeft: 8, backgroundColor: isFollowing ? "#e5e7eb" : theme.colors.primary, opacity: busy ? 0.6 : 1 }}>
						<Text style={{ color: isFollowing ? theme.colors.text : "#fff" }}>{busy ? "Updating…" : isFollowing ? "Unfollow" : "Follow"}</Text>
					</TouchableOpacity>}
				</View>;
			}}
			onEndReached={list.loadMore} onEndReachedThreshold={0.5} refreshing={state.refreshing} onRefresh={list.refresh}
			ListEmptyComponent={<ProfileListStatus loading={!state.loaded || state.loading} error={state.error} onRetry={list.refresh} emptyMessage={stat === "Followers" ? "No followers yet." : "Not following anyone yet."} />}
			ListFooterComponent={state.items.length ? state.loading ? <ActivityIndicator /> : state.error ? <ProfileListStatus error={state.error} onRetry={list.refresh} /> : null : null} />
	</BottomModal>;
}
