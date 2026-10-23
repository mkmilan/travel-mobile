import { TASK_NAME } from "@/src/background/TripLocationTask";
import CircleButton from "@/src/components/CircleButton";
import AddPoiModal from "@/src/components/modals/AddPoiModal";
import AddRecommendationModal from "@/src/components/modals/AddRecommendationModal";
import TripSaveModal from "@/src/components/modals/TripSaveModal";
import { runMigrations } from "@/src/db/migrations";

import {
	addPoi,
	addRecommendation,
	buildTripJsonForUpload,
	deleteTrip,
	finishTrip,
	getPendingTrips,
	getLocalTrip,
	getPoiForEdit,
	updatePoiNote,
	tripMetadataDefaults,
	markTripUploaded,
	releaseRejectedTripUpload,
	ownsLocalTrip,
	startSegment,
	startTrip,
	stopTrip,
	setTripRecordingStatus,
} from "@/src/db/tripDao";
import { uploadTripJson } from "@/src/services/api";
import { getTripLocationNames } from "@/src/services/locationNames";
import { useAuthStore } from "@/src/stores/auth";
import { theme } from "@/src/theme";
import { clearActiveTrip, getActiveTrip, setActiveTrip } from "@/src/utils/activeTrip";
import { toast } from "@/src/utils/toast";
import { stopAbandonedRecording, readRecordingTaskState } from "@/src/utils/recordingAttempt";
import { ensureRecordingPermissions } from "@/src/utils/recordingPermissions";
import { Ionicons } from "@expo/vector-icons";
import * as Location from "expo-location";
import { useEffect, useRef, useState } from "react";
import { ActivityIndicator, Alert, FlatList, StyleSheet, Text, TouchableOpacity, View } from "react-native";

//5000, 10 = 5sec 10 meters
const TIME_INTERVAL = 5000;
const DISTANCE_INTERVAL = 10;

export default function RecordScreen() {
	// ─────── state ────────────────────────────────────────────────────────────
	const [status, setStatus] = useState("idle"); // idle | recording | paused | stopped | cleanup_required
	const [tripId, setTripId] = useState(null);
	const [segmentId, setSegment] = useState(null);
	const [pending, setPending] = useState([]); // local trips not yet uploaded
	const [isResolvingLocation, setIsResolvingLocation] = useState(false);
	const [isUploading, setIsUploading] = useState(false);
	const [uploadingTripId, setUploadingTripId] = useState(null); //just for showing upload proggress

	const [isRestoring, setIsRestoring] = useState(true);

	const locationWatcher = useRef(null);
	const permissionPending = useRef(false);
	const firstPoint = useRef(null);
	const lastPoint = useRef(null);
	const sheetRef = useRef(null);
	const poiModalRef = useRef(null);
	const pendingPoi = useRef(null);
	const addRecommendationModalRef = useRef(null);

	const pendingNames = useRef({ startName: "Unknown", endName: "Unknown" });
	const tripEndTime = useRef(null);
	const stopRequest = useRef(null);
	const metadataDraft = useRef(null);
	const uploadRequest = useRef(false);
	const lifecycleRequest = useRef(false);
	const watcherRequest = useRef(0);
	const poiRepairModalRef = useRef(null);
	const pendingPoiRepair = useRef(null);
	const recoveryRequest = useRef(null);
	const [recoveryError, setRecoveryError] = useState(null);
	const recordingLifetime = useRef(null);

	const user = useAuthStore((s) => s.user);
	const token = useAuthStore((s) => s.token);
	const sessionEpoch = useAuthStore((s) => s.sessionEpoch);
	const isSessionChanging = useAuthStore((s) => s.isSessionChanging);

	// ─────── migrations + first load ─────────────────────────────────────────
	useEffect(() => {
		let cancelled = false;
		let busy = false;
		const lifetime = {};
		recordingLifetime.current = lifetime;
		const isCurrent = () => !cancelled && useAuthStore.getState().user?._id === user?._id
			&& useAuthStore.getState().token === token && useAuthStore.getState().sessionEpoch === sessionEpoch
			&& !useAuthStore.getState().isSessionChanging;
		stopRequest.current = null;
		metadataDraft.current = null;
		pendingPoiRepair.current = null;
		pendingPoi.current = null;
		firstPoint.current = null;
		lastPoint.current = null;
		tripEndTime.current = null;
		pendingNames.current = { startName: "Unknown", endName: "Unknown" };
		setIsResolvingLocation(false);
		setPending([]);
		setStatus("idle");
		setTripId(null);
		setSegment(null);
		setRecoveryError(null);
		setIsRestoring(true);
		const recover = async () => {
			if (busy || !isCurrent()) return;
			busy = true;
			setIsRestoring(true);
			try {
				await runMigrations();
				if (!isCurrent()) return;
				await refreshPending();
				if (!isCurrent()) return;
				const active = await getActiveTrip();
				const running = await readRecordingTaskState(Location, TASK_NAME);
				if (!isCurrent()) return;
				const { tripId: tid, segmentId: seg, userId: ownerId } = active;
				if (tid && ownerId !== user?._id) throw new Error("A different account owns the recording marker. Sign in to that account to stop it safely.");
				let trip;
				if (tid && seg && ownerId) {
					try { trip = await getLocalTrip(tid, ownerId); }
					catch (error) {
						// Build 4 could delete an active row. Only absence, not an
						// arbitrary SQLite failure, permits missing-row cleanup.
						if (await ownsLocalTrip(tid, ownerId)) throw error;
					}
				}
				if (!isCurrent()) return;
				if (active.cleanupId || (!trip && (running || tid)) || (trip && !["recording", "paused"].includes(trip.status))) {
					setStatus("cleanup_required");
					const outcome = await stopAbandonedRecording({ ...active, location: Location,
						taskName: TASK_NAME, getActiveTrip, isCurrent });
					if (!isCurrent()) return;
					if (outcome !== "stopped") throw new Error("The recording changed during recovery. Try Stop again to check its current state.");
					setStatus("idle");
					setRecoveryError(null);
					toast({ type: "info", title: "Stale recording stopped", msg: "Your saved trip data has been kept." });
					return;
				}
				if (!trip) {
					setStatus("idle");
					setRecoveryError(null);
					return;
				}
				// A newer marker must never be downgraded by an old restore.
				const latest = await getActiveTrip();
				if (!isCurrent()) return;
				if (latest.tripId !== tid || latest.segmentId !== seg || latest.userId !== ownerId || latest.cleanupId) throw new Error("The recording changed during recovery. Try Stop again.");
				setTripId(tid);
				setSegment(seg);
				if (running) {
					setStatus("recording");
					await startLocationWatcher();
					if (!isCurrent()) await stopLocationWatcher();
				} else {
					// A killed/failed native collector is recoverable, never auto-uploaded.
					if (await clearActiveTrip(active) === false) throw new Error("The recording changed during recovery. Try Stop again.");
					if (!isCurrent()) return;
					await setTripRecordingStatus(tid, "paused", ownerId);
					if (isCurrent()) setStatus("paused");
				}
				if (isCurrent()) setRecoveryError(null);
			} catch (error) {
				if (isCurrent()) {
					setStatus("cleanup_required");
					setRecoveryError(error.message);
					toast({ type: "warning", title: "Recording recovery needs attention", msg: error.message });
				}
			} finally {
				busy = false;
				if (isCurrent()) setIsRestoring(false);
			}
		};
		recoveryRequest.current = recover;
		recover();
		return () => {
			cancelled = true;
			if (recordingLifetime.current === lifetime) recordingLifetime.current = null;
			if (recoveryRequest.current === recover) recoveryRequest.current = null;
			stopRequest.current = null;
			watcherRequest.current++;
			locationWatcher.current?.remove();
			locationWatcher.current = null;
		};
	}, [user?._id, token, sessionEpoch, isSessionChanging]);

	const refreshPending = async () => {
		const uid = user?._id;
		const rows = await getPendingTrips(uid);
		if (useAuthStore.getState().user?._id === uid) setPending(rows);
	};

	// ─────── location helpers ────────────────────────────────────────────────
	const stopLocationWatcher = async () => {
		watcherRequest.current++;
		if (locationWatcher.current) {
			await locationWatcher.current.remove();
			locationWatcher.current = null;
		}
	};

	const startLocationWatcher = async () => {
		const request = ++watcherRequest.current;
		const session = { ...useAuthStore.getState() };
		const isCurrent = () => request === watcherRequest.current
			&& useAuthStore.getState().user?._id === session.user?._id
			&& useAuthStore.getState().token === session.token
			&& useAuthStore.getState().sessionEpoch === session.sessionEpoch && !useAuthStore.getState().isSessionChanging;
		const watcher = await Location.watchPositionAsync(
			{
				accuracy: Location.Accuracy.High,
				timeInterval: TIME_INTERVAL,
				distanceInterval: DISTANCE_INTERVAL,
			},
			(loc) => {
				if (!isCurrent()) return;
				const { latitude, longitude } = loc.coords;
				const timestamp = new Date().toISOString();

				if (!firstPoint.current) {
					firstPoint.current = { lat: latitude, lon: longitude };
				}
				lastPoint.current = { lat: latitude, lon: longitude };

				// DEV LOG – keep verbose in dev builds
				console.log(`[Rec] ${latitude.toFixed(5)},${longitude.toFixed(5)} `);
			}
		);
		if (isCurrent()) locationWatcher.current = watcher;
		else watcher.remove();
	};

	// ─────── actions ─────────────────────────────────────────────────────────
	const requestRecordingAccess = async (isCurrentSession) => {
		// Retain the caller's pre-await login and mounted-operation identity.
		// Reading credentials here again would let a delayed prompt adopt a login.
		if (permissionPending.current || !isCurrentSession()) return false;
		permissionPending.current = true;
		try {
			return await ensureRecordingPermissions({
				location: Location,
				isCurrentSession,
				confirmBackground: () => new Promise((resolve) => Alert.alert(
					"Allow background trip recording?",
					"To keep recording while your screen is locked or you use another app, allow background location in the next permission screen. On Android this may open Settings. You can cancel without starting a track.",
					[
						{ text: "Cancel", style: "cancel", onPress: () => resolve(false) },
						{ text: "Continue", onPress: () => resolve(true) },
					],
					{ cancelable: true, onDismiss: () => resolve(false) }
				)),
				onBlocked: (kind, settingsRequired) => toast({
					type: "warning",
					title: kind === "background" ? "Background location required" : "Location permission required",
					msg: settingsRequired
						? "Enable location access in your device Settings, then try again. Recording has not started."
						: "Permission was not granted. Recording has not started.",
				}),
			});
		} catch (error) {
			if (isCurrentSession()) toast({ type: "danger", title: "Could not check location permissions", msg: error.message });
			return false;
		} finally {
			permissionPending.current = false;
		}
	};

	const handleStart = async () => {
		if (isRestoring || lifecycleRequest.current || uploadRequest.current || status !== "idle") return;
		// Capture before the first permission/native await, including same-token
		// relogins and unmounts that do not change the authenticated account.
		const session = { ...useAuthStore.getState() };
		const uid = session.user?._id;
		const lifetime = recordingLifetime.current;
		const isCurrent = () => !!lifetime && recordingLifetime.current === lifetime
			&& useAuthStore.getState().user?._id === uid && useAuthStore.getState().token === session.token
			&& useAuthStore.getState().sessionEpoch === session.sessionEpoch && !useAuthStore.getState().isSessionChanging;
		if (!uid || uid !== user?._id || !session.token || session.token !== token || session.sessionEpoch !== sessionEpoch || !isCurrent()) return;
		lifecycleRequest.current = true;
		let attempt;
		try {
			// No trip or marker is created before both permissions are granted.
			if (!(await requestRecordingAccess(isCurrent)) || !isCurrent()) return;
			const existing = await getActiveTrip();
			if (!isCurrent()) return;
			if (existing.cleanupId || existing.tripId) {
				setStatus("cleanup_required");
				setRecoveryError("The previous collector still needs checking. Try Stop before starting another trip.");
				return;
			}
			const tid = await startTrip(uid, session.user.settings || {});
			if (!isCurrent()) return; // Retain this owner's unsynced row for recovery.
			const seg = startSegment();
			attempt = { tripId: tid, segmentId: seg, userId: uid };
			metadataDraft.current = null;
			tripEndTime.current = null;
			await setActiveTrip(tid, seg, uid);
			if (!isCurrent()) return;
			await startLocationWatcher();
			if (!isCurrent()) return;
			await Location.startLocationUpdatesAsync(TASK_NAME, {
				accuracy: Location.Accuracy.High, timeInterval: TIME_INTERVAL, distanceInterval: DISTANCE_INTERVAL,
				showsBackgroundLocationIndicator: true,
				foregroundService: { notificationTitle: "Recording trip", notificationBody: "Tracking continues when the app is closed." },
			});
			if (!isCurrent()) return;
			setTripId(tid);
			setSegment(seg);
			setStatus("recording");
			toast({ type: "success", title: "Recording started" });
		} catch (error) {
			if (attempt) {
				if (isCurrent()) await stopLocationWatcher();
				try {
					const outcome = await stopAbandonedRecording({ ...attempt, location: Location, taskName: TASK_NAME, getActiveTrip });
					if (outcome !== "stopped") throw new Error("The previous collector still needs checking. Try Stop again.");
				} catch (cleanupError) {
					if (isCurrent()) {
						setStatus("cleanup_required");
						setRecoveryError(cleanupError.message);
						toast({ type: "warning", title: "Recording recovery needs attention", msg: cleanupError.message });
					}
					return;
				}
				if (isCurrent()) {
					await setTripRecordingStatus(attempt.tripId, "paused", attempt.userId);
					await refreshPending();
				}
			}
			if (isCurrent()) toast({ type: "danger", title: "Could not start recording", msg: error.message });
		} finally {
			try {
				if (attempt && !isCurrent()) await stopAbandonedRecording({ ...attempt, location: Location, taskName: TASK_NAME, getActiveTrip });
			} catch {
				// Persisted cleanup evidence is retried by the next live screen.
			} finally {
				lifecycleRequest.current = false;
			}
		}
	};

	const handlePauseResume = async () => {
		if (lifecycleRequest.current || stopRequest.current || isRestoring || status === "cleanup_required") return;
		const session = { ...useAuthStore.getState() };
		const lifetime = recordingLifetime.current;
		const isCurrent = () => !!lifetime && recordingLifetime.current === lifetime
			&& useAuthStore.getState().user?._id === session.user?._id
			&& useAuthStore.getState().token === session.token
			&& useAuthStore.getState().sessionEpoch === session.sessionEpoch && !useAuthStore.getState().isSessionChanging;
		if (!tripId || !session.token || session.user?._id !== user?._id || session.token !== token || session.sessionEpoch !== sessionEpoch || !isCurrent()) return;
		lifecycleRequest.current = true;
		let attempt;
		try {
			if (status === "recording") {
				await stopLocationWatcher();
				if (await Location.hasStartedLocationUpdatesAsync(TASK_NAME)) await Location.stopLocationUpdatesAsync(TASK_NAME);
				if (!isCurrent()) return;
				await clearActiveTrip();
				await setTripRecordingStatus(tripId, "paused", session.user._id);
				if (!isCurrent()) return;
				setStatus("paused");
				toast({ type: "info", title: "Paused" });
			} else if (status === "paused") {
				if (!(await requestRecordingAccess(isCurrent)) || !isCurrent()) return;
				await setTripRecordingStatus(tripId, "recording", session.user._id);
				if (!isCurrent()) return;
				const seg = startSegment();
				attempt = { tripId, segmentId: seg, userId: session.user._id };
				await setActiveTrip(tripId, seg, session.user._id);
				if (!isCurrent()) return;
				try {
					await Location.startLocationUpdatesAsync(TASK_NAME, {
						accuracy: Location.Accuracy.High, timeInterval: TIME_INTERVAL, distanceInterval: DISTANCE_INTERVAL,
						showsBackgroundLocationIndicator: true,
						foregroundService: { notificationTitle: "Recording trip", notificationBody: "Tracking continues when the app is closed." },
					});
					if (!isCurrent()) return;
					await startLocationWatcher();
					if (!isCurrent()) return;
					setSegment(seg);
					setStatus("recording");
					toast({ type: "success", title: "Resumed" });
				} catch (error) {
					if (isCurrent()) {
						await stopLocationWatcher();
						try {
							const outcome = await stopAbandonedRecording({ ...attempt, location: Location, taskName: TASK_NAME, getActiveTrip });
							if (outcome !== "stopped") throw new Error("The previous collector still needs checking. Try Stop again.");
						} catch (cleanupError) {
							if (isCurrent()) { setStatus("cleanup_required"); setRecoveryError(cleanupError.message); }
							throw cleanupError;
						}
						await setTripRecordingStatus(tripId, "paused", session.user._id);
					}
					throw error;
				}
			}
			if (isCurrent()) await refreshPending();
		} catch (error) {
			if (isCurrent()) toast({ type: "danger", title: "Could not change recording state", msg: error.message });
		} finally {
			try {
				if (attempt && !isCurrent()) await stopAbandonedRecording({ ...attempt, location: Location, taskName: TASK_NAME, getActiveTrip });
			} catch {
				// Cleanup-only marker remains available to the next live session.
			} finally {
				lifecycleRequest.current = false;
			}
		}
	};

	const handleRecover = async (tid) => {
		if (isRestoring || lifecycleRequest.current || uploadRequest.current || ["recording", "paused", "cleanup_required"].includes(status)) return;
		const session = { ...useAuthStore.getState() };
		if (!session.token || session.user?._id !== user?._id) return;
		lifecycleRequest.current = true;
		try {
			await setTripRecordingStatus(tid, "paused", session.user._id);
			if (useAuthStore.getState().user?._id !== session.user._id || useAuthStore.getState().token !== session.token) return;
			metadataDraft.current = null;
			firstPoint.current = null;
			lastPoint.current = null;
			tripEndTime.current = null;
			setTripId(tid);
			setSegment(null);
			setStatus("paused");
			await refreshPending();
			toast({ type: "info", title: "Recovered paused trip", msg: "Resume recording, or tap Stop to review and save its details." });
		} catch (error) {
			toast({ type: "warning", title: "Could not recover trip", msg: error.message });
		} finally {
			lifecycleRequest.current = false;
		}
	};

	const handleDelete = async (tid) => {
		if (isRestoring || status === "cleanup_required" || uploadRequest.current || lifecycleRequest.current || (tid === tripId && status !== "stopped")) return;
		try {
			await deleteTrip(tid, user?._id);
			await refreshPending();
			if (tid === tripId) resetState();
		} catch (error) {
			toast({ type: "warning", title: "Could not delete trip", msg: error.message });
		}
	};

	const handleEditDetails = async (tid = tripId) => {
		const session = { ...useAuthStore.getState() };
		if (!tid || !session.token || session.user?._id !== user?._id) return;
		const isCurrent = () => useAuthStore.getState().user?._id === session.user._id
			&& useAuthStore.getState().token === session.token
			&& useAuthStore.getState().sessionEpoch === session.sessionEpoch && !useAuthStore.getState().isSessionChanging;
		const trip = await getLocalTrip(tid, session.user._id);
		if (!isCurrent()) return;
		if (trip.status !== "stopped") throw new Error("Stop this recording before editing its details.");
		const previous = metadataDraft.current;
		if (previous?.tripId === tid && previous.userId === session.user._id && previous.token === session.token) {
			sheetRef.current?.reopen();
			return;
		}
		metadataDraft.current = { tripId: tid, userId: session.user._id, token: session.token,
			endTime: trip.end_time, startName: trip.start_name || "Unknown", endName: trip.end_name || "Unknown" };
		const defaults = tripMetadataDefaults(trip, session.user.settings || {});
		sheetRef.current?.open(trip.title || "Recorded trip", defaults.mode, defaults.visibility, trip.description || "");
	};

	const handleStop = async () => {
		if (stopRequest.current || lifecycleRequest.current || isRestoring) return;
		Alert.alert("Stop recording?", "Are you sure you want to finish this track?", [
			{ text: "Continue", style: "cancel" },
			{
				text: "Stop",
				style: "destructive",
				onPress: async () => {
					if (stopRequest.current) return;
					const session = { ...useAuthStore.getState() };
					if (!tripId || !user?._id || session.user?._id !== user._id) return;
					const operation = { token: session.token, userId: user._id };
					stopRequest.current = operation;
					const isCurrent = () => stopRequest.current === operation
						&& useAuthStore.getState().token === operation.token
						&& useAuthStore.getState().user?._id === operation.userId;
					setIsResolvingLocation(true);
					try {
						await stopLocationWatcher();
						if (!isCurrent()) return;
						// Paused trips may already have no background task to stop.
						const running = await Location.hasStartedLocationUpdatesAsync(TASK_NAME);
						if (!isCurrent()) return;
						if (running) await Location.stopLocationUpdatesAsync(TASK_NAME);
						if (!isCurrent()) return;
						await clearActiveTrip();
						if (!isCurrent()) return;
						tripEndTime.current = new Date().toISOString();
						await stopTrip(tripId, tripEndTime.current, operation.userId);
						if (!isCurrent()) return;
						setStatus("stopped");
						await refreshPending();

						let names = {};
						try {
							names = await getTripLocationNames({ start: firstPoint.current, end: lastPoint.current });
						} catch {
							// Missing/failed optional names must not strand a stopped recording.
						}
						if (!isCurrent()) return;
						const startName = names?.startName || "Unknown";
						const endName = names?.endName || "Unknown";
						pendingNames.current = { startName, endName };
						const title = names?.startName && names?.endName ? `From ${startName} to ${endName}` : "Recorded trip";
						const trip = await getLocalTrip(tripId, operation.userId);
						if (!isCurrent()) return;
						metadataDraft.current = { tripId, userId: operation.userId, token: operation.token,
							endTime: trip.end_time, startName: trip.start_name || startName, endName: trip.end_name || endName };
						const defaults = tripMetadataDefaults(trip, useAuthStore.getState().user?.settings || {});
						sheetRef.current?.open(trip.title || title, defaults.mode, defaults.visibility, trip.description || "");
					} catch (error) {
						if (isCurrent()) toast({ type: "danger", title: "Could not stop recording", msg: error?.message || "Please try Stop again." });
					} finally {
						if (stopRequest.current === operation) {
							stopRequest.current = null;
							setIsResolvingLocation(false);
						}
					}
				},
			},
		]);
	};

	const handleSaveMeta = async ({ title, mode, visibility, description }) => {
		const draft = metadataDraft.current;
		const isCurrent = () => draft && useAuthStore.getState().user?._id === draft.userId
			&& useAuthStore.getState().token === draft.token;
		if (!isCurrent()) throw new Error("Account changed. Reopen this trip's details.");
		await finishTrip(draft.tripId, {
			endTime: draft.endTime,
			title, description,
			startName: draft.startName,
			endName: draft.endName,
			defaultTransportMode: mode,
			defaultTripVisibility: visibility,
		}, draft.userId);
		if (!isCurrent()) return;
		toast({ type: "success", title: "Trip details saved" });
		await refreshPending();
	};

	const handleUpload = async (tid = tripId) => {
		if (uploadRequest.current || lifecycleRequest.current || isRestoring || status === "cleanup_required" || (tid === tripId && ["recording", "paused"].includes(status))) return;
		const session = { ...useAuthStore.getState() };
		if (!session.token || session.user?._id !== user?._id) return;
		const isCurrent = () => useAuthStore.getState().user?._id === session.user._id
			&& useAuthStore.getState().token === session.token
			&& useAuthStore.getState().sessionEpoch === session.sessionEpoch && !useAuthStore.getState().isSessionChanging;
		uploadRequest.current = true;
		setIsUploading(true);
		setUploadingTripId(tid);
		let payload;
		try {
			toast({ type: "info", title: "Packaging trip…" });
			// const payload = await buildTripJsonForUpload(tid);
			payload = await buildTripJsonForUpload(tid, user?.settings || {}, user?._id, true);

			if (!isCurrent()) throw new Error("Account changed; upload cancelled");
			const result = await uploadTripJson(payload, true, user?._id);
			await markTripUploaded(tid, user?._id, result, payload); // keeps it for history but not in pending
			if (!isCurrent()) return;
			toast({ type: "success", title: "Uploaded!" });

			await refreshPending();
			if (tid === tripId) resetState();
		} catch (err) {
			if (!isCurrent()) return;
			if (err.data?.uploadRejected === true && payload) {
				try { await releaseRejectedTripUpload(tid, session.user._id, payload, err.data); } catch (_) { /* Keep the original draft if local storage fails. */ }
				if (!isCurrent()) return;
			}
			if (["TRIP_METADATA_REQUIRED", "POI_NOTE_NEEDS_EDIT"].includes(err.code)) {
				try {
					if (err.code === "TRIP_METADATA_REQUIRED") {
						await handleEditDetails(tid);
						if (isCurrent()) toast({ type: "info", title: "Review trip details before uploading" });
					} else {
						const poi = await getPoiForEdit(tid, err.poiId, session.user._id);
						if (!isCurrent()) return;
						pendingPoiRepair.current = { tripId: tid, poiId: poi.id, userId: session.user._id, token: session.token };
						poiRepairModalRef.current?.open(poi.note || "", { title: "Edit POI note before upload" });
					}
				} catch (reviewError) {
					if (isCurrent()) toast({ type: "danger", title: "Could not open trip details", msg: reviewError.message });
				}
				return;
			}
			console.error("Upload failed:", err);
			toast({ type: "danger", title: err.code === "TRIP_UPLOAD_INCOMPLETE" ? "Upload incomplete" : "Upload not confirmed", msg: err.message });
		} finally {
			uploadRequest.current = false;
			setIsUploading(false);
			setUploadingTripId(null);
		}
	};

	const resetState = () => {
		setStatus("idle");
		setTripId(null);
		setSegment(null);
		firstPoint.current = null;
		lastPoint.current = null;
		tripEndTime.current = null;
		metadataDraft.current = null;
	};

	// secondary buttons
	const handleAddPoi = () => {
		const session = { ...useAuthStore.getState() };
		if (!tripId || !["recording", "paused"].includes(status) || !user?._id || session.user?._id !== user._id || !session.token) {
			toast({ type: "warning", title: "Start or resume a trip before adding a POI" });
			return;
		}
		const point = lastPoint.current;
		if (!point || !Number.isFinite(point.lat) || !Number.isFinite(point.lon)) {
			toast({ type: "warning", title: "Location not available yet", msg: "Wait for GPS, then add the POI again." });
			return;
		}
		// Save the location at which Add POI was tapped, not wherever the user
		// happens to be after typing the note while recording continues.
		pendingPoi.current = { tripId, userId: user._id, token: session.token, lat: point.lat, lon: point.lon };
		poiModalRef.current?.open();
	};

	const handlePoiSubmit = async ({ note }) => {
		const context = pendingPoi.current;
		const isCurrent = () => {
			const session = { ...useAuthStore.getState() };
			return context && context.tripId === tripId && ["recording", "paused"].includes(status)
				&& session.user?._id === context.userId && session.token === context.token;
		};
		if (!isCurrent() || !(await ownsLocalTrip(context.tripId, context.userId)) || !isCurrent()) {
			throw new Error("The recording session changed. Reopen Add POI on the current trip.");
		}
		await addPoi(context.tripId, { lat: context.lat, lon: context.lon, note });
		toast({ type: "success", title: "POI saved" });
	};

	const handlePoiRepairSubmit = async ({ note }) => {
		const context = pendingPoiRepair.current;
		const isCurrent = () => context && useAuthStore.getState().user?._id === context.userId
			&& useAuthStore.getState().token === context.token;
		if (!isCurrent()) throw new Error("Account changed. Reopen this trip's POI note.");
		await getPoiForEdit(context.tripId, context.poiId, context.userId);
		if (!isCurrent()) throw new Error("Account changed. Reopen this trip's POI note.");
		await updatePoiNote(context.tripId, context.poiId, note, context.userId);
		if (isCurrent()) toast({ type: "success", title: "POI note updated", msg: "Your trip is kept on this device. Tap Upload to try again." });
	};

	// Handle recommendation submission
	const handleRecommendationSubmit = async (recommendationData) => {
		if (!tripId || (status !== "recording" && status !== "paused")) {
			console.warn("[RecordScreen] No active trip to add recommendation to", { tripId, status });
			toast({
				type: "error",
				title: "No active trip to add recommendation to",
			});
			return;
		}

		try {
			const newRec = await addRecommendation(tripId, recommendationData);
			toast({
				type: "success",
				title: "Recommendation saved",
				subtitle: "Added to current trip",
			});
			return newRec ? { _id: newRec } : null;
		} catch (error) {
			console.error("Failed to save recommendation:", error);
			toast({ type: "error", title: "Failed to save recommendation" });
		}
	};

	// When opening the recommendation modal, pass current location
	const handleOpenRecommendationModal = () => {
		// Check if we can add recommendations (recording or paused)
		if (!tripId || (status !== "recording" && status !== "paused")) {
			toast({
				type: "error",
				title: "No active trip to add recommendation to",
			});
			return;
		}
		// Use last known location from the location watcher
		const locationData = lastPoint.current
			? {
					lat: lastPoint.current.lat,
					lon: lastPoint.current.lon,
			  }
			: null;

		if (!locationData) {
			toast({
				type: "warning",
				title: "Location not available yet",
				subtitle: "Please wait for GPS to initialize",
			});
			return;
		}

		addRecommendationModalRef.current?.open(locationData);
	};

	// ─────── UI ──────────────────────────────────────────────────────────────
	return (
		<View style={styles.container}>
			<Text style={styles.status}>Status: {status.toUpperCase()}</Text>

			{isResolvingLocation && (
				<View style={styles.loadingOverlay}>
					<ActivityIndicator size="large" color={theme.colors.primary} />
				</View>
			)}

			{isUploading &&
				uploadingTripId === tripId &&
				status === "stopped" && ( // Loader for main trip upload
					<View style={styles.loadingOverlay}>
						<ActivityIndicator size="large" color={theme.colors.primary} />
						<Text style={styles.loadingText}>Uploading trip...</Text>
					</View>
				)}

			{status === "cleanup_required" && (
				<View style={{ alignSelf: "stretch", marginBottom: 24 }}>
					<Text accessibilityRole="alert" style={{ color: theme.colors.text, marginBottom: 12 }}>
						{recoveryError || "Stopping an unfinished GPS collector. Your saved trip data will not be changed."}
					</Text>
					<TouchableOpacity accessibilityRole="button" accessibilityLabel="Retry Stop" disabled={isRestoring}
						onPress={() => recoveryRequest.current?.()}>
						<Text style={{ color: theme.colors.link }}>{isRestoring ? "Checking GPS…" : "Retry Stop"}</Text>
					</TouchableOpacity>
				</View>
			)}

			{status === "idle" && !isRestoring && <CircleButton icon="play" color="green" onPress={handleStart} />}

			{(status === "recording" || status === "paused") && (
				<>
					<View style={styles.row}>
						<CircleButton
							icon={status === "recording" ? "pause" : "play"}
							color={theme.colors.secondary}
							onPress={handlePauseResume}
						/>
						<CircleButton icon="stop" color={theme.colors.error} onPress={handleStop} />
					</View>
					{/* ── NEW secondary buttons ───────────────── */}
					<View style={styles.row}>
						<CircleButton
							icon="location-sharp"
							color={theme.colors.info}
							onPress={handleAddPoi}
							// style={{ marginLeft: theme.space.md }}
						/>
						{/* <Text style={styles.actionButtonText}>Add POI</Text> */}
						<CircleButton icon="star" color={theme.colors.warning} onPress={handleOpenRecommendationModal} />
						{/* <Text style={styles.actionButtonText}>Add Recommendation</Text> */}
					</View>
				</>
			)}

			{status === "stopped" && (
				<>
					<TouchableOpacity accessibilityRole="button" accessibilityLabel="Edit trip details" onPress={() => handleEditDetails().catch((error) => toast({ type: "danger", title: "Could not open trip details", msg: error.message }))} disabled={isUploading} style={{ marginBottom: 24 }}>
						<Text style={{ color: theme.colors.link, fontSize: 16 }}>Edit trip details</Text>
					</TouchableOpacity>
					<CircleButton icon="cloud-upload" color="green" onPress={() => handleUpload()} />
					<TouchableOpacity onPress={resetState} style={{ marginTop: 24 }} disabled={isUploading}>
						<Text style={{ color: theme.colors.link, fontSize: 16 }}>Start a new trip</Text>
					</TouchableOpacity>
				</>
			)}

			{/* local trips still on device */}
			{pending.length > 0 && (
				<View style={{ alignSelf: "stretch", marginTop: 32 }}>
					<Text style={{ color: theme.colors.text, marginBottom: 6 }}>Trips on device ({pending.length})</Text>

					<FlatList
						data={pending}
						keyExtractor={(t) => t.id}
						style={{ maxHeight: 260 }}
						renderItem={({ item }) => (
							<PendingRow
								item={item}
								isUploading={isUploading}
								uploadingTripId={uploadingTripId}
								onUpload={() => handleUpload(item.id)}
								onDelete={() => handleDelete(item.id)}
								onRecover={() => handleRecover(item.id)}
								isActive={isRestoring || status === "cleanup_required" || (item.id === tripId && ["recording", "paused"].includes(status))}
								canRecover={!isRestoring && !["recording", "paused", "cleanup_required"].includes(status)}
							/>
						)}
					/>
				</View>
			)}

			<TripSaveModal key={user?._id || "signed-out"} ref={sheetRef} onConfirm={handleSaveMeta} />
			<AddPoiModal key={`add-poi-${user?._id || "signed-out"}`} ref={poiModalRef} onSubmit={handlePoiSubmit} />
			<AddPoiModal key={`repair-poi-${user?._id || "signed-out"}`} ref={poiRepairModalRef} onSubmit={handlePoiRepairSubmit} />
			<AddRecommendationModal
				ref={addRecommendationModalRef}
				onSubmit={handleRecommendationSubmit}
				disablePhotos={true}
			/>
		</View>
	);
}

const PendingRow = ({ item, onUpload, onDelete, onRecover, isActive, canRecover, isUploading, uploadingTripId }) => {
	const isCurrentlyUploadingThisItem = isUploading && uploadingTripId === item.id;
	const isAnotherItemUploading = isUploading && uploadingTripId !== null && uploadingTripId !== item.id;

	const unfinished = item.status !== "stopped";
	const uploadButtonDisabled = isAnotherItemUploading || isActive || unfinished;
	const deleteButtonDisabled = isUploading || isActive || unfinished; // Disable delete if any upload is in progress

	return (
		<View style={{ flexDirection: "row", paddingVertical: 4, alignItems: "center" }}>
			<Text style={{ color: theme.colors.text, flex: 1 }}>
				{new Date(item.start_time).toLocaleDateString()} · {item.pointsCount} pts{unfinished ? " · unfinished" : ""}
			</Text>
			{unfinished && !isActive && canRecover && !isUploading && (
				<TouchableOpacity accessibilityLabel="Recover recording" onPress={onRecover} style={{ marginRight: 16 }}>
					<Text style={{ color: theme.colors.link }}>Recover</Text>
				</TouchableOpacity>
			)}
			{isCurrentlyUploadingThisItem ? (
				<ActivityIndicator size="small" color="green" style={{ marginRight: 16 }} />
			) : (
				<Ionicons
					name="cloud-upload"
					size={20}
					color={uploadButtonDisabled ? theme.colors.disabled : "green"}
					style={{ marginRight: 16 }}
					onPress={uploadButtonDisabled ? null : onUpload}
				/>
			)}
			<Ionicons
				name="trash"
				size={20}
				color={deleteButtonDisabled ? theme.colors.disabled : "#D14343"}
				onPress={deleteButtonDisabled ? null : onDelete}
			/>
		</View>
	);
};

// ─────── styles ────────────────────────────────────────────────────────────
const styles = StyleSheet.create({
	container: {
		flex: 1,
		backgroundColor: theme.colors.background,
		justifyContent: "center",
		alignItems: "center",
		padding: theme.space.lg,
	},
	status: {
		fontSize: 20,
		marginBottom: theme.space.lg,
		color: theme.colors.text,
	},
	// row: { flexDirection: "row", gap: theme.space.md, flexWrap: "wrap" },
	// circle: { borderRadius: 50, padding: theme.space.md },
	loadingOverlay: {
		...StyleSheet.absoluteFillObject,
		backgroundColor: "rgba(255, 255, 255, 0.7)",
		justifyContent: "center",
		alignItems: "center",
		zIndex: 10, // Ensure it's on top
	},
	loadingText: {
		marginTop: theme.space.sm,
		fontSize: theme.fontSize.md,
		color: theme.colors.text,
	},
	row: {
		flexDirection: "row",
		gap: theme.space.md,
		flexWrap: "wrap",
		marginBottom: theme.space.md,
	},
	circle: { borderRadius: 50, padding: theme.space.md },
	actionButtonContainer: {
		alignItems: "center",
		marginTop: theme.space.md,
	},
	actionButtonText: {
		color: theme.colors.text,
		marginTop: theme.space.xs,
		fontSize: theme.fontSize.sm,
	},
});
