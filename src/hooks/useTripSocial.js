// hooks/useTripSocial.js
import { useTripSocialStore } from "@/src/stores/tripSocialStore";
import React from "react";

/**
 * Central social state hook.
 * Always calls the same number of React-hooks on every render
 * (even when trip is null) so no DevTools warnings.
 */
export default function useTripSocial(trip) {
	const { primeCounts, toggleLike, loadLikers, loadComments, addComment, loadRecommendations, ...data } =
		useTripSocialStore();

	/* ------------------------------------------------------------ */
	/* run once per trip to cache the initial counts                */
	/* ------------------------------------------------------------ */
	React.useEffect(() => {
		if (trip && trip._id) {
			primeCounts(trip);
		}
	}, [primeCounts, trip?._id]); //  **ALWAYS length-2**

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
	const state = data.trips?.[trip._id] ?? {};

	return {
		/* counts */
		likesCount: state.likesCount ?? trip.likesCount,
		commentsCount: state.commentsCount ?? trip.commentsCount,
		recommendationCount: state.recommendationCount ?? trip.recommendationCount,
		isLiked: state.isLikedByCurrentUser ?? trip.isLikedByCurrentUser,

		/* actions */
		toggleLike: () => toggleLike(trip._id),
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
