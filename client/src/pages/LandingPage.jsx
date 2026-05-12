import { Link } from 'react-router-dom'
import Navbar from '../components/Navbar'
import { CopyButton } from '../components/CopyButton'

const INSTALL_CMD  = 'npm install -g tunnlify'
const TUNNEL_CMD   = 'tunnel start --port 3000 --subdomain john --token tun_abc123'

export default function LandingPage() {
  return (
    <div className="min-h-screen bg-white flex flex-col">
      <Navbar />

      {/* Hero */}
      <main className="flex-1 flex flex-col items-center justify-center px-6 py-24 text-center">

        {/* Pill badge */}
        <span className="mb-6 inline-flex items-center gap-2 px-3 py-1 rounded-full border border-gray-200 text-xs font-medium text-gray-500">
          <span className="w-1.5 h-1.5 rounded-full bg-green-500 inline-block" />
          Free plan available
        </span>

        {/* Headline */}
        <h1 className="text-5xl font-bold tracking-tight text-gray-900 max-w-2xl leading-tight">
          Share localhost<br />permanently.
        </h1>

        {/* Description */}
        <p className="mt-5 text-lg text-gray-500 max-w-md">
          Expose your local server to the internet with a stable public URL — no config, no restarts.
        </p>

        {/* CTA buttons */}
        <div className="mt-8 flex items-center gap-3">
          <Link to="/signup" className="btn-primary btn-lg">
            Start free
          </Link>
          <Link to="/login" className="btn-secondary btn-lg">
            Log in
          </Link>
        </div>

        {/* Terminal demo */}
        <div className="mt-14 w-full max-w-xl text-left">
          {/* Window chrome */}
          <div className="flex items-center gap-1.5 px-4 py-3 bg-gray-900 rounded-t-lg border-b border-gray-800">
            <span className="w-3 h-3 rounded-full bg-red-500/80" />
            <span className="w-3 h-3 rounded-full bg-yellow-500/80" />
            <span className="w-3 h-3 rounded-full bg-green-500/80" />
            <span className="ml-3 text-xs text-gray-500 font-mono">Terminal</span>
          </div>

          <div className="bg-gray-950 rounded-b-lg p-5 space-y-3">
            {/* Step 1: install */}
            <TerminalLine step="1" prompt="$" command={INSTALL_CMD} comment="install once" />
            {/* Step 2: run */}
            <TerminalLine step="2" prompt="$" command={TUNNEL_CMD} />
            {/* Output */}
            <div className="pt-1 space-y-1 font-mono text-sm">
              <p className="text-gray-500">  ┌────────────────────────────────────────┐</p>
              <p className="text-gray-500">  │  <span className="text-green-400">tunnel</span> is live!                        │</p>
              <p className="text-gray-500">  ├────────────────────────────────────────┤</p>
              <p className="text-gray-500">  │  Public  <span className="text-cyan-400">http://john.tunnels.com</span>       │</p>
              <p className="text-gray-500">  └────────────────────────────────────────┘</p>
            </div>
          </div>
        </div>

      </main>

      {/* How it works */}
      <section className="border-t border-gray-100 py-20 px-6">
        <div className="max-w-4xl mx-auto">
          <h2 className="text-xl font-semibold text-gray-900 mb-12 text-center">How it works</h2>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-8">
            <Step n="1" title="Sign up" desc="Create a free account and get your permanent subdomain and API token instantly." />
            <Step n="2" title="Run the CLI" desc="Install the tunnel CLI globally and start it with your port and token." />
            <Step n="3" title="Share the URL" desc="Your local server is now live at your-name.tunnels.com — share it freely." />
          </div>
        </div>
      </section>

      {/* Footer */}
      <footer className="border-t border-gray-100 py-8 px-6 text-center text-xs text-gray-400">
        © {new Date().getFullYear()} Tunnlify
      </footer>
    </div>
  )
}

function TerminalLine({ prompt, command, comment }) {
  return (
    <div className="flex items-start gap-3 group">
      <div className="flex-1 font-mono text-sm">
        <span className="text-green-400">{prompt} </span>
        <span className="text-gray-100">{command}</span>
        {comment && <span className="text-gray-600 ml-3"># {comment}</span>}
      </div>
      <CopyButton
        text={command}
        label="Copy"
        className="opacity-0 group-hover:opacity-100 transition-opacity shrink-0 !border-gray-700 !text-gray-400 hover:!text-gray-200 hover:!bg-gray-800"
      />
    </div>
  )
}

function Step({ n, title, desc }) {
  return (
    <div className="flex flex-col gap-3">
      <div className="w-8 h-8 rounded-full border border-gray-200 flex items-center justify-center text-sm font-semibold text-gray-900">
        {n}
      </div>
      <h3 className="font-semibold text-gray-900">{title}</h3>
      <p className="text-sm text-gray-500 leading-relaxed">{desc}</p>
    </div>
  )
}
