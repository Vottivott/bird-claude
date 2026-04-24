import * as store from '../store.js';
import { getTotalRuns, getTotalDistance } from '../models/run.js';
import { updateStreaks, getUpcomingRewards } from '../models/streak.js';
import { getMaxAffordableLevel, getCurrentNestInfo, NEST_LEVELS } from '../models/nest.js';
import { navigate } from '../router.js';
import { namedAsset } from '../utils/assets.js';

export function mount(container) {
  const streaks = updateStreaks();
  const econ = store.getEconomy();
  const totalRuns = getTotalRuns();
  const totalDist = getTotalDistance();
  const upcoming = getUpcomingRewards(streaks);

  const div = document.createElement('div');
  div.className = 'view';

  const nestInfo = getCurrentNestInfo();
  const maxAffordable = getMaxAffordableLevel();
  const nestUpgradeAvailable = maxAffordable > nestInfo.level;
  const upgradeName = nestUpgradeAvailable ? NEST_LEVELS[Math.min(maxAffordable, NEST_LEVELS.length - 1)].name : '';

  const greeting = getGreeting();

  div.innerHTML = `
    <div class="home-crow">
      <img src="${namedAsset(totalRuns > 0 ? '52_happy1.png' : '19_looking_at_user.png')}" alt="Crow">
    </div>
    <div class="home-greeting">${greeting}</div>

    <div class="home-stats">
      <div class="home-stat">
        <div class="home-stat__value">${totalRuns}</div>
        <div class="home-stat__label">Total Runs</div>
      </div>
      <div class="home-stat">
        <div class="home-stat__value">${totalDist.toFixed(1)}</div>
        <div class="home-stat__label">Total km</div>
      </div>
      <div class="home-stat">
        <div class="home-stat__value">${streaks.daily.current}</div>
        <div class="home-stat__label">Day Streak</div>
      </div>
      <div class="home-stat">
        <div class="home-stat__value">${econ.seeds}</div>
        <div class="home-stat__label">Seeds</div>
      </div>
    </div>

    <div class="quick-actions">
      <button class="btn btn--primary" id="btn-log-run">Log a Run</button>
      <button class="btn btn--ghost" id="btn-log-weight">Log Weight</button>
    </div>

    ${nestUpgradeAvailable ? `
      <div class="card" style="border:2px solid var(--accent);cursor:pointer" id="nest-upgrade-banner">
        <div style="display:flex;align-items:center;gap:12px">
          <img src="${namedAsset('54_very_happy.png')}" style="width:48px;height:48px;object-fit:contain">
          <div style="flex:1">
            <div style="font-weight:700;font-size:15px">Nest Upgrade Available!</div>
            <div style="font-size:13px;color:var(--text-light)">You can upgrade to <strong>${upgradeName}</strong></div>
          </div>
          <div style="font-size:20px;color:var(--accent)">&#8250;</div>
        </div>
      </div>
    ` : ''}

    ${upcoming.length > 0 ? `
      <div class="card">
        <div class="card__title">Upcoming Rewards</div>
        ${upcoming.map(u => `
          <div style="display:flex;justify-content:space-between;align-items:center;padding:8px 0;border-bottom:1px solid #f0f0f0">
            <div>
              <div style="font-weight:600;font-size:14px">${u.type}</div>
              <div style="font-size:12px;color:var(--text-light)">${u.description}</div>
            </div>
            <div style="text-align:right">
              <div style="font-weight:700;color:var(--accent)">${u.reward} seeds</div>
              <div style="font-size:11px;color:var(--text-muted)">in ~${u.daysLeft}d</div>
            </div>
          </div>
        `).join('')}
      </div>
    ` : ''}

    ${totalRuns === 0 ? `
      <div class="card card--accent" style="text-align:center;padding:24px">
        <img src="${namedAsset('38_pointing_to_the_right.png')}"
             alt="" style="max-height:100px;margin-bottom:12px">
        <div style="font-size:16px;font-weight:600">Welcome to Crow Run!</div>
        <div style="font-size:14px;opacity:0.9;margin-top:4px">Log your first run to start earning seeds and explore the map!</div>
      </div>
    ` : ''}

    <div class="card">
      <div class="card__title">Streaks</div>
      <div style="display:grid;grid-template-columns:1fr 1fr;gap:8px">
        <div style="text-align:center;padding:8px">
          <div style="font-size:20px;font-weight:700;color:${streaks.daily.current > 0 ? 'var(--green-dark)' : 'var(--text-muted)'}">${streaks.daily.current}</div>
          <div style="font-size:11px;color:var(--text-light)">Daily</div>
        </div>
        <div style="text-align:center;padding:8px">
          <div style="font-size:20px;font-weight:700;color:${streaks.everyOther.current > 0 ? 'var(--green-dark)' : 'var(--text-muted)'}">${streaks.everyOther.current}</div>
          <div style="font-size:11px;color:var(--text-light)">Every 2nd Day</div>
        </div>
        <div style="text-align:center;padding:8px">
          <div style="font-size:20px;font-weight:700;color:${streaks.everyThird.current > 0 ? 'var(--green-dark)' : 'var(--text-muted)'}">${streaks.everyThird.current}</div>
          <div style="font-size:11px;color:var(--text-light)">Every 3rd Day</div>
        </div>
        <div style="text-align:center;padding:8px">
          <div style="font-size:20px;font-weight:700;color:${streaks.weekly.current > 0 ? 'var(--green-dark)' : 'var(--text-muted)'}">${streaks.weekly.current}</div>
          <div style="font-size:11px;color:var(--text-light)">Weekly</div>
        </div>
      </div>
      <button class="btn btn--ghost" style="width:100%;margin-top:8px;padding:10px" id="btn-streaks">View Streaks & Calendar</button>
    </div>
  `;

  container.appendChild(div);

  div.querySelector('#btn-log-run').addEventListener('click', () => navigate('log'));
  div.querySelector('#btn-log-weight').addEventListener('click', () => navigate('weight'));
  div.querySelector('#btn-streaks').addEventListener('click', () => navigate('streaks'));
  const nestBanner = div.querySelector('#nest-upgrade-banner');
  if (nestBanner) nestBanner.addEventListener('click', () => navigate('nest'));
}

function getGreeting() {
  const h = new Date().getHours();
  if (h < 12) return 'Good morning!';
  if (h < 18) return 'Good afternoon!';
  return 'Good evening!';
}
