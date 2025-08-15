import { Hono } from 'hono'
import { cors } from 'hono/cors'
import { serveStatic } from 'hono/cloudflare-workers'

const app = new Hono()

app.use('/api/*', cors())
app.use('/static/*', serveStatic({ root: './public' }))

app.get('/api/hello', (c) => c.json({ message: 'Hello from 社畜弾幕！' }))

app.get('/', (c) => {
  return c.html(`
  <!DOCTYPE html>
  <html lang="ja">
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1, maximum-scale=1, user-scalable=no, viewport-fit=cover" />
    <title>社畜ブレイカー（仮）</title>
    <script src="https://cdn.tailwindcss.com"></script>
    <link href="https://cdn.jsdelivr.net/npm/@fortawesome/fontawesome-free@6.4.0/css/all.min.css" rel="stylesheet">
    <link rel="preconnect" href="https://fonts.googleapis.com">
    <link href="https://fonts.googleapis.com/css2?family=Orbitron:wght@400;700&family=Noto+Sans+JP:wght@400;700&display=swap" rel="stylesheet">
    <link rel="stylesheet" href="/static/styles.css" />
  </head>
  <body class="bg-gray-900 text-gray-100" style="overflow:hidden;">
    <div id="game-root" class="min-h-screen"></div>
    <script src="/static/app.js"></script>
  </body>
  </html>
  `)
})

export default app
