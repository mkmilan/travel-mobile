import useTripSocial from "@/src/hooks/useTripSocial";
import { theme } from "@/src/theme";
import { useRouter } from "expo-router";
import React from "react";
import { ActivityIndicator, FlatList, Pressable, Text } from "react-native";
import BaseSheet from "./BaseSheet";

export default function LikersSheet({ trip, visible, onClose }) {
	const { likers, loadLikers } = useTripSocial(trip);
	const router = useRouter();

	React.useEffect(() => {
		if (visible && trip?._id) loadLikers();
	}, [visible, trip?._id]);

	const goProfile = (uid) => {
		onClose();
		router.push(`/user/${uid}`); // ← route used elsewhere in your app
	};

	return (
		<BaseSheet title="Liked By" visible={visible} onClose={onClose}>
			{!likers ? (
				<ActivityIndicator color={theme.colors.primary} style={{ marginTop: 40 }} />
			) : likers.length === 0 ? (
				<Text style={{ textAlign: "center", marginTop: 40 }}>Be the first to like.</Text>
			) : (
				<FlatList
					data={likers}
					keyExtractor={(i) => i._id}
					renderItem={({ item }) => (
						<Pressable onPress={() => goProfile(item._id)} style={{ paddingVertical: 12, paddingHorizontal: 16 }}>
							<Text style={{ color: theme.colors.primary }}>{item.username}</Text>
						</Pressable>
					)}
				/>
			)}
		</BaseSheet>
	);
}
