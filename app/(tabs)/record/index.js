import { TASK_NAME } from "@/src/background/TripLocationTask";
import CircleButton from "@/src/components/CircleButton";
import AddPoiModal from "@/src/components/modals/AddPoiModal";
import AddRecommendationModal from "@/src/components/modals/AddRecommendationModal";
import TripSaveModal from "@/src/components/modals/TripSaveModal";
import { runMigrations } from "@/src/db/migrations";

import {
	addRecommendation,
	buildTripJsonForUpload,
	deleteTrip,
	finishTrip,
	getPendingTrips,
	markTripUploaded,
	startSegment,
	startTrip,
} from "@/src/db/tripDao";
import { uploadTripJson } from "@/src/services/api";
import { getTripLocationNames } from "@/src/services/locationNames";
import { useAuthStore } from "@/src/stores/auth";
import { theme } from "@/src/theme";
import { clearActiveTrip, getActiveTrip, setActiveTrip } from "@/src/utils/activeTrip";
import { toast } from "@/src/utils/toast";
import { Ionicons } from "@expo/vector-icons";
import * as Location from "expo-location";
import * as TaskManager from "expo-task-manager";
import { useEffect, useRef, useState } from "react";
import { ActivityIndicator, Alert, FlatList, StyleSheet, Text, TouchableOpacity, View } from "react-native";

//5000, 10 = 5sec 10 meters
const TIME_INTERVAL = 5000;
const DISTANCE_INTERVAL = 10;

export default function RecordScreen() {
	// ─────── state ────────────────────────────────────────────────────────────
	const [status, setStatus] = useState("idle"); // idle | recording | paused | stopped
	const [tripId, setTripId] = useState(null);
	const [segmentId, setSegment] = useState(null);
	const [pending, setPending] = useState([]); // local trips not yet uploaded
	const [isResolvingLocation, setIsResolvingLocation] = useState(false);
	const [isUploading, setIsUploading] = useState(false);
	const [uploadingTripId, setUploadingTripId] = useState(null); //just for showing upload proggress

	const locationWatcher = useRef(null);
	const firstPoint = useRef(null);
	const lastPoint = useRef(null);
	const sheetRef = useRef(null);
	const poiModalRef = useRef(null);
	const addRecommendationModalRef = useRef(null);

	const pendingNames = useRef({ startName: "Unknown", endName: "Unknown" });

	const user = useAuthStore((s) => s.user);

	// ─────── migrations + first load ─────────────────────────────────────────
	useEffect(() => {
		(async () => {
			await runMigrations();
			await refreshPending();
			// Restore background tracking state if OS relaunched the app
			const running = await TaskManager.isTaskRegisteredAsync(TASK_NAME);
			if (running) {
				const { tripId: tid, segmentId: seg } = await getActiveTrip();
				if (tid && seg) {
					setTripId(tid);
					setSegment(seg);
					setStatus("recording");
					await startLocationWatcher();
				}
			}
		})();
	}, []);

	const refreshPending = async () => {
		const rows = await getPendingTrips();
		setPending(rows);
	};

	// ─────── location helpers ────────────────────────────────────────────────
	const stopLocationWatcher = async () => {
		if (locationWatcher.current) {
			await locationWatcher.current.remove();
			locationWatcher.current = null;
		}
	};

	const startLocationWatcher = async () => {
		locationWatcher.current = await Location.watchPositionAsync(
			{
				accuracy: Location.Accuracy.High,
				timeInterval: TIME_INTERVAL,
				distanceInterval: DISTANCE_INTERVAL,
			},
			(loc) => {
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
	};

	// ─────── actions ─────────────────────────────────────────────────────────
	const handleStart = async () => {
		// 1 — ask permission ----------------------------------------------------
		const { status: perm } = await Location.requestForegroundPermissionsAsync();
		if (perm !== "granted") {
			toast({ type: "danger", title: "Location permission required" });
			return;
		}

		// 2 — create trip & first segment ---------------------------------------
		const uid = user?._id || "test-user";
		const tid = await startTrip(uid);
		const seg = startSegment();

		setTripId(tid);
		setSegment(seg);
		setStatus("recording");

		// 3 — persist ids so TaskManager knows where to write
		await setActiveTrip(tid, seg);

		// 4 — start foreground & background tracking ----------------------------
		try {
			// foreground watcher (only updates first/last point refs)
			await startLocationWatcher();

			// background updates (write points to SQLite)
			await Location.startLocationUpdatesAsync(TASK_NAME, {
				accuracy: Location.Accuracy.High,
				timeInterval: TIME_INTERVAL,
				distanceInterval: DISTANCE_INTERVAL,
				showsBackgroundLocationIndicator: true,
				foregroundService: {
					notificationTitle: "Recording trip",
					notificationBody: "Tracking continues when the app is closed.",
				},
			});

			toast({ type: "success", title: "Recording started" });
		} catch (err) {
			// rollback if either watcher fails ------------------------------------
			await stopLocationWatcher();
			await Location.stopLocationUpdatesAsync(TASK_NAME).catch(() => {});
			await clearActiveTrip();

			setStatus("idle");
			setTripId(null);
			setSegment(null);

			toast({
				type: "danger",
				title: "Could not start recording",
				msg: err.message,
			});
		}
	};

	const handlePauseResume = async () => {
		if (status === "recording") {
			await stopLocationWatcher();
			// stop background updates
			await Location.stopLocationUpdatesAsync(TASK_NAME);
			await clearActiveTrip();
			//--------------------------------//
			setStatus("paused");
			toast({ type: "info", title: "Paused" });
		} else {
			//resuming
			const seg = startSegment();
			setSegment(seg);
			setStatus("recording");

			await setActiveTrip(tripId, seg);

			// resume background updates
			await Location.startLocationUpdatesAsync(TASK_NAME, {
				accuracy: Location.Accuracy.High,
				timeInterval: TIME_INTERVAL,
				distanceInterval: DISTANCE_INTERVAL,
				showsBackgroundLocationIndicator: true,
				foregroundService: {
					notificationTitle: "Recording trip",
					notificationBody: "Tracking continues when the app is closed.",
				},
			});
			// await startLocation(tripId, seg);
			await startLocationWatcher();
			//----------------------------------//
			toast({ type: "success", title: "Resumed" });
		}
	};

	const handleStop = async () => {
		Alert.alert("Stop recording?", "Are you sure you want to finish this track?", [
			{ text: "Continue", style: "cancel" },
			{
				text: "Stop",
				style: "destructive",
				onPress: async () => {
					await stopLocationWatcher();
					// stop background updates
					await Location.stopLocationUpdatesAsync(TASK_NAME);
					await clearActiveTrip();
					//--------------------------------//
					setIsResolvingLocation(true);
					try {
						const { startName, endName } = await getTripLocationNames({
							start: firstPoint.current ?? {},
							end: lastPoint.current ?? {},
						});

						// toast({ type: "warning", title: "Recording stopped" });

						pendingNames.current = { startName, endName };
						const defaultMode = user?.settings?.defaultTravelMode || "car";

						setStatus("stopped");
						setIsResolvingLocation(false);

						sheetRef.current?.open(`From ${startName} to ${endName}`, defaultMode);
					} catch (error) {
						console.error("Error getting location names:", error);
						toast({
							type: "danger",
							title: "Error",
							msg: "Could not resolve location names. Add it manually",
						});
						setIsResolvingLocation(false);
						// Optionally, reset status if needed, e.g., setStatus("idle");
					}
					// await refreshPending();
				},
			},
		]);
	};

	const handleSaveMeta = async ({ title, mode, visibility, description }) => {
		const endTime = new Date().toISOString();

		await finishTrip(tripId, {
			endTime,
			title,
			description,
			startName: pendingNames.current.startName,
			endName: pendingNames.current.endName,
			defaultTravelMode: mode,
			defaultTripVisibility: visibility,
		});

		setStatus("stopped");
		toast({ type: "warning", title: "Recording stopped" });
		await refreshPending();
	};

	const handleUpload = async (tid = tripId) => {
		setIsUploading(true);
		setUploadingTripId(tid);
		try {
			toast({ type: "info", title: "Packaging trip…" });
			// const payload = await buildTripJsonForUpload(tid);
			const payload = await buildTripJsonForUpload(tid, user?.settings || {});

			await uploadTripJson(payload);
			await markTripUploaded(tid); // keeps it for history but not in pending
			toast({ type: "success", title: "Uploaded!" });

			await refreshPending();
			if (tid === tripId) resetState();
		} catch (err) {
			console.error("Upload failed:", err);
			toast({ type: "danger", title: "Upload failed", msg: err.message });
		} finally {
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
	};

	// secondary buttons
	const handleAddPoi = () => poiModalRef.current?.open();

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

			{status === "idle" && <CircleButton icon="play" color="green" onPress={handleStart} />}

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
								onDelete={async () => {
									await deleteTrip(item.id);
									await refreshPending();
								}}
							/>
						)}
					/>
				</View>
			)}

			<TripSaveModal ref={sheetRef} onConfirm={handleSaveMeta} />
			<AddPoiModal ref={poiModalRef} />
			<AddRecommendationModal
				ref={addRecommendationModalRef}
				onSubmit={handleRecommendationSubmit}
				disablePhotos={true}
			/>
		</View>
	);
}

const PendingRow = ({ item, onUpload, onDelete, isUploading, uploadingTripId }) => {
	const isCurrentlyUploadingThisItem = isUploading && uploadingTripId === item.id;
	const isAnotherItemUploading = isUploading && uploadingTripId !== null && uploadingTripId !== item.id;

	const uploadButtonDisabled = isAnotherItemUploading;
	const deleteButtonDisabled = isUploading; // Disable delete if any upload is in progress

	return (
		<View style={{ flexDirection: "row", paddingVertical: 4, alignItems: "center" }}>
			<Text style={{ color: theme.colors.text, flex: 1 }}>
				{new Date(item.start_time).toLocaleDateString()} · {item.pointsCount} pts
			</Text>
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
