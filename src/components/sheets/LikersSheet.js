import ProfileListStatus from "@/src/components/ProfileListStatus";
import useSocialSheetLoader from "@/src/hooks/useSocialSheetLoader";
import useTripSocial from "@/src/hooks/useTripSocial";
import { theme } from "@/src/theme";
import { useRouter } from "expo-router";
import React from "react";
import { ActivityIndicator, FlatList, Pressable, Text } from "react-native";
import Avatar from "../ui/Avatar";
import BaseSheet from "./BaseSheet";

export default function LikersSheet({ trip, visible, onClose, primeOnMount = true }) {
	const { likers, loadLikers } = useTripSocial(trip || {}, primeOnMount);
	const loader = useSocialSheetLoader({ tripId: trip?._id, visible, load: loadLikers });
	const router = useRouter();

	const goProfile = (uid) => {
		onClose();
		router.push(`/user/${uid}`); // ← route used elsewhere in your app
	};

	return (
		<BaseSheet title="Liked By" visible={visible} onClose={onClose}>
			{loader.error ? <ProfileListStatus error={loader.error} onRetry={loader.retry} /> : null}
			{!likers ? (
				loader.loading ? <ActivityIndicator color={theme.colors.primary} style={{ marginTop: 40 }} /> : null
			) : likers.length === 0 ? (
				<Text style={{ textAlign: "center", marginTop: 40 }}>Be the first to like.</Text>
			) : (
				<FlatList
					data={likers}
					keyExtractor={(i) => i._id}
					renderItem={({ item }) => (
						<Pressable
							onPress={() => goProfile(item._id)}
							style={{
								paddingVertical: 12,
								paddingHorizontal: 16,
								display: "flex",
								flexDirection: "row",
								alignItems: "center",
							}}
						>
							<Avatar
								user={item}
								profilePictureUrl={item.profilePictureUrl}
								size={26}
								style={{ marginRight: theme.space.sm }}
							/>
							<Text style={{ color: theme.colors.primary }}>{item.username}</Text>
						</Pressable>
					)}
				/>
			)}
		</BaseSheet>
	);
}
