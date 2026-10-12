import fs from 'node:fs';
import path from 'node:path';
import zlib from 'node:zlib';

/**
 * Pure Node.js PNG encoder without external dependencies
 * @param {number} width
 * @param {number} height
 * @param {Buffer} rgbaBuffer
 * @returns {Buffer}
 */
function createPng(width, height, rgbaBuffer) {
  const signature = Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]);

  function chunk(type, data) {
    const len = Buffer.alloc(4);
    len.writeUInt32BE(data.length, 0);
    const typeBuf = Buffer.from(type, 'ascii');
    const crc = crc32(Buffer.concat([typeBuf, data]));
    const crcBuf = Buffer.alloc(4);
    crcBuf.writeUInt32BE(crc, 0);
    return Buffer.concat([len, typeBuf, data, crcBuf]);
  }

  // IHDR
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(width, 0);
  ihdr.writeUInt32BE(height, 4);
  ihdr[8] = 8; // bit depth
  ihdr[9] = 6; // color type: RGBA
  ihdr[10] = 0; // compression
  ihdr[11] = 0; // filter
  ihdr[12] = 0; // interlace

  // IDAT (filter 0 for each line)
  const lineSize = width * 4 + 1;
  const rawScanlines = Buffer.alloc(height * lineSize);
  for (let y = 0; y < height; y++) {
    rawScanlines[y * lineSize] = 0; // filter type 0: None
    const srcStart = y * width * 4;
    const destStart = y * lineSize + 1;
    rgbaBuffer.copy(rawScanlines, destStart, srcStart, srcStart + width * 4);
  }

  const compressed = zlib.deflateSync(rawScanlines, { level: 9 });

  return Buffer.concat([
    signature,
    chunk('IHDR', ihdr),
    chunk('IDAT', compressed),
    chunk('IEND', Buffer.alloc(0)),
  ]);
}

// CRC32 table & calculation
const crcTable = new Uint32Array(256);
for (let n = 0; n < 256; n++) {
  let c = n;
  for (let k = 0; k < 8; k++) {
    c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
  }
  crcTable[n] = c;
}

function crc32(buf) {
  let crc = 0xffffffff;
  for (let i = 0; i < buf.length; i++) {
    crc = crcTable[(crc ^ buf[i]) & 0xff] ^ (crc >>> 8);
  }
  return (crc ^ 0xffffffff) >>> 0;
}

// Draw a stylized gym badge directly to pixel buffer
function renderIcon(size, isMaskable = false) {
  const buf = Buffer.alloc(size * size * 4);
  const cx = size / 2;
  const cy = size / 2;
  const rBg = isMaskable ? size * 0.7 : size * 0.46;
  const cornerR = isMaskable ? 0 : size * 0.22;

  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      const idx = (y * size + x) * 4;
      const dx = x - cx;
      const dy = y - cy;
      const dist = Math.hypot(dx, dy);

      // Rounded rect check if not maskable
      let inside = true;
      if (!isMaskable) {
        const qx = Math.max(0, Math.abs(dx) - (cx - cornerR));
        const qy = Math.max(0, Math.abs(dy) - (cy - cornerR));
        if (Math.hypot(qx, qy) > cornerR) inside = false;
      }

      if (!inside) {
        buf[idx] = 0;
        buf[idx + 1] = 0;
        buf[idx + 2] = 0;
        buf[idx + 3] = 0;
        continue;
      }

      // Deep dark gradient with subtle glow
      const radial = Math.min(1, dist / (size * 0.55));
      let r = Math.round(11 + (1 - radial) * 22);
      let g = Math.round(17 + (1 - radial) * 25);
      let b = Math.round(41 + (1 - radial) * 55);
      let a = 255;

      // Dumbbell / Barbell shape (rotated 35 deg)
      const rad = (-35 * Math.PI) / 180;
      const cos = Math.cos(rad);
      const sin = Math.sin(rad);
      const rx = dx * cos - dy * sin;
      const ry = dx * sin + dy * cos;

      const scale = size / 512;
      const barHalfW = 150 * scale;
      const barHalfH = 12 * scale;

      // Central bar
      if (Math.abs(rx) <= barHalfW && Math.abs(ry) <= barHalfH) {
        r = 200;
        g = 215;
        b = 230;
      }

      // Left plates
      if (Math.abs(rx - (-90 * scale)) <= 11 * scale && Math.abs(ry) <= 90 * scale) {
        r = 249; g = 115; b = 22; // Orange accent
      } else if (Math.abs(rx - (-116 * scale)) <= 10 * scale && Math.abs(ry) <= 70 * scale) {
        r = 45; g = 212; b = 191; // Teal accent
      } else if (Math.abs(rx - (-138 * scale)) <= 8 * scale && Math.abs(ry) <= 45 * scale) {
        r = 100; g = 116; b = 139;
      }

      // Right plates
      if (Math.abs(rx - (90 * scale)) <= 11 * scale && Math.abs(ry) <= 90 * scale) {
        r = 249; g = 115; b = 22; // Orange accent
      } else if (Math.abs(rx - (116 * scale)) <= 10 * scale && Math.abs(ry) <= 70 * scale) {
        r = 45; g = 212; b = 191; // Teal accent
      } else if (Math.abs(rx - (138 * scale)) <= 8 * scale && Math.abs(ry) <= 45 * scale) {
        r = 100; g = 116; b = 139;
      }

      // Energy lightning bolt in center
      if (Math.abs(dx) < 28 * scale && Math.abs(dy) < 65 * scale) {
        const boltX = dx / (scale * 28);
        const boltY = dy / (scale * 65);
        if (boltY > -0.8 && boltY < 0.8 && Math.abs(boltX + boltY * 0.4) < 0.35) {
          r = 250;
          g = 204;
          b = 21; // Yellow gold
        }
      }

      buf[idx] = r;
      buf[idx + 1] = g;
      buf[idx + 2] = b;
      buf[idx + 3] = a;
    }
  }

  return createPng(size, size, buf);
}

const iconsDir = path.resolve('icons');
fs.mkdirSync(iconsDir, { recursive: true });

fs.writeFileSync(path.join(iconsDir, 'icon-512.png'), renderIcon(512, false));
fs.writeFileSync(path.join(iconsDir, 'icon-maskable-512.png'), renderIcon(512, true));
fs.writeFileSync(path.join(iconsDir, 'icon-192.png'), renderIcon(192, false));
fs.writeFileSync(path.join(iconsDir, 'apple-touch-icon.png'), renderIcon(180, false));
fs.writeFileSync(path.join(iconsDir, 'favicon-32.png'), renderIcon(32, false));

console.log('Icons generated successfully.');
