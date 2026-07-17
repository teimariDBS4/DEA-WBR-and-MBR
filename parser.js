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
    for (const row of rows) {
      for (const cell of row) {
        const s = String(cell || '');
        const m = s.match(/(\d{4})-W(\d{1,2})/);
        if (m) return { year: m[1], week: m[2].padStart(2,'0'), full: s.trim() };
      }
    }
    return null;
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

  function detectDayColumns(rows, weekKey) {
    // weekKey is e.g. "2026-W28" - we want the Total column for THIS week specifically
    const DAYS = ['SUN','MON','TUE','WED','THU','FRI','SAT'];

    for (const row of rows) {
      const dayIndices = [];
      let totalIdx = -1;

      row.forEach((cell, i) => {
        const s = String(cell || '').toUpperCase().trim();

        // Match day columns
        if (DAYS.some(d => s.startsWith(d))) {
          dayIndices.push({ idx: i, label: s });
        }

        // Match the CURRENT week total column specifically e.g. "Total 2026-W28"
        if (weekKey && s.includes('TOTAL') && s.includes(weekKey.toUpperCase())) {
          totalIdx = i;
        }
      });

      if (dayIndices.length === 7 && totalIdx >= 0) {
        return { dayIndices, totalIdx };
      }

      // Fallback: if we found 7 days but no week-specific total yet,
      // keep looking but store day indices
      if (dayIndices.length === 7 && totalIdx === -1) {
        // Try to find total in same row by position (first Total after SAT)
        let foundDays = false;
        for (let i = 0; i < row.length; i++) {
          const s = String(row[i] || '').toUpperCase().trim();
          if (DAYS.some(d => s.startsWith(d))) foundDays = true;
          if (foundDays && s.includes('TOTAL') && !s.includes('WOW')) {
            // Check if this is the current week total
            if (weekKey && s.includes(weekKey.toUpperCase())) {
              totalIdx = i;
              break;
            } else if (!weekKey && totalIdx === -1) {
              totalIdx = i; // fallback if no weekKey
            }
          }
        }
        if (totalIdx >= 0) return { dayIndices, totalIdx };
      }
    }
    return null;
  }

  function parse(arrayBuffer) {
    const wb = XLSX.read(arrayBuffer, { type: 'array' });
    const ws = wb.Sheets[wb.SheetNames[0]];
    const raw = XLSX.utils.sheet_to_json(ws, { header: 1, defval: '' });

    // Step 1: detect week first
    const weekInfo = detectWeekNumber(raw);
    if (!weekInfo) throw new Error('Could not detect week number in file. Please check the file format.');

    const weekKey = `${weekInfo.year}-W${weekInfo.week}`;

    // Step 2: detect columns using weekKey to find the RIGHT total column
    const cols = detectDayColumns(raw, weekKey);
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

    // 1.4 Last Mile BPS - must be exact match to avoid picking up 1.5
    let row14 = null;
    for (const row of raw) {
      for (let i = 0; i < Math.min(3, row.length); i++) {
        const cell = String(row[i] || '').trim();
        if (cell === '1.4' || cell.startsWith('1.4\t') ||
            (cell.toLowerCase().includes('last mile (bps)') &&
             cell.toLowerCase().includes('int pdd') &&
             !cell.toLowerCase().includes('drilldown') &&
             !cell.toLowerCase().includes('ds drill'))) {
          row14 = row;
          break;
        }
      }
      if (row14) break;
    }

    // Fallback label search if exact match failed
    if (!row14) row14 = findRowByLabel(raw, 'Last Mile (bps) [Int PDD]');

    const bpsTotal = row14 && totalIdx >= 0 ? parseNum(row14[totalIdx]) : 0;
    const bpsDays  = row14 ? dayIndices.map(d => parseNum(row14[d.idx])) : [];

    // Section 4: DEA Misses per bucket
    const buckets = {};
    for (const [name, keys] of Object.entries(BUCKET_MAP)) {
      const row4 = findRowByPrefix(raw, keys.section4);
      const row2 = findRowByPrefix(raw, keys.section2);
      const miss  = extractRow(row4);
      const bpsRow = extractRow(row2);
      if (miss) {
        buckets[name] = {
          units:      miss.total,
          unitsByDay: miss.days,
          bps:        bpsRow ? bpsRow.total : 0,
          bpsByDay:   bpsRow ? bpsRow.days  : [],
        };
      }
    }

    // Sort descending by BPS then units
    const sortedBuckets = Object.entries(buckets)
      .filter(([,v]) => v.bps > 0 || v.units > 0)
      .sort((a,b) => b[1].bps - a[1].bps || b[1].units - a[1].units);

    const totalMisses = sortedBuckets.reduce((s,[,v]) => s + v.units, 0);

    // Format day labels nicely e.g. "SUN-05-JUL"
    const dayLabels = dayIndices.map(d => d.label);

    return {
      weekKey,
      weekLabel:    `W${weekInfo.week} ${weekInfo.year}`,
      year:         weekInfo.year,
      week:         weekInfo.week,
      deaVolume:    vol ? vol.total : 0,
      deaVolByDay:  vol ? vol.days  : [],
      totalBPS:     bpsTotal,
      bpsByDay:     bpsDays,
      totalMisses,
      dayLabels,
      sortedBuckets,
    };
  }

  return { parse };
})();
