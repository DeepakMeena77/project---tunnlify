# Tunnlify

> **Expose your localhost to the world instantly** — a fast, lightweight alternative to ngrok powered by WebSockets.

```bash
npm install -g tunnlify
```

---

## How it works

```
Your Local App (localhost:3000)
        │
        │  WebSocket tunnel
        ▼
  Tunnlify Server  ──►  Public URL shared with anyone
```

Anyone can hit your public tunnel URL and the request gets forwarded live to your local machine — no port forwarding, no firewall rules.

---

## Quick Start

### 1. Sign up & get your API token

👉 Go to **[https://tunnlify.vercel.app](https://tunnlify.vercel.app)**

- Create a free account
- Open the **Dashboard**
- Copy your **API Token**

### 2. Install the CLI

```bash
npm install -g tunnlify
```

### 3. Start a tunnel

```bash
tunnlify start --port 3000 --subdomain myapp --token YOUR_API_TOKEN
```

You'll see:

```
✔  Tunnel registered!
   Public URL → https://project-tunnlify.onrender.com/t/myapp/
   Forwarding → localhost:3000
```

Share that URL with anyone — they'll hit your local app directly.

---

## Usage

```
tunnlify <command> [flags]

Commands:
  start   Open a tunnel from a public URL to a local port

Flags (start):
  --port        (required)  Local port to expose          e.g. 3000
  --subdomain   (required)  A name for your tunnel        e.g. myapp
  --token       (required)  Your API token from dashboard
  --server      (optional)  Custom tunnel server WebSocket URL

Global Flags:
  --help        Show help and exit
```

### Examples

```bash
# Expose a Node.js app on port 3000
tunnlify start --port 3000 --subdomain myapi --token abc123

# Expose a React / Vite dev server on port 5173
tunnlify start --port 5173 --subdomain myreact --token abc123

# Expose a Django app on port 8000
tunnlify start --port 8000 --subdomain django --token abc123
```

---

## Plans

| Plan      | Price      | Active Tunnels |
|-----------|------------|----------------|
| Free      | Free       | 1              |
| Developer | ₹199/month | 5              |
| Team      | ₹699/month | 20             |

---

## Requirements

- **Node.js** >= 18

---

## License

MIT
