import { registerView, initRouter } from './router.js';
import * as store from './store.js';
import { mount as mountHome } from './views/home.js';
import { mount as mountLogRun } from './views/log-run.js';
import { mount as mountRecords } from './views/records.js';
import { mount as mountStreaks } from './views/streaks.js';
import { mount as mountHexGame } from './views/hex-game.js';
import { mount as mountNest } from './views/nest-view.js';
import { mount as mountWeight } from './views/weight.js';

function applyHexEditorUrlFlags() {
  const params = new URLSearchParams(window.location.search);
  const raw = params.get('hexEditor') ?? params.get('editor');
  if (!raw) return;

  const value = raw.trim().toLowerCase();
  if (['1', 'true', 'yes', 'on', 'hex'].includes(value)) {
    localStorage.setItem('crowrun_hex_editor', '1');
    if (!window.location.hash) {
      window.location.hash = 'hex';
    }
    return;
  }

  if (['0', 'false', 'no', 'off'].includes(value)) {
    localStorage.removeItem('crowrun_hex_editor');
  }
}

registerView('home', mountHome);
registerView('log', mountLogRun);
registerView('records', mountRecords);
registerView('streaks', mountStreaks);
registerView('hex', mountHexGame);
registerView('nest', mountNest);
registerView('weight', mountWeight);

function updateStatusBar() {
  const econ = store.getEconomy();
  document.getElementById('seeds-count').textContent = econ.seeds;
  document.getElementById('sticks-count').textContent = econ.sticks;
  const board = store.getHexBoard();
  document.getElementById('steps-count').textContent = board ? board.pendingSteps : 0;
}

store.subscribe('economy:changed', updateStatusBar);
store.subscribe('hexboard:changed', updateStatusBar);
updateStatusBar();

applyHexEditorUrlFlags();

const container = document.getElementById('view-container');
initRouter(container);
