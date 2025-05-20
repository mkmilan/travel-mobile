// // Very small helpers – adjust regex to mirror your backend rules

// export const isEmail = (value) => /^\S+@\S+\.\S+$/.test(value.trim());

// export const isUsername = (value) => /^[a-zA-Z0-9_]{3,20}$/.test(value.trim()); // 3–20 chars, letters/digits/_

// export const isStrongPassword = (value) => value.length >= 6; // add more rules if needed

export const usernameRule = "3-20 letters, numbers or _";
export const passwordRule = "≥ 8 chars, incl. 1 number";

export const validateUsername = (v) =>
	/^[a-zA-Z0-9_]{3,20}$/.test(v.trim())
		? null
		: `Username must be ${usernameRule}`;

export const validateEmail = (v) =>
	/^\S+@\S+\.\S+$/.test(v.trim()) ? null : "Enter a valid e-mail";

export const validatePassword = (v) =>
	/^(?=.*\d).{8,}$/.test(v) ? null : `Password must be ${passwordRule}`;
