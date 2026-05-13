# Tunnlify — WebSocket HTTP Tunnel Server

Expose a local HTTP service to the internet via a WebSocket tunnel.

## Architecture

```
Internet caller
    │  GET http://john.tunnels.com:3000/api/data
    ▼
┌─────────────────────────────────┐
│       Tunnel Server (server.js) │  :3000  (HTTP + WS on same port)
│  Express  ──►  tunnels.get(sub) │
│               │  JSON over WS   │
└───────────────┼─────────────────┘
                │ WebSocket
┌───────────────▼─────────────────┐
│   Tunnel Client (your machine)  │
│  client-example.js              │
│     ──► localhost:8080 (local)  │
└─────────────────────────────────┘
```

## Quick Start

```bash
# 1. Install dependencies
npm install

# 2. Start the tunnel server
npm start
# or with auto-reload (Node ≥ 18)
npm run dev

# 3. In another terminal, start the example tunnel client
node client-example.js
```

## WebSocket Protocol

All messages are UTF-8 JSON frames.

### Client → Server

| `type`     | Fields                            | Description                          |
|------------|-----------------------------------|--------------------------------------|
| `register` | `subdomain`, `token`              | Claim a subdomain                    |
| `response` | `requestId`, `status`, `headers`, `body`, `bodyBase64` | Reply to a proxied HTTP request |
| `pong`     | —                                 | Application-level heartbeat reply    |

### Server → Client

| `type`       | Fields                                    | Description                        |
|--------------|-------------------------------------------|------------------------------------|
| `registered` | `subdomain`, `publicUrl`                  | Subdomain successfully registered  |
| `request`    | `requestId`, `method`, `path`, `headers`, `body`, `bodyBase64` | HTTP request to forward |
| `ping`       | —                                         | Application-level heartbeat ping   |
| `error`      | `message`                                 | Registration or protocol error     |

### Body encoding

Request / response bodies are `base64`-encoded when `bodyBase64: true`.

## Configuration

Set these environment variables in `.env` or your hosting provider:

| Variable                    | Default       | Description                           |
|-----------------------------|---------------|---------------------------------------|
| `PORT`                      | —             | Hosting-provided listen port          |
| `HTTP_PORT`                 | `3000`        | HTTP + WebSocket listen port          |
| `TUNNEL_DOMAIN`             | `tunnels.com` | Host suffix for subdomain routing     |
| `PUBLIC_TUNNEL_PROTOCOL`    | `http`/`https` | Protocol shown in tunnel URLs        |
| `PUBLIC_TUNNEL_PORT`        | local port    | Optional public URL port              |
| `DB_DRIVER`                 | —             | Set to `file` for zero-setup local dev |
| `DATABASE_URL` or `PG*`     | —             | PostgreSQL connection                 |
| `DATABASE_URL_SSL`          | auto          | Set `true`/`false` for hosted DB TLS  |
| `JWT_SECRET`                | —             | Secret used to sign auth tokens       |
| `FRONTEND_URL`              | —             | Hosted frontend URL for CORS          |
| `CORS_ORIGIN`               | —             | Comma-separated allowed origins       |
| `APP_URL`                   | request origin | Frontend URL for Stripe redirects     |
| `BILLING_ENABLED`           | `false`       | Set `true` only when Stripe is ready  |
| `STRIPE_SECRET_KEY`         | —             | Stripe secret API key                 |
| `STRIPE_WEBHOOK_SECRET`     | —             | Stripe webhook signing secret         |
| `STRIPE_DEVELOPER_PRICE_ID` | —             | Stripe INR monthly price for Developer |
| `STRIPE_TEAM_PRICE_ID`      | —             | Stripe INR monthly price for Team      |

Client build variables:

| Variable                 | Default                 | Description                |
|--------------------------|-------------------------|----------------------------|
| `VITE_API_URL`           | same origin             | Backend API base URL       |
| `VITE_TUNNEL_DOMAIN`     | `tunnels.com`           | Public tunnel host suffix  |
| `VITE_TUNNEL_PROTOCOL`   | `http`                  | `http` locally, `https` in production |

## Deployment

Recommended free stack for a first public demo:

1. Create a free Postgres database on Neon and copy its pooled connection string.
2. Deploy the backend as a Render Web Service.
   - Build command: `npm install`
   - Start command: `npm start`
   - Health check path: `/status`
3. Deploy `client/` as a static site.
   - Build command: `npm install && npm run build`
   - Publish directory: `dist`
4. Point a wildcard domain such as `*.tunnel.example.com` at the backend service, then set `TUNNEL_DOMAIN=tunnel.example.com`.

Backend environment example:

```bash
DB_DRIVER=postgresql
DATABASE_URL=postgresql://...
DATABASE_URL_SSL=true
JWT_SECRET=replace_with_a_long_random_secret
TUNNEL_DOMAIN=tunnel.example.com
PUBLIC_TUNNEL_PROTOCOL=https
FRONTEND_URL=https://your-frontend.example.com
CORS_ORIGIN=https://your-frontend.example.com
BILLING_ENABLED=false
```

On most hosted platforms, leave `PUBLIC_TUNNEL_PORT` unset so public URLs do not include the internal app port.

Frontend environment example:

```bash
VITE_API_URL=https://your-backend.example.com
VITE_TUNNEL_DOMAIN=tunnel.example.com
VITE_TUNNEL_PROTOCOL=https
```

## Billing

Plans are enforced by active tunnel count:

| Plan      | Price     | Active tunnels |
|-----------|-----------|----------------|
| Free      | Free      | 1              |
| Developer | ₹199/month | 5              |
| Team      | ₹699/month | 20             |

Paid upgrades are disabled by default. When you are ready to enable money flow, set `BILLING_ENABLED=true`, create the paid monthly prices in Stripe using INR, set their price IDs in the environment, and point Stripe webhooks at:

```bash
POST /billing/webhook
```

The webhook handler updates the user's plan on `checkout.session.completed` and `invoice.payment_succeeded`, and downgrades to Free on subscription cancellation.

## Testing with curl

```bash
# Test a registered tunnel (john.tunnels.com → local :8080)
curl -H "Host: john.tunnels.com" http://localhost:3000/

# Test 404 for unregistered subdomain
curl -H "Host: nobody.tunnels.com" http://localhost:3000/
```
