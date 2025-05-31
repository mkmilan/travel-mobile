// components/TripCardContainer.js
import useTripSocial from "@/src/hooks/useTripSocial";
import { calcAvgSpeed, isoToDate, kmOrMiles, msToDuration } from "@/src/utils/format";
import { lineStringToCoords } from "@/src/utils/geo";
import TripCard from "./TripCard";

/**
 * Wraps the dumb <TripCard/> with formatted numbers
 * and the shared social-state actions.
 */
export default function TripCardContainer({ trip, onOpenSheet, onPress, userNameOverride }) {
	const { likesCount, commentsCount, recommendationCount, isLiked, toggleLike } = useTripSocial(trip);

	/* ---- format everything exactly like the old page did ---- */
	const distanceLabel = kmOrMiles(trip.distanceMeters);
	const durationLabel = msToDuration(trip.durationMillis);
	const avgSpeedLabel = calcAvgSpeed(trip.distanceMeters, trip.durationMillis);
	const coords = lineStringToCoords(trip.simplifiedRoute);

	const displayUser = userNameOverride || trip?.user?.username || "Unknown User";

	return (
		<TripCard
			/* static trip info */
			tripId={trip._id}
			title={trip.title}
			userName={displayUser}
			visibility={trip.defaultTripVisibility}
			description={trip.description}
			date={isoToDate(trip.startDate)}
			distanceKm={distanceLabel}
			durationStr={durationLabel}
			avgSpeed={avgSpeedLabel}
			travelMode={trip.defaultTravelMode}
			coords={coords}
			/* live counts */
			likes={likesCount}
			comments={commentsCount}
			recommendationsCount={recommendationCount}
			isLikedByCurrentUser={isLiked}
			/* actions */
			onLikePress={toggleLike}
			onOpenLikersModalPress={() => onOpenSheet("likers", trip)}
			onCommentPress={() => onOpenSheet("comments", trip)}
			onRecommendPress={() => onOpenSheet("recs", trip)}
			onSharePress={(id) => console.log("share trip id:", id)}
			onPress={onPress}
		/>
	);
}
