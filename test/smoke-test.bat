@echo off
setlocal

echo ============================================
echo   Tunnlify Integration Smoke Test
echo ============================================
echo.

:: Kill any stale node processes
taskkill /f /im node.exe > nul 2>&1

echo [1/4] Starting echo server on :9999...
start "echo-server" /b node f:\Tunnlify\test\echo-server.js

echo [2/4] Starting tunnel server on :3000...
start "tunnel-server" /b node f:\Tunnlify\server.js

echo     Waiting for servers to start...
timeout /t 3 /nobreak > nul

echo [3/4] Starting tunnel client (subdomain: john)...
start "tunnel-client" /b node f:\Tunnlify\bin\tunnel.js start --port 9999 --subdomain john --token abc --server ws://localhost:3000

echo     Waiting for tunnel to register...
timeout /t 3 /nobreak > nul

echo [4/4] Sending GET /api/users through tunnel...
curl -s -H "Host: john.tunnels.com" http://localhost:3000/api/users
echo.

echo.
echo [5/4] Sending POST /api/data through tunnel...
curl -s -X POST -H "Host: john.tunnels.com" -H "Content-Type: application/json" -d "{\"hello\":\"world\"}" http://localhost:3000/api/data
echo.

echo.
echo [6] Test unregistered subdomain (expect 404)...
curl -s -H "Host: nobody.tunnels.com" http://localhost:3000/ping
echo.

echo.
echo ============================================
echo   Cleaning up...
echo ============================================
taskkill /f /im node.exe > nul 2>&1

endlocal
