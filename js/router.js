/** Minimal hash router. Routes are declared as '/name' or '/name/:param'. */

const routes = [];
let notFound = null;
let onNavigate = null;

export function route(pattern, handler) {
  const parts = pattern.split('/').filter(Boolean);
  routes.push({ pattern, parts, handler });
}

export function setNotFound(handler) { notFound = handler; }
export function onAfterNavigate(fn) { onNavigate = fn; }

export function currentPath() {
  const raw = window.location.hash.replace(/^#/, '');
  return raw || '/welcome';
}

export function go(path) {
  if (currentPath() === path) { resolve(); return; }
  window.location.hash = path;
}

export function replace(path) {
  const url = `${window.location.pathname}${window.location.search}#${path}`;
  window.history.replaceState(null, '', url);
  resolve();
}

function match(path) {
  const parts = path.split('/').filter(Boolean);
  for (const r of routes) {
    if (r.parts.length !== parts.length) continue;
    const params = {};
    let ok = true;
    for (let i = 0; i < r.parts.length; i += 1) {
      const rp = r.parts[i];
      if (rp.startsWith(':')) params[rp.slice(1)] = decodeURIComponent(parts[i]);
      else if (rp !== parts[i]) { ok = false; break; }
    }
    if (ok) return { handler: r.handler, params, name: r.parts[0] || '' };
  }
  return null;
}

export function resolve() {
  const path = currentPath();
  const found = match(path);
  if (found) found.handler(found.params);
  else if (notFound) notFound(path);
  if (onNavigate) onNavigate(found ? found.name : '', path);
}

export function start() {
  window.addEventListener('hashchange', resolve);
  resolve();
}
