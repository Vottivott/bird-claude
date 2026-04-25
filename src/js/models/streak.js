import * as store from '../store.js';
import { toLocalDateString, dayDiff, addDays, today } from '../utils/date.js';

export function computeStreaks(runDates) {
  const daySet = new Set(runDates.map(d => toLocalDateString(d)));
  const days = [...daySet].sort().reverse();
  const todayStr = today();

  function streakLength(maxGap) {
    if (days.length === 0) return 0;

    const lastRunDay = days.find(d => d <= todayStr);
    if (!lastRunDay) return 0;
    if (dayDiff(lastRunDay, todayStr) >= maxGap) return 0;

    let count = 1;
    let prevDay = lastRunDay;

    for (let i = days.indexOf(lastRunDay) + 1; i < days.length; i++) {
      const gap = dayDiff(days[i], prevDay);
      if (gap <= maxGap) {
        count++;
        prevDay = days[i];
      } else {
        break;
      }
    }
    return count;
  }

  return {
    daily: streakLength(1),
    everyOther: streakLength(2),
    everyThird: streakLength(3),
    weekly: streakLength(7),
  };
}

export function updateStreaks() {
  const runs = store.getRuns();
  const dates = runs.map(r => r.date);
  const computed = computeStreaks(dates);

  const prev = store.getStreaks();
  const streaks = {
    daily: { current: computed.daily, best: Math.max(computed.daily, prev.daily?.best || 0) },
    everyOther: { current: computed.everyOther, best: Math.max(computed.everyOther, prev.everyOther?.best || 0) },
    everyThird: { current: computed.everyThird, best: Math.max(computed.everyThird, prev.everyThird?.best || 0) },
    weekly: { current: computed.weekly, best: Math.max(computed.weekly, prev.weekly?.best || 0) },
    lastMilestonesAwarded: prev.lastMilestonesAwarded || { daily: 0, everyOther: 0, everyThird: 0, weekly: 0 },
  };

  store.setStreaks(streaks);
  return streaks;
}

export function checkAndAwardMilestones() {
  const streaks = updateStreaks();
  const awarded = [];
  const lma = streaks.lastMilestonesAwarded;

  // Daily: milestone every 7 days, rewards double: 100, 200, 400, 800...
  if (streaks.daily.current >= 7) {
    const milestone = Math.floor(streaks.daily.current / 7) * 7;
    if (milestone > lma.daily) {
      const level = milestone / 7;
      const prevLevel = lma.daily / 7;
      for (let l = prevLevel + 1; l <= level; l++) {
        const reward = 100 * Math.pow(2, l - 1);
        store.addSeeds(reward, 'streak_daily');
        awarded.push({ type: 'daily', days: l * 7, reward });
      }
      lma.daily = milestone;
    }
  }

  // Every-other-day: milestone every 4 qualifying runs, rewards +20: 20, 40, 60, 80...
  if (streaks.everyOther.current >= 4) {
    const milestone = Math.floor(streaks.everyOther.current / 4) * 4;
    if (milestone > lma.everyOther) {
      const level = milestone / 4;
      const prevLevel = lma.everyOther / 4;
      for (let l = prevLevel + 1; l <= level; l++) {
        const reward = 20 * l;
        store.addSeeds(reward, 'streak_eod');
        awarded.push({ type: 'everyOther', days: l * 4, reward });
      }
      lma.everyOther = milestone;
    }
  }

  // Every-third-day: milestone every 4 qualifying runs, rewards +10: 20, 30, 40, 50...
  if (streaks.everyThird.current >= 4) {
    const milestone = Math.floor(streaks.everyThird.current / 4) * 4;
    if (milestone > lma.everyThird) {
      const level = milestone / 4;
      const prevLevel = lma.everyThird / 4;
      for (let l = prevLevel + 1; l <= level; l++) {
        const reward = 10 + 10 * l;
        store.addSeeds(reward, 'streak_e3d');
        awarded.push({ type: 'everyThird', days: l * 4, reward });
      }
      lma.everyThird = milestone;
    }
  }

  // Weekly: milestone every 4 weeks
  if (streaks.weekly.current >= 4) {
    const milestone = Math.floor(streaks.weekly.current / 4) * 4;
    if (milestone > lma.weekly) {
      const level = milestone / 4;
      const prevLevel = lma.weekly / 4;
      for (let l = prevLevel + 1; l <= level; l++) {
        const reward = 10 + 10 * l;
        store.addSeeds(reward, 'streak_weekly');
        awarded.push({ type: 'weekly', weeks: l * 4, reward });
      }
      lma.weekly = milestone;
    }
  }

  streaks.lastMilestonesAwarded = lma;
  store.setStreaks(streaks);
  return awarded;
}

export function getUpcomingRewards(streaks) {
  const upcoming = [];

  const dailyCurrent = streaks.daily.current;
  const dailyNext = Math.ceil((dailyCurrent + 1) / 7) * 7;
  const dailyDaysLeft = dailyNext - dailyCurrent;
  const dailyLevel = dailyNext / 7;
  upcoming.push({
    type: 'Daily',
    daysLeft: dailyDaysLeft,
    reward: 100 * Math.pow(2, dailyLevel - 1),
    description: `Run every day for ${dailyDaysLeft} more day${dailyDaysLeft > 1 ? 's' : ''}`,
  });

  const eodCurrent = streaks.everyOther.current;
  const eodNext = Math.ceil((eodCurrent + 1) / 4) * 4;
  const eodLeft = eodNext - eodCurrent;
  const eodLevel = eodNext / 4;
  upcoming.push({
    type: 'Every 2nd day',
    daysLeft: eodLeft * 2,
    reward: 20 * eodLevel,
    description: `${eodLeft} more run${eodLeft > 1 ? 's' : ''} (every other day)`,
  });

  const e3dCurrent = streaks.everyThird.current;
  const e3dNext = Math.ceil((e3dCurrent + 1) / 4) * 4;
  const e3dLeft = e3dNext - e3dCurrent;
  const e3dLevel = e3dNext / 4;
  upcoming.push({
    type: 'Every 3rd day',
    daysLeft: e3dLeft * 3,
    reward: 10 + 10 * e3dLevel,
    description: `${e3dLeft} more run${e3dLeft > 1 ? 's' : ''} (every 3 days)`,
  });

  const weeklyCurrent = streaks.weekly.current;
  const weeklyNext = Math.ceil((weeklyCurrent + 1) / 4) * 4;
  const weeklyLeft = weeklyNext - weeklyCurrent;
  const weeklyLevel = weeklyNext / 4;
  upcoming.push({
    type: 'Weekly',
    daysLeft: weeklyLeft * 7,
    reward: 10 + 10 * weeklyLevel,
    description: `${weeklyLeft} more week${weeklyLeft > 1 ? 's' : ''}`,
  });

  return upcoming;
}
