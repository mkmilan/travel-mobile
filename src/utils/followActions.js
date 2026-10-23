// Shared by the existing people list and the profile's missing follow control.
// Writes are single-flight per target; reads reconcile failures without ever
// automatically retrying a potentially committed mutation.
export function createFollowActions({ context, follow, unfollow, onChange, reconcile, getFollowing }) {
	let state = { pending: {}, error: null };
	const listeners = new Set();
	const update = (patch) => {
		if (!context.isCurrent()) return;
		state = { ...state, ...patch };
		listeners.forEach((listener) => listener());
	};
	return {
		getSnapshot: () => state,
		subscribe(listener) { listeners.add(listener); return () => listeners.delete(listener); },
		async toggle(userId, isFollowing) {
			if (!context.isCurrent() || userId === context.userId || state.pending[userId]) return;
			const following = !(getFollowing?.(userId) ?? isFollowing);
			update({ pending: { ...state.pending, [userId]: true }, error: null });
			try {
				await (following ? follow : unfollow)(userId);
				if (!context.isCurrent()) return;
				await onChange(userId, following);
			} catch (error) {
				if (!context.isCurrent()) return;
				// A lost response is ambiguous: expose the error and GET status. Do
				// not send another POST/DELETE until the user explicitly retries.
				update({ error: `Could not update follow status: ${error?.message || "Please try again."}` });
				try { await reconcile?.(); } catch { /* read failure stays recoverable */ }
			} finally {
				if (context.isCurrent()) {
					const pending = { ...state.pending }; delete pending[userId]; update({ pending });
				}
			}
		},
	};
}

export const followsUser = (user, actorId) => typeof user.isFollowing === "boolean"
	? user.isFollowing : !!user.followers?.some((id) => String(id?._id || id) === String(actorId));
