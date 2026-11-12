// Aggregate external entries without a browser ID, visit history or storage.
export function siteEntry(env) {
  const {location, document, performance} = env;
  if (!/^https?:$/.test(location.protocol) ||
      /^\/(?:manager\.html|api\/)/.test(location.pathname)) return null;
  if (document.cookie.split(';').some(value => value.trim() === 'dp_staff=1')) return null;
  if (performance?.getEntriesByType('navigation')[0]?.type === 'reload') return null;
  let referrerHost;
  try {
    const previous = new URL(document.referrer);
    if (previous.origin === location.origin) return null;
    referrerHost = previous.hostname;
  } catch {}
  const query = new URL(location.href).searchParams;
  const limited = (key, max) => {
    const value = query.get(key);
    return value && value.length <= max ? value : undefined;
  };
  return {
    page_path: location.pathname,
    context: limited('dp_ctx', 1800),
    utm_source: limited('utm_source', 80),
    utm_medium: limited('utm_medium', 40),
    yclid: query.has('yclid') ? 'present' : undefined,
    gclid: query.has('gclid') ? 'present' : undefined,
    referrer_host: referrerHost
  };
}

export async function reportSiteEntry(env = globalThis) {
  const data = siteEntry(env);
  if (!data) return;
  try {
    await env.fetch('/api/analytics/entry', {
      method: 'POST',
      credentials: 'same-origin',
      headers: {'Content-Type': 'application/json'},
      body: JSON.stringify(data),
      keepalive: true
    });
  } catch {}
}

if (typeof window !== 'undefined') reportSiteEntry();
