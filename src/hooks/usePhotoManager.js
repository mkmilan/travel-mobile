import {
	deleteRecommendationPhoto,
	deleteTripPhoto,
	uploadProfilePhoto,
	uploadRecommendationPhoto,
	uploadTripPhoto,
} from "@/src/services/api";
import { copyAndResizeAsync } from "@/src/utils/imageHelpers";
import * as ImagePicker from "expo-image-picker";
import { useEffect, useState } from "react";

export default function usePhotoManager({ context, id: initialIdProp, max = 5, initial = [] }) {
	const [photos, setPhotos] = useState(initial || []);
	const [uploading, setUploading] = useState(false);
	const [currentId, setCurrentId] = useState(initialIdProp);

	// Reset when props change
	useEffect(() => {
		setPhotos(initial || []);
		setCurrentId(initialIdProp);
	}, [initialIdProp, JSON.stringify(initial)]);

	const addPhotos = async () => {
		const remaining = max - photos.length;
		if (remaining <= 0) return;

		const res = await ImagePicker.launchImageLibraryAsync({
			mediaTypes: ImagePicker.MediaTypeOptions.Images,
			allowsMultipleSelection: true,
			selectionLimit: remaining,
			quality: 0.9,
			allowsEditing: false,
		});
		if (res.canceled || !res.assets) return;

		const pickedAssets = res.assets.slice(0, remaining);
		const newLocalUris = await Promise.all(pickedAssets.map((a) => copyAndResizeAsync(a.uri)));

		// Add to photos array immediately for preview
		setPhotos((prev) => [...prev, ...newLocalUris].slice(0, max));
	};

	const removePhoto = async (photoIdToRemove) => {
		if (photoIdToRemove.startsWith("file://")) {
			setPhotos((prev) => prev.filter((p) => p !== photoIdToRemove));
			return;
		}

		try {
			if (context === "trip" && currentId && currentId !== "new") {
				await deleteTripPhoto(currentId, photoIdToRemove);
			} else if (context === "recommendation" && currentId && currentId !== "new") {
				await deleteRecommendationPhoto(currentId, photoIdToRemove);
			}
		} catch (e) {
			console.warn(`Failed to delete photo ${photoIdToRemove} from server:`, e.message);
		}
		setPhotos((prev) => prev.filter((p) => p !== photoIdToRemove));
	};

	// Upload all pending local files at once
	const uploadPendingPhotos = async (serverId) => {
		const localFiles = photos.filter((p) => p.startsWith("file://"));
		if (!serverId || serverId === "new" || localFiles.length === 0) return;

		console.log(`📤 Uploading ${localFiles.length} photos for ${context} ${serverId}`);
		setUploading(true);

		try {
			// Upload all files
			const uploadPromises = localFiles.map(async (localUri) => {
				try {
					let result;
					if (context === "recommendation") {
						result = await uploadRecommendationPhoto(serverId, localUri);
					} else if (context === "trip") {
						result = await uploadTripPhoto(serverId, localUri);
					} else if (context === "profile") {
						const upd = await uploadProfilePhoto(localUri);
						result = { photoIds: [upd.user?.profilePictureUrl || upd.profilePictureUrl] };
					}

					if (result?.photoIds?.[0]) {
						return { localUri, serverId: result.photoIds[0] };
					}
					return null;
				} catch (e) {
					console.warn(`Upload failed for ${localUri}:`, e.message);
					return null;
				}
			});

			const results = await Promise.all(uploadPromises);

			// Replace local URIs with server IDs all at once
			setPhotos((prev) => {
				let updated = [...prev];
				results.forEach((result) => {
					if (result) {
						const index = updated.indexOf(result.localUri);
						if (index !== -1) {
							updated[index] = result.serverId;
						}
					}
				});
				return updated;
			});
		} finally {
			setUploading(false);
		}
	};

	return {
		photos,
		uploading,
		addPhotos,
		removePhoto,
		setPhotos,
		uploadPendingPhotos,
	};
}
