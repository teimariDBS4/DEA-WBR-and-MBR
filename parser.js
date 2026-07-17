// ── Excel Parser ──
const Parser = (() => {

  const BUCKET_MAP = {
    'Not Inducted on time': { section4: '4.1', section2: '2.1' },
    'Not Dispatched':       { section4: '4.2', section2: '2.2' },
    'Items missing':        { section4: '4.3', section2: '2.3' },
    'Out of delivery time': { section4: '4.4', section2: '2.4' },
    'Late Dispatch':        { section4: '4.5', section2: '2.5' },
    'Not Attempted':        { section4: '4.6', section2: '2.6' },
    'Other':                { section4: '4.7', section2: '2.7' },
  };

  function parseNum(val) {
    if (val === null || val === undefined || val === '-' || val === '') return 0;
    if (typeof val === 'number') return val;
    return parseFloat(String(val).replace(/,/g, '')) || 0;
  }

  function detectWeekNumber(rows) {
    // Look for a header row containing week label like "2026-W28"
    for (const row of rows) {
      for (const cell of row) {
        const s = String(cell || '');
        const m = s.match(/(\d{4})-W(\d{1,2})/);
        if (m) return { year: m[1], week: m[2].padStart(2,'0') };
      }
    }
    return null;
  }

  function findRowByLabel(rows, label) {
    for (const row of rows) {
      const first = String(row[0] || row[1] || '').trim();
      if (first.toLowerCase().includes(label.toLowerCase())) return row;
      // also check second cell
      const second = String(row[1] || '').trim();
      if (second.toLowerCase().includes(label.toLowerCase())) return row;
    }
    return null;
  }

  function findRowByPrefix(rows, prefix) {
    for (const row of rows) {
      for (let i = 0; i < Math.min(3, row.length); i++) {
        const cell = String(row[i] || '').trim();
        if (cell.startsWith(prefix)) return row;
      }
    }
    return null;
  }

  // Returns column indices for Sun-Sat + Total WXX
  function detectDayColumns(rows) {
    const DAYS = ['SUN','MON','TUE','WED','THU','FRI','SAT'];
    for (const row of rows) {
      const dayIndices = [];
      let totalIdx = -1;
      row.forEach((cell, i) => {
        const s = String(cell || '').toUpperCase();
        if (DAYS.some(d => s.includes(d))) dayIndices.push({ idx: i, label: s.split('-').slice(0,2).join('-') });
        if (s.includes('TOTAL') && s.includes('W') && !s.includes('WOW')) totalIdx = i;
      });
      if (dayIndices.length === 7) return { dayIndices, totalIdx };
    }
    return null;
  }

  function parse(arrayBuffer) {
    const wb = XLSX.read(arrayBuffer, { type: 'array' });
    const ws = wb.Sheets[wb.SheetNames[0]];
    const raw = XLSX.utils.sheet_to_json(ws, { header: 1, defval: '' });

    const weekInfo = detectWeekNumber(raw);
    const cols = detectDayColumns(raw);

    if (!cols) throw new Error('Could not detect day columns. Please check the file format.');

    const { dayIndices, totalIdx } = cols;

    // Helper: extract daily values + total from a row
    function extractRow(row) {
      if (!row) return null;
      const days = dayIndices.map(d => parseNum(row[d.idx]));
      const total = totalIdx >= 0 ? parseNum(row[totalIdx]) : days.reduce((a,b) => a+b, 0);
      return { days, total };
    }

    // 1.1 DEA Volume
    const row11 = findRowByLabel(raw, 'DEA Volume');
    const vol = extractRow(row11);

    // 1.4 Last Mile BPS
    const row14 = findRowByLabel(raw, 'Last Mile (bps) [Int PDD]');
    const bpsTotal = row14 && totalIdx >= 0 ? parseNum(row14[totalIdx]) : 0;
    const bpsDays = row14 ? dayIndices.map(d => parseNum(row14[d.idx])) : [];

    // Section 4: DEA Misses per bucket
    const buckets = {};
    for (const [name, keys] of Object.entries(BUCKET_MAP)) {
      const row4 = findRowByPrefix(raw, keys.section4);
      const row2 = findRowByPrefix(raw, keys.section2);
      const miss = extractRow(row4);
      const bpsRow = extractRow(row2);
      if (miss) {
        buckets[name] = {
          units: miss.total,
          unitsByDay: miss.days,
          bps: bpsRow ? bpsRow.total : 0,
          bpsByDay: bpsRow ? bpsRow.days : [],
        };
      }
    }

    // Sort descending by BPS
    const sortedBuckets = Object.entries(buckets)
      .filter(([,v]) => v.bps > 0 || v.units > 0)
      .sort((a,b) => b[1].bps - a[1].bps || b[1].units - a[1].units);

    const totalMisses = sortedBuckets.reduce((s,[,v]) => s + v.units, 0);

    return {
      weekKey: weekInfo ? `${weekInfo.year}-W${weekInfo.week}` : `W-unknown`,
      weekLabel: weekInfo ? `W${weekInfo.week} ${weekInfo.year}` : 'Unknown Week',
      year: weekInfo?.year || '',
      week: weekInfo?.week || '',
      deaVolume: vol ? vol.total : 0,
      deaVolByDay: vol ? vol.days : [],
      totalBPS: bpsTotal,
      bpsByDay: bpsDays,
      totalMisses,
      dayLabels: dayIndices.map(d => d.label),
      sortedBuckets, // [[name, {units, bps, unitsByDay, bpsByDay}], ...]
    };
  }

  return { parse };
})();
