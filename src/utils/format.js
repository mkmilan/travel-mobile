import { useAuthStore } from "@/src/stores/auth";

export const metersToKm = (m) => (m ? (m / 1000).toFixed(1) : "–");
export const metersToMiles = (m) => (m ? (m / 1609.34).toFixed(1) : "–");

export const kmOrMiles = (meters) => {
	const units =
		useAuthStore.getState().user?.settings?.preferredUnits || "metric";
	return units === "imperial"
		? `${(meters / 1609).toFixed(1)} mi`
		: `${(meters / 1000).toFixed(1)} km`;
};

export const msToDuration = (ms) => {
	if (!ms) return "–";
	const totalMin = Math.round(ms / 60000);
	const h = Math.floor(totalMin / 60);
	const m = totalMin % 60;
	return h ? `${h}h ${m}m` : `${m}m`;
};

export const calcAvgSpeed = (meters, ms) => {
	if (!meters || !ms) return "–";
	const hours = ms / 3_600_000;
	const km = meters / 1000;
	return (km / hours).toFixed(1);
};

export const isoToDate = (iso) =>
	iso ? new Date(iso).toLocaleDateString() : "";
