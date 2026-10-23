import useRequireAuth from "@/src/hooks/useRequireAuth";
import { useResolvedTheme } from "@/src/hooks/useResolvedTheme";
import useProfileContext from "@/src/hooks/useProfileContext";
import { getPublicUserById, getUserById } from "@/src/services/api";
import { useAuthStore } from "@/src/stores/auth";
import { darkTheme, theme as lightTheme } from "@/src/theme";
import { createProfileData, profileStats } from "@/src/utils/profileData";
import { useLocalSearchParams } from "expo-router";
import { useFocusEffect } from "expo-router/react-navigation";
import { useCallback, useMemo, useSyncExternalStore } from "react";
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
	useFocusEffect(useCallback(() => { if (ready) void profile.refresh(); }, [ready, profile]));

	if (!ready || !authUser) return <View style={styles.centered} />;
	if (!displayedUser) return (
		<View style={[styles.centered, { backgroundColor: colors.background }]}>
			{error ? <><Text accessibilityRole="alert" style={{ color: colors.error }}>Could not load profile: {error}</Text>
				<Pressable accessibilityRole="button" onPress={profile.refresh} style={{ padding: 16 }}><Text style={{ color: colors.link }}>Retry</Text></Pressable></>
				: <ActivityIndicator size="large" color={colors.primary} />}
		</View>
	);
	const summaryData = { displayedUser, stats: profileStats(displayedUser), colors, isSelf,
		onLogout: doLogout, refreshing: loading, refreshError: error, onRefresh: profile.refresh };
	return <ProfileTabsLayout key={displayedUser.isFollowing ? "following" : "not-following"}
		isSelf={isSelf} userId={profileId} summaryData={summaryData} onProfileStatsChange={profile.refresh} />;
}

const styles = StyleSheet.create({ centered: { flex: 1, justifyContent: "center", alignItems: "center" } });
