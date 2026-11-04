/** Fetch completely before handing the file to the browser; failures must reach the button. */
export async function fetchDownloadBlob(url: string): Promise<Blob> {
  const response = await fetch(url);
  if (!response.ok) throw new Error("File could not be downloaded");
  const blob = await response.blob();
  if (!blob.size) throw new Error("The downloaded file is empty");
  return blob;
}

export async function downloadFile(url: string, filename: string): Promise<void> {
  const blob = await fetchDownloadBlob(url);
  const objectUrl = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = objectUrl;
  link.download = filename;
  link.rel = "noopener";
  document.body.appendChild(link);
  link.click();
  link.remove();
  setTimeout(() => URL.revokeObjectURL(objectUrl), 30_000);
}