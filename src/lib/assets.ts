/**
 * Utility for resolving Directus assets via internal Next.js proxy route.
 * Prevents exposing internal Directus hostnames and ports in client-side HTML/DOM.
 */

export function extractAssetId(imageVal: string | null | undefined): string | null {
  if (!imageVal || typeof imageVal !== "string") return null;
  const trimmed = imageVal.trim();
  if (!trimmed) return null;

  // Extract UUID if present
  const uuidMatch = trimmed.match(/[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}/);
  if (uuidMatch) return uuidMatch[0];

  // If it's a URL ending in /assets/<id>
  if (trimmed.includes("/assets/")) {
    const parts = trimmed.split("/assets/");
    const last = parts[parts.length - 1].split("?")[0].split("/")[0];
    if (last) return last;
  }

  return trimmed;
}

/**
 * Returns a secure, internal proxy URL for an asset ID or Directus asset URL.
 * Example: getAssetUrl("a4fb878c-ef06-40e2-9a3d-3d3986891c8c") => "/api/assets/a4fb878c-ef06-40e2-9a3d-3d3986891c8c"
 */
export function getAssetUrl(imageVal: string | null | undefined): string | null {
  const id = extractAssetId(imageVal);
  if (!id) return null;
  return `/api/assets/${encodeURIComponent(id)}`;
}
