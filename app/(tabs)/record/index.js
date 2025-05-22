import CircleButton from "@/src/components/CircleButton";
import AddPoiModal from "@/src/components/modals/AddPoiModal";
import AddRecommendationModal from "@/src/components/modals/AddRecommendationModal";
import TripSaveModal from "@/src/components/modals/TripSaveModal";
import { runMigrations } from "@/src/db/migrations";
import {
	buildTripJsonForUpload,
	deleteTrip,
	finishTrip,
	getPendingTrips,
	insertTrackPoint,
	markTripUploaded,
	startSegment,
	startTrip,
} from "@/src/db/tripDao";
import { uploadTripJson } from "@/src/services/api";
import { getTripLocationNames } from "@/src/services/locationNames";
import { useAuthStore } from "@/src/stores/auth";
import { theme } from "@/src/theme";
import { toast } from "@/src/utils/toast";
import { Ionicons } from "@expo/vector-icons";
import * as Location from "expo-location";
import { useEffect, useRef, useState } from "react";
import {
	ActivityIndicator,
	Alert,
	FlatList,
	StyleSheet,
	Text,
	TouchableOpacity,
	View,
} from "react-native";

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
	const recModalRef = useRef(null);

	const pendingNames = useRef({ startName: "Unknown", endName: "Unknown" });

	const user = useAuthStore((s) => s.user);

	// ─────── migrations + first load ─────────────────────────────────────────
	useEffect(() => {
		(async () => {
			await runMigrations();
			await refreshPending();
		})();
	}, []);

	const refreshPending = async () => {
		const rows = await getPendingTrips();
		setPending(rows);
	};

	// ─────── location helpers ────────────────────────────────────────────────
	const stopLocation = async () => {
		if (locationWatcher.current) {
			await locationWatcher.current.remove();
			locationWatcher.current = null;
		}
	};

	// const startLocation = async (tid, seg) => {
	// 	locationWatcher.current = await Location.watchPositionAsync(
	// 		{
	// 			accuracy: Location.Accuracy.High,
	// 			timeInterval: 1000,
	// 			distanceInterval: 1,
	// 		},
	// 		async (loc) => {
	// 			const { latitude, longitude, speed, accuracy } = loc.coords;
	// 			const timestamp = new Date().toISOString();

	// 			if (!firstPoint.current) {
	// 				firstPoint.current = { lat: latitude, lon: longitude };
	// 			}
	// 			lastPoint.current = { lat: latitude, lon: longitude };

	// 			// DEV LOG – keep verbose in dev builds
	// 			console.log(
	// 				`[Rec] ${latitude.toFixed(5)},${longitude.toFixed(5)} ` +
	// 					`spd:${speed?.toFixed(1) ?? "?"} acc:${accuracy ?? "?"}`
	// 			);

	// 			try {
	// 				await insertTrackPoint(tid, seg, {
	// 					lat: latitude,
	// 					lon: longitude,
	// 					timestamp,
	// 					speed,
	// 					accuracy,
	// 				});
	// 			} catch (err) {
	// 				console.error("Failed to save point:", err);
	// 			}
	// 		}
	// 	);
	// };
	const startLocation = async (tid, seg) => {
		locationWatcher.current = await Location.watchPositionAsync(
			{
				accuracy: Location.Accuracy.High,
				timeInterval: 1000,
				distanceInterval: 0,
			},
			async (loc) => {
				const { latitude, longitude, speed, accuracy } = loc.coords;
				const timestamp = new Date().toISOString();

				if (!firstPoint.current) {
					firstPoint.current = { lat: latitude, lon: longitude };
				}
				lastPoint.current = { lat: latitude, lon: longitude };

				// DEV LOG – keep verbose in dev builds
				console.log(
					`[Rec] ${latitude.toFixed(5)},${longitude.toFixed(5)} ` +
						`spd:${speed?.toFixed(1) ?? "?"} acc:${accuracy ?? "?"}`
				);

				// Call insertTrackPoint without awaiting it in the main callback flow
				// Handle potential errors with .catch()
				insertTrackPoint(tid, seg, {
					lat: latitude,
					lon: longitude,
					timestamp,
					speed,
					accuracy,
				}).catch((err) => {
					// Log errors from the async insert operation
					console.error("Failed to save point (async):", err);
				});
			}
		);
	};

	// ─────── actions ─────────────────────────────────────────────────────────
	const handleStart = async () => {
		const { status: perm } = await Location.requestForegroundPermissionsAsync();
		if (perm !== "granted") {
			toast({ type: "danger", title: "Location permission required" });
			return;
		}

		const uid = user?._id || "test-user";
		const tid = await startTrip(uid);
		const seg = startSegment();

		setTripId(tid);
		setSegment(seg);
		setStatus("recording");
		await startLocation(tid, seg);

		toast({ type: "success", title: "Recording started" });
	};

	const handlePauseResume = async () => {
		if (status === "recording") {
			await stopLocation();
			setStatus("paused");
			toast({ type: "info", title: "Paused" });
		} else {
			const seg = startSegment();
			setSegment(seg);
			setStatus("recording");
			await startLocation(tripId, seg);
			toast({ type: "success", title: "Resumed" });
		}
	};

	const handleStop = async () => {
		Alert.alert(
			"Stop recording?",
			"Are you sure you want to finish this track?",
			[
				{ text: "Continue", style: "cancel" },
				{
					text: "Stop",
					style: "destructive",
					onPress: async () => {
						await stopLocation();

						setIsResolvingLocation(true);
						try {
							const { startName, endName } = await getTripLocationNames({
								start: firstPoint.current ?? {},
								end: lastPoint.current ?? {},
							});

							// toast({ type: "warning", title: "Recording stopped" });

							pendingNames.current = { startName, endName };
							console.log("Pending names:", pendingNames.current);
							const defaultMode = user?.settings?.defaultTransportMode || "car";

							setStatus("stopped");
							setIsResolvingLocation(false);

							sheetRef.current?.open(
								`From ${startName} to ${endName}`,
								defaultMode
							);
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
			]
		);
	};

	// secondary buttons
	const handleAddPoi = () => poiModalRef.current?.open();
	const handleAddRec = () => recModalRef.current?.open();

	const handleSaveMeta = async ({ title, mode, visibility }) => {
		const endTime = new Date().toISOString();

		await finishTrip(tripId, {
			endTime,
			title,
			startLocationName: pendingNames.current.startName,
			endLocationName: pendingNames.current.endName,
			defaultTransportMode: mode,
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
			console.log("Payload:", JSON.stringify(payload, null, 2));

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

	// ─────── UI ──────────────────────────────────────────────────────────────
	return (
		<View style={styles.container}>
			<Text style={styles.status}>Status: {status.toUpperCase()}</Text>

			{isResolvingLocation && (
				<View style={styles.loadingOverlay}>
					<ActivityIndicator
						size="large"
						color={theme.colors.primary}
					/>
				</View>
			)}

			{isUploading &&
				uploadingTripId === tripId &&
				status === "stopped" && ( // Loader for main trip upload
					<View style={styles.loadingOverlay}>
						<ActivityIndicator
							size="large"
							color={theme.colors.primary}
						/>
						<Text style={styles.loadingText}>Uploading trip...</Text>
					</View>
				)}

			{status === "idle" && (
				<CircleButton
					icon="play"
					color="green"
					onPress={handleStart}
				/>
			)}

			{(status === "recording" || status === "paused") && (
				<>
					<View style={styles.row}>
						<CircleButton
							icon={status === "recording" ? "pause" : "play"}
							color={theme.colors.secondary}
							onPress={handlePauseResume}
						/>
						<CircleButton
							icon="stop"
							color={theme.colors.error}
							onPress={handleStop}
						/>
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
						<CircleButton
							icon="star"
							color={theme.colors.warning}
							onPress={handleAddRec}
						/>
						{/* <Text style={styles.actionButtonText}>Add Recommendation</Text> */}
					</View>
				</>
			)}

			{status === "stopped" && (
				<>
					<CircleButton
						icon="cloud-upload"
						color="green"
						onPress={() => handleUpload()}
					/>
					<TouchableOpacity
						onPress={resetState}
						style={{ marginTop: 24 }}
						disabled={isUploading}
					>
						<Text style={{ color: theme.colors.link, fontSize: 16 }}>
							Start a new trip
						</Text>
					</TouchableOpacity>
				</>
			)}

			{/* local trips still on device */}
			{pending.length > 0 && (
				<View style={{ alignSelf: "stretch", marginTop: 32 }}>
					<Text style={{ color: theme.colors.text, marginBottom: 6 }}>
						Trips on device ({pending.length})
					</Text>

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

			<TripSaveModal
				ref={sheetRef}
				onConfirm={handleSaveMeta}
			/>
			<AddPoiModal ref={poiModalRef} />
			<AddRecommendationModal ref={recModalRef} />
		</View>
	);
}

const PendingRow = ({
	item,
	onUpload,
	onDelete,
	isUploading,
	uploadingTripId,
}) => {
	const isCurrentlyUploadingThisItem =
		isUploading && uploadingTripId === item.id;
	const isAnotherItemUploading =
		isUploading && uploadingTripId !== null && uploadingTripId !== item.id;

	const uploadButtonDisabled = isAnotherItemUploading;
	const deleteButtonDisabled = isUploading; // Disable delete if any upload is in progress

	return (
		<View
			style={{ flexDirection: "row", paddingVertical: 4, alignItems: "center" }}
		>
			<Text style={{ color: theme.colors.text, flex: 1 }}>
				{new Date(item.start_time).toLocaleDateString()} · {item.pointsCount}{" "}
				pts
			</Text>
			{isCurrentlyUploadingThisItem ? (
				<ActivityIndicator
					size="small"
					color="green"
					style={{ marginRight: 16 }}
				/>
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

// const PendingRow = ({ item, onUpload, onDelete }) => (
// 	<View
// 		style={{ flexDirection: "row", paddingVertical: 4, alignItems: "center" }}
// 	>
// 		<Text style={{ color: theme.colors.text, flex: 1 }}>
// 			{new Date(item.start_time).toLocaleDateString()} · {item.pointsCount} pts
// 		</Text>
// 		<Ionicons
// 			name="cloud-upload"
// 			size={20}
// 			color="green"
// 			style={{ marginRight: 16 }}
// 			onPress={onUpload}
// 		/>
// 		<Ionicons
// 			name="trash"
// 			size={20}
// 			color="#D14343"
// 			onPress={onDelete}
// 		/>
// 	</View>
// );

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
