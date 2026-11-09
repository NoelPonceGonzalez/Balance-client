import { spawn } from 'node:child_process';
import { createWriteStream } from 'node:fs';
import net from 'node:net';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const log = createWriteStream(path.join(root, '.vite-dev.log'), { flags: 'a' });
const viteBin = path.join(root, 'node_modules', 'vite', 'bin', 'vite.js');

function note(line) {
  log.write(`${new Date().toISOString()} ${line}\n`);
}

function portOpen(port) {
  return new Promise((resolve) => {
    const socket = net.connect({ port, host: '127.0.0.1' });
    const done = (open) => {
      socket.removeAllListeners();
      socket.destroy();
      resolve(open);
    };
    socket.setTimeout(800);
    socket.once('connect', () => done(true));
    socket.once('timeout', () => done(false));
    socket.once('error', () => done(false));
  });
}

if (await portOpen(5181)) {
  note('5181 ya responde. No arranco otro.');
  process.exit(0);
}

note('arranque del cliente');
let failures = 0;
while (true) {
  const started = Date.now();
  const child = spawn(process.execPath, [viteBin], {
    cwd: root,
    stdio: ['ignore', 'pipe', 'pipe'],
    windowsHide: true,
  });
  child.stdout?.pipe(log, { end: false });
  child.stderr?.pipe(log, { end: false });
  const code = await new Promise((resolve) => child.once('exit', resolve));
  const lived = Date.now() - started;
  failures = lived > 20_000 ? 0 : failures + 1;
  const wait = Math.min(15_000, 1000 * Math.max(1, failures));
  note(`vite salió (${code ?? 'sin código'}) tras ${Math.round(lived / 1000)} s. Vuelve en ${wait} ms.`);
  await new Promise((resolve) => setTimeout(resolve, wait));
  if (await portOpen(5181)) {
    note('5181 ya lo tiene otro proceso. Me paro.');
    process.exit(0);
  }
}
