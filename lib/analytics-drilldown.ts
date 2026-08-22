export type AnalyticsPropertyScope = string[] | null;

/**
 * Keeps analytics navigation within the exact property selection that produced
 * the metric. An omitted propertyId means the caller selected all properties;
 * an empty value is an intentional empty scope.
 */
export function analyticsScopedPath(path: string, selectedPropertyIds: string[], allPropertyIds: string[]) {
  const url = new URL(path, "https://analytics.local");
  const selected = [...new Set(selectedPropertyIds.filter(Boolean))];
  const all = [...new Set(allPropertyIds.filter(Boolean))];
  if (selected.length === all.length && selected.every((id) => all.includes(id))) {
    url.searchParams.delete("propertyId");
  } else {
    url.searchParams.set("propertyId", selected.join(","));
  }
  return `${url.pathname}${url.search}${url.hash}`;
}

export function parseAnalyticsPropertyScope(search: string): AnalyticsPropertyScope {
  const raw = new URLSearchParams(search).get("propertyId");
  if (raw === null) return null;
  return raw ? [...new Set(raw.split(",").filter(Boolean))] : [];
}
