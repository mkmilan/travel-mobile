export function profileStats(user) {
	const number = (value) => Number.isFinite(value) && value >= 0 ? value : 0;
	return {
		totalDistance: number(user.totalDistance), totalTrips: number(user.totalTrips),
		recommendationCount: number(user.totalRecommendations), followers: number(user.followersCount),
		following: number(user.followingCount), poi: number(user.totalPois),
	};
}

// Profile presentation only; do not round stored measurements or trip displays.
export const profileDistance = (meters) => {
	if (!Number.isFinite(meters) || meters < 0) return "–";
	return meters < 1000 ? `${Math.round(meters)} m` : `${(meters / 1000).toFixed(1)} km`;
};

// One bounded request per current profile/login; a failed refresh keeps the
// last confirmed data and exposes an error instead of substituting fake zeros.
export function createProfileData(load, isCurrent) {
	let state = { user: null, loading: false, error: null };
	let pending = null;
	let version = 0;
	let queuedRefresh = null;
	const listeners = new Set();
	const update = (patch) => {
		if (!isCurrent()) return;
		state = { ...state, ...patch };
		listeners.forEach((listener) => listener());
	};
	const refresh = () => {
		if (!isCurrent()) return Promise.resolve();
		if (pending) return pending;
		const requestVersion = version;
		update({ loading: true, error: null });
		pending = Promise.resolve().then(() => {
			if (isCurrent()) return load();
		}).then((user) => {
			if (!isCurrent() || requestVersion !== version) return;
			if (!user?._id) throw new Error("Invalid profile response");
			update({ user });
		}).catch((error) => { if (requestVersion === version) update({ error: error?.message || "Please try again." }); })
			.finally(() => { pending = null; update({ loading: false }); });
		return pending;
	};
	const refreshAfterChange = () => {
		// Do not publish a response captured before the mutation.
		version++;
		if (!pending) return refresh();
		if (!queuedRefresh) queuedRefresh = pending.then(() => { queuedRefresh = null; return refresh(); });
		return queuedRefresh;
	};
	return { refresh, refreshAfterChange, getSnapshot: () => state, subscribe(listener) { listeners.add(listener); return () => listeners.delete(listener); },
		updateUser(patch) { version++; if (state.user) update({ user: { ...state.user, ...patch } }); },
	};
}
