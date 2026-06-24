import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const lines = fs.readFileSync(path.join(root, 'app.js'), 'utf8').split('\n');

function extract(ranges) {
    const out = [];
    for (const [start, end] of ranges) {
        for (let i = start - 1; i < end; i++) {
            if (lines[i] !== undefined) out.push(lines[i]);
        }
    }
    return out.join('\n') + '\n';
}

const modules = {
    'js/constants.js': [[15, 19], [23, 43], [61, 62], [78], [305, 309]],
    'js/firebase.js': [[1, 14], [21, 21]],
    'js/state.js': [[45, 60], [64, 76], [504, 550], [662, 725]],
    'js/categories.js': [[80, 303], [552, 660]],
    'js/format.js': [[315, 323], [921, 936], [1290, 1294], [1734, 1740]],
    'js/theme.js': [[136, 147], [2121, 2150]],
    'js/ui.js': [[311, 313], [325, 444], [446, 502]],
    'js/transactions.js': [[727, 865]],
    'js/dashboard.js': [[867, 911], [938, 1176]],
    'js/reports-core.js': [[1178, 2033]],
    'js/investments.js': [[2035, 2067]],
    'js/loans.js': [[2069, 2092]],
    'js/settings.js': [[2094, 2472]],
    'js/bootstrap.js': [[2474, 2480]],
};

for (const [file, ranges] of Object.entries(modules)) {
    const target = path.join(root, file);
    fs.mkdirSync(path.dirname(target), { recursive: true });
    fs.writeFileSync(target, extract(ranges));
    console.log(`Wrote ${file} (${fs.readFileSync(target, 'utf8').split('\n').length - 1} lines)`);
}
