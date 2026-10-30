// hooks/useTripSocial.js
import { getSocialSessionScope, useTripSocialStore } from "@/src/stores/tripSocialStore";
import React from "react";
import { useAuthStore } from "@/src/stores/auth";

/**
 * Central social state hook.
 * Always calls the same number of React-hooks on every render
 * (even when trip is null) so no DevTools warnings.
 */
export default function useTripSocial(trip, primeOnMount = true) {
	useAuthStore(state => state.token);
	useAuthStore(state => state.user?._id);
	useAuthStore(state => state.sessionEpoch);
	const isSessionChanging = useAuthStore(state => state.isSessionChanging);
	const scope = getSocialSessionScope();
	const { primeCounts, toggleLike, loadLikers, loadComments, addComment, loadRecommendations, ...data } =
		useTripSocialStore();

	/* ------------------------------------------------------------ */
	/* run once per trip to cache the initial counts                */
	/* ------------------------------------------------------------ */
	React.useEffect(() => {
		if (primeOnMount && trip && trip._id) {
			primeCounts(trip);
		}
	}, [primeCounts, trip?._id, scope, primeOnMount]); // Stable trip/session identities only.

	/* ------------------------------------------------------------ */
	/* if no trip yet (sheet closed) → return inert API             */
	/* ------------------------------------------------------------ */
	if (!trip || !trip._id) {
		const noop = () => {};
		return {
			likesCount: 0,
			commentsCount: 0,
			recommendationCount: 0,
			isLiked: false,
			likePending: false,

			toggleLike: noop,
			loadLikers: noop,
			loadComments: noop,
			addComment: noop,
			loadRecommendations: noop,

			likers: [],
			comments: [],
			recommendations: [],
		};
	}

	/* ------------------------------------------------------------ */
	/* normal path                                                  */
	/* ------------------------------------------------------------ */
	const cached = data.trips?.[trip._id];
	const state = cached?.session === scope ? cached : {};

	return {
		/* counts */
		likesCount: state.likesCount ?? trip.likesCount,
		commentsCount: state.commentsCount ?? trip.commentsCount,
		recommendationCount: state.recommendationCount ?? trip.recommendationCount,
		isLiked: state.isLikedByCurrentUser ?? trip.isLikedByCurrentUser,
		likePending: !!state.likePending || !!isSessionChanging,

		/* actions */
		toggleLike: () => { if (scope === getSocialSessionScope()) return toggleLike(trip._id); },
		loadLikers: () => loadLikers(trip._id),
		loadComments: () => loadComments(trip._id),
		addComment: (t) => addComment(trip._id, t),
		loadRecommendations: () => loadRecommendations(trip._id),

		/* lists */
		likers: state.likers,
		comments: state.comments,
		recommendations: state.recommendations,
	};
}
