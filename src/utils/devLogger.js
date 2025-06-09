/*  utils/devLogger.js  */
export const devLog = (...args) => {
	if (__DEV__) {
		// only in development builds
		// eslint-disable-next-line no-console
		console.log("[DEV]", ...args);
	}
};
