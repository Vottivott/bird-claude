import * as store from '../store.js';
import { updateStreaks, getUpcomingRewards } from '../models/streak.js';
import { toLocalDateString, getMonthDays, getFirstDayOfWeek, addDays, today } from '../utils/date.js';
import { navigate } from '../router.js';
import { namedAsset } from '../utils/assets.js';

export function mount(container) {
  const streaks = updateStreaks();
  const upcoming = getUpcomingRewards(streaks);
  const runs = store.getRuns();
  const runDays = new Set(runs.map(r => toLocalDateString(r.date)));
  const todayStr = today();

  const div = document.createElement('div');
  div.className = 'view';

  const streakTypes = [
    { key: 'daily', name: 'Daily', icon: '', color: 'var(--green)', desc: 'Run every day' },
    { key: 'everyOther', name: 'Every 2nd Day', icon: '', color: 'var(--primary)', desc: 'Run at least every other day' },
    { key: 'everyThird', name: 'Every 3rd Day', icon: '', color: 'var(--accent)', desc: 'Run at least every 3 days' },
    { key: 'weekly', name: 'Weekly', icon: '', color: 'var(--brown)', desc: 'Run at least once a week' },
  ];

  div.innerHTML = `
    <div class="crow-display">
      <img src="${namedAsset(streaks.daily.current > 0 ? '56_streak_bonus.png' : '19_looking_at_user.png')}" alt="Crow">
    </div>

    ${streakTypes.map((st, idx) => {
      const s = streaks[st.key];
      const u = upcoming[idx];
      return `
        <div class="streak-card">
          <div class="streak-card__icon" style="background:${st.color}20;color:${st.color}">
            ${st.icon}
          </div>
          <div class="streak-card__info">
            <div class="streak-card__name">${st.name}</div>
            <div class="streak-card__count">${s.current} current (best: ${s.best})</div>
            <div style="font-size:11px;color:var(--text-muted);margin-top:2px">${u.description}</div>
          </div>
          <div class="streak-card__reward">
            <div class="streak-card__reward-amount">${u.reward}</div>
            <div class="streak-card__reward-label">seeds in ~${u.daysLeft}d</div>
          </div>
        </div>
      `;
    }).join('')}

    <div class="card" style="margin-top:4px">
      <div class="card__title">Calendar</div>
      <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:8px">
        <button class="btn btn--ghost" style="padding:6px 12px;font-size:13px" id="btn-prev-month">&lt;</button>
        <span id="month-label" style="font-weight:600"></span>
        <button class="btn btn--ghost" style="padding:6px 12px;font-size:13px" id="btn-next-month">&gt;</button>
      </div>
      <div class="streak-calendar" id="calendar-grid"></div>
      <div style="display:flex;gap:16px;justify-content:center;margin-top:12px;font-size:12px;color:var(--text-light)">
        <span><span style="display:inline-block;width:10px;height:10px;border-radius:50%;background:var(--green);vertical-align:middle;margin-right:4px"></span>Run day</span>
        <span><span style="display:inline-block;width:10px;height:10px;border-radius:50%;border:2px solid var(--primary);vertical-align:middle;margin-right:4px"></span>Today</span>
      </div>
    </div>

    <button class="btn btn--ghost" style="width:100%;margin-top:4px" id="btn-back">Back to Home</button>
  `;

  container.appendChild(div);

  const now = new Date();
  let currentYear = now.getFullYear();
  let currentMonth = now.getMonth();

  function renderCalendar() {
    const grid = div.querySelector('#calendar-grid');
    const label = div.querySelector('#month-label');
    const monthName = new Date(currentYear, currentMonth).toLocaleDateString(undefined, { month: 'long', year: 'numeric' });
    label.textContent = monthName;

    const daysInMonth = getMonthDays(currentYear, currentMonth);
    const firstDay = getFirstDayOfWeek(currentYear, currentMonth);

    const days = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];
    let html = days.map(d => `<div class="streak-calendar__header">${d}</div>`).join('');

    for (let i = 0; i < firstDay; i++) {
      html += '<div class="streak-calendar__day streak-calendar__day--empty"></div>';
    }

    for (let d = 1; d <= daysInMonth; d++) {
      const dateStr = `${currentYear}-${String(currentMonth + 1).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
      const isToday = dateStr === todayStr;
      const hasRun = runDays.has(dateStr);

      let cls = 'streak-calendar__day';
      if (isToday) cls += ' streak-calendar__day--today';
      if (hasRun) cls += ' streak-calendar__day--run';

      html += `<div class="${cls}">${d}</div>`;
    }

    grid.innerHTML = html;
  }

  renderCalendar();

  div.querySelector('#btn-prev-month').addEventListener('click', () => {
    currentMonth--;
    if (currentMonth < 0) { currentMonth = 11; currentYear--; }
    renderCalendar();
  });

  div.querySelector('#btn-next-month').addEventListener('click', () => {
    currentMonth++;
    if (currentMonth > 11) { currentMonth = 0; currentYear++; }
    renderCalendar();
  });

  div.querySelector('#btn-back').addEventListener('click', () => navigate('home'));
}
