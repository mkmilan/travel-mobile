import { theme } from "@/src/theme";
import { showMessage } from "react-native-flash-message";

export const toast = ({ type = "info", title, msg }) => {
	showMessage({
		message: title, // bold line
		description: msg, // small line (optional)
		type, // "success" | "danger" | "warning" | "info"
		backgroundColor:
			type === "success"
				? theme.colors.primary
				: type === "danger"
				? "#D14343"
				: theme.colors.secondary,
	});
};
