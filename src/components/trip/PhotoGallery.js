// tiny, isolated component ─ reuse it anywhere
import { usePhotoSource } from "@/src/hooks/usePhotoSource";
import { useEffect, useMemo, useState } from "react";
import { Alert, Dimensions, FlatList, Image, Pressable, StyleSheet } from "react-native";
import ImageViewing from "@/src/components/SafeImageViewing";

const { width } = Dimensions.get("window");
const GAP = 6;
const ITEM = (width - GAP * 4) / 3; // 3-col grid

export default function PhotoGallery({ photoIds = [], canDelete = false, deleteDisabled = false, onDelete = () => {} }) {
	const [selection, setSelection] = useState(null);
	const openId = selection?.id;
	const { getPhotoSource, mediaKey } = usePhotoSource();
	useEffect(() => setSelection(null), [mediaKey]);
	const viewerPhotos = photoIds.map((id) => ({ id, source: getPhotoSource(id) })).filter((photo) => Boolean(photo.source));
	const selectedIndex = openId ? viewerPhotos.findIndex((photo) => photo.id === openId) : -1;
	// DELETE or refresh can remove an image while its preview is open. Hide it
	// immediately, before effects run, and forget it so a later refresh cannot
	// unexpectedly reopen the viewer. Keep a still-present selection by ID.
	useEffect(() => {
		if (openId && selectedIndex < 0) setSelection(null);
	}, [openId, selectedIndex]);

	// The adapter treats imageIndex as an initial index and keys its native viewer
	// by it. Track swipes by ID, but do not change that initial index mid-gesture.
	// A changed image list starts a new viewer at the still-selected photo.
	const photoKey = JSON.stringify(viewerPhotos.map((photo) => photo.id));
	const initialId = selection?.initialId;
	const initialIndex = useMemo(() => Math.max(0, selectedIndex), [photoKey, initialId]);

	/* render single thumb */
	const renderItem = ({ item }) => (
		<Pressable
			onPress={() => setSelection({ id: item, initialId: item })}
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
				key={JSON.stringify([mediaKey, photoKey, initialId, selectedIndex >= 0])}
				images={viewerPhotos.map((photo) => photo.source)}
				imageIndex={initialIndex}
				onImageIndexChange={(index) => {
					if (selectedIndex >= 0 && viewerPhotos[index]) {
						setSelection((current) => !current || current.id === viewerPhotos[index].id
							? current
							: { ...current, id: viewerPhotos[index].id });
					}
				}}
				visible={selectedIndex >= 0}
				onRequestClose={() => setSelection(null)}
				swipeToCloseEnabled={true}
				doubleTapToZoomEnabled={false}
			/>
			{/* full-screen preview */}
			{/* <Modal visible={!!openId} transparent onRequestClose={() => setSelection(null)}>
				<Pressable style={styles.modalBg} onPress={() => setSelection(null)}>
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
