// Comprueba que node_modules se instaló en ESTA plataforma (Windows y Linux no se comparten).
// Si falta el binario nativo de esbuild para este sistema, para antes de dev, build o test.
import { existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const target = `${process.platform}-${process.arch}`;
const native = path.join(root, 'node_modules', '@esbuild', target);
const [major, minor] = process.versions.node.split('.').map(Number);

if (major !== 22 || minor < 12) {
  console.error(`Balance necesita Node 22.12 o superior dentro de la línea 22 (tienes ${process.versions.node}). Usa la versión de .nvmrc.`);
  process.exit(1);
}
if (!existsSync(native)) {
  console.error(`node_modules no es de esta plataforma (${target}). Ejecuta "npm ci" en esta máquina; no copies node_modules entre Windows y Linux.`);
  process.exit(1);
}
