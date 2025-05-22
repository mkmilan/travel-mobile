import { theme } from "@/src/theme";
import BottomSheet from "@gorhom/bottom-sheet";
import React, { forwardRef, useMemo, useRef, useState } from "react";
import { Platform, Pressable, Text, TextInput, View } from "react-native";

import TransportIcon from "@/src/components/TransportIcon";
import { useAuthStore } from "@/src/stores/auth";
// derive list of modes straight from the icon map
const TRANSPORT_MODES = [
	"motorhome",
	"campervan",
	"car",
	"motorcycle",
	"bicycle",
	"walking",
];

export const TripSaveBottomSheet = forwardRef(({ onConfirm }, ref) => {
	const snapPoints = useMemo(() => ["50%"], []);
	const inner = useRef(null);
	const sheet = useRef(null);

	const user = useAuthStore((s) => s.user);

	// local state lives only while sheet is open
	const [title, setTitle] = useState("");
	const [mode, setMode] = useState(user?.settings?.defaultMode);

	// expose .open() to the parent
	React.useImperativeHandle(ref, () => ({
		open(initialTitle, initialMode) {
			setTitle(initialTitle);
			setMode(initialMode || user?.settings?.defaultMode);
			// inner.current?.snapToIndex?.(0); // works in v5
			sheet.current?.expand();
		},
	}));

	return (
		<BottomSheet
			ref={sheet}
			index={-1} // hidden initially
			snapPoints={snapPoints}
			enablePanDownToClose
		>
			<View style={{ flex: 1, padding: 16 }}>
				{/* title ------------------------------------------------------------- */}
				<Text style={{ fontSize: 18, fontWeight: "600", marginBottom: 8 }}>
					{`Trip title (${Platform.OS === "ios" ? "return" : "enter"} to save)`}
				</Text>

				<TextInput
					value={title}
					onChangeText={setTitle}
					style={{
						borderWidth: 1,
						borderColor: theme.colors.border,
						borderRadius: 12,
						padding: 10,
						marginBottom: 16,
					}}
					returnKeyType="done"
				/>

				{/* mode -------------------------------------------------------------- */}
				<Text style={{ fontSize: 18, fontWeight: "600", marginBottom: 8 }}>
					Transport mode
				</Text>

				<View
					style={{ flexDirection: "row", flexWrap: "wrap", marginBottom: 24 }}
				>
					{TRANSPORT_MODES.map((m) => (
						<Pressable
							key={m}
							onPress={() => setMode(m)}
							style={{
								flexDirection: "row",
								alignItems: "center",
								borderWidth: 1,
								borderColor: theme.colors.border,
								borderRadius: 12,
								paddingVertical: 6,
								paddingHorizontal: 12,
								marginRight: 8,
								marginBottom: 8,
								backgroundColor: m === mode ? "#e0e0e0" : "transparent",
							}}
						>
							<TransportIcon
								mode={m}
								size={18}
							/>
							<Text style={{ marginLeft: 6 }}>{m}</Text>
						</Pressable>
					))}
				</View>

				{/* save -------------------------------------------------------------- */}
				<Pressable
					onPress={() => {
						onConfirm({ title, mode });
						sheet.current?.close();
					}}
					style={{
						backgroundColor: theme.colors.primary,
						borderRadius: 12,
						paddingVertical: 12,
					}}
				>
					<Text
						style={{ color: "#fff", textAlign: "center", fontWeight: "600" }}
					>
						Save trip
					</Text>
				</Pressable>
			</View>
		</BottomSheet>
	);
});

// expose the mode map so RecordScreen can reuse it if needed
TripSaveBottomSheet.TRANSPORT_MODES = TRANSPORT_MODES;
