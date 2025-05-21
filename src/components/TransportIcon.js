import { theme } from "@/src/theme";
import { FontAwesome5, MaterialCommunityIcons } from "@expo/vector-icons";

const map = {
	motorhome: { lib: MaterialCommunityIcons, name: "rv-truck" }, // front-view RV
	campervan: { lib: FontAwesome5, name: "caravan" },
	car: { lib: FontAwesome5, name: "car" },
	motorcycle: { lib: FontAwesome5, name: "motorcycle" },
	bicycle: { lib: FontAwesome5, name: "bicycle" },
	walking: { lib: FontAwesome5, name: "walking" },
};

export default function TransportIcon({
	mode = "motorhome",
	size = 18,
	color = theme.colors.textMuted,
	style = {},
}) {
	const cfg = map[mode] || map.motorhome;
	const Icon = cfg.lib;
	return (
		<Icon
			name={cfg.name}
			size={size}
			color={color}
			style={style}
		/>
	);
}
