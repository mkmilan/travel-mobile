import { useEffect, useRef, useState } from "react";
import { useAuthStore } from "@/src/stores/auth";

// UI completions must belong to the same profile AND login, including a
// logout/login cycle that reuses the same token. Tokens never enter React keys.
export default function useProfileContext(key) {
	const token = useAuthStore((state) => state.token);
	const userId = useAuthStore((state) => state.user?._id);
	const sessionEpoch = useAuthStore((state) => state.sessionEpoch);
	const isSessionChanging = useAuthStore((state) => state.isSessionChanging);
	const [, setRevision] = useState(0);
	const active = useRef(null);
	const mounted = useRef(true);
	if (!active.current || !active.current.valid || active.current.key !== key || active.current.token !== token || active.current.userId !== userId || active.current.sessionEpoch !== sessionEpoch || active.current.isSessionChanging !== isSessionChanging) {
		active.current = { key, token, userId, sessionEpoch, isSessionChanging, valid: true };
	}
	const context = active.current;
	useEffect(() => {
		mounted.current = true;
		const unsubscribe = useAuthStore.subscribe((next, previous) => {
			if (next.token !== previous.token || next.user?._id !== previous.user?._id || next.sessionEpoch !== previous.sessionEpoch || next.isSessionChanging !== previous.isSessionChanging) {
				active.current.valid = false;
				setRevision((value) => value + 1);
			}
		});
		return () => { mounted.current = false; unsubscribe(); };
	}, []);
	// A mutation can settle after its sheet closes. Its same-session cache
	// invalidation must survive that UI lifetime, but never a new login epoch.
	context.isSessionCurrent = () => {
		const state = useAuthStore.getState();
		return !!context.token && !!context.userId && !context.isSessionChanging && !state.isSessionChanging
			&& state.token === context.token && state.user?._id === context.userId && state.sessionEpoch === context.sessionEpoch;
	};
	context.isCurrent = () => mounted.current && active.current === context && context.valid && context.isSessionCurrent();
	return context;
}
