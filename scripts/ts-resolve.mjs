// Resolvedor para ejecutar pruebas TypeScript con Node 22 (--experimental-strip-types) sin tsx:
// un import relativo sin extensión, o con .js, se resuelve al archivo .ts/.tsx que exista.
import { existsSync } from 'node:fs';
import { fileURLToPath, pathToFileURL } from 'node:url';

export async function resolve(specifier, context, next) {
  if ((specifier.startsWith('./') || specifier.startsWith('../')) && context.parentURL) {
    const file = fileURLToPath(new URL(specifier, context.parentURL));
    for (const candidate of [file.replace(/\.js$/, '.ts'), `${file}.ts`, `${file}.tsx`]) {
      if (candidate !== file && existsSync(candidate)) return next(pathToFileURL(candidate).href, context);
    }
  }
  return next(specifier, context);
}
