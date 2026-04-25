# Bird Claude

Minimal asset repository containing only the bird graphics extracted from the
source repository at:

- `https://github.com/Vottivott/tones.git`

## Included assets
- `assets/bird_square_strict.gif`
- `assets/speaking_animation.gif`
- `assets/speaking_animation_white_bg.gif`
- `assets/icons/icon-192.png`
- `assets/icons/icon-512.png`

## Source provenance
- extracted from local clone:
  - `/data/workspace/genai/bird`
- source commit:
  - `67bfc35b983082e91906cc99bf6f684c009665c3`

## Scope
This repository intentionally excludes:
- application code
- game assets unrelated to the bird character
- medals, tone-grid images, and other UI graphics

## Layout
- `assets/`: bird-related image assets only

## Preview deploy helper

To build, deploy the Firebase Hosting preview channel, verify the live bundles,
and print the 4 cache-busted links:

```bash
npm run deploy:links
```

Optional flags:

```bash
node ./scripts/deploy-preview-links.mjs --channel birdclaude-20260425a --project viewmymodel
node ./scripts/deploy-preview-links.mjs --json
```

The script prints:
- preview link
- editor link
- reset link
- reset + editor link
