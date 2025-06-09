// import { useIsFocused } from "@react-navigation/native";
// import { BlurView } from "expo-blur";
// import { useRouter } from "expo-router";
// import { useEffect, useRef, useState } from "react";
// import { ActivityIndicator, FlatList, Image, Pressable, Text, useWindowDimensions } from "react-native";
// import ImageViewing from "react-native-image-viewing";

// import { buildPhotoUrl, fetchUserPhotosApi } from "@/src/services/api";

// export default function ProfileGallery({ userId }) {
// 	/* -------------------- state -------------------- */
// 	const [photos, setPhotos] = useState([]);
// 	const [loading, setLoading] = useState(false);
// 	const [visible, setVisible] = useState(false);
// 	const [selected, setSelected] = useState(null); // { photoId, context, … }
// 	const [page, setPage] = useState(1);
// 	const [hasMore, setHasMore] = useState(true);
// 	const [fetchingMore, setFetchingMore] = useState(false);

// 	const router = useRouter();
// 	const isFocused = useIsFocused();
// 	const { width } = useWindowDimensions();
// 	const thumb = (width - 3 * 4) / 2; // 2 cols, 4-px gutter
// 	const listRef = useRef(null);
// 	const offsetRef = useRef(0); // remember Y offset

// 	/* -------------------- fetch helper -------------------- */
// 	const loadPhotos = async (nextPage) => {
// 		if (loading || fetchingMore || !hasMore) return;
// 		if (nextPage > 1) setFetchingMore(true);
// 		setLoading(true);
// 		try {
// 			const batch = await fetchUserPhotosApi(userId, nextPage, 20);
// 			setPhotos((prev) => (nextPage === 1 ? batch : [...prev, ...batch]));
// 			setPage(nextPage);
// 			if (batch.length < 20) setHasMore(false);
// 		} finally {
// 			setLoading(false);
// 			setFetchingMore(false);
// 			if (nextPage > 1) {
// 				requestAnimationFrame(() =>
// 					listRef.current?.scrollToOffset({
// 						offset: offsetRef.current,
// 						animated: false,
// 					})
// 				);
// 			}
// 		}
// 	};

// 	/* -------------------- refresh on focus or user change -------------------- */
// 	useEffect(() => {
// 		if (!isFocused) return;
// 		setPhotos([]);
// 		setPage(1);
// 		setHasMore(true);
// 		loadPhotos(1);
// 	}, [isFocused, userId]);

// 	/* -------------------- navigation from footer -------------------- */
// 	const openSource = () => {
// 		if (!selected) return;
// 		if (selected.sourceType === "trip") {
// 			router.push(`(tabs)/trip/${selected.sourceId}`);
// 		} else if (selected.sourceType === "recommendation") {
// 			router.push(`/recommendation/${selected.sourceId}`);
// 		}
// 	};

// 	/* -------------------- render -------------------- */
// 	if (loading && page === 1) {
// 		return <ActivityIndicator style={{ marginTop: 32 }} />;
// 	}

// 	return (
// 		<>
// 			<FlatList
// 				ref={listRef}
// 				data={photos}
// 				refreshing={loading && page === 1}
// 				onRefresh={() => loadPhotos(1)}
// 				keyExtractor={(item) => item.photoId}
// 				numColumns={2}
// 				showsVerticalScrollIndicator={false}
// 				columnWrapperStyle={{ justifyContent: "space-between" }}
// 				maintainVisibleContentPosition={{ minIndexForVisible: 1 }}
// 				onEndReached={() => loadPhotos(page + 1)}
// 				onEndReachedThreshold={0.3}
// 				onScroll={({ nativeEvent }) => (offsetRef.current = nativeEvent.contentOffset.y)}
// 				scrollEventThrottle={16}
// 				renderItem={({ item }) => (
// 					<Pressable
// 						onPress={() => {
// 							setSelected(item);
// 							setVisible(true);
// 						}}
// 						style={{ marginVertical: 4 }}
// 					>
// 						<Image
// 							source={{ uri: buildPhotoUrl(item.photoId) }}
// 							style={{ width: thumb, height: thumb, borderRadius: 10 }}
// 							resizeMode="cover"
// 						/>
// 					</Pressable>
// 				)}
// 			/>

// 			<ImageViewing
// 				images={
// 					selected
// 						? [
// 								{
// 									uri: buildPhotoUrl(selected.photoId),
// 									title: selected.context,
// 									sourceType: selected.sourceType,
// 									sourceId: selected.sourceId,
// 								},
// 						  ]
// 						: []
// 				}
// 				imageIndex={0} /* only one image, no horizontal swipe */
// 				visible={visible}
// 				onRequestClose={() => setVisible(false)}
// 				swipeToCloseEnabled={true} /* vertical drag to close */
// 				doubleTapToZoomEnabled={false}
// 				FooterComponent={() =>
// 					selected && (
// 						<BlurView intensity={50} tint="dark" style={{ padding: 16, alignItems: "center" }}>
// 							<Pressable onPress={openSource}>
// 								<Text
// 									style={{
// 										color: "#fff",
// 										fontWeight: "600",
// 										fontSize: 16,
// 									}}
// 								>
// 									{selected.context}
// 								</Text>
// 							</Pressable>
// 						</BlurView>
// 					)
// 				}
// 			/>
// 		</>
// 	);
// }
import { buildPhotoUrl, fetchUserPhotosApi } from "@/src/services/api";
import { useIsFocused, useNavigation } from "@react-navigation/native";
import { BlurView } from "expo-blur";
import { useRouter } from "expo-router";
import { useEffect, useRef, useState } from "react";
import { ActivityIndicator, FlatList, Image, Pressable, Text, useWindowDimensions } from "react-native";
import ImageViewing from "react-native-image-viewing";

export default function ProfileGallery({ userId }) {
	/* ---------- state ---------- */
	const [photos, setPhotos] = useState([]);
	const [page, setPage] = useState(1);
	const [hasMore, setMore] = useState(true);
	const [loading, setLoad] = useState(false);

	const [viewerOpen, setViewerOpen] = useState(false);
	const [chosen, setChosen] = useState(null); // { photoId, context … }

	/* ---------- helpers ---------- */
	const PAGE_SIZE = 20;
	const router = useRouter();
	const nav = useNavigation();
	const isFocused = useIsFocused();
	const listRef = useRef(null);
	const offsetRef = useRef(0); // remember scroll Y offset
	const thumb = (useWindowDimensions().width - 3 * 4) / 2;

	const fetchPage = async (p, replace = false) => {
		if (loading || (!hasMore && !replace)) return;
		setLoad(true);
		try {
			const batch = await fetchUserPhotosApi(userId, p, PAGE_SIZE);
			setPhotos((prev) => (replace ? batch : [...prev, ...batch]));
			setPage(p + 1);
			setMore(batch.length === PAGE_SIZE);
		} finally {
			setLoad(false);
			// snap back after pagination to stop jump-to-top
			if (!replace && p > 1) {
				requestAnimationFrame(() =>
					listRef.current?.scrollToOffset({
						offset: offsetRef.current,
						animated: false,
					})
				);
			}
		}
	};

	/* ---------- focus behaviour ---------- */
	useEffect(() => {
		if (!isFocused) return;
		// always refetch first page; keeps data current but never shows blank
		fetchPage(1, true);
	}, [isFocused, userId]);

	/* ---------- link from viewer footer ---------- */
	const openSource = () => {
		if (!chosen) return;
		if (chosen.sourceType === "trip") {
			setViewerOpen(false); // close the gallery first OVO SMO DODALI OBRISI AKO NE VALJA/////////////////////////////////
			router.push(`(tabs)/trip/${chosen.sourceId}`);
			return; //I OVO //////////////////////////////////////////////////////////////////////
		} else if (chosen.sourceType === "recommendation") {
			setViewerOpen(false); // close the gallery first

			/* navigate to the same profile route but add a query param
       your Profile screen already lives at /user/[userId] and
       renders RecommendationDetailModal when selRec is set.
       The param below lets that screen open the modal directly. */

			// router.push({
			// 	pathname: `/user/${userId}`, // stay on the profile page
			// 	params: { rec: chosen.sourceId }, // <-- picked up in Profile screen
			// });
			nav.navigate("Recs", { openRecId: chosen.sourceId, ts: Date.now() });
		}
		setViewerOpen(false);
	};

	/* ---------- render ---------- */
	if (loading && photos.length === 0) {
		return <ActivityIndicator style={{ marginTop: 32 }} />;
	}

	return (
		<>
			<FlatList
				ref={listRef}
				data={photos}
				keyExtractor={(it) => it.photoId}
				numColumns={2}
				showsVerticalScrollIndicator={false}
				columnWrapperStyle={{ justifyContent: "space-between" }}
				onEndReached={() => fetchPage(page)}
				onEndReachedThreshold={0.4}
				maintainVisibleContentPosition={{ minIndexForVisible: 1 }}
				onScroll={({ nativeEvent }) => (offsetRef.current = nativeEvent.contentOffset.y)}
				scrollEventThrottle={16}
				renderItem={({ item }) => (
					<Pressable
						onPress={() => {
							setChosen(item);
							setViewerOpen(true);
						}}
						style={{ marginVertical: 4 }}
					>
						<Image
							source={{ uri: buildPhotoUrl(item.photoId) }}
							style={{ width: thumb, height: thumb, borderRadius: 10 }}
							resizeMode="cover"
						/>
					</Pressable>
				)}
				ListFooterComponent={loading && photos.length > 0 ? <ActivityIndicator style={{ margin: 12 }} /> : null}
			/>

			<ImageViewing
				images={
					chosen
						? [
								{
									uri: buildPhotoUrl(chosen.photoId),
									title: chosen.context,
								},
						  ]
						: []
				}
				visible={viewerOpen}
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
