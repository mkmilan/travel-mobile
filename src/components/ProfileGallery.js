import useProfileList from "@/src/hooks/useProfileList";
import ProfileListStatus from "@/src/components/ProfileListStatus";
import { fetchUserPhotosApi } from "@/src/services/api";
import { usePhotoSource } from "@/src/hooks/usePhotoSource";
import { useIsFocused, useNavigation } from "expo-router/react-navigation";
import { BlurView } from "expo-blur";
import { useRouter } from "expo-router";
import { useEffect, useRef, useState } from "react";
import { ActivityIndicator, FlatList, Image, Pressable, RefreshControl, Text, useWindowDimensions } from "react-native";
import ImageViewing from "react-native-image-viewing";

const PAGE_SIZE = 20;
const loadGalleryPage = async (userId, page, limit) => {
	const data = await fetchUserPhotosApi(userId, page, limit);
	return { data, hasNext: data?.length === limit };
};

export default function ProfileGallery({ userId }) {
	const { getPhotoSource, mediaKey } = usePhotoSource();
	const { identity, items: photos, loading, initialLoading, refreshing, error, refresh: onRefresh, loadMore } = useProfileList(userId, loadGalleryPage, PAGE_SIZE, mediaKey);
	const [viewerOpen, setViewerOpen] = useState(false);
	const [selection, setSelection] = useState(null);
	const chosen = selection && selection.identity === identity ? selection.photo : null;
	const sourceReturn = useRef(null);
	const router = useRouter();
	const nav = useNavigation();
	const isFocused = useIsFocused();
	const thumb = (useWindowDimensions().width - 3 * 4) / 2;

	// Ordinary tab switches reuse the loaded gallery. Returning from a photo's
	// source can follow an edit/delete, so revalidate once; pull-to-refresh is
	// always available for other changes.
	useEffect(() => {
		if (isFocused && sourceReturn.current === identity) {
			sourceReturn.current = null;
			void onRefresh();
		}
	}, [isFocused, identity, onRefresh]);

	/* ---------- link from viewer footer ---------- */
	const openSource = () => {
		if (!chosen) return;
		if (chosen.sourceType === "trip") {
			sourceReturn.current = identity;
			setViewerOpen(false);
			router.push(`(tabs)/trip/${chosen.sourceId}`);
			return;
		} else if (chosen.sourceType === "recommendation") {
			sourceReturn.current = identity;
			setViewerOpen(false); // close the gallery first

			nav.navigate("Recs", { openRecId: chosen.sourceId, ts: Date.now() });
		}
		setViewerOpen(false);
	};

	/* ---------- render ---------- */
	return (
		<>
			<FlatList
				key={`${userId}-${mediaKey}`}
				data={photos}
				keyExtractor={(it) => it.photoId}
				numColumns={2}
				showsVerticalScrollIndicator={false}
				columnWrapperStyle={{ justifyContent: "space-between" }}
				onEndReached={loadMore}
				onEndReachedThreshold={0.4}
				maintainVisibleContentPosition={{ minIndexForVisible: 1 }}
				renderItem={({ item }) => (
					<Pressable
						onPress={() => {
							setSelection({ identity, photo: item });
							setViewerOpen(true);
						}}
						style={{ marginVertical: 4 }}
					>
						<Image
							key={`${mediaKey}-${item.photoId}`}
							source={getPhotoSource(item.photoId)}
							style={{ width: thumb, height: thumb, borderRadius: 10 }}
							resizeMode="cover"
						/>
					</Pressable>
				)}
				ListFooterComponent={photos.length > 0 ? (loading ? <ActivityIndicator style={{ margin: 12 }} /> : error ? <ProfileListStatus error={error} onRetry={onRefresh} /> : null) : null}
				refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} />}
				ListEmptyComponent={<ProfileListStatus loading={initialLoading || loading} error={error} onRetry={onRefresh} emptyMessage="No photos yet." />}
			/>

			<ImageViewing
				key={`${userId}-${mediaKey}`}
				images={
					chosen
						? [
								{
									...getPhotoSource(chosen.photoId),
									title: chosen.context,
								},
						  ]
						: []
				}
				visible={viewerOpen && Boolean(chosen)}
				imageIndex={0} // single image → no horizontal swipe
				onRequestClose={() => setViewerOpen(false)}
				swipeToCloseEnabled={true} // vertical drag OK
				doubleTapToZoomEnabled={false}
				FooterComponent={() =>
					chosen && (
						<BlurView intensity={50} tint="dark" style={{ padding: 16, alignItems: "center" }}>
							<Pressable onPress={openSource}>
								<Text style={{ color: "#fff", fontWeight: "600", fontSize: 16 }}>{chosen.context}</Text>
							</Pressable>
						</BlurView>
					)
				}
			/>
		</>
	);
}
