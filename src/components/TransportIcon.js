import { theme } from "@/src/theme";
import { FontAwesome5, Ionicons, MaterialCommunityIcons } from "@expo/vector-icons";

// const map = {
// 	motorhome: { lib: MaterialCommunityIcons, name: "rv-truck" },
// 	campervan: { lib: FontAwesome5, name: "caravan" },
// 	car: { lib: MaterialCommunityIcons, name: "car-outline" },
// 	motorcycle: { lib: FontAwesome5, name: "motorcycle" },
// 	bicycle: { lib: FontAwesome5, name: "bicycle" },
// 	walking: { lib: MaterialCommunityIcons, name: "walk" },
// };
const map = {
	motorhome: { lib: MaterialCommunityIcons, name: "rv-truck" },
	campervan: { lib: FontAwesome5, name: "caravan" },
	car: { lib: Ionicons, name: "car-outline" }, // good
	motorcycle: { lib: FontAwesome5, name: "motorcycle" }, // or FontAwesome5, name: "motorcycle" if style is acceptable
	bicycle: { lib: Ionicons, name: "bicycle-outline" }, // good
	walking: { lib: Ionicons, name: "walk-outline" },
};

export default function TransportIcon({ mode = "motorhome", size = 18, color = theme.colors.textMuted, style = {} }) {
	const cfg = map[mode] || map.motorhome;
	const Icon = cfg.lib;
	return <Icon name={cfg.name} size={size} color={color} style={style} />;
}
