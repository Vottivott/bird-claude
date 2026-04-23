import { registerView, initRouter } from './router.js';
import * as store from './store.js';
import { mount as mountHome } from './views/home.js';
import { mount as mountLogRun } from './views/log-run.js';
import { mount as mountRecords } from './views/records.js';
import { mount as mountStreaks } from './views/streaks.js';
import { mount as mountHexGame } from './views/hex-game.js';
import { mount as mountNest } from './views/nest-view.js';
import { mount as mountWeight } from './views/weight.js';

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
}

store.subscribe('economy:changed', updateStatusBar);
updateStatusBar();

const container = document.getElementById('view-container');
initRouter(container);
