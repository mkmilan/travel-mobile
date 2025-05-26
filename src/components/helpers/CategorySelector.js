import BottomModal from "@/src/components/modals/BottomModal";
import ModalHeader from "@/src/components/modals/ModalHeader";
import { RECOMMENDATION_CATEGORIES } from "@/src/constants";
import { styles } from "@/src/styles/components/helpers/CategorySelectorStyles";
import { theme } from "@/src/theme";
import Ionicons from "@expo/vector-icons/Ionicons";
import { useState } from "react";
import { Pressable, ScrollView, Text, View } from "react-native";

export const CategorySelector = ({ selectedCategory, onCategoryChange }) => {
	const [showCategories, setShowCategories] = useState(false);

	const selectedCategoryLabel =
		RECOMMENDATION_CATEGORIES.find((cat) => cat.value === selectedCategory)
			?.label || "Select Category";

	return (
		<View>
			<Text style={styles.label}>Category</Text>
			<Pressable
				onPress={() => setShowCategories(true)}
				style={[
					styles.input,
					{
						flexDirection: "row",
						justifyContent: "space-between",
						alignItems: "center",
					},
				]}
			>
				<Text
					style={{
						color: selectedCategory
							? theme.colors.text
							: theme.colors.textMuted,
					}}
				>
					{selectedCategoryLabel}
				</Text>
				<Ionicons
					name="chevron-down"
					size={20}
					color={theme.colors.textMuted}
				/>
			</Pressable>

			<BottomModal visible={open} onClose={() => setOpen(false)}>
				<ModalHeader title="Select Category" onClose={() => setOpen(false)} />
				<ScrollView style={{ maxHeight: 300 }}>
					{RECOMMENDATION_CATEGORIES.map((category) => (
						<Pressable
							key={category.value}
							onPress={() => {
								onCategoryChange(category.value);
								setShowCategories(false);
							}}
							style={[
								styles.categoryItem,
								selectedCategory === category.value && {
									backgroundColor: theme.colors.primary + "20",
								},
							]}
						>
							<Text
								style={[
									styles.categoryItemText,
									selectedCategory === category.value && {
										color: theme.colors.primary,
										fontWeight: "600",
									},
								]}
							>
								{category.label}
							</Text>
							{selectedCategory === category.value && (
								<Ionicons
									name="checkmark"
									size={20}
									color={theme.colors.primary}
								/>
							)}
						</Pressable>
					))}
				</ScrollView>
			</BottomModal>
		</View>
	);
};
