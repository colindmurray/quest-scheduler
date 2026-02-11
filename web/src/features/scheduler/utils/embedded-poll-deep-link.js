export function parseEmbeddedPollIdFromSearch(search = "") {
  const rawSearch = typeof search === "string" ? search : "";
  if (!rawSearch) return null;

  const query = rawSearch.startsWith("?") ? rawSearch : `?${rawSearch}`;
  const searchParams = new URLSearchParams(query);
  const pollId = String(searchParams.get("poll") || "").trim();
  if (!pollId) return null;

  return pollId;
}
