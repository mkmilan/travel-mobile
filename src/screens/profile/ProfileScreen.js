// fetch helpers
import { getPublicUserById, getUserById } from "@/src/services/api";

import { useAuthStore } from "@/src/stores/auth";
import { darkTheme, theme as lightTheme } from "@/src/theme";

import { useLocalSearchParams, useRouter } from "expo-router";
import { useEffect, useState } from "react";
import { ActivityIndicator, StyleSheet, View, useColorScheme } from "react-native";
import ProfileTabsLayout from "./ProfileTabsLayout";

/* ───────────────── constants ───────────────── */
const FUTURE_TOP_NAVBAR_HEIGHT = 0;

/* ───────────────── screen ───────────────── */
export default function ProfileScreen() {
	/* routing & auth ----------------------------------------------------- */
	const { userId } = useLocalSearchParams(); // /user/[userId] – undefined on “Me”
	const authUser = useAuthStore((s) => s.user);
	const doLogout = useAuthStore((s) => s.logout);
	const router = useRouter();

	const profileId = userId || authUser?._id;
	const isSelf = authUser && profileId === authUser._id;

	/* theme -------------------------------------------------------------- */
	const pref = useAuthStore((s) => s.theme);
	const sys = useColorScheme();
	const colors =
		pref === "system"
			? sys === "dark"
				? darkTheme.colors
				: lightTheme.colors
			: pref === "dark"
			? darkTheme.colors
			: lightTheme.colors;

	/* data ---------------------------------------------------------------- */
	const [displayedUser, setDisplayedUser] = useState(isSelf ? authUser : null);
	const [stats, setStats] = useState({
		totalDistance: 0,
		totalTrips: 0,
		recommendationCount: 0,
		followers: 0,
		following: 0,
		poi: 0,
	});
	const [loading, setLoading] = useState(!isSelf);

	/* fetch whenever profileId changes ----------------------------------- */
	useEffect(() => {
		let cancelled = false;
		(async () => {
			setLoading(true);
			try {
				const data = isSelf ? await getUserById(profileId) : await getPublicUserById(profileId);

				if (cancelled) return;

				setDisplayedUser(data);
				setStats({
					totalDistance: data.totalDistance ?? 0,
					totalTrips: data.totalTrips ?? 0,
					recommendationCount: data.totalRecommendations ?? 0,
					followers: data.followersCount ?? 0,
					following: data.followingCount ?? 0,
					poi: data.totalPois ?? 0,
				});
			} catch (e) {
				console.warn("Profile fetch failed:", e);
			} finally {
				!cancelled && setLoading(false);
			}
		})();
		return () => {
			cancelled = true;
		};
	}, [profileId, isSelf]);

	/* loading / error ---------------------------------------------------- */
	if (loading || !displayedUser) {
		return (
			<View style={[styles.centered, { backgroundColor: colors.background }]}>
				<ActivityIndicator size="large" color={colors.primary} />
			</View>
		);
	}

	/* summary-data bundled for child tabs -------------------------------- */
	const summaryData = {
		displayedUser,
		stats,
		colors,
		isSelf,
		onLogout: async () => {
			await doLogout();
			router.replace("/(auth)/login");
		},
	};

	/* render ------------------------------------------------------------- */
	return (
		<ProfileTabsLayout
			isSelf={isSelf}
			userId={profileId}
			summaryData={summaryData}
			topOffset={FUTURE_TOP_NAVBAR_HEIGHT}
		/>
	);
}

/* ───────────────── styles ───────────────── */
const styles = StyleSheet.create({
	centered: { flex: 1, justifyContent: "center", alignItems: "center" },
});
