// Hash router: #/path/segments?key=value. Works on any static host without rewrites.

export interface Route {
  path: string[];
  params: URLSearchParams;
}

export function currentRoute(hash = location.hash): Route {
  const raw = hash.replace(/^#\/?/, "");
  const [path = "", query = ""] = raw.split("?");
  return {
    path: path.split("/").filter(Boolean).map(decodeURIComponent),
    params: new URLSearchParams(query),
  };
}

export function href(path: string[], params?: Record<string, string | number | undefined>): string {
  const query = new URLSearchParams();
  for (const [k, v] of Object.entries(params ?? {})) {
    if (v !== undefined && v !== "") query.set(k, String(v));
  }
  const q = query.toString();
  return `#/${path.map(encodeURIComponent).join("/")}${q ? `?${q}` : ""}`;
}

/** Update the query string without adding a history entry or re-running the router. */
export function replaceParams(params: Record<string, string | number | undefined>): void {
  const route = currentRoute();
  history.replaceState(null, "", href(route.path, params));
}
