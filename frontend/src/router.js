const routes = new Map();

export function register(path, render) {
  routes.set(path, render);
}

export function navigate(path) {
  if (!path.startsWith("#")) path = `#${path}`;
  if (location.hash !== path) location.hash = path;
  else dispatch();
}

export function currentPath() {
  const h = location.hash.replace(/^#/, "") || "/pos";
  return h.startsWith("/") ? h : `/${h}`;
}

export function dispatch() {
  const path = currentPath();
  const view = routes.get(path) || routes.get("/dashboard");
  window.dispatchEvent(new CustomEvent("route", { detail: { path, view } }));
}

export function startRouter() {
  window.addEventListener("hashchange", dispatch);
  if (!location.hash) location.hash = "#/login";
  dispatch();
}
