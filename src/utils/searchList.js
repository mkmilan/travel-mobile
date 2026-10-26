// One active query/tab/category/login owns this list. Debounce, pagination and
// refocus share a request lock; obsolete completions never enter another list.
export function createSearchList({ loadPage, isCurrent, enabled, delay = 400 }) {
	let state = { items: [], loaded: !enabled, loading: false, refreshing: false, error: null, hasMore: false, refreshIdentity: null };
	let active = false, timer = null, pending = null, queuedRefresh = null, generation = 0, pages = 0, failedAttempt = null;
	const listeners = new Set();
	const update = (patch) => { state = { ...state, ...patch }; listeners.forEach(listener => listener()); };
	const cancelTimer = () => { if (timer !== null) clearTimeout(timer); timer = null; };
	const current = () => active && enabled && isCurrent();
	const unique = (items) => {
		const byId = new Map();
		items.forEach(item => byId.set(item._id, item));
		return [...byId.values()];
	};
	const request = (attempt) => {
		cancelTimer();
		if (!current()) return Promise.resolve();
		if (pending) return pending;
		const version = generation;
		const accepts = () => current() && version === generation;
		update({ loading: true, refreshing: attempt.replace && pages > 0, error: null });
		pending = Promise.resolve().then(async () => {
			let items = [], lastPage = attempt.page, hasMore = false;
			// Revalidate every loaded page on return, preserving pagination. Apply
			// together, so an intermediate page cannot flash a false empty result.
			for (let page = attempt.page; page <= attempt.through; page++) {
				if (!accepts()) return;
				const result = await loadPage(page);
				if (!accepts()) return;
				if (!Array.isArray(result?.results) || typeof result.hasMore !== "boolean") throw new Error("Invalid search response");
				items.push(...result.results);
				lastPage = page;
				hasMore = result.hasMore;
				if (!hasMore) break;
			}
			if (!accepts()) return;
			pages = lastPage;
			failedAttempt = null;
			update({ items: unique(attempt.replace ? items : [...state.items, ...items]), loaded: true, hasMore,
				refreshIdentity: attempt.replace ? {} : state.refreshIdentity });
		}).catch(error => {
			if (!accepts()) return;
			failedAttempt = attempt;
			update({ loaded: true, error: error?.message || "Please try again." });
		}).finally(() => {
			if (version !== generation) return;
			pending = null;
			if (current()) update({ loading: false, refreshing: false });
		});
		return pending;
	};
	const first = () => {
		if (pending) {
			const version = generation;
			if (!queuedRefresh) queuedRefresh = pending.then(() => {
				if (version !== generation || !current()) return;
				queuedRefresh = null;
				return first();
			});
			return queuedRefresh;
		}
		return request({ page: 1, through: Math.max(1, pages), replace: true });
	};
	return {
		getSnapshot: () => state,
		subscribe(listener) { listeners.add(listener); return () => listeners.delete(listener); },
		activate() {
			active = true;
			if (!current()) return;
			if (state.loaded) { void first(); return; }
			update({ loading: true });
			timer = setTimeout(() => { timer = null; void first(); }, delay);
		},
		deactivate() {
			active = false;
			cancelTimer();
			generation++;
			pending = null;
			queuedRefresh = null;
			update({ loading: false, refreshing: false });
		},
		submit: () => pending || (failedAttempt ? request(failedAttempt) : state.loaded ? Promise.resolve() : first()),
		retry: () => request(failedAttempt || { page: 1, through: Math.max(1, pages), replace: true }),
		refresh: first,
		loadMore: () => pending || (!state.loaded || !state.hasMore || state.error ? Promise.resolve() : request({ page: pages + 1, through: pages + 1, replace: false })),
	};
}
