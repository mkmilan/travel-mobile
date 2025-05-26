// // import { theme } from "@/src/theme";
// // import { Feather } from "@expo/vector-icons";
// // import { Pressable, ScrollView, StyleSheet, Text } from "react-native";

// // /**
// //  * Props
// //  *   • value        – current value
// //  *   • options      – [{ label, value, icon }]
// //  *   • onChange(v)
// //  */
// // export default function ChoiceTabs({ value, options, onChange }) {
// // 	return (
// // 		<ScrollView
// // 			horizontal
// // 			showsHorizontalScrollIndicator={false}
// // 			contentContainerStyle={{ gap: theme.space.sm }}
// // 			style={{ marginVertical: theme.space.sm }}
// // 		>
// // 			{options.map((opt) => {
// // 				const active = opt.value === value;
// // 				return (
// // 					<Pressable
// // 						key={opt.value}
// // 						onPress={() => onChange(opt.value)}
// // 						style={[
// // 							styles.tab,
// // 							active && { backgroundColor: theme.colors.primary + "20" },
// // 						]}
// // 					>
// // 						{opt.icon && (
// // 							<Feather
// // 								name={opt.icon}
// // 								size={16}
// // 								color={active ? theme.colors.primary : theme.colors.textMuted}
// // 								style={{ marginRight: 6 }}
// // 							/>
// // 						)}
// // 						<Text
// // 							style={[
// // 								styles.tabText,
// // 								active && { color: theme.colors.primary, fontWeight: "600" },
// // 							]}
// // 							numberOfLines={1}
// // 						>
// // 							{opt.label}
// // 						</Text>
// // 					</Pressable>
// // 				);
// // 			})}
// // 		</ScrollView>
// // 	);
// // }

// // const styles = StyleSheet.create({
// // 	tab: {
// // 		flexDirection: "row",
// // 		alignItems: "center",
// // 		paddingVertical: 6,
// // 		paddingHorizontal: 12,
// // 		borderRadius: theme.radius.full,
// // 		backgroundColor: theme.colors.inputBackground,
// // 		elevation: 1,
// // 		shadowColor: "#000",
// // 		shadowOffset: { width: 0, height: 1 },
// // 		shadowOpacity: 0.05,
// // 		shadowRadius: 1,
// // 	},
// // 	tabText: {
// // 		fontSize: theme.fontSize.xs,
// // 		color: theme.colors.text,
// // 	},
// // });
// import { theme } from "@/src/theme";
// import { Feather } from "@expo/vector-icons";
// import { Pressable, StyleSheet, Text, View } from "react-native";

// /**
//  *  value     – current selected value
//  *  options   – [{ label, value, icon, customIcon }]
//  *              • icon       → Feather icon name
//  *              • customIcon → any React element (e.g. <TransportIcon />)
//  *  onChange  – callback
//  */
// export default function ChoiceTabs({ value, options, onChange }) {
// 	return (
// 		<View style={styles.wrap}>
// 			{options.map((opt) => {
// 				const active = opt.value === value;
// 				return (
// 					<Pressable
// 						key={opt.value}
// 						onPress={() => onChange(opt.value)}
// 						style={[
// 							styles.tab,
// 							active && { backgroundColor: theme.colors.primary + "20" },
// 						]}
// 					>
// 						{/* icon on the left — custom element wins, else Feather */}
// 						{opt.customIcon
// 							? opt.customIcon
// 							: opt.icon && (
// 									<Feather
// 										name={opt.icon}
// 										size={16}
// 										color={
// 											active ? theme.colors.primary : theme.colors.textMuted
// 										}
// 										style={{ marginRight: 6 }}
// 									/>
// 							  )}

// 						<Text
// 							style={[
// 								styles.text,
// 								active && { color: theme.colors.primary, fontWeight: "600" },
// 							]}
// 							numberOfLines={1}
// 						>
// 							{opt.label}
// 						</Text>
// 					</Pressable>
// 				);
// 			})}
// 		</View>
// 	);
// }

// const styles = StyleSheet.create({
// 	wrap: {
// 		flexDirection: "row",
// 		flexWrap: "wrap", // 🔑 chips break into rows, no scrolling
// 		gap: theme.space.sm,
// 		marginVertical: theme.space.sm,
// 	},
// 	tab: {
// 		flexDirection: "row",
// 		alignItems: "center",
// 		paddingVertical: 6,
// 		paddingHorizontal: 12,
// 		borderRadius: theme.radius.full,
// 		backgroundColor: theme.colors.inputBackground,
// 		elevation: 1,
// 		shadowColor: "#000",
// 		shadowOffset: { width: 0, height: 1 },
// 		shadowOpacity: 0.05,
// 		shadowRadius: 1,
// 	},
// 	text: {
// 		fontSize: theme.fontSize.xs,
// 		color: theme.colors.text,
// 	},
// });
/**
 * ChoiceTabs – small “card” variant (profile-stat style)
 *
 * props
 * ───────────────────────────────────────────────────────────
 * value           currently-selected value  (string)
 * options         [{ label, value, icon?, customIcon? }]
 * onChange(v)     callback
 * size            "md" | "sm"      (defaults to md)
 *
 * NOTE: selected text keeps         theme.colors.text
 *       selected border/background  theme.colors.primary + '15'
 */
import { theme } from "@/src/theme";
import Feather from "@expo/vector-icons/Feather";
import { StyleSheet, Text, TouchableOpacity, View } from "react-native";

export default function ChoiceTabs({
	value,
	options = [],
	onChange = () => {},
	size = "md",
	iconRenderer, // optional custom renderer
}) {
	const isSm = size === "sm";

	return (
		<View style={styles.row /* ← now flex-wrap */}>
			{options.map((opt) => {
				const selected = opt.value === value;

				return (
					<TouchableOpacity
						key={opt.value}
						onPress={() => onChange(opt.value)}
						style={[styles.tab, isSm && styles.tabSm, selected && styles.tabSelected]}
						activeOpacity={0.8}
					>
						{/* icon ------------------------------------------------- */}
						{opt.customIcon ? (
							opt.customIcon
						) : opt.icon ? (
							iconRenderer ? (
								iconRenderer(opt.icon, selected ? theme.colors.text : theme.colors.textMuted)
							) : (
								<Feather
									name={opt.icon}
									size={isSm ? 14 : 16}
									color={selected ? theme.colors.text : theme.colors.textMuted}
									style={{ marginRight: 6 }}
								/>
							)
						) : null}

						{/* label ------------------------------------------------ */}
						<Text
							style={[
								styles.lbl,
								isSm && styles.lblSm,
								{ color: theme.colors.text }, // ← always dark text
							]}
							numberOfLines={1}
						>
							{opt.label}
						</Text>
					</TouchableOpacity>
				);
			})}
		</View>
	);
}

/* -------------------------------------------------------------------- */
const base = theme; // alias

const styles = StyleSheet.create({
	row: { flexDirection: "row", flexWrap: "wrap", gap: base.space.sm },
	tab: {
		flexDirection: "row",
		alignItems: "center",
		paddingHorizontal: base.space.md + 2,
		paddingVertical: base.space.sm + 2,
		backgroundColor: base.colors.background,
		borderWidth: 1,
		borderColor: base.colors.background,
		borderRadius: base.radius.md,
		shadowColor: "#000",
		shadowOffset: { width: 0, height: 1 },
		shadowOpacity: 0.05,
		shadowRadius: 2,
		elevation: 1,
	},
	tabSm: {
		paddingHorizontal: base.space.sm,
		paddingVertical: base.space.xs + 2,
		borderRadius: base.radius.sm,
		backgroundColor: base.colors.inputBackground,
	},
	tabSelected: {
		backgroundColor: base.colors.primary + "35",
		borderColor: base.colors.primary + "35",
		shadowColor: "#000",
		shadowOffset: { width: 0, height: 0 },
		shadowOpacity: 0,
		shadowRadius: 0,
		elevation: 0,
	},
	lbl: { fontSize: base.fontSize.sm, fontWeight: "500" },
	lblSm: { fontSize: base.fontSize.xs },
});
