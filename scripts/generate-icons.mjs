import sharp from 'sharp';
import { mkdir } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.join(__dirname, '..');
const source = process.argv[2] || path.join(
    root,
    'assets',
    'wallet-icon-source.png'
);
const outDir = path.join(root, 'icons');

const SIZES = [
    { name: 'icon-192.png', size: 192 },
    { name: 'icon-512.png', size: 512 },
    { name: 'apple-touch-icon.png', size: 180 },
];

await mkdir(outDir, { recursive: true });

const meta = await sharp(source).metadata();
console.log(`Source: ${source} (${meta.width}x${meta.height})`);

for (const { name, size } of SIZES) {
    const dest = path.join(outDir, name);
    await sharp(source)
        .resize(size, size, {
            fit: 'cover',
            position: 'centre',
            background: { r: 15, g: 15, b: 15, alpha: 1 },
        })
        .png({ compressionLevel: 9, palette: false })
        .toFile(dest);
    console.log(`Wrote ${name} (${size}x${size})`);
}

const maskableSize = 512;
const innerSize = Math.round(maskableSize * 0.76);
const inner = await sharp(source)
    .resize(innerSize, innerSize, { fit: 'cover', position: 'centre' })
    .png()
    .toBuffer();
const maskableDest = path.join(outDir, 'icon-512-maskable.png');
await sharp({
    create: {
        width: maskableSize,
        height: maskableSize,
        channels: 4,
        background: { r: 15, g: 15, b: 15, alpha: 1 },
    },
})
    .composite([{
        input: inner,
        left: Math.round((maskableSize - innerSize) / 2),
        top: Math.round((maskableSize - innerSize) / 2),
    }])
    .png({ compressionLevel: 9 })
    .toFile(maskableDest);
console.log(`Wrote icon-512-maskable.png (${maskableSize}x${maskableSize}, safe zone)`);
