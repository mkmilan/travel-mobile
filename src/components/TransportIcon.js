import { Feather, FontAwesome5 } from "@expo/vector-icons";

const iconMap = {
	motorhome: { lib: FontAwesome5, name: "caravan" },
	campervan: { lib: FontAwesome5, name: "campground" },
	car: { lib: Feather, name: "truck" },
	motorcycle: { lib: Feather, name: "activity" },
	bicycle: { lib: Feather, name: "map-pin" },
	walking: { lib: Feather, name: "navigation" },
};

export default function TransportIcon({ mode, color = "#666", size = 16 }) {
	const cfg = iconMap[mode] || iconMap.motorhome;
	const Icon = cfg.lib;
	return (
		<Icon
			name={cfg.name}
			color={color}
			size={size}
		/>
	);
}
