/**
 * Składa index.html — zamienia <!-- @include ścieżka --> na zawartość pliku.
 * Użycie: node scripts/assemble-html.mjs
 */
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const ROOT = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');
const INDEX = path.join(ROOT, 'index.html');
const INCLUDE_RE = /<!--\s*@include\s+([^\s]+)\s*-->/g;

function assembleHtml(html) {
    return html.replace(INCLUDE_RE, (_, relPath) => {
        const filePath = path.join(ROOT, relPath.replace(/\//g, path.sep));
        if (!fs.existsSync(filePath)) {
            throw new Error(`Brak pliku partial: ${relPath}`);
        }
        return fs.readFileSync(filePath, 'utf8').replace(/\s*$/, '');
    });
}

const source = fs.readFileSync(INDEX, 'utf8');
const output = assembleHtml(source);
if (output !== source) {
    fs.writeFileSync(INDEX, output.endsWith('\n') ? output : `${output}\n`);
    console.log('index.html zaktualizowany (include → inline)');
} else {
    console.log('index.html bez zmian (brak @include)');
}
