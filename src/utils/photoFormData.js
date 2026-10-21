import { File } from 'expo-file-system';

/** Expo SDK 56+ fetch requires Blob/File parts, not React Native { uri } parts. */
export async function createPhotoFormData(field, localUri) {
  if (typeof localUri !== 'string' || !/^(file|content):\/\//i.test(localUri)) {
    throw new Error('Photo upload requires a local file or content URI');
  }
  const rawName = localUri.split('/').pop()?.split(/[?#]/)[0] || 'photo.jpg';
  const filename = rawName.replace(/[\r\n"\\]/g, '_');
  const ext = filename.match(/\.([a-z0-9]+)$/i)?.[1]?.toLowerCase();
  const types = { jpg: 'image/jpeg', jpeg: 'image/jpeg', png: 'image/png', gif: 'image/gif', webp: 'image/webp', heic: 'image/heic', heif: 'image/heif' };
  // Expo's multipart encoder accepts File.bytes() directly. Do not construct a
  // global Blob from Uint8Array: React Native's Blob still rejects typed arrays.
  class PhotoFile extends File {
    get name() { return filename; }
    get type() { return types[ext] || super.type || 'image/jpeg'; }
  }
  const form = new FormData();
  form.append(field, new PhotoFile(localUri));
  return form;
}
