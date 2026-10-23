// tiny, isolated component ─ reuse it anywhere
import { usePhotoSource } from "@/src/hooks/usePhotoSource";
import { useEffect, useState } from "react";
import { Alert, Dimensions, FlatList, Image, Pressable, StyleSheet } from "react-native";
import ImageViewing from "react-native-image-viewing";

const { width } = Dimensions.get("window");
const GAP = 6;
const ITEM = (width - GAP * 4) / 3; // 3-col grid

export default function PhotoGallery({ photoIds = [], canDelete = false, deleteDisabled = false, onDelete = () => {} }) {
	const [openId, setOpenId] = useState(null);
	const { getPhotoSource, mediaKey } = usePhotoSource();
	useEffect(() => setOpenId(null), [mediaKey]);

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
				images={photoIds.map(getPhotoSource).filter(Boolean)}
				imageIndex={openId ? photoIds.indexOf(openId) : 0}
				visible={!!openId}
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
