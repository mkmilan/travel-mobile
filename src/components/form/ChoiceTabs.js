// import { theme } from "@/src/theme";
// import { Feather } from "@expo/vector-icons";
// import { Pressable, ScrollView, StyleSheet, Text } from "react-native";

// /**
//  * Props
//  *   • value        – current value
//  *   • options      – [{ label, value, icon }]
//  *   • onChange(v)
//  */
// export default function ChoiceTabs({ value, options, onChange }) {
// 	return (
// 		<ScrollView
// 			horizontal
// 			showsHorizontalScrollIndicator={false}
// 			contentContainerStyle={{ gap: theme.space.sm }}
// 			style={{ marginVertical: theme.space.sm }}
// 		>
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
// 						{opt.icon && (
// 							<Feather
// 								name={opt.icon}
// 								size={16}
// 								color={active ? theme.colors.primary : theme.colors.textMuted}
// 								style={{ marginRight: 6 }}
// 							/>
// 						)}
// 						<Text
// 							style={[
// 								styles.tabText,
// 								active && { color: theme.colors.primary, fontWeight: "600" },
// 							]}
// 							numberOfLines={1}
// 						>
// 							{opt.label}
// 						</Text>
// 					</Pressable>
// 				);
// 			})}
// 		</ScrollView>
// 	);
// }

// const styles = StyleSheet.create({
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
// 	tabText: {
// 		fontSize: theme.fontSize.xs,
// 		color: theme.colors.text,
// 	},
// });
import { theme } from "@/src/theme";
import { Feather } from "@expo/vector-icons";
import { Pressable, StyleSheet, Text, View } from "react-native";

/**
 *  value     – current selected value
 *  options   – [{ label, value, icon, customIcon }]
 *              • icon       → Feather icon name
 *              • customIcon → any React element (e.g. <TransportIcon />)
 *  onChange  – callback
 */
export default function ChoiceTabs({ value, options, onChange }) {
	return (
		<View style={styles.wrap}>
			{options.map((opt) => {
				const active = opt.value === value;
				return (
					<Pressable
						key={opt.value}
						onPress={() => onChange(opt.value)}
						style={[
							styles.tab,
							active && { backgroundColor: theme.colors.primary + "20" },
						]}
					>
						{/* icon on the left — custom element wins, else Feather */}
						{opt.customIcon
							? opt.customIcon
							: opt.icon && (
									<Feather
										name={opt.icon}
										size={16}
										color={
											active ? theme.colors.primary : theme.colors.textMuted
										}
										style={{ marginRight: 6 }}
									/>
							  )}

						<Text
							style={[
								styles.text,
								active && { color: theme.colors.primary, fontWeight: "600" },
							]}
							numberOfLines={1}
						>
							{opt.label}
						</Text>
					</Pressable>
				);
			})}
		</View>
	);
}

const styles = StyleSheet.create({
	wrap: {
		flexDirection: "row",
		flexWrap: "wrap", // 🔑 chips break into rows, no scrolling
		gap: theme.space.sm,
		marginVertical: theme.space.sm,
	},
	tab: {
		flexDirection: "row",
		alignItems: "center",
		paddingVertical: 6,
		paddingHorizontal: 12,
		borderRadius: theme.radius.full,
		backgroundColor: theme.colors.inputBackground,
		elevation: 1,
		shadowColor: "#000",
		shadowOffset: { width: 0, height: 1 },
		shadowOpacity: 0.05,
		shadowRadius: 1,
	},
	text: {
		fontSize: theme.fontSize.xs,
		color: theme.colors.text,
	},
});
