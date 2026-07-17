// ── Excel Parser (handles both daily weekly and multi-week monthly formats) ──
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
    return parseFloat(String(val).replace(/,/g, '').replace(/%/g, '')) || 0;
  }

  function findRowByLabel(rows, label) {
    for (const row of rows) {
      for (let i = 0; i < Math.min(3, row.length); i++) {
        const cell = String(row[i] || '').trim();
        if (cell.toLowerCase().includes(label.toLowerCase())) return row;
      }
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

  // ── Detect file type: weekly (daily columns) or monthly (week columns) ──
  function detectFileType(rows) {
    const DAYS = ['SUN','MON','TUE','WED','THU','FRI','SAT'];
    for (const row of rows) {
      let dayCount = 0;
      let weekCount = 0;
      row.forEach(cell => {
        const s = String(cell || '').toUpperCase().trim();
        if (DAYS.some(d => s.startsWith(d))) dayCount++;
        if (s.match(/^\d{4}-W\d{1,2}$/)) weekCount++;
      });
      if (dayCount >= 7) return 'weekly';
      if (weekCount >= 2) return 'monthly';
    }
    return 'weekly'; // default
  }

  // ── Parse WEEKLY file (daily columns Sun-Sat) ──
  function parseWeekly(rows) {
    const DAYS = ['SUN','MON','TUE','WED','THU','FRI','SAT'];

    // Detect week number
    let weekInfo = null;
    for (const row of rows) {
      for (const cell of row) {
        const s = String(cell || '').trim();
        const m = s.match(/(\d{4})-W(\d{1,2})/);
        if (m) { weekInfo = { year: m[1], week: m[2].padStart(2,'0'), full: s }; break; }
      }
      if (weekInfo) break;
    }
    if (!weekInfo) throw new Error('Could not detect week number.');

    const weekKey = `${weekInfo.year}-W${weekInfo.week}`;

    // Find header row with day columns
    let dayIndices = [];
    let totalIdx = -1;
    for (const row of rows) {
      const found = [];
      let tIdx = -1;
      row.forEach((cell, i) => {
        const s = String(cell || '').toUpperCase().trim();
        if (DAYS.some(d => s.startsWith(d))) found.push({ idx: i, label: s });
        if (s.includes('TOTAL') && s.includes(weekKey.toUpperCase()) && !s.includes('WOW')) tIdx = i;
      });
      if (found.length === 7 && tIdx >= 0) { dayIndices = found; totalIdx = tIdx; break; }
    }
    if (!dayIndices.length) throw new Error('Could not detect day columns.');

    function extractRow(row) {
      if (!row) return null;
      const days = dayIndices.map(d => parseNum(row[d.idx]));
      const total = totalIdx >= 0 ? parseNum(row[totalIdx]) : days.reduce((a,b)=>a+b,0);
      return { days, total };
    }

    const row11 = findRowByLabel(rows, 'DEA Volume');
    const vol = extractRow(row11);

    // Find 1.4 specifically (not 1.5 drilldown)
    let row14 = null;
    for (const row of rows) {
      for (let i = 0; i < Math.min(3, row.length); i++) {
        const cell = String(row[i] || '').trim().toLowerCase();
        if (cell.includes('last mile (bps)') && cell.includes('int pdd') &&
            !cell.includes('drilldown') && !cell.includes('ds drill')) {
          row14 = row; break;
        }
      }
      if (row14) break;
    }

    const bpsTotal = row14 && totalIdx >= 0 ? parseNum(row14[totalIdx]) : 0;
    const bpsDays  = row14 ? dayIndices.map(d => parseNum(row14[d.idx])) : [];

    const buckets = {};
    for (const [name, keys] of Object.entries(BUCKET_MAP)) {
      const row4 = findRowByPrefix(rows, keys.section4);
      const row2 = findRowByPrefix(rows, keys.section2);
      const miss  = extractRow(row4);
      const bpsRow = extractRow(row2);
      if (miss) {
        buckets[name] = {
          units: miss.total, unitsByDay: miss.days,
          bps: bpsRow ? bpsRow.total : 0, bpsByDay: bpsRow ? bpsRow.days : [],
        };
      }
    }

    const sortedBuckets = Object.entries(buckets)
      .filter(([,v]) => v.bps > 0 || v.units > 0)
      .sort((a,b) => b[1].bps - a[1].bps || b[1].units - a[1].units);

    return {
      fileType: 'weekly',
      weekKey,
      weekLabel: `W${weekInfo.week} ${weekInfo.year}`,
      year: weekInfo.year,
      week: weekInfo.week,
      deaVolume: vol ? vol.total : 0,
      deaVolByDay: vol ? vol.days : [],
      totalBPS: bpsTotal,
      bpsByDay: bpsDays,
      totalMisses: sortedBuckets.reduce((s,[,v]) => s + v.units, 0),
      dayLabels: dayIndices.map(d => d.label),
      sortedBuckets,
    };
  }

  // ── Parse MONTHLY file (week columns e.g. 2026-W24, 2026-W25...) ──
  function parseMonthly(rows) {
    // Find the header row containing week keys like 2026-W24
    let weekCols = [];   // [{weekKey, colIdx}, ...]
    let labelColIdx = 0; // column with row labels

    for (const row of rows) {
      const found = [];
      row.forEach((cell, i) => {
        const s = String(cell || '').trim();
        const m = s.match(/(\d{4})-W(\d{1,2})/);
        if (m) found.push({ weekKey: s.trim(), colIdx: i });
      });
      if (found.length >= 2) {
        weekCols = found;
        // Label column is first non-empty column before first week col
        labelColIdx = found[0].colIdx > 0 ? 0 : 0;
        break;
      }
    }

    if (!weekCols.length) throw new Error('Could not detect week columns in monthly file.');

    // Helper: extract value for a specific week column from a row
    function getVal(row, colIdx) {
      return row ? parseNum(row[colIdx]) : 0;
    }

    // Find data rows
    const row11 = findRowByLabel(rows, 'DEA Volume');
    const row14rows = [];
    for (const row of rows) {
      for (let i = 0; i < Math.min(3, row.length); i++) {
        const cell = String(row[i] || '').trim().toLowerCase();
        if (cell.includes('last mile (bps)') && cell.includes('int pdd') &&
            !cell.includes('drilldown') && !cell.includes('ds drill')) {
          row14rows.push(row); break;
        }
      }
    }
    const row14 = row14rows[0] || null;

    // Build per-week data
    const weeksData = weekCols.map(({ weekKey, colIdx }) => {
      const m = weekKey.match(/(\d{4})-W(\d{1,2})/);
      const weekLabel = m ? `W${m[2].padStart(2,'0')} ${m[1]}` : weekKey;

      const deaVolume = row11 ? getVal(row11, colIdx) : 0;
      const totalBPS  = row14 ? getVal(row14, colIdx) : 0;

      const buckets = {};
      for (const [name, keys] of Object.entries(BUCKET_MAP)) {
        const row4 = findRowByPrefix(rows, keys.section4);
        const row2 = findRowByPrefix(rows, keys.section2);
        const units = row4 ? getVal(row4, colIdx) : 0;
        const bps   = row2 ? getVal(row2, colIdx) : 0;
        if (units > 0 || bps > 0) {
          buckets[name] = { units, bps };
        }
      }

      const sortedBuckets = Object.entries(buckets)
        .sort((a,b) => b[1].bps - a[1].bps || b[1].units - a[1].units);

      return {
        weekKey,
        weekLabel,
        colIdx,
        deaVolume,
        totalBPS,
        totalMisses: sortedBuckets.reduce((s,[,v]) => s + v.units, 0),
        sortedBuckets,
      };
    });

    return {
      fileType: 'monthly',
      weeksData,
      availableWeeks: weekCols.map(w => w.weekKey),
    };
  }

  // ── Main parse entry point ──
  function parse(arrayBuffer) {
    const wb = XLSX.read(arrayBuffer, { type: 'array' });
    const ws = wb.Sheets[wb.SheetNames[0]];
    const rows = XLSX.utils.sheet_to_json(ws, { header: 1, defval: '' });

    const fileType = detectFileType(rows);
    if (fileType === 'monthly') return parseMonthly(rows);
    return parseWeekly(rows);
  }

  return { parse };
})();
