// tiny, isolated component ─ reuse it anywhere
import { usePhotoSource } from "@/src/hooks/usePhotoSource";
import { useEffect, useState } from "react";
import { Alert, Dimensions, FlatList, Image, Pressable, StyleSheet } from "react-native";
import ImageViewing from "@/src/components/SafeImageViewing";

const { width } = Dimensions.get("window");
const GAP = 6;
const ITEM = (width - GAP * 4) / 3; // 3-col grid

export default function PhotoGallery({ photoIds = [], canDelete = false, deleteDisabled = false, onDelete = () => {} }) {
	const [openId, setOpenId] = useState(null);
	const { getPhotoSource, mediaKey } = usePhotoSource();
	useEffect(() => setOpenId(null), [mediaKey]);
	const viewerPhotos = photoIds.map((id) => ({ id, source: getPhotoSource(id) })).filter((photo) => Boolean(photo.source));
	const selectedIndex = openId ? viewerPhotos.findIndex((photo) => photo.id === openId) : -1;
	// DELETE or refresh can remove an image while its preview is open. Hide it
	// immediately, before effects run, and forget it so a later refresh cannot
	// unexpectedly reopen the viewer. Keep a still-present selection by ID.
	useEffect(() => {
		if (openId && selectedIndex < 0) setOpenId(null);
	}, [openId, selectedIndex]);

	/* render single thumb */
	const renderItem = ({ item }) => (
		<Pressable
			onPress={() => setOpenId(item)}
			onLongPress={
				canDelete && !deleteDisabled
					? () =>
							Alert.alert("Delete photo?", "", [
								{ text: "Cancel", style: "cancel" },
								{
									text: "Delete",
									style: "destructive",
									onPress: () => onDelete(item),
								},
							])
					: undefined
			}
			style={styles.thumbWrap}
		>
			<Image key={`${mediaKey}-${item}`} source={getPhotoSource(item)} style={styles.thumb} resizeMode="cover" />
			{/* {canDelete && <Feather name="x-circle" size={18} color={theme.colors.error} style={styles.deleteBadge} />} */}
		</Pressable>
	);

	return (
		<>
			<FlatList
				key={mediaKey}
				data={photoIds}
				keyExtractor={(id) => id}
				renderItem={renderItem}
				numColumns={3}
				scrollEnabled={false}
				columnWrapperStyle={{ gap: GAP }}
				contentContainerStyle={{ gap: GAP }}
			/>
			{/* full-screen preview with ImageViewing */}
			<ImageViewing
				key={mediaKey}
				images={viewerPhotos.map((photo) => photo.source)}
				imageIndex={selectedIndex >= 0 ? selectedIndex : 0}
				visible={selectedIndex >= 0}
				onRequestClose={() => setOpenId(null)}
				swipeToCloseEnabled={true}
				doubleTapToZoomEnabled={false}
			/>
			{/* full-screen preview */}
			{/* <Modal visible={!!openId} transparent onRequestClose={() => setOpenId(null)}>
				<Pressable style={styles.modalBg} onPress={() => setOpenId(null)}>
					{openId && <Image source={getPhotoSource(openId)} style={styles.fullImage} resizeMode="contain" />}
				</Pressable>
			</Modal> */}
		</>
	);
}

const styles = StyleSheet.create({
	thumbWrap: { width: ITEM, height: ITEM },
	thumb: {
		width: "100%",
		height: "100%",
		borderRadius: 4, // ← small radius, **no** huge rounding
	},
	deleteBadge: {
		position: "absolute",
		top: 4,
		right: 4,
		backgroundColor: "#fff",
		borderRadius: 9,
	},
	modalBg: {
		flex: 1,
		backgroundColor: "rgba(0,0,0,0.9)",
		justifyContent: "center",
		alignItems: "center",
	},
	fullImage: {
		width: "90%",
		height: "90%",
	},
});
