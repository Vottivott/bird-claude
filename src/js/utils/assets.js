export const ASSET_VERSION = __APP_ASSET_VERSION__;
const BASE = import.meta.env.BASE_URL;

export function assetUrl(path) {
  const separator = path.includes('?') ? '&' : '?';
  return `${path}${separator}v=${ASSET_VERSION}`;
}

export function namedAsset(file) {
  return assetUrl(`${BASE}assets/named_selection_borderless_8x_cleaned_crow_toned/${file}`);
}

export function plantAsset(file) {
  return assetUrl(`${BASE}assets/plants_prepared_named_transparent/${file}`);
}

export function hexAsset(file) {
  return assetUrl(`${BASE}assets/hex_sprites_aligned/${file}`);
}

export function nestAsset(file) {
  return assetUrl(`${BASE}assets/nest_progression/${file}`);
}

export function iconAsset(file) {
  return assetUrl(`${BASE}icons/${file}`);
}

export function scenePropAsset(file) {
  return assetUrl(`${BASE}assets/scene_props/${file}`);
}
