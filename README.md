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
| `HTTP_PORT`                 | `3000`        | HTTP + WebSocket listen port          |
| `TUNNEL_DOMAIN`             | `tunnels.com` | Host suffix for subdomain routing     |
| `DB_DRIVER`                 | —             | Set to `file` for zero-setup local dev |
| `DATABASE_URL` or `PG*`     | —             | PostgreSQL connection                 |
| `JWT_SECRET`                | —             | Secret used to sign auth tokens       |
| `APP_URL`                   | request origin | Frontend URL for Stripe redirects     |
| `STRIPE_SECRET_KEY`         | —             | Stripe secret API key                 |
| `STRIPE_WEBHOOK_SECRET`     | —             | Stripe webhook signing secret         |
| `STRIPE_DEVELOPER_PRICE_ID` | —             | Stripe INR monthly price for Developer |
| `STRIPE_TEAM_PRICE_ID`      | —             | Stripe INR monthly price for Team      |

## Billing

Plans are enforced by active tunnel count:

| Plan      | Price     | Active tunnels |
|-----------|-----------|----------------|
| Free      | Free      | 1              |
| Developer | ₹199/month | 5              |
| Team      | ₹699/month | 20             |

Create the paid monthly prices in Stripe using INR, set their price IDs in the environment, and point Stripe webhooks at:

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
