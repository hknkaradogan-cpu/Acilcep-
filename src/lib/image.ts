/** Shrinks a photo in the browser (max 1600px, JPEG) to save storage and mobile data. */
export async function compressImage(file: File, maxSize = 1600, quality = 0.82): Promise<Blob> {
  if (!file.type.startsWith('image/')) throw new Error('Please choose an image file.');
  try {
    const bitmap = await createImageBitmap(file);
    const scale = Math.min(1, maxSize / Math.max(bitmap.width, bitmap.height));
    const canvas = document.createElement('canvas');
    canvas.width = Math.round(bitmap.width * scale);
    canvas.height = Math.round(bitmap.height * scale);
    canvas.getContext('2d')!.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
    const blob = await new Promise<Blob | null>((res) => canvas.toBlob(res, 'image/jpeg', quality));
    if (blob) return blob;
  } catch {
    /* fall back to the original file */
  }
  if (file.size > 5 * 1024 * 1024) throw new Error('Photo is larger than 5 MB.');
  return file;
}
