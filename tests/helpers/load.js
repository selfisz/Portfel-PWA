/**
 * Helper do ładowania vanilla JS plików z globalami w środowisku testowym.
 * Używa vm.runInThisContext() żeby deklaracje funkcji trafiły do global scope,
 * bez modyfikowania plików źródłowych.
 */
import { readFileSync } from 'fs';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';
import vm from 'vm';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..', '..');

export function loadScript(relPath) {
  const src = readFileSync(join(ROOT, relPath), 'utf8');
  vm.runInThisContext(src, { filename: relPath });
}

/**
 * Uruchamia dowolny kod inline w tym samym V8 context.
 * Używane do wstrzykiwania helper functions, które mają dostęp
 * do zmiennych let/const zdefiniowanych przez loadScript.
 */
export function runInContext(code) {
  vm.runInThisContext(code);
}
