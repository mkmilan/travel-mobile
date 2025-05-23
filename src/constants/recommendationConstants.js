export const RECOMMENDATION_CATEGORIES = [
	{ value: "CAMPSITE", label: "Campsite" },
	{ value: "AIRE", label: "Aire/Service Area" },
	{ value: "WILD_SPOT", label: "Wild Spot" },
	{ value: "PARKING", label: "Parking" },
	{ value: "RESTAURANT", label: "Restaurant" },
	{ value: "CAFE", label: "Cafe" },
	{ value: "SUPERMARKET", label: "Supermarket" },
	{ value: "SERVICE_POINT", label: "Service Point (Water/Waste)" },
	{ value: "LANDMARK", label: "Landmark/Viewpoint" },
	{ value: "ACTIVITY", label: "Activity/Attraction" },
	{ value: "OTHER", label: "Other" },
];

export const RECOMMENDATION_TAGS = [
	// Amenities
	{ value: "WATER_FILL", label: "Water Fill" },
	{ value: "GREY_WATER_DISPOSAL", label: "Grey Water Disposal" },
	{ value: "BLACK_WATER_DISPOSAL", label: "Black Water Disposal" },
	{ value: "TOILETS", label: "Toilets" },
	{ value: "SHOWERS", label: "Showers" },
	{ value: "LAUNDRY", label: "Laundry" },
	{ value: "ELECTRICITY", label: "Electricity Hookup" },
	{ value: "WIFI", label: "WiFi Available" },
	{ value: "LPG_SWAP", label: "LPG Swap/Fill" },
	// Suitability
	{ value: "PET_FRIENDLY", label: "Pet Friendly" },
	{ value: "FAMILY_FRIENDLY", label: "Family Friendly" },
	{ value: "ACCESSIBLE", label: "Wheelchair Accessible" },
	// Cost
	{ value: "FREE", label: "Free" },
	{ value: "LOW_COST", label: "Low Cost" },
	// Environment/Features
	{ value: "SCENIC", label: "Scenic Views" },
	{ value: "QUIET", label: "Quiet Location" },
	{ value: "SECURE", label: "Feels Secure" },
	{ value: "NEAR_BEACH", label: "Near Beach" },
	{ value: "HIKING_NEARBY", label: "Hiking Nearby" },
	{ value: "PLAYGROUND", label: "Playground" },
	{ value: "POOL", label: "Swimming Pool" },
];

// Helper function to get the label for a recommendation category value
export const getRecommendationCategoryLabel = (value) => {
	return (
		RECOMMENDATION_CATEGORIES.find((cat) => cat.value === value)?.label || value
	);
};

// Helper function to get the label for a recommendation tag value
export const getRecommendationTagLabel = (value) => {
	return RECOMMENDATION_TAGS.find((tag) => tag.value === value)?.label || value;
};
