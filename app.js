// ── Main App Controller ──
(() => {
  let currentParsed        = null;
  let currentMonthlyData   = null;
  let currentMonthlyBridge = null;

  // ── Tab Navigation ──
  document.querySelectorAll('.nav-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      document.querySelectorAll('.nav-btn').forEach(b => b.classList.remove('active'));
      document.querySelectorAll('.tab-content').forEach(t => {
        t.classList.remove('active'); t.classList.add('hidden');
      });
      btn.classList.add('active');
      const tab = document.getElementById('tab-' + btn.dataset.tab);
      tab.classList.remove('hidden');
      tab.classList.add('active');
      if (btn.dataset.tab === 'saved') renderSavedList();
    });
  });

  // ── WEEKLY: Upload ──
  const weeklyDropZone  = document.getElementById('weekly-drop-zone');
  const weeklyFileInput = document.getElementById('weekly-file-input');

  weeklyDropZone.addEventListener('dragover', e => { e.preventDefault(); weeklyDropZone.classList.add('dragover'); });
  weeklyDropZone.addEventListener('dragleave', () => weeklyDropZone.classList.remove('dragover'));
  weeklyDropZone.addEventListener('drop', e => {
    e.preventDefault(); weeklyDropZone.classList.remove('dragover');
    handleWeeklyFile(e.dataTransfer.files[0]);
  });
  weeklyDropZone.addEventListener('click', () => weeklyFileInput.click());
  weeklyFileInput.addEventListener('change', () => handleWeeklyFile(weeklyFileInput.files[0]));

  function handleWeeklyFile(file) {
    if (!file) return;
    const reader = new FileReader();
    reader.onload = e => {
      try {
        const parsed = Parser.parse(e.target.result);
        if (parsed.fileType === 'monthly') {
          showFeedback('weekly-feedback', 'error',
            'This looks like a monthly file. Please use the Monthly Bridge tab.');
          return;
        }
        currentParsed = parsed;
        renderWeeklySummary(parsed);
      } catch (err) {
        showFeedback('weekly-feedback', 'error', 'Failed to parse file: ' + err.message);
      }
    };
    reader.readAsArrayBuffer(file);
  }

  // ── WEEKLY: Render ──
  function renderWeeklySummary(data) {
    document.getElementById('weekly-summary').classList.remove('hidden');
    document.getElementById('weekly-title').textContent = `DEA ${data.weekLabel} Summary`;
    document.getElementById('weekly-week-badge').textContent = data.weekKey;

    document.getElementById('weekly-stats').innerHTML = `
      <div class="stat-box">
        <div class="stat-value">${data.totalBPS} bps</div>
        <div class="stat-label">Total DEA BPS</div>
      </div>
      <div class="stat-box">
        <div class="stat-value">${data.deaVolume.toLocaleString()}</div>
        <div class="stat-label">DEA Volume (units)</div>
      </div>
      <div class="stat-box">
        <div class="stat-value">${data.totalMisses.toLocaleString()}</div>
        <div class="stat-label">Impacting Units</div>
      </div>
    `;

    const tbody = document.getElementById('weekly-bucket-body');
    tbody.innerHTML = '';
    data.sortedBuckets.forEach(([name, d], i) => {
      const pct      = data.totalMisses > 0
        ? ((d.units / data.totalMisses) * 100).toFixed(1) : '0';
      const topBadge = i < 2 ? `<span class="top-badge">RC${i+1}</span>` : '';
      tbody.innerHTML += `
        <tr>
          <td class="rank-cell">${i+1}</td>
          <td><strong>${name}</strong>${topBadge}</td>
          <td>${d.units.toLocaleString()}</td>
          <td class="bps-cell">${d.bps} bps</td>
          <td>${pct}%</td>
        </tr>`;
    });

    const rcSection = document.getElementById('weekly-rc-section');
    rcSection.innerHTML = '';

    data.sortedBuckets.slice(0, 2).forEach(([name, d], rcIdx) => {
      const block = document.createElement('div');
      block.className = 'rc-block';

      // Build day entries sorted by units descending
      const dayEntries = data.dayLabels.map((day, i) => ({
        idx:   i,
        label: day,
        units: d.unitsByDay && d.unitsByDay[i] ? d.unitsByDay[i] : 0,
      })).sort((a, b) => b.units - a.units);

      // Highest impacting day is first after sort
      const highestDay = dayEntries[0] && dayEntries[0].units > 0
        ? dayEntries[0].label : null;

      block.innerHTML = `
        <h4>RC${rcIdx+1}: ${name}
          <span style="font-weight:400;color:#888;">
            (${d.bps} bps / ${d.units.toLocaleString()} units)
          </span>
        </h4>
        <p class="rc-sub">
          Ordered by highest impact first.
          ${highestDay ? `Highest impacting day: <strong>${highestDay}</strong>.` : ''}
          Leave blank to skip that day.
        </p>
      `;

      dayEntries.forEach(({ idx, label, units }) => {
        const unitsStr  = units > 0 ? ` – ${units.toLocaleString()} units` : '';
        const isHighest = label === highestDay;
        const row       = document.createElement('div');
        row.className   = 'day-rc-row';
        row.innerHTML   = `
          <div class="day-label">${isHighest ? '⭐ ' : ''}${label}${unitsStr}</div>
          <textarea
            data-rc="${name}"
            data-day="${idx}"
            data-rc-idx="${rcIdx}"
            rows="2"
            placeholder="Root cause (optional)..."></textarea>
        `;
        block.appendChild(row);
      });

      rcSection.appendChild(block);
    });
  }

  function collectWeeklyRC() {
    const rc   = {};
    const seen = {};
    document.querySelectorAll('textarea[data-rc]').forEach(el => {
      const name  = el.dataset.rc;
      const day   = el.dataset.day;
      const rcIdx = el.dataset.rcIdx;
      const key   = `${rcIdx}-${name}-${day}`;
      if (seen[key]) return;
      seen[key] = true;
      if (!rc[name]) rc[name] = {};
      rc[name][day] = el.value.trim();
    });
    return rc;
  }

  document.getElementById('weekly-save-btn').addEventListener('click', async () => {
    if (!currentParsed) return;
    const bridge = BridgeGenerator.buildWeekly(
      currentParsed, collectWeeklyRC(),
      document.getElementById('weekly-action-plan').value
    );
    const ok = await Storage.save(bridge);
    showFeedback('weekly-feedback', ok ? 'success' : 'error',
      ok ? `✅ ${bridge.weekLabel} saved!` : 'Failed to save. Check your connection.');
  });

  document.getElementById('weekly-export-btn').addEventListener('click', async () => {
    if (!currentParsed) return;
    const bridge = BridgeGenerator.buildWeekly(
      currentParsed, collectWeeklyRC(),
      document.getElementById('weekly-action-plan').value
    );
    try {
      await DocxExport.exportWeekly(bridge);
      showFeedback('weekly-feedback', 'success', '📄 Word document downloaded!');
    } catch (e) {
      showFeedback('weekly-feedback', 'error', 'Export failed: ' + e.message);
    }
  });

  // ── MONTHLY: Upload ──
  const monthlyDropZone  = document.getElementById('monthly-drop-zone');
  const monthlyFileInput = document.getElementById('monthly-file-input');

  monthlyDropZone.addEventListener('dragover', e => { e.preventDefault(); monthlyDropZone.classList.add('dragover'); });
  monthlyDropZone.addEventListener('dragleave', () => monthlyDropZone.classList.remove('dragover'));
  monthlyDropZone.addEventListener('drop', e => {
    e.preventDefault(); monthlyDropZone.classList.remove('dragover');
    handleMonthlyFile(e.dataTransfer.files[0]);
  });
  monthlyDropZone.addEventListener('click', () => monthlyFileInput.click());
  monthlyFileInput.addEventListener('change', () => handleMonthlyFile(monthlyFileInput.files[0]));

  function handleMonthlyFile(file) {
    if (!file) return;
    const reader = new FileReader();
    reader.onload = e => {
      try {
        const parsed = Parser.parse(e.target.result);
        if (parsed.fileType !== 'monthly') {
          showFeedback('monthly-feedback', 'error',
            'This looks like a weekly file. Please use the Weekly Bridge tab.');
          return;
        }
        currentMonthlyData = parsed;
        populateWeekSelectors(parsed.availableWeeks);
        document.getElementById('monthly-range-section').classList.remove('hidden');
        document.getElementById('monthly-preview-section').classList.add('hidden');
        showFeedback('monthly-feedback', 'success',
          `✅ File loaded! Found ${parsed.availableWeeks.length} weeks: ${parsed.availableWeeks.join(', ')}`);
      } catch (err) {
        showFeedback('monthly-feedback', 'error', 'Failed to parse file: ' + err.message);
      }
    };
    reader.readAsArrayBuffer(file);
  }

  function populateWeekSelectors(weeks) {
    const fromSel = document.getElementById('monthly-week-from');
    const toSel   = document.getElementById('monthly-week-to');
    fromSel.innerHTML = '';
    toSel.innerHTML   = '';
    weeks.forEach(w => {
      fromSel.innerHTML += `<option value="${w}">${w}</option>`;
      toSel.innerHTML   += `<option value="${w}">${w}</option>`;
    });
    fromSel.selectedIndex = 0;
    toSel.selectedIndex   = weeks.length - 1;
  }

  document.getElementById('monthly-apply-range-btn').addEventListener('click', async () => {
    if (!currentMonthlyData) return;

    const fromKey = document.getElementById('monthly-week-from').value;
    const toKey   = document.getElementById('monthly-week-to').value;

    if (fromKey > toKey) {
      showFeedback('monthly-feedback', 'error', '"From" week must be before "To" week.');
      return;
    }

    const selectedWeeks = currentMonthlyData.weeksData.filter(w =>
      w.weekKey >= fromKey && w.weekKey <= toKey
    );

    if (selectedWeeks.length < 2) {
      showFeedback('monthly-feedback', 'error', 'Please select a range of at least 2 weeks.');
      return;
    }

    const savedBridges = await Storage.getAll();
    renderMonthlyPreview(selectedWeeks, savedBridges);
  });

  // ── MONTHLY: Render Preview ──
  async function renderMonthlyPreview(selectedWeeks, savedBridges) {
    const compiled = BridgeGenerator.compileMonthlyStats(selectedWeeks);

    document.getElementById('monthly-stats').innerHTML = `
      <div class="stat-box">
        <div class="stat-value">${compiled.totalBPSAvg} bps</div>
        <div class="stat-label">Avg DEA BPS</div>
      </div>
      <div class="stat-box">
        <div class="stat-value">${compiled.totalVolume.toLocaleString()}</div>
        <div class="stat-label">Total Volume (units)</div>
      </div>
      <div class="stat-box">
        <div class="stat-value">${compiled.totalMissesSum.toLocaleString()}</div>
        <div class="stat-label">Total Impacting Units</div>
      </div>
      <div class="stat-box">
        <div class="stat-value">${selectedWeeks.length}</div>
        <div class="stat-label">Weeks Included</div>
      </div>
    `;

    const tbody = document.getElementById('monthly-bucket-body');
    tbody.innerHTML = '';
    compiled.sortedBuckets.forEach(([name, d], i) => {
      const pct      = compiled.totalMissesSum > 0
        ? ((d.units / compiled.totalMissesSum) * 100).toFixed(1) : '0';
      const topBadge = i < 2 ? `<span class="top-badge">RC${i+1}</span>` : '';
      tbody.innerHTML += `
        <tr>
          <td class="rank-cell">${i+1}</td>
          <td><strong>${name}</strong>${topBadge}</td>
          <td>${d.units.toLocaleString()}</td>
          <td class="bps-cell">${d.bps} bps avg</td>
          <td>${pct}%</td>
        </tr>`;
    });

    const labelEl = document.getElementById('monthly-label');
    if (!labelEl.value) {
      labelEl.value =
        `${selectedWeeks[0].weekLabel} to ${selectedWeeks[selectedWeeks.length-1].weekLabel}`;
    }

    const autoRC = BridgeGenerator.autoFillMonthlyRC(
      selectedWeeks, compiled.sortedBuckets, savedBridges
    );

    const rcSection = document.getElementById('monthly-rc-section');
    rcSection.innerHTML = '';

    compiled.sortedBuckets.slice(0, 2).forEach(([name, d], rcIdx) => {
      const block = document.createElement('div');
      block.className = 'rc-block';

      // Sort weeks by BPS for THIS bucket descending
      const sortedWeeks = [...selectedWeeks].sort((a, b) => {
        const aBps = (a.sortedBuckets.find(([n]) => n === name) || [null, { bps: 0 }])[1].bps;
        const bBps = (b.sortedBuckets.find(([n]) => n === name) || [null, { bps: 0 }])[1].bps;
        return bBps - aBps;
      });

      const highestWeek = sortedWeeks[0] ? sortedWeeks[0].weekLabel : 'N/A';

      block.innerHTML = `
        <h4>RC${rcIdx+1}: ${name}
          <span style="font-weight:400;color:#888;">
            (avg ${d.bps} bps / ${d.units.toLocaleString()} total units)
          </span>
        </h4>
        <p class="rc-sub">
          Ordered by highest impact first.
          Highest impacting week: <strong>${highestWeek}</strong>.
          Auto-filled from saved bridges where available. Edit as needed.
        </p>
      `;

      sortedWeeks.forEach(week => {
        const wb        = week.sortedBuckets.find(([n]) => n === name);
        const wUnits    = wb ? wb[1].units.toLocaleString() : '0';
        const wBps      = wb ? wb[1].bps : 0;
        const savedText = (autoRC[name] && autoRC[name][week.weekKey]) || '';
        const hasSaved  = savedText.trim().length > 0;
        const isHighest = week.weekLabel === highestWeek;

        const row = document.createElement('div');
        row.className = 'week-rc-row';
        row.innerHTML = `
          <label>
            ${isHighest ? '⭐ ' : ''}${week.weekLabel}
            – ${wUnits} units (${wBps} bps)
            ${hasSaved ? '<span class="auto-filled-badge">auto-filled</span>' : ''}
          </label>
          <textarea
            data-monthly-rc="${name}"
            data-week="${week.weekKey}"
            data-rc-idx="${rcIdx}"
            rows="3"
            placeholder="Root cause for ${week.weekLabel} (optional)..."
          >${savedText}</textarea>
        `;
        block.appendChild(row);
      });

      rcSection.appendChild(block);
    });

    currentMonthlyData._selectedWeeks = selectedWeeks;
    document.getElementById('monthly-preview-section').classList.remove('hidden');
    document.getElementById('monthly-generate-btn').classList.remove('hidden');
  }

  // ── MONTHLY: Generate ──
  document.getElementById('monthly-generate-btn').addEventListener('click', () => {
    if (!currentMonthlyData || !currentMonthlyData._selectedWeeks) return;

    const label  = document.getElementById('monthly-label').value.trim();
    const rcData = {};
    const seen   = {};

    document.querySelectorAll('textarea[data-monthly-rc]').forEach(el => {
      const name  = el.dataset.monthlyRc;
      const week  = el.dataset.week;
      const rcIdx = el.dataset.rcIdx;
      const key   = `${rcIdx}-${name}-${week}`;
      if (seen[key]) return;
      seen[key] = true;
      if (!rcData[name]) rcData[name] = {};
      rcData[name][week] = el.value.trim();
    });

    const actionPlan = document.getElementById('monthly-action-plan').value;
    currentMonthlyBridge = BridgeGenerator.buildMonthly(
      currentMonthlyData._selectedWeeks, label, rcData, actionPlan
    );

    document.getElementById('monthly-export-btn').classList.remove('hidden');
    showFeedback('monthly-feedback', 'success',
      '✅ Monthly bridge ready! Click Export Word to download.');
  });

  // ── MONTHLY: Export ──
  document.getElementById('monthly-export-btn').addEventListener('click', async () => {
    if (!currentMonthlyBridge) return;
    try {
      await DocxExport.exportMonthly(currentMonthlyBridge);
      showFeedback('monthly-feedback', 'success', '📄 Monthly Word document downloaded!');
    } catch (e) {
      showFeedback('monthly-feedback', 'error', 'Export failed: ' + e.message);
    }
  });

  // ── SAVED: Render ──
  async function renderSavedList() {
    const container = document.getElementById('saved-list');
    container.innerHTML =
      '<div class="empty-state"><div class="empty-icon">⏳</div><p>Loading...</p></div>';
    const all = await Storage.getAll();
    if (!all.length) {
      container.innerHTML =
        `<div class="empty-state"><div class="empty-icon">📭</div>
         <p>No saved bridges yet. Upload an Excel in the Weekly tab to get started.</p></div>`;
      return;
    }
    container.innerHTML = '';
    all.forEach(bridge => {
      const card  = document.createElement('div');
      card.className = 'saved-card';
      const saved = new Date(bridge.savedAt).toLocaleDateString('en-GB',
        { day: 'numeric', month: 'short', year: 'numeric' });
      card.innerHTML = `
        <div class="saved-card-info">
          <h4>DEA ${bridge.weekLabel}</h4>
          <p>${bridge.totalBPS} bps &nbsp;|&nbsp; ${bridge.deaVolume.toLocaleString()} units
             &nbsp;|&nbsp; Saved ${saved}</p>
        </div>
        <div class="saved-card-actions">
          <button class="btn-secondary" data-export="${bridge.weekKey}">📄 Re-export</button>
          <button class="btn-danger"    data-delete="${bridge.weekKey}">🗑 Delete</button>
        </div>`;
      container.appendChild(card);
    });

    container.querySelectorAll('[data-export]').forEach(btn => {
      btn.addEventListener('click', async () => {
        const bridge = await Storage.getByKey(btn.dataset.export);
        if (bridge) await DocxExport.exportWeekly(bridge);
      });
    });
    container.querySelectorAll('[data-delete]').forEach(btn => {
      btn.addEventListener('click', async () => {
        if (confirm(`Delete ${btn.dataset.delete}?`)) {
          await Storage.remove(btn.dataset.delete);
          renderSavedList();
        }
      });
    });
  }

  // ── Feedback ──
  function showFeedback(id, type, msg) {
    const el = document.getElementById(id);
    el.textContent = msg;
    el.className   = `feedback ${type}`;
    el.classList.remove('hidden');
    setTimeout(() => el.classList.add('hidden'), 6000);
  }
})();
