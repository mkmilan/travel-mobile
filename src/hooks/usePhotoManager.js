import {
	deleteRecommendationPhoto,
	deleteTripPhoto,
	uploadProfilePhoto,
	uploadRecommendationPhoto,
	uploadTripPhoto,
} from "@/src/services/api";
import { copyAndResizeAsync } from "@/src/utils/imageHelpers";
import * as ImagePicker from "expo-image-picker";
import { useEffect, useRef, useState } from "react";

export default function usePhotoManager({ context, id: initialIdProp, max = 5, initial = [] }) {
	const [photos, setPhotoState] = useState(initial || []);
	const photosRef = useRef(photos);
	const draftVersion = useRef(0);
	const uploadInFlight = useRef(null);
	const [uploading, setUploading] = useState(false);
	const [currentId, setCurrentId] = useState(initialIdProp);

	// Async retries must read the latest confirmed IDs, not a render's old URI list.
	const updatePhotos = (value) => {
		const next = typeof value === "function" ? value(photosRef.current) : value;
		photosRef.current = next;
		setPhotoState(next);
		return next;
	};
	const setPhotos = (value) => {
		draftVersion.current += 1;
		updatePhotos(value);
	};

	// Reset when props change
	useEffect(() => {
		setPhotos(initial || []);
		setCurrentId(initialIdProp);
	}, [initialIdProp, JSON.stringify(initial)]);

	const addPhotos = async () => {
		if (uploadInFlight.current) return;
		const version = draftVersion.current;
		const remaining = max - photosRef.current.length;
		if (remaining <= 0) return;

		const res = await ImagePicker.launchImageLibraryAsync({
			mediaTypes: ["images"],
			allowsMultipleSelection: true,
			selectionLimit: remaining,
			quality: 0.9,
			allowsEditing: false,
		});
		if (res.canceled || !res.assets || version !== draftVersion.current || uploadInFlight.current) return;

		const pickedAssets = res.assets.slice(0, remaining);
		const newLocalUris = await Promise.all(pickedAssets.map((a) => copyAndResizeAsync(a.uri)));
		if (version !== draftVersion.current || uploadInFlight.current) return;

		// Add to photos array immediately for preview
		updatePhotos((prev) => [...prev, ...newLocalUris].slice(0, max));
	};

	const removePhoto = async (photoIdToRemove) => {
		if (uploadInFlight.current) return;
		if (photoIdToRemove.startsWith("file://")) {
			updatePhotos((prev) => prev.filter((p) => p !== photoIdToRemove));
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
		updatePhotos((prev) => prev.filter((p) => p !== photoIdToRemove));
	};

	// Confirmed successes become server IDs before a partial failure is reported.
	// Retrying the same form therefore uploads only the remaining local files.
	const uploadPendingPhotos = (serverId) => {
		if (uploadInFlight.current) {
			if (uploadInFlight.current.serverId === serverId) return uploadInFlight.current.promise;
			return Promise.reject(new Error("Another photo upload is still in progress."));
		}
		const localFiles = [...new Set(photosRef.current.filter((p) => p.startsWith("file://")))];
		if (localFiles.length === 0) return Promise.resolve({ photoIds: photosRef.current, uploadedCount: 0 });
		if (!serverId || serverId === "new") return Promise.reject(new Error("Save the item before uploading its photos."));
		const version = draftVersion.current;
		setUploading(true);
		setCurrentId(serverId);

		const promise = (async () => {
			try {
				const results = await Promise.all(localFiles.map(async (localUri) => {
					try {
						let result;
						if (context === "recommendation") {
							result = await uploadRecommendationPhoto(serverId, localUri);
						} else if (context === "trip") {
							result = await uploadTripPhoto(serverId, localUri);
						} else if (context === "profile") {
							const updated = await uploadProfilePhoto(localUri);
							result = { photoIds: [updated.user?.profilePictureUrl || updated.profilePictureUrl] };
						}
						const photoId = result?.photoIds?.[0];
						return typeof photoId === "string" && photoId ? { localUri, photoId } : null;
					} catch {
						return null;
					}
				}));
				if (version !== draftVersion.current) throw new Error("The photo selection changed during upload. Reopen the item to check its saved photos.");
				const successful = new Map(results.filter(Boolean).map(({ localUri, photoId }) => [localUri, photoId]));
				const photoIds = updatePhotos((previous) => previous.map((photo) => successful.get(photo) || photo));
				const failedCount = results.filter((result) => !result).length;
				if (failedCount) {
					throw new Error(`${failedCount} photo${failedCount === 1 ? "" : "s"} could not be uploaded. Any completed uploads are saved. Keep this form open and retry to upload only the remaining photos.`);
				}
				return { photoIds, uploadedCount: successful.size };
			} finally {
				uploadInFlight.current = null;
				setUploading(false);
			}
		})();
		uploadInFlight.current = { serverId, promise };
		return promise;
	};

	return {
		photos,
		getPhotos: () => photosRef.current,
		uploading,
		addPhotos,
		removePhoto,
		setPhotos,
		uploadPendingPhotos,
	};
}
