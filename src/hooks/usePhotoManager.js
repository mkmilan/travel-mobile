import {
	deleteRecommendationPhoto,
	deleteTripPhoto,
	uploadProfilePhoto,
	uploadRecommendationPhoto,
	uploadTripPhoto,
} from "@/src/services/api";
import useProfileContext from "@/src/hooks/useProfileContext";
import { copyAndResizeAsync } from "@/src/utils/imageHelpers";
import * as ImagePicker from "expo-image-picker";
import { useEffect, useRef, useState } from "react";

export default function usePhotoManager({ context, id: initialIdProp, max = 5, initial = [] }) {
	const photoContext = useProfileContext(`${context}:${initialIdProp || "new"}`);
	const stateContext = useRef(photoContext);
	const [photos, setPhotoState] = useState(initial || []);
	const photosRef = useRef(photos);
	const draftVersion = useRef(0);
	const uploadInFlight = useRef(null);
	const [uploading, setUploading] = useState(false);
	const currentId = useRef(initialIdProp);
	const deleteInFlight = useRef(null);
	const [deleting, setDeleting] = useState(false);
	const [deleteFailure, setDeleteFailure] = useState(null);
	const deleteFailureRef = useRef(null);
	const updateDeleteFailure = (failure) => {
		deleteFailureRef.current = failure;
		setDeleteFailure(failure);
	};

	// Async retries must read the latest confirmed IDs, not a render's old URI list.
	const updatePhotos = (value) => {
		const next = typeof value === "function" ? value(photosRef.current) : value;
		photosRef.current = next;
		setPhotoState(next);
		return next;
	};
	const setPhotos = (value) => {
		draftVersion.current += 1;
		deleteInFlight.current = null;
		setDeleting(false);
		updateDeleteFailure(null);
		updatePhotos(value);
	};

	// Reset when props change
	useEffect(() => {
		const previous = stateContext.current;
		const sameSession = previous.valid && previous.token === photoContext.token && previous.userId === photoContext.userId;
		setPhotos(sameSession ? initial || [] : []);
		stateContext.current = photoContext;
		currentId.current = initialIdProp;
	}, [initialIdProp, JSON.stringify(initial), photoContext]);

	const addPhotos = async () => {
		if (stateContext.current !== photoContext || !photoContext.isCurrent() || uploadInFlight.current || deleteInFlight.current) return;
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
		if (res.canceled || !res.assets || version !== draftVersion.current || !photoContext.isCurrent() || uploadInFlight.current || deleteInFlight.current) return;

		const pickedAssets = res.assets.slice(0, remaining);
		const newLocalUris = await Promise.all(pickedAssets.map((a) => copyAndResizeAsync(a.uri)));
		if (version !== draftVersion.current || !photoContext.isCurrent() || uploadInFlight.current || deleteInFlight.current) return;

		// Add to photos array immediately for preview
		updatePhotos((prev) => [...prev, ...newLocalUris].slice(0, max));
	};

	const removePhoto = (photoIdToRemove) => {
		if (stateContext.current !== photoContext || !photoContext.isCurrent() || uploadInFlight.current) return Promise.resolve(false);
		if (deleteInFlight.current) return deleteInFlight.current.photoId === photoIdToRemove
			? deleteInFlight.current.promise : Promise.resolve(false);
		if (!photosRef.current.includes(photoIdToRemove)) return Promise.resolve(true);
		if (photoIdToRemove.startsWith("file://")) {
			updatePhotos((prev) => prev.filter((p) => p !== photoIdToRemove));
			return Promise.resolve(true);
		}

		const version = draftVersion.current;
		const targetId = currentId.current;
		const isCurrent = () => photoContext.isCurrent() && version === draftVersion.current;
		const operation = { photoId: photoIdToRemove, promise: null };
		deleteInFlight.current = operation;
		setDeleting(true);
		updateDeleteFailure(null);
		// Install the lock before invoking even a synchronous failing API mock.
		operation.promise = Promise.resolve().then(async () => {
			try {
				if (!isCurrent()) return false;
				if (!targetId || targetId === "new") throw new Error("Reopen the saved item before removing this photo.");
				if (context === "trip") await deleteTripPhoto(targetId, photoIdToRemove);
				else if (context === "recommendation") await deleteRecommendationPhoto(targetId, photoIdToRemove);
				else throw new Error("Photo removal is not available here.");
				if (!isCurrent()) return false;
				updatePhotos((prev) => prev.filter((p) => p !== photoIdToRemove));
				return true;
			} catch (error) {
				if (isCurrent()) updateDeleteFailure({ photoId: photoIdToRemove,
					message: `Photo removal was not confirmed. ${error?.message || "Please try again."}` });
				// The thumbnail stays visible and callers have explicit failure UI;
				// native Alert callbacks must never leak an unhandled rejection.
				return false;
			} finally {
				if (deleteInFlight.current === operation) {
					deleteInFlight.current = null;
					if (isCurrent()) setDeleting(false);
				}
			}
		});
		return operation.promise;
	};

	// Confirmed successes become server IDs before a partial failure is reported.
	// Retrying the same form therefore uploads only the remaining local files.
	const uploadPendingPhotos = (serverId) => {
		if (stateContext.current !== photoContext || !photoContext.isCurrent()) return Promise.reject(new Error("Photo session changed. Reopen the item."));
		if (deleteInFlight.current) return Promise.reject(new Error("Wait for the photo removal to finish before saving."));
		if (uploadInFlight.current) {
			if (uploadInFlight.current.serverId === serverId) return uploadInFlight.current.promise;
			return Promise.reject(new Error("Another photo upload is still in progress."));
		}
		const localFiles = [...new Set(photosRef.current.filter((p) => p.startsWith("file://")))];
		if (localFiles.length === 0) return Promise.resolve({ photoIds: photosRef.current, uploadedCount: 0 });
		if (!serverId || serverId === "new") return Promise.reject(new Error("Save the item before uploading its photos."));
		const version = draftVersion.current;
		setUploading(true);
		currentId.current = serverId;

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
				if (version !== draftVersion.current || !photoContext.isCurrent()) throw new Error("The photo selection changed during upload. Reopen the item to check its saved photos.");
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

	const ownsState = stateContext.current === photoContext;
	return {
		photos: ownsState ? photos : [],
		getPhotos: () => stateContext.current === photoContext && photoContext.isCurrent() ? photosRef.current : [],
		uploading,
		deleting: ownsState && deleting,
		isDeleting: () => Boolean(deleteInFlight.current),
		deleteError: ownsState ? deleteFailure?.message || null : null,
		retryRemovePhoto: () => deleteFailureRef.current ? removePhoto(deleteFailureRef.current.photoId) : Promise.resolve(false),
		addPhotos,
		removePhoto,
		prepareRemovePhoto: (photoId) => {
			const version = draftVersion.current;
			return () => version === draftVersion.current ? removePhoto(photoId) : Promise.resolve(false);
		},
		setPhotos,
		uploadPendingPhotos,
	};
}
