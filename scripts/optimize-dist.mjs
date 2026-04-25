import sharp from 'sharp';
import fs from 'node:fs';
import path from 'node:path';

const DIST = path.resolve('dist');

const RULES = [
  // Crow sprites: max 160px display, 2x retina = 320
  { glob: 'assets/named_selection_borderless_8x_cleaned_crow_toned/*.png', maxDim: 320,
    exclude: ['walking_hex.png', 'running_transparent_loop.png', 'walking_transparent_loop.png',
              'running_small.png', 'walking_small.png', 'walking_tiny.png'] },
  // Seeds, sticks, footsteps: 22-28px display icons = 100
  { glob: 'assets/named_selection_borderless_8x_cleaned_crow_toned/seeds.png', maxDim: 100 },
  { glob: 'assets/named_selection_borderless_8x_cleaned_crow_toned/stick_pair.png', maxDim: 100 },
  { glob: 'assets/named_selection_borderless_8x_cleaned_crow_toned/stick_pile.png', maxDim: 100 },
  { glob: 'assets/named_selection_borderless_8x_cleaned_crow_toned/watering_can_*.png', maxDim: 200 },
  { glob: 'assets/bird_footsteps.png', maxDim: 100 },
  // Hex tiles: drawn at ~96x90 on canvas = 200
  { glob: 'assets/hex_sprites_aligned/*.png', maxDim: 200, exclude: ['hex_sprites_aligned_collage.png'] },
  // Nest backgrounds: fills ~390px width, 2x = 800
  { glob: 'assets/nest_progression/*.png', maxDim: 800 },
  // Plant images: displayed large in nest scene, 2x retina = 400
  { glob: 'assets/plants_prepared_named_transparent/*.png', maxDim: 400 },
];

const DELETE = [
  'assets/bird_square_strict.gif',
  'assets/speaking_animation.gif',
  'assets/speaking_animation_white_bg.gif',
  'assets/hex_sprites_aligned/hex_sprites_aligned_collage.png',
  'assets/hex_sprites_aligned/hex_sprites_aligned_manifest.txt',
  'assets/named_selection_borderless_8x_cleaned_crow_toned/retint_manifest.json',
  'assets/named_selection_borderless_8x_cleaned_crow_toned/walking_transparent_loop.png',
];

function matchGlob(filepath, pattern) {
  const regex = pattern.replace(/\./g, '\\.').replace(/\*/g, '[^/]*');
  return new RegExp('^' + regex + '$').test(filepath);
}

async function optimizeFile(filepath, maxDim) {
  const meta = await sharp(filepath).metadata();
  if (!meta.width || !meta.height) return;
  const currentMax = Math.max(meta.width, meta.height);
  if (currentMax <= maxDim) return;

  const sizeBefore = fs.statSync(filepath).size;
  const buf = await sharp(filepath)
    .resize({ width: maxDim, height: maxDim, fit: 'inside', withoutEnlargement: true })
    .png({ compressionLevel: 9 })
    .toBuffer();
  fs.writeFileSync(filepath, buf);
  const sizeAfter = buf.length;
  const saved = ((sizeBefore - sizeAfter) / sizeBefore * 100).toFixed(0);
  console.log(`  ${path.relative(DIST, filepath)}: ${meta.width}x${meta.height} → ${maxDim}max (${saved}% smaller)`);
}

async function run() {
  // Delete unused files
  for (const rel of DELETE) {
    const full = path.join(DIST, rel);
    if (fs.existsSync(full)) {
      fs.unlinkSync(full);
      console.log(`Deleted: ${rel}`);
    }
  }

  // Collect all files
  const allFiles = [];
  function walk(dir) {
    for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
      const full = path.join(dir, entry.name);
      if (entry.isDirectory()) walk(full);
      else if (entry.name.endsWith('.png')) allFiles.push(full);
    }
  }
  walk(DIST);

  // Apply rules
  let totalBefore = 0, totalAfter = 0;
  for (const rule of RULES) {
    for (const filepath of allFiles) {
      const rel = path.relative(DIST, filepath);
      if (!matchGlob(rel, rule.glob)) continue;
      if (rule.exclude && rule.exclude.includes(path.basename(filepath))) continue;
      const before = fs.statSync(filepath).size;
      totalBefore += before;
      await optimizeFile(filepath, rule.maxDim);
      totalAfter += fs.statSync(filepath).size;
    }
  }

  console.log(`\nTotal optimized: ${(totalBefore/1048576).toFixed(1)} MB → ${(totalAfter/1048576).toFixed(1)} MB`);

  // Report final dist size
  let distTotal = 0;
  function countSize(dir) {
    for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
      const full = path.join(dir, entry.name);
      if (entry.isDirectory()) countSize(full);
      else distTotal += fs.statSync(full).size;
    }
  }
  countSize(DIST);
  console.log(`Final dist size: ${(distTotal/1048576).toFixed(1)} MB`);
}

run().catch(console.error);
