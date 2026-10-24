import useRequireAuth from "@/src/hooks/useRequireAuth";
import { useResolvedTheme } from "@/src/hooks/useResolvedTheme";
import useProfileContext from "@/src/hooks/useProfileContext";
import { followUser, unfollowUser, getPublicUserById, getUserById } from "@/src/services/api";
import { useTripSocialStore } from "@/src/stores/tripSocialStore";
import { useAuthStore } from "@/src/stores/auth";
import { darkTheme, theme as lightTheme } from "@/src/theme";
import { createFollowActions } from "@/src/utils/followActions";
import { createProfileData, profileStats } from "@/src/utils/profileData";
import { useLocalSearchParams } from "expo-router";
import { useFocusEffect } from "expo-router/react-navigation";
import { useCallback, useMemo, useRef, useSyncExternalStore } from "react";
import { ActivityIndicator, Pressable, StyleSheet, Text, View } from "react-native";
import ProfileTabsLayout from "./ProfileTabsLayout";

export default function ProfileScreen() {
	const ready = useRequireAuth();
	const { userId } = useLocalSearchParams();
	const authUser = useAuthStore((state) => state.user);
	const doLogout = useAuthStore((state) => state.logout);
	const profileId = (Array.isArray(userId) ? userId[0] : userId) || authUser?._id;
	const isSelf = profileId === authUser?._id;
	const context = useProfileContext(profileId);
	const resolvedTheme = useResolvedTheme();
	const colors = resolvedTheme === "dark" ? darkTheme.colors : lightTheme.colors;
	const profile = useMemo(() => createProfileData(
		() => isSelf ? getUserById(profileId) : getPublicUserById(profileId), context.isCurrent
	), [context, isSelf, profileId]);
	const { user: displayedUser, loading, error } = useSyncExternalStore(profile.subscribe, profile.getSnapshot, profile.getSnapshot);
	const actions = useMemo(() => createFollowActions({
		context, follow: followUser, unfollow: unfollowUser,
		getFollowing: () => profile.getSnapshot().user?.isFollowing,
		onChange: async (_id, isFollowing) => {
			const user = profile.getSnapshot().user;
			profile.updateUser({ isFollowing, followersCount: Math.max(0, (user?.followersCount || 0) + (isFollowing ? 1 : -1)) });
			await profile.refreshAfterChange();
		},
		reconcile: profile.refreshAfterChange,
	}), [context, profile]);
	const deletionRevision = useTripSocialStore(state => state.deletionRevision);
	const lastDeletion = useRef({ profile, revision: deletionRevision });
	const actionState = useSyncExternalStore(actions.subscribe, actions.getSnapshot, actions.getSnapshot);
	useFocusEffect(useCallback(() => {
		if (!ready) return;
		const changed = lastDeletion.current.profile === profile && lastDeletion.current.revision !== deletionRevision;
		lastDeletion.current = { profile, revision: deletionRevision };
		// A focus read begun before deletion cannot satisfy its reconciliation.
		void (changed ? profile.refreshAfterChange() : profile.refresh());
	}, [ready, profile, deletionRevision]));

	if (!ready || !authUser) return <View style={styles.centered} />;
	if (!displayedUser) return (
		<View style={[styles.centered, { backgroundColor: colors.background }]}>
			{error ? <><Text accessibilityRole="alert" style={{ color: colors.error }}>Could not load profile: {error}</Text>
				<Pressable accessibilityRole="button" onPress={profile.refresh} style={{ padding: 16 }}><Text style={{ color: colors.link }}>Retry</Text></Pressable></>
				: <ActivityIndicator size="large" color={colors.primary} />}
		</View>
	);
	const summaryData = { displayedUser, stats: profileStats(displayedUser), colors, isSelf,
		onLogout: doLogout, onFollowToggle: () => actions.toggle(profileId, !!displayedUser.isFollowing),
		followBusy: !!actionState.pending[profileId], followError: actionState.error, refreshing: loading, refreshError: error, onRefresh: profile.refresh };
	return <ProfileTabsLayout key={displayedUser.isFollowing ? "following" : "not-following"}
		isSelf={isSelf} userId={profileId} summaryData={summaryData} onProfileStatsChange={profile.refreshAfterChange} />;
}

const styles = StyleSheet.create({ centered: { flex: 1, justifyContent: "center", alignItems: "center" } });
