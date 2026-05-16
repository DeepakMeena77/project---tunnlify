'use strict';

const CYAN   = '\x1b[36m';
const YELLOW = '\x1b[33m';
const WHITE  = '\x1b[97m';
const GRAY   = '\x1b[90m';
const RESET  = '\x1b[0m';
const BOLD   = '\x1b[1m';
const GREEN  = '\x1b[32m';

const DEFAULT_SERVER = process.env.TUNNLIFY_SERVER || 'wss://project-tunnlify.onrender.com';

function printHelp() {
  console.log(`
${BOLD}${CYAN}  tunnlify${RESET} ${GRAY}— Expose your localhost to the world instantly${RESET}

${BOLD}Usage${RESET}
  tunnlify <command> [flags]

${BOLD}Commands${RESET}
  ${WHITE}start${RESET}   Open a tunnel from a public URL to a local port

${BOLD}Flags (start)${RESET}
  ${YELLOW}--port${RESET}        ${GRAY}(required)${RESET}  Local port to expose                ${GRAY}e.g. 3000${RESET}
  ${YELLOW}--subdomain${RESET}   ${GRAY}(required)${RESET}  Subdomain to register on the server ${GRAY}e.g. myapp${RESET}
  ${YELLOW}--token${RESET}       ${GRAY}(required)${RESET}  Your API token from the dashboard
  ${YELLOW}--server${RESET}      ${GRAY}(optional)${RESET}  Tunnel server WebSocket URL
                              ${GRAY}default: ${DEFAULT_SERVER}${RESET}

${BOLD}Global Flags${RESET}
  ${YELLOW}--help${RESET}        Show this help message and exit

${BOLD}Examples${RESET}
  ${GRAY}# Expose local port 3000${RESET}
  tunnlify start --port 3000 --subdomain myapp --token <your-api-token>

  ${GRAY}# Expose a React dev server${RESET}
  tunnlify start --port 5173 --subdomain myreact --token <your-api-token>

${BOLD}Get your API token${RESET}
  ${GREEN}https://tunnlify.vercel.app${RESET} → Sign up → Dashboard → Copy token
`);
}

module.exports = { printHelp };
