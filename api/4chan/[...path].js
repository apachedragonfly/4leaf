const ALLOWED_PATHS = [
  /^boards\.json$/,
  /^[a-z0-9]+\/catalog\.json$/,
  /^[a-z0-9]+\/thread\/\d+\.json$/,
]

export default async function handler(request, response) {
  if (request.method !== 'GET') {
    return response.status(405).json({ error: 'Method not allowed.' })
  }

  const value = request.query.path
  const path = Array.isArray(value) ? value.join('/') : (value ?? '')
  if (!ALLOWED_PATHS.some((pattern) => pattern.test(path))) {
    return response.status(400).json({ error: 'Unsupported API path.' })
  }

  try {
    const upstream = await fetch(`https://a.4cdn.org/${path}`, {
      headers: { Accept: 'application/json', 'User-Agent': '4leaf/0.1' },
    })
    const body = await upstream.text()
    const ttl = path === 'boards.json' ? 3600 : path.endsWith('catalog.json') ? 60 : 15

    response.setHeader('Content-Type', 'application/json; charset=utf-8')
    response.setHeader('Cache-Control', `public, s-maxage=${ttl}, stale-while-revalidate=${ttl * 4}`)
    response.setHeader('X-Content-Type-Options', 'nosniff')
    return response.status(upstream.status).send(body)
  } catch {
    return response.status(502).json({ error: '4chan is currently unreachable.' })
  }
}
