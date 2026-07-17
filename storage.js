// ── Storage (localStorage - works offline, easy to migrate to cloud) ──
const Storage = (() => {
  const KEY = 'dea_weekly_bridges';

  function getAll() {
    try {
      return JSON.parse(localStorage.getItem(KEY)) || [];
    } catch { return []; }
  }

  function save(bridge) {
    const all = getAll();
    const idx = all.findIndex(b => b.weekKey === bridge.weekKey);
    if (idx >= 0) {
      all[idx] = bridge; // overwrite same week
    } else {
      all.push(bridge);
    }
    all.sort((a, b) => (a.weekKey > b.weekKey ? 1 : -1));
    localStorage.setItem(KEY, JSON.stringify(all));
  }

  function remove(weekKey) {
    const all = getAll().filter(b => b.weekKey !== weekKey);
    localStorage.setItem(KEY, JSON.stringify(all));
  }

  function getByKey(weekKey) {
    return getAll().find(b => b.weekKey === weekKey) || null;
  }

  return { getAll, save, remove, getByKey };
})();
