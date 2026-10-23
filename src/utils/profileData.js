export function profileStats(user) {
	const number = (value) => Number.isFinite(value) && value >= 0 ? value : 0;
	return {
		totalDistance: number(user.totalDistance), totalTrips: number(user.totalTrips),
		recommendationCount: number(user.totalRecommendations), followers: number(user.followersCount),
		following: number(user.followingCount), poi: number(user.totalPois),
	};
}

export const profileDistance = (meters) => `${Number((meters / 1000).toFixed(3))} km`;

// One bounded request per current profile/login; a failed refresh keeps the
// last confirmed data and exposes an error instead of substituting fake zeros.
export function createProfileData(load, isCurrent) {
	let state = { user: null, loading: false, error: null };
	let pending = null;
	const listeners = new Set();
	const update = (patch) => {
		if (!isCurrent()) return;
		state = { ...state, ...patch };
		listeners.forEach((listener) => listener());
	};
	const refresh = () => {
		if (!isCurrent()) return Promise.resolve();
		if (pending) return pending;
		update({ loading: true, error: null });
		pending = Promise.resolve().then(() => {
			if (isCurrent()) return load();
		}).then((user) => {
			if (!isCurrent()) return;
			if (!user?._id) throw new Error("Invalid profile response");
			update({ user });
		}).catch((error) => update({ error: error?.message || "Please try again." }))
			.finally(() => { pending = null; update({ loading: false }); });
		return pending;
	};
	return { refresh, getSnapshot: () => state, subscribe(listener) { listeners.add(listener); return () => listeners.delete(listener); },
		updateUser(patch) { if (state.user) update({ user: { ...state.user, ...patch } }); },
	};
}
