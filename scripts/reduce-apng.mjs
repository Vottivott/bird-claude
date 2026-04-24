import { readFileSync, writeFileSync } from 'fs';
import sharp from 'sharp';

const INPUT = process.argv[2];
const OUTPUT = process.argv[3];
const KEEP_EVERY = parseInt(process.argv[4] || '8');
const TARGET_W = parseInt(process.argv[5] || '200');

const buf = readFileSync(INPUT);

function readU32(b, off) { return b.readUInt32BE(off); }
function readU16(b, off) { return b.readUInt16BE(off); }
function writeU32(b, off, v) { b.writeUInt32BE(v, off); }
function writeU16(b, off, v) { b.writeUInt16BE(v, off); }

function crc32(buf) {
  let table = crc32.table;
  if (!table) {
    table = crc32.table = new Uint32Array(256);
    for (let n = 0; n < 256; n++) {
      let c = n;
      for (let k = 0; k < 8; k++) c = (c & 1) ? (0xEDB88320 ^ (c >>> 1)) : (c >>> 1);
      table[n] = c;
    }
  }
  let c = 0xFFFFFFFF;
  for (let i = 0; i < buf.length; i++) c = table[(c ^ buf[i]) & 0xFF] ^ (c >>> 8);
  return (c ^ 0xFFFFFFFF) >>> 0;
}

function buildChunk(type, data) {
  const len = Buffer.alloc(4);
  writeU32(len, 0, data.length);
  const typeB = Buffer.from(type, 'ascii');
  const body = Buffer.concat([typeB, data]);
  const crcVal = crc32(body);
  const crcB = Buffer.alloc(4);
  writeU32(crcB, 0, crcVal);
  return Buffer.concat([len, body, crcB]);
}

// Parse all chunks
function parseChunks(buf) {
  const chunks = [];
  let pos = 8;
  while (pos < buf.length) {
    const len = readU32(buf, pos);
    const type = buf.slice(pos + 4, pos + 8).toString('ascii');
    const data = buf.slice(pos + 8, pos + 8 + len);
    chunks.push({ type, data });
    pos += 12 + len;
  }
  return chunks;
}

const pngSig = buf.slice(0, 8);
const chunks = parseChunks(buf);

const ihdr = chunks.find(c => c.type === 'IHDR');
const origW = readU32(ihdr.data, 0);
const origH = readU32(ihdr.data, 4);

// Group frames: each fcTL starts a frame. Frame 0's data is in IDAT chunks.
const frameGroups = [];
for (let i = 0; i < chunks.length; i++) {
  if (chunks[i].type === 'fcTL') {
    frameGroups.push({ fctlData: chunks[i].data, dataChunks: [] });
  } else if (chunks[i].type === 'IDAT') {
    if (frameGroups.length > 0) frameGroups[frameGroups.length - 1].dataChunks.push({ type: 'IDAT', data: chunks[i].data });
  } else if (chunks[i].type === 'fdAT') {
    if (frameGroups.length > 0) frameGroups[frameGroups.length - 1].dataChunks.push({ type: 'fdAT', data: chunks[i].data });
  }
}

console.log(`Parsed ${frameGroups.length} frames, ${origW}x${origH}`);

// Decide which to keep
const keepIdxs = [];
for (let i = 0; i < frameGroups.length; i += KEEP_EVERY) keepIdxs.push(i);
if (!keepIdxs.includes(0)) keepIdxs.unshift(0);
console.log(`Keeping ${keepIdxs.length} frames`);

const scale = TARGET_W / origW;
const newW = TARGET_W;
const newH = Math.round(origH * scale);
console.log(`Resizing ${origW}x${origH} -> ${newW}x${newH}`);

// For each kept frame, extract as standalone PNG, resize with sharp, get raw IDAT data
async function extractFramePNG(frame, isFirst) {
  // Get the image data bytes (stripping fdAT sequence numbers)
  const imageDataParts = frame.dataChunks.map(dc => {
    if (dc.type === 'fdAT') return dc.data.slice(4); // strip 4-byte seq num
    return dc.data; // IDAT data as-is
  });

  // Frame dimensions from fcTL
  const fw = readU32(frame.fctlData, 4);
  const fh = readU32(frame.fctlData, 8);

  // Build a standalone PNG from this frame's data
  const fIhdr = Buffer.alloc(13);
  writeU32(fIhdr, 0, fw);
  writeU32(fIhdr, 4, fh);
  fIhdr[8] = ihdr.data[8];  // bit depth
  fIhdr[9] = ihdr.data[9];  // color type
  fIhdr[10] = 0; fIhdr[11] = 0; fIhdr[12] = 0;

  const parts = [
    pngSig,
    buildChunk('IHDR', fIhdr),
  ];
  for (const d of imageDataParts) {
    parts.push(buildChunk('IDAT', d));
  }
  parts.push(buildChunk('IEND', Buffer.alloc(0)));

  const framePng = Buffer.concat(parts);

  // Resize with sharp
  const resized = await sharp(framePng)
    .resize(newW, newH, { fit: 'fill' })
    .png({ compressionLevel: 9 })
    .toBuffer();

  return resized;
}

// Process all kept frames
const resizedPNGs = [];
for (let ki = 0; ki < keepIdxs.length; ki++) {
  const fi = keepIdxs[ki];
  const frame = frameGroups[fi];
  const png = await extractFramePNG(frame, fi === 0);
  resizedPNGs.push(png);
  process.stdout.write(`\rProcessed frame ${ki + 1}/${keepIdxs.length}`);
}
console.log('');

// Now reassemble as APNG
// Extract IDAT data from each resized PNG
function extractIDAT(pngBuf) {
  const chunks = parseChunks(pngBuf);
  return Buffer.concat(chunks.filter(c => c.type === 'IDAT').map(c => c.data));
}

// Build new IHDR
const newIhdr = Buffer.alloc(13);
writeU32(newIhdr, 0, newW);
writeU32(newIhdr, 4, newH);
newIhdr[8] = 8;  // 8-bit
newIhdr[9] = 6;  // RGBA
newIhdr[10] = 0; newIhdr[11] = 0; newIhdr[12] = 0;

// Build acTL
const acTL = Buffer.alloc(8);
writeU32(acTL, 0, keepIdxs.length); // num_frames
writeU32(acTL, 4, 0); // num_plays (0 = infinite)

const outParts = [
  pngSig,
  buildChunk('IHDR', newIhdr),
  buildChunk('acTL', acTL),
];

let seqNum = 0;
for (let ki = 0; ki < resizedPNGs.length; ki++) {
  const fi = keepIdxs[ki];
  const origFrame = frameGroups[fi];
  const idatData = extractIDAT(resizedPNGs[ki]);

  // Build fcTL
  const fcTL = Buffer.alloc(26);
  writeU32(fcTL, 0, seqNum++);     // sequence_number
  writeU32(fcTL, 4, newW);          // width
  writeU32(fcTL, 8, newH);          // height
  writeU32(fcTL, 12, 0);            // x_offset
  writeU32(fcTL, 16, 0);            // y_offset
  // Scale delay
  const origDelayNum = readU16(origFrame.fctlData, 20);
  const origDelayDen = readU16(origFrame.fctlData, 22) || 100;
  const newDelay = Math.min(origDelayNum * KEEP_EVERY, 65535);
  writeU16(fcTL, 20, newDelay);     // delay_num
  writeU16(fcTL, 22, origDelayDen); // delay_den
  fcTL[24] = 0;  // dispose: none
  fcTL[25] = 0;  // blend: source

  outParts.push(buildChunk('fcTL', fcTL));

  if (ki === 0) {
    // First frame uses IDAT
    outParts.push(buildChunk('IDAT', idatData));
  } else {
    // Subsequent frames use fdAT
    const seqBuf = Buffer.alloc(4);
    writeU32(seqBuf, 0, seqNum++);
    outParts.push(buildChunk('fdAT', Buffer.concat([seqBuf, idatData])));
  }
}

outParts.push(buildChunk('IEND', Buffer.alloc(0)));

const outBuf = Buffer.concat(outParts);
writeFileSync(OUTPUT, outBuf);
console.log(`Output: ${keepIdxs.length} frames, ${newW}x${newH}, ${(outBuf.length / 1024).toFixed(0)} KB (was ${(buf.length / 1024).toFixed(0)} KB)`);
