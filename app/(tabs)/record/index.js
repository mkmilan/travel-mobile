import { Ionicons } from "@expo/vector-icons";
import * as Location from "expo-location";
import { useEffect, useRef, useState } from "react";
import {
	Alert,
	FlatList,
	StyleSheet,
	Text,
	TouchableOpacity,
	View,
} from "react-native";

import TripSaveModal from "@/src/components/TripSaveModal";
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

export default function RecordScreen() {
	// ─────── state ────────────────────────────────────────────────────────────
	const [status, setStatus] = useState("idle"); // idle | recording | paused | stopped
	const [tripId, setTripId] = useState(null);
	const [segmentId, setSegment] = useState(null);
	const [pending, setPending] = useState([]); // local trips not yet uploaded

	const locationWatcher = useRef(null);
	const firstPoint = useRef(null);
	const lastPoint = useRef(null);
	const sheetRef = useRef(null);
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

	const startLocation = async (tid, seg) => {
		locationWatcher.current = await Location.watchPositionAsync(
			{
				accuracy: Location.Accuracy.High,
				timeInterval: 1000,
				distanceInterval: 1,
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

				try {
					await insertTrackPoint(tid, seg, {
						lat: latitude,
						lon: longitude,
						timestamp,
						speed,
						accuracy,
					});
				} catch (err) {
					console.error("Failed to save point:", err);
				}
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
						setStatus("stopped");

						const { startName, endName } = await getTripLocationNames({
							start: firstPoint.current ?? {},
							end: lastPoint.current ?? {},
						});

						// toast({ type: "warning", title: "Recording stopped" });

						pendingNames.current = { startName, endName };
						console.log("Pending names:", pendingNames.current);
						const defaultMode = user?.settings?.defaultTransportMode || "car";
						sheetRef.current?.open(
							`From ${startName} to ${endName}`,
							defaultMode
						);
						// await refreshPending();
					},
				},
			]
		);
	};

	const handleSaveMeta = async ({ title, mode }) => {
		const endTime = new Date().toISOString();

		await finishTrip(tripId, {
			endTime,
			title,
			startLocationName: pendingNames.current.startName,
			endLocationName: pendingNames.current.endName,
			defaultTransportMode: mode,
		});

		setStatus("stopped");
		toast({ type: "warning", title: "Recording stopped" });
		await refreshPending();
	};

	const handleUpload = async (tid = tripId) => {
		try {
			toast({ type: "info", title: "Packaging trip…" });
			const payload = await buildTripJsonForUpload(tid);
			console.log("Payload:", JSON.stringify(payload, null, 2));

			await uploadTripJson(payload);
			await markTripUploaded(tid); // keeps it for history but not in pending
			toast({ type: "success", title: "Uploaded!" });

			await refreshPending();
			if (tid === tripId) resetState();
		} catch (err) {
			console.error("Upload failed:", err);
			toast({ type: "danger", title: "Upload failed", msg: err.message });
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

			{status === "idle" && (
				<CircleButton
					icon="play"
					color="green"
					onPress={handleStart}
				/>
			)}

			{(status === "recording" || status === "paused") && (
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
		</View>
	);
}

// ─────── tiny sub-components ──────────────────────────────────────────────
const CircleButton = ({ icon, color, onPress }) => (
	<TouchableOpacity
		onPress={onPress}
		style={[styles.circle, { backgroundColor: color }]}
	>
		<Ionicons
			name={icon}
			size={28}
			color="#fff"
		/>
	</TouchableOpacity>
);

const PendingRow = ({ item, onUpload, onDelete }) => (
	<View
		style={{ flexDirection: "row", paddingVertical: 4, alignItems: "center" }}
	>
		<Text style={{ color: theme.colors.text, flex: 1 }}>
			{new Date(item.start_time).toLocaleDateString()} · {item.pointsCount} pts
		</Text>
		<Ionicons
			name="cloud-upload"
			size={20}
			color="green"
			style={{ marginRight: 16 }}
			onPress={onUpload}
		/>
		<Ionicons
			name="trash"
			size={20}
			color="#D14343"
			onPress={onDelete}
		/>
	</View>
);

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
	row: { flexDirection: "row", gap: theme.space.md },
	circle: { borderRadius: 50, padding: theme.space.md },
});
