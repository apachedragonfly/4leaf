interface PagesContext {
  request: Request
  waitUntil(promise: Promise<unknown>): void
}

declare const caches: CacheStorage & { default: Cache }

const ALLOWED_PATHS = [
  /^boards\.json$/,
  /^[a-z0-9]+\/catalog\.json$/,
  /^[a-z0-9]+\/thread\/\d+\.json$/,
]

export async function onRequest(context: PagesContext): Promise<Response> {
  if (context.request.method !== 'GET') {
    return json({ error: 'Method not allowed.' }, 405, 0)
  }

  const value = new URL(context.request.url).searchParams.get('path') ?? ''
  const path = value.replace(/^\/+/, '')
  if (!ALLOWED_PATHS.some((pattern) => pattern.test(path))) {
    return json({ error: 'Unsupported API path.' }, 400, 60)
  }

  const cache = caches.default
  const cacheKey = new Request(context.request.url, { method: 'GET' })
  const cached = await cache.match(cacheKey)
  if (cached) return cached

  const upstream = await fetch(`https://a.4cdn.org/${path}`, {
    headers: { Accept: 'application/json' },
  })

  const ttl = path === 'boards.json' ? 3600 : path.endsWith('catalog.json') ? 60 : 15
  const response = new Response(upstream.body, {
    status: upstream.status,
    headers: {
      'Content-Type': 'application/json; charset=utf-8',
      'Cache-Control': `public, max-age=${ttl}`,
      'X-Content-Type-Options': 'nosniff',
      'Access-Control-Allow-Origin': '*',
    },
  })

  if (upstream.ok) context.waitUntil(cache.put(cacheKey, response.clone()))
  return response
}

function json(body: object, status: number, ttl: number): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: {
      'Content-Type': 'application/json; charset=utf-8',
      'Cache-Control': `public, max-age=${ttl}`,
      'X-Content-Type-Options': 'nosniff',
      'Access-Control-Allow-Origin': '*',
    },
  })
}
