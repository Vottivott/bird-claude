# Crow Run - Implementation Plan

## Context

Build "Crow Run", a gamified exercise tracking web app from an asset-only repo. The repo contains crow character sprites (24 poses), two APNG animations (running 110 frames, walking 232 frames), item images (seeds, sticks, watering cans), and app icons. No code exists yet.

The app tracks runs, rewards users with seeds/sticks via a hex board game, manages streaks, shows a performance frontier plot, and lets users build up a crow nest.

## Tech Stack

- **Vite** (vanilla JS, no framework) - dev server + build
- **Chart.js 4.x** - scatter plot (performance frontier) + line chart (weight)
- **HTML5 Canvas** - hex board rendering
- **Native APNG** in `<img>` tags (browsers support it) + build-time optimization
- **localStorage** for all persistence
- **Hash-based routing** (hand-rolled, ~50 lines)
- No TypeScript, no React/Vue

## Project Structure

```
src/
  index.html
  styles/
    main.css          # CSS custom properties, palette, base
    components.css    # Cards, buttons, inputs, modals
    views.css         # Per-view layouts
    hex.css           # Hex board styles
  js/
    app.js            # Entry point, init, global state
    router.js         # Hash-based view switching
    store.js          # localStorage wrapper + pub-sub event bus
    models/
      run.js          # Run creation, validation, speed calc
      streak.js       # Streak detection for 4 cadences
      economy.js      # Seeds/sticks balance, transactions
      hexboard.js     # Board generation, content, state
      nest.js         # Nest levels, furniture
      frontier.js     # Upper convex hull, frontier-push check
      plant.js        # Plant lifecycle (soil -> water -> collect)
    views/
      home.js         # Dashboard
      log-run.js      # Run input form + reward animation
      records.js      # Performance frontier chart
      streaks.js      # Streak calendar + details
      hex-game.js     # Hex board game
      nest-view.js    # Nest display + furniture placement
      weight.js       # Weight tracking
    ui/
      crow.js         # Crow sprite manager (contextual display)
      hex-renderer.js # Canvas hex grid renderer
      chart-records.js# Chart.js performance plot config
      chart-weight.js # Chart.js weight plot + EMA smoothing
      calendar.js     # Streak calendar component
      modal.js        # Reusable modal/dialog
      toast.js        # Reward notification popups
    utils/
      convex-hull.js  # Andrew's monotone chain (upper hull)
      date.js         # Day-diff, date formatting helpers
      random.js       # Seeded PRNG for board generation
  img/                # Optimized assets (output of build script)
scripts/
  optimize-assets.mjs # Resize PNGs, convert to WebP
public/
  icons/              # PWA icons
  manifest.json
vite.config.js
package.json
```

## Data Model (localStorage keys)

**`crowrun_runs`** - Array of `{ id, date, durationMinutes, distanceKm, speedKmh, isFrontierPush, seedsEarned }`

**`crowrun_weight`** - Array of `{ id, date, weightKg }`

**`crowrun_economy`** - `{ seeds, sticks, totalSeedsEarned, totalSticksEarned, waterInventory: [{size, usesLeft}], transactions[] }`

**`crowrun_streaks`** - Cached: `{ daily, everyOther, everyThird, weekly }` each with `{ current, best }` + `lastMilestonesAwarded`

**`crowrun_hexboard`** - `{ hexes[], playerPosition, pendingSteps, totalHexesVisited }`

**`crowrun_nest`** - `{ level, furniture[], inventory[] }`

**`crowrun_plants`** - Array of `{ id, plantType, cost, wateringsNeeded, wateringsGiven, hexId, ready }`

## Implementation Phases

### Phase 1: Skeleton + Core Data
1. Init Vite project, create `index.html` shell with bottom nav + status bar (seeds/sticks)
2. Implement `router.js` (hash-based: #home, #log, #records, #streaks, #hex, #nest, #weight)
3. Implement `store.js` (localStorage CRUD + pub-sub event emitter)
4. Build global CSS: pastel palette, card components, bottom tab bar
5. Implement `crow.js` (shows correct sprite for current context)
6. Copy & reference optimized assets (initially use raw assets, optimize later)

### Phase 2: Run Logging + Performance Plot
1. `log-run.js`: duration/distance form, large touch-friendly inputs, submit -> shows crow running APNG -> reward screen
2. `run.js` model: create run, calc speed, persist
3. `frontier.js`: upper convex hull algo, frontier-push detection
4. `chart-records.js`: Chart.js scatter plot + custom plugin drawing filled frontier polygon
5. `records.js` view: mounts chart, highlights frontier-push points in gold
6. `economy.js`: +10 seeds per run, +5 if frontier push

### Phase 3: Streak System
1. `streak.js`: compute streaks for 4 cadences from run dates
   - Daily: max gap 1 day
   - Every-other-day: max gap 2 days
   - Every-third-day: max gap 3 days
   - Weekly: max gap 7 days
2. Streak rewards:
   - Daily 7-day milestones: 100, 200, 400, 800... (doubling)
   - Every-2nd-day 7-run milestones: 20, 40, 60, 80... (+20)
   - Every-3rd-day 7-run milestones: 20, 30, 40, 50... (+10)
   - Weekly: TBD
3. `calendar.js`: month grid with colored dots for run days, streak highlighting
4. `streaks.js` view: all 4 streak types, current count, **next milestone date + reward amount**
5. After run log: celebrate with `56_streak_bonus.png` if milestone hit

### Phase 4: Hex Board Game (most complex)
1. `hexboard.js` model:
   - Procedural corridor generation (left-to-right)
   - ~25% branch probability (diamond-shaped forks that merge)
   - Shop hex every 15-25 hexes, soil hex every 10-20 hexes
   - Content at reveal: seeds (1-3), 33% chance sticks (67% -> 1, 33% -> 3-5)
   - Steps per run: `Math.ceil(distanceKm)`
2. `hex-renderer.js`: flat-top hex canvas rendering
   - Axial coords (q,r) -> pixel with isometric squash (y * 0.8)
   - Viewport centered on player, pans rightward
   - Hex states: hidden/fog, revealed, current, shop (visible icon), soil (visible icon)
   - Crow sprite on current hex, slide animation between hexes
3. `hex-game.js` view: step through hexes, show found items with crow reactions
   - `find_seed.png` / `find_seeds.png` for seed discoveries
   - `find_stick.png` / `find_sticks.png` for stick discoveries
4. Shop modal: furniture catalog (swimming pool 1000, sunchair 500), water (100/150/200 for 1/2/3 uses)
5. Soil hex: plant seeds (costs vary, e.g. 800), crow shows planting_1-4 sequence
6. Plant lifecycle: placed 5-10 hexes ahead, when reached either collect or water+push forward. More expensive = more waterings needed.

### Phase 5: Nest System
1. `nest.js` model: stick thresholds (0=ground, 10=tree, 20=larger, 30=largest)
2. Nest view: CSS-composed scene (gradients, positioned elements) + crow sprite
3. Can always choose a lower nest. See next unlock, rest hidden with "?"
4. Furniture placement from inventory into nest positions

### Phase 6: Weight Tracking
1. Weight input form
2. Chart.js line chart: raw points + EMA smoothed curve (alpha ~0.3)

### Phase 7: Polish
1. Asset optimization (resize PNGs to max display size, WebP conversion)
2. PWA manifest + service worker
3. Animations/transitions (page transitions, reward popups, crow bounce)
4. Mobile responsive testing
5. First-launch onboarding with speaking crow

## Key Algorithms

**Upper Convex Hull** (for frontier): Andrew's monotone chain on sorted points. Frontier push = new point's y exceeds interpolated frontier y at that x.

**Streak Detection**: Convert run dates to unique local-date set. Walk backwards from today checking gaps <= maxGapDays (1/2/3/7).

**Hex Board Generation**: Seeded PRNG. Main path picks from 3 rightward hex neighbors. 25% branch chance creates diamond fork. Content determined at reveal time using boardSeed + hexId.

**Weight EMA**: `smoothed[i] = alpha * raw[i] + (1-alpha) * smoothed[i-1]`, alpha=0.3

## Navigation (bottom tab bar)

**Home** | **Log** | **Map** | **Records** | **Nest**

- Home: dashboard, streak summary, seeds/sticks, quick-log, weight link
- Log: run form -> reward animation -> hex game
- Map: hex board game
- Records: performance plot (+ weight chart tab)
- Nest: nest scene + furniture

## Visual Design

- Palette: soft blue-purple (#8B9FD4) primary, cream (#FFF8E7) bg, golden (#E8C547) accent, soft green (#9FD4A0), warm brown (#A0785A)
- Rounded cards (16px radius), soft shadows
- Crow always visible in top section, contextual pose
- Large touch-friendly inputs (48px+)
- Mobile-first, portrait layout

## Asset Optimization

Raw assets = 114 MB (APNGs alone = 102 MB). Strategy:
1. Static sprites: resize to max 600px wide, convert to WebP (80-200KB each)
2. APNGs: serve as-is initially (browsers handle APNG natively), optimize later by extracting frames to sprite sheets if load times are problematic
3. Items: resize to 100px, WebP (~5-15KB each)
4. Lazy-load non-critical sprites; only load neutral pose + log_run initially

## Verification

1. `npm run dev` -> opens in browser
2. Log a run -> verify seeds awarded, point appears on chart, frontier updates
3. Log runs on consecutive days -> verify daily streak increments, milestone rewards
4. Complete run -> hex board appears, step through hexes, find seeds/sticks
5. Visit shop hex -> buy items, verify seed deduction
6. Visit soil hex -> plant, find plant later, water, collect
7. Check nest -> verify stick count unlocks, furniture placement
8. Log weight -> verify plot with smoothed curve
9. Test on mobile viewport (Chrome DevTools device mode)
