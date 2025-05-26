import BottomModal from "@/src/components/modals/BottomModal";
import ModalHeader from "@/src/components/modals/ModalHeader";
import { theme } from "@/src/theme";
import { Feather, Ionicons } from "@expo/vector-icons";
import { useState } from "react";
import { Pressable, ScrollView, StyleSheet, Text, View } from "react-native";

/**
 * Props
 *  • label        – field title
 *  • value        – current value
 *  • options      – [{label,value}]
 *  • onChange(v)
 */
export default function SelectRow({ label, value, options, onChange, icon }) {
	const [open, setOpen] = useState(false);
	const selected = options.find((o) => o.value === value)?.label ?? "—";

	return (
		<View style={styles.row}>
			<View style={styles.rowHeader}>
				{icon && (
					<Feather
						name={icon}
						size={18}
						color={theme.colors.textMuted}
						style={{ marginRight: 8 }}
					/>
				)}
				<Text style={styles.label}>{label}</Text>
			</View>

			<Pressable style={styles.button} onPress={() => setOpen(true)}>
				<Text style={styles.text} numberOfLines={1}>
					{selected}
				</Text>
				<Ionicons
					name="chevron-forward"
					size={18}
					color={theme.colors.textMuted}
				/>
			</Pressable>
			{/* bottom sheet */}
			<BottomModal visible={open} onClose={() => setOpen(false)}>
				<ModalHeader title={`Select ${label}`} onClose={() => setOpen(false)} />

				<ScrollView style={{ maxHeight: 400 }}>
					{options.map((opt) => (
						<Pressable
							key={opt.value}
							style={[
								styles.option,
								opt.value === value && {
									backgroundColor: theme.colors.primary + "20",
								},
							]}
							onPress={() => {
								onChange(opt.value);
								setOpen(false);
							}}
						>
							<Text
								style={[
									styles.optionText,
									opt.value === value && {
										color: theme.colors.primary,
										fontWeight: "600",
									},
								]}
							>
								{opt.label}
							</Text>
							{opt.value === value && (
								<Ionicons
									name="checkmark"
									size={18}
									color={theme.colors.primary}
								/>
							)}
						</Pressable>
					))}
				</ScrollView>
			</BottomModal>
		</View>
	);
}

const styles = StyleSheet.create({
	row: { marginBottom: theme.space.md },
	rowHeader: { flexDirection: "row", alignItems: "center", marginBottom: 4 },
	label: {
		fontSize: theme.fontSize.sm,
		fontWeight: "600",
		color: theme.colors.text,
	},
	button: {
		flexDirection: "row",
		justifyContent: "space-between",
		alignItems: "center",
		borderWidth: 1,
		borderColor: theme.colors.inputBorder,
		borderRadius: theme.radius.md,
		padding: theme.space.sm,
		backgroundColor: theme.colors.inputBackground,
	},
	text: { fontSize: theme.fontSize.sm, color: theme.colors.text },
	option: {
		flexDirection: "row",
		justifyContent: "space-between",
		alignItems: "center",
		paddingVertical: theme.space.md,
		paddingHorizontal: theme.space.sm,
		borderRadius: theme.radius.sm,
	},
	optionText: { fontSize: theme.fontSize.sm, color: theme.colors.text },
});
