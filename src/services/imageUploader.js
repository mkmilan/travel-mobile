export async function uploadImage(localUri, contextType = "trip", id = "") {
	// Step 1: prepare multipart form
	const form = new FormData();
	form.append("image", {
		uri: localUri,
		name: `upload.jpg`,
		type: "image/jpeg",
	});
	form.append("context", contextType);
	form.append("id", id);

	// Step 2: send to server
	const res = await fetch("https://your-api.com/api/uploads", {
		method: "POST",
		headers: {
			Authorization: `Bearer ${token}`,
		},
		body: form,
	});

	const data = await res.json();
	return data.url; // or ID
}
