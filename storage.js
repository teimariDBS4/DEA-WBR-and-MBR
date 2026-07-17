// ── Storage (Firebase Realtime Database - shared across all users) ──
const Storage = (() => {
  const DB_URL = "https://dea-bridge-default-rtdb.europe-west1.firebasedatabase.app";
  const PATH   = "/bridges";

  async function apiCall(method, weekKey, data) {
    const url = weekKey
      ? `${DB_URL}${PATH}/${weekKey}.json`
      : `${DB_URL}${PATH}.json`;
    const opts = { method };
    if (data) {
      opts.headers = { 'Content-Type': 'application/json' };
      opts.body = JSON.stringify(data);
    }
    const res = await fetch(url, opts);
    if (!res.ok) throw new Error(`Firebase error: ${res.status}`);
    return res.json();
  }

  async function getAll() {
    try {
      const data = await apiCall('GET', null, null);
      if (!data) return [];
      return Object.values(data).sort((a, b) =>
        a.weekKey > b.weekKey ? 1 : -1
      );
    } catch (e) {
      console.error('Failed to load bridges:', e);
      return [];
    }
  }

  async function save(bridge) {
    try {
      await apiCall('PUT', bridge.weekKey, bridge);
      return true;
    } catch (e) {
      console.error('Failed to save bridge:', e);
      return false;
    }
  }

  async function remove(weekKey) {
    try {
      await apiCall('DELETE', weekKey, null);
      return true;
    } catch (e) {
      console.error('Failed to delete bridge:', e);
      return false;
    }
  }

  async function getByKey(weekKey) {
    try {
      const data = await apiCall('GET', weekKey, null);
      return data || null;
    } catch (e) {
      console.error('Failed to get bridge:', e);
      return null;
    }
  }

  return { getAll, save, remove, getByKey };
})();
