export const ASSET_VERSION = __APP_ASSET_VERSION__;
export const NAMED_ASSET_BASE = '/assets/named_selection_borderless_8x_cleaned_crow_toned/';

export function assetUrl(path) {
  const separator = path.includes('?') ? '&' : '?';
  return `${path}${separator}v=${ASSET_VERSION}`;
}

export function namedAsset(file) {
  return assetUrl(`${NAMED_ASSET_BASE}${file}`);
}

export function plantAsset(file) {
  return assetUrl(`/assets/plants_prepared_named_transparent/${file}`);
}

export function iconAsset(file) {
  return assetUrl(`/icons/${file}`);
}
