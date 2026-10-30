import useProfileList from "@/src/hooks/useProfileList";
import ProfileListStatus from "@/src/components/ProfileListStatus";
import { fetchUserPhotosApi } from "@/src/services/api";
import { usePhotoSource } from "@/src/hooks/usePhotoSource";
import { useNavigation } from "expo-router/react-navigation";
import { BlurView } from "expo-blur";
import { useRouter } from "expo-router";
import { useEffect, useRef, useState } from "react";
import { ActivityIndicator, FlatList, Image, Pressable, RefreshControl, Text, useWindowDimensions } from "react-native";
import ImageViewing from "@/src/components/SafeImageViewing";

const PAGE_SIZE = 20;
const loadGalleryPage = async (userId, page, limit) => {
	const data = await fetchUserPhotosApi(userId, page, limit);
	return { data, hasNext: data?.length === limit };
};

export default function ProfileGallery({ userId }) {
	const { getPhotoSource, mediaKey } = usePhotoSource();
	// One focus-return path covers external uploads/deletions and source links.
	const { identity, items: photos, loading, initialLoading, refreshing, error, refresh: onRefresh, loadMore } = useProfileList(userId, loadGalleryPage, PAGE_SIZE, mediaKey, true, true);
	const [viewerOpen, setViewerOpen] = useState(false);
	const [selection, setSelection] = useState(null);
	const chosen = selection && selection.identity === identity ? photos.find(photo => photo.photoId === selection.photo.photoId) || null : null;
	const sourceNavigationPending = useRef(false);
	const currentSelection = useRef(selection);
	currentSelection.current = chosen ? selection : null;
	const router = useRouter();
	const nav = useNavigation();
	const thumb = (useWindowDimensions().width - 3 * 4) / 2;

	// A refresh may remove the viewed photo. Forget the selection, rather than
	// keeping a deleted photo open or reopening it if stale data later returns.
	useEffect(() => {
		if (selection && !chosen) {
			setSelection(null);
			setViewerOpen(false);
		}
	}, [chosen, selection]);

	/* ---------- link from viewer footer ---------- */
	const openSource = () => {
		if (!viewerOpen || !chosen || currentSelection.current !== selection || sourceNavigationPending.current) return;
		if (!["trip", "recommendation"].includes(chosen.sourceType) || !chosen.sourceId) return;
		sourceNavigationPending.current = true;
		if (chosen.sourceType === "trip") {
			setViewerOpen(false);
			router.push(`(tabs)/trip/${chosen.sourceId}`);
			return;
		} else if (chosen.sourceType === "recommendation") {
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
							sourceNavigationPending.current = false;
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
							<Text style={{ color: "#fff", textAlign: "center", marginBottom: 8 }}>{chosen.context}</Text>
							<Pressable accessibilityRole="button" accessibilityLabel={chosen.sourceType === "trip" ? "Open trip" : "Open place"} onPress={openSource} style={{ minHeight: 48, alignSelf: "stretch", alignItems: "center", justifyContent: "center", paddingHorizontal: 16, borderRadius: 8, backgroundColor: "#2463A8" }}>
								<Text style={{ color: "#fff", fontWeight: "600", fontSize: 16 }}>{chosen.sourceType === "trip" ? "Open trip" : "Open place"}</Text>
							</Pressable>
						</BlurView>
					)
				}
			/>
		</>
	);
}
