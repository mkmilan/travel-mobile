import { useAuthStore } from "@/src/stores/auth";

const METERS_PER_MILE = 1609.344;
const isMeasurement = (value) => Number.isFinite(value) && value >= 0;
const viewerUnits = () => useAuthStore.getState().user?.settings?.preferredUnits || "metric";

export const metersToKm = (m) => (isMeasurement(m) && m ? (m / 1000).toFixed(1) : "–");
export const metersToMiles = (m) => (isMeasurement(m) && m ? (m / METERS_PER_MILE).toFixed(1) : "–");

// Explicit units keep render-time conversions pure. The omitted-argument
// fallback supports existing callers; rendered statistics subscribe separately.
export const kmOrMiles = (meters, units = viewerUnits()) => {
	if (!isMeasurement(meters)) return "–";
	return units === "imperial"
		? `${(meters / METERS_PER_MILE).toFixed(1)} mi`
		: `${(meters / 1000).toFixed(1)} km`;
};

export const speedUnit = (units) => units === "imperial" ? "mph" : "km/h";

export const msToDuration = (ms) => {
	if (!isMeasurement(ms) || !ms) return "–";
	const totalMin = Math.round(ms / 60000);
	const h = Math.floor(totalMin / 60);
	const m = totalMin % 60;
	return h ? `${h}h ${m}m` : `${m}m`;
};

export const calcAvgSpeed = (meters, ms, units = viewerUnits()) => {
	// Retain the existing unavailable-speed fallback for zero distance/duration.
	if (!isMeasurement(meters) || !isMeasurement(ms) || !meters || !ms) return "–";
	const hours = ms / 3_600_000;
	const distance = meters / (units === "imperial" ? METERS_PER_MILE : 1000);
	const speed = distance / hours;
	return Number.isFinite(speed) ? speed.toFixed(1) : "–";
};

export const isoToDate = (iso) =>
	iso ? new Date(iso).toLocaleDateString() : "";
