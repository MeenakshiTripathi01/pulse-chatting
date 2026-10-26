// Development mode reachable from other devices on the same network (e.g. a friend's laptop on
// your Wi-Fi). Exposes the Vite dev server on all interfaces and allows those LAN origins on the
// API. The API itself stays on localhost; Vite proxies /api and /socket.io to it.
//
// Usage: npm run dev:lan   (development only: plain http, no Secure cookies)
import { spawn } from 'node:child_process';
import os from 'node:os';

const CLIENT_PORT = 5173;

const lanAddresses = Object.values(os.networkInterfaces())
  .flat()
  .filter((address) => address && address.family === 'IPv4' && !address.internal)
  .map((address) => address.address);

if (lanAddresses.length === 0) {
  console.error('[dev:lan] No network connection found. Connect to Wi-Fi/Ethernet and retry.');
  process.exit(1);
}

const origins = [
  `http://localhost:${CLIENT_PORT}`,
  ...lanAddresses.map((ip) => `http://${ip}:${CLIENT_PORT}`),
];

console.log('[dev:lan] Open one of these on the other device (same network):');
for (const ip of lanAddresses) console.log(`           http://${ip}:${CLIENT_PORT}`);
console.log(
  '[dev:lan] If it does not load, allow Node.js through the firewall for private networks.',
);

const command = [
  'npx concurrently -n server,client -c blue,magenta',
  '"npm run dev -w server"',
  `"npm run dev -w client -- --host 0.0.0.0 --port ${CLIENT_PORT} --strictPort"`,
].join(' ');

const child = spawn(command, {
  stdio: 'inherit',
  shell: true,
  // Process environment overrides server/.env, so this only affects this session.
  env: { ...process.env, CLIENT_ORIGIN: origins.join(',') },
});

child.on('exit', (code) => process.exit(code ?? 0));
