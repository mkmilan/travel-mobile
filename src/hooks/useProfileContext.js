import { useEffect, useRef, useState } from "react";
import { useAuthStore } from "@/src/stores/auth";

// UI completions must belong to the same profile AND login, including a
// logout/login cycle that reuses the same token. Tokens never enter React keys.
export default function useProfileContext(key) {
	const token = useAuthStore((state) => state.token);
	const userId = useAuthStore((state) => state.user?._id);
	const [, setRevision] = useState(0);
	const active = useRef(null);
	const mounted = useRef(true);
	if (!active.current || !active.current.valid || active.current.key !== key || active.current.token !== token || active.current.userId !== userId) {
		active.current = { key, token, userId, valid: true };
	}
	const context = active.current;
	useEffect(() => {
		mounted.current = true;
		const unsubscribe = useAuthStore.subscribe((next, previous) => {
			if (next.token !== previous.token || next.user?._id !== previous.user?._id) {
				active.current.valid = false;
				setRevision((value) => value + 1);
			}
		});
		return () => { mounted.current = false; unsubscribe(); };
	}, []);
	context.isCurrent = () => {
		const state = useAuthStore.getState();
		return mounted.current && active.current === context && context.valid && !!context.token && !!context.userId
			&& state.token === context.token && state.user?._id === context.userId;
	};
	return context;
}
