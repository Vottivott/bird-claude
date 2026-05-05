export const ASSET_VERSION = __APP_ASSET_VERSION__;
export const BASE_URL = import.meta.env.BASE_URL;

export function assetUrl(path) {
  const separator = path.includes('?') ? '&' : '?';
  return `${path}${separator}v=${ASSET_VERSION}`;
}

export function publicAsset(path) {
  return assetUrl(`${BASE_URL}${path}`);
}

export function namedAsset(file) {
  return publicAsset(`assets/named_selection_borderless_8x_cleaned_crow_toned/${file}`);
}

export function plantAsset(file) {
  return publicAsset(`assets/plants_prepared_named_transparent/${file}`);
}

export function hexAsset(file) {
  return publicAsset(`assets/hex_sprites_aligned/${file}`);
}

export function nestAsset(file) {
  return publicAsset(`assets/nest_progression/${file}`);
}

export function iconAsset(file) {
  return publicAsset(`icons/${file}`);
}

export function scenePropAsset(file) {
  return publicAsset(`assets/scene_props/${file}`);
}
