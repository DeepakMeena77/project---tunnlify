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
      <main className="flex-1 flex flex-col items-center justify-center px-4 py-14 text-center sm:px-6 sm:py-20 lg:py-24">

        {/* Pill badge */}
        <span className="mb-6 inline-flex items-center gap-2 px-3 py-1 rounded-full border border-gray-200 text-xs font-medium text-gray-500">
          <span className="w-1.5 h-1.5 rounded-full bg-green-500 inline-block" />
          Free plan available
        </span>

        {/* Headline */}
        <h1 className="text-4xl font-bold text-gray-900 max-w-2xl leading-tight sm:text-5xl">
          Share localhost<br />permanently.
        </h1>

        {/* Description */}
        <p className="mt-5 max-w-md text-base leading-7 text-gray-500 sm:text-lg">
          Expose your local server to the internet with a stable public URL — no config, no restarts.
        </p>

        {/* CTA buttons */}
        <div className="mt-8 flex w-full max-w-sm flex-col items-stretch gap-3 sm:w-auto sm:max-w-none sm:flex-row sm:items-center">
          <Link to="/signup" className="btn-primary btn-lg w-full sm:w-auto">
            Start free
          </Link>
          <Link to="/login" className="btn-secondary btn-lg w-full sm:w-auto">
            Log in
          </Link>
        </div>

        {/* Terminal demo */}
        <div className="mt-12 w-full max-w-xl text-left sm:mt-14">
          {/* Window chrome */}
          <div className="flex items-center gap-1.5 px-4 py-3 bg-gray-900 rounded-t-lg border-b border-gray-800">
            <span className="w-3 h-3 rounded-full bg-red-500/80" />
            <span className="w-3 h-3 rounded-full bg-yellow-500/80" />
            <span className="w-3 h-3 rounded-full bg-green-500/80" />
            <span className="ml-3 text-xs text-gray-500 font-mono">Terminal</span>
          </div>

          <div className="bg-gray-950 rounded-b-lg p-3 space-y-3 overflow-x-auto sm:p-5">
            {/* Step 1: install */}
            <TerminalLine step="1" prompt="$" command={INSTALL_CMD} comment="install once" />
            {/* Step 2: run */}
            <TerminalLine step="2" prompt="$" command={TUNNEL_CMD} />
            {/* Output */}
            <div className="pt-1 min-w-max space-y-1 font-mono text-xs sm:text-sm">
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
      <section className="border-t border-gray-100 px-4 py-14 sm:px-6 sm:py-20">
        <div className="max-w-4xl mx-auto">
          <h2 className="text-xl font-semibold text-gray-900 mb-12 text-center">How it works</h2>
          <div className="grid grid-cols-1 gap-8 sm:grid-cols-3">
            <Step n="1" title="Sign up" desc="Create a free account and get your permanent subdomain and API token instantly." />
            <Step n="2" title="Run the CLI" desc="Install the tunnel CLI globally and start it with your port and token." />
            <Step n="3" title="Share the URL" desc="Your local server is now live at your-name.tunnels.com — share it freely." />
          </div>
        </div>
      </section>

      {/* Footer */}
      <footer className="border-t border-gray-100 px-4 py-8 text-center text-xs text-gray-400 sm:px-6">
        © {new Date().getFullYear()} Tunnlify
      </footer>
    </div>
  )
}

function TerminalLine({ prompt, command, comment }) {
  return (
    <div className="group flex min-w-max flex-col gap-2 sm:flex-row sm:items-start sm:gap-3">
      <div className="flex-1 font-mono text-xs sm:text-sm">
        <span className="text-green-400">{prompt} </span>
        <span className="text-gray-100">{command}</span>
        {comment && <span className="ml-3 text-gray-600"># {comment}</span>}
      </div>
      <CopyButton
        text={command}
        label="Copy"
        className="w-fit shrink-0 opacity-100 transition-opacity !border-gray-700 !text-gray-400 hover:!bg-gray-800 hover:!text-gray-200 sm:opacity-0 sm:group-hover:opacity-100"
      />
    </div>
  )
}

function Step({ n, title, desc }) {
  return (
    <div className="flex flex-col items-center gap-3 text-center sm:items-start sm:text-left">
      <div className="w-8 h-8 rounded-full border border-gray-200 flex items-center justify-center text-sm font-semibold text-gray-900">
        {n}
      </div>
      <h3 className="font-semibold text-gray-900">{title}</h3>
      <p className="text-sm text-gray-500 leading-relaxed">{desc}</p>
    </div>
  )
}
