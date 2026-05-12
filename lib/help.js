'use strict';

const CYAN   = '\x1b[36m';
const YELLOW = '\x1b[33m';
const WHITE  = '\x1b[97m';
const GRAY   = '\x1b[90m';
const RESET  = '\x1b[0m';
const BOLD   = '\x1b[1m';

function printHelp() {
  console.log(`
${BOLD}${CYAN}  tunnel${RESET} ${GRAY}— WebSocket HTTP tunnel client${RESET}

${BOLD}Usage${RESET}
  tunnel <command> [flags]

${BOLD}Commands${RESET}
  ${WHITE}start${RESET}   Open a tunnel from a public subdomain to a local port

${BOLD}Flags (start)${RESET}
  ${YELLOW}--port${RESET}        ${GRAY}(required)${RESET}  Local port to expose                ${GRAY}e.g. 3000${RESET}
  ${YELLOW}--subdomain${RESET}   ${GRAY}(required)${RESET}  Subdomain to register on the server ${GRAY}e.g. john${RESET}
  ${YELLOW}--token${RESET}       ${GRAY}(required)${RESET}  Auth token                          ${GRAY}e.g. abc${RESET}
  ${YELLOW}--server${RESET}      ${GRAY}(optional)${RESET}  Tunnel server WebSocket URL
                              ${GRAY}default: wss://yourserver.com${RESET}

${BOLD}Global Flags${RESET}
  ${YELLOW}--help${RESET}        Show this help message and exit

${BOLD}Examples${RESET}
  ${GRAY}#${RESET} Expose local port 3000 as john.tunnels.com
  tunnel start --port 3000 --subdomain john --token abc

  ${GRAY}#${RESET} Use a custom tunnel server
  tunnel start --port 8080 --subdomain alice --token xyz --server wss://mytunnel.example.com
`);
}

module.exports = { printHelp };
