// ── Main App Controller ──
(() => {
  let currentParsed = null;
  let currentMonthlyBridge = null;
  let monthlyParsedWeeks = []; // holds all parsed weekly data for monthly

  // ── Tab Navigation ──
  document.querySelectorAll('.nav-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      document.querySelectorAll('.nav-btn').forEach(b => b.classList.remove('active'));
      document.querySelectorAll('.tab-content').forEach(t => {
        t.classList.remove('active');
        t.classList.add('hidden');
      });
      btn.classList.add('active');
      const tab = document.getElementById('tab-' + btn.dataset.tab);
      tab.classList.remove('hidden');
      tab.classList.add('active');
      if (btn.dataset.tab === 'saved') renderSavedList();
    });
  });

  // ── WEEKLY: File Upload ──
  const weeklyDropZone = document.getElementById('weekly-drop-zone');
  const weeklyFileInput = document.getElementById('weekly-file-input');

  weeklyDropZone.addEventListener('dragover', e => { e.preventDefault(); weeklyDropZone.classList.add('dragover'); });
  weeklyDropZone.addEventListener('dragleave', () => weeklyDropZone.classList.remove('dragover'));
  weeklyDropZone.addEventListener('drop', e => {
    e.preventDefault();
    weeklyDropZone.classList.remove('dragover');
    handleWeeklyFile(e.dataTransfer.files[0]);
  });
  weeklyDropZone.addEventListener('click', () => weeklyFileInput.click());
  weeklyFileInput.addEventListener('change', () => handleWeeklyFile(weeklyFileInput.files[0]));

  function handleWeeklyFile(file) {
    if (!file) return;
    const reader = new FileReader();
    reader.onload = e => {
      try {
        currentParsed = Parser.parse(e.target.result);
        renderWeeklySummary(currentParsed);
      } catch (err) {
        showFeedback('weekly-feedback', 'error', 'Failed to parse file: ' + err.message);
      }
    };
    reader.readAsArrayBuffer(file);
  }

  // ── WEEKLY: Render Summary ──
  function renderWeeklySummary(data) {
    document.getElementById('weekly-summary').classList.remove('hidden');
    document.getElementById('weekly-title').textContent = `DEA ${data.weekLabel} Summary`;
    document.getElementById('weekly-week-badge').textContent = data.weekKey;

    const statsEl = document.getElementById('weekly-stats');
    statsEl.innerHTML = `
      <div class="stat-box"><div class="stat-value">${data.totalBPS} bps</div><div class="stat-label">Total DEA BPS</div></div>
      <div class="stat-box"><div class="stat-value">${data.deaVolume.toLocaleString()}</div><div class="stat-label">DEA Volume (units)</div></div>
      <div class="stat-box"><div class="stat-value">${data.totalMisses.toLocaleString()}</div><div class="stat-label">Impacting Units</div></div>
    `;

    const tbody = document.getElementById('weekly-bucket-body');
    tbody.innerHTML = '';
    data.sortedBuckets.forEach(([name, d], i) => {
      const pct = data.totalMisses > 0 ? ((d.units / data.totalMisses) * 100).toFixed(1) : '0';
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
      block.innerHTML = `
        <h4>RC${rcIdx+1}: ${name} <span style="font-weight:400;color:#888;">(${d.bps} bps / ${d.units.toLocaleString()} units)</span></h4>
        <p class="rc-sub">Enter root cause per day. Leave blank to skip that day in the output.</p>
      `;
      data.dayLabels.forEach((day, i) => {
        const units = d.unitsByDay && d.unitsByDay[i] > 0 ? ` – ${d.unitsByDay[i].toLocaleString()} units` : '';
        const row = document.createElement('div');
        row.className = 'day-rc-row';
        row.innerHTML = `
          <div class="day-label">${day}${units}</div>
          <textarea data-rc="${name}" data-day="${i}" rows="2" placeholder="Root cause (optional)..."></textarea>
        `;
        block.appendChild(row);
      });
      rcSection.appendChild(block);
    });
  }

  function collectWeeklyRC() {
    const rc = {};
    document.querySelectorAll('[data-rc]').forEach(el => {
      const name = el.dataset.rc;
      const day = el.dataset.day;
      if (!rc[name]) rc[name] = {};
      rc[name][day] = el.value.trim();
    });
    return rc;
  }

  // ── WEEKLY: Save ──
  document.getElementById('weekly-save-btn').addEventListener('click', async () => {
    if (!currentParsed) return;
    const bridge = BridgeGenerator.buildWeekly(
      currentParsed,
      collectWeeklyRC(),
      document.getElementById('weekly-action-plan').value
    );
    const ok = await Storage.save(bridge);
    if (ok) {
      showFeedback('weekly-feedback', 'success', `✅ ${bridge.weekLabel} saved successfully!`);
    } else {
      showFeedback('weekly-feedback', 'error', 'Failed to save. Check your connection.');
    }
  });

  // ── WEEKLY: Export ──
  document.getElementById('weekly-export-btn').addEventListener('click', async () => {
    if (!currentParsed) return;
    const bridge = BridgeGenerator.buildWeekly(
      currentParsed,
      collectWeeklyRC(),
      document.getElementById('weekly-action-plan').value
    );
    try {
      await DocxExport.exportWeekly(bridge);
      showFeedback('weekly-feedback', 'success', '📄 Word document downloaded!');
    } catch (e) {
      showFeedback('weekly-feedback', 'error', 'Export failed: ' + e.message);
    }
  });

  // ── MONTHLY: Multi-file Upload ──
  const monthlyDropZone = document.getElementById('monthly-drop-zone');
  const monthlyFileInput = document.getElementById('monthly-file-input');

  monthlyDropZone.addEventListener('dragover', e => { e.preventDefault(); monthlyDropZone.classList.add('dragover'); });
  monthlyDropZone.addEventListener('dragleave', () => monthlyDropZone.classList.remove('dragover'));
  monthlyDropZone.addEventListener('drop', e => {
    e.preventDefault();
    monthlyDropZone.classList.remove('dragover');
    handleMonthlyFiles(e.dataTransfer.files);
  });
  monthlyDropZone.addEventListener('click', () => monthlyFileInput.click());
  monthlyFileInput.addEventListener('change', () => handleMonthlyFiles(monthlyFileInput.files));

  function handleMonthlyFiles(files) {
    if (!files || files.length < 2) {
      showFeedback('monthly-feedback', 'error', 'Please upload at least 2 weekly Excel files.');
      return;
    }
    if (files.length > 6) {
      showFeedback('monthly-feedback', 'error', 'Maximum 6 weekly files at once.');
      return;
    }

    monthlyParsedWeeks = [];
    let loaded = 0;
    const total = files.length;
    const results = new Array(total);

    Array.from(files).forEach((file, idx) => {
      const reader = new FileReader();
      reader.onload = e => {
        try {
          results[idx] = Parser.parse(e.target.result);
        } catch (err) {
          results[idx] = null;
          console.error('Failed to parse:', file.name, err);
        }
        loaded++;
        if (loaded === total) {
          monthlyParsedWeeks = results
            .filter(Boolean)
            .sort((a, b) => a.weekKey > b.weekKey ? 1 : -1);

          if (monthlyParsedWeeks.length < 2) {
            showFeedback('monthly-feedback', 'error', 'Could not parse enough valid files. Please check your Excel files.');
            return;
          }
          renderMonthlyFilesLoaded(monthlyParsedWeeks);
        }
      };
      reader.readAsArrayBuffer(file);
    });
  }

  function renderMonthlyFilesLoaded(weeks) {
    // Show file chips
    const chipsContainer = document.getElementById('monthly-files-chips');
    chipsContainer.innerHTML = '';
    weeks.forEach(w => {
      const chip = document.createElement('div');
      chip.className = 'week-chip selected';
      chip.textContent = `${w.weekLabel} · ${w.totalBPS} bps`;
      chipsContainer.appendChild(chip);
    });
    document.getElementById('monthly-files-list').classList.remove('hidden');

    // Compile and show stats
    const compiled = BridgeGenerator.compileMonthlyStats(weeks);

    const statsEl = document.getElementById('monthly-stats');
    statsEl.innerHTML = `
      <div class="stat-box"><div class="stat-value">${compiled.totalBPSAvg} bps</div><div class="stat-label">Avg DEA BPS</div></div>
      <div class="stat-box"><div class="stat-value">${compiled.totalVolume.toLocaleString()}</div><div class="stat-label">Total Volume (units)</div></div>
      <div class="stat-box"><div class="stat-value">${compiled.totalMissesSum.toLocaleString()}</div><div class="stat-label">Total Impacting Units</div></div>
      <div class="stat-box"><div class="stat-value">${weeks.length}</div><div class="stat-label">Weeks Included</div></div>
    `;

    const tbody = document.getElementById('monthly-bucket-body');
    tbody.innerHTML = '';
    compiled.sortedBuckets.forEach(([name, d], i) => {
      const pct = compiled.totalMissesSum > 0 ? ((d.units / compiled.totalMissesSum) * 100).toFixed(1) : '0';
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
    document.getElementById('monthly-stats-preview').classList.remove('hidden');

    // Auto fill label
    const label = document.getElementById('monthly-label');
    if (!label.value) {
      label.value = `${weeks[0].weekLabel} to ${weeks[weeks.length-1].weekLabel}`;
    }

    // Build RC entry blocks per week for top 2 buckets
    renderMonthlyRC(weeks, compiled.sortedBuckets);

    // Show generate button
    document.getElementById('monthly-generate-btn').classList.remove('hidden');
  }

  function renderMonthlyRC(weeks, sortedBuckets) {
    const rcSection = document.getElementById('monthly-rc-section');
    rcSection.innerHTML = '';

    sortedBuckets.slice(0, 2).forEach(([name, d], rcIdx) => {
      const block = document.createElement('div');
      block.className = 'rc-block';
      block.innerHTML = `
        <h4>RC${rcIdx+1}: ${name} <span style="font-weight:400;color:#888;">(avg ${d.bps} bps / ${d.units.toLocaleString()} total units)</span></h4>
        <p class="rc-sub">Enter root cause per week. Leave blank to skip that week in the output.</p>
      `;
      weeks.forEach(week => {
        const weekBucket = week.sortedBuckets.find(([n]) => n === name);
        const weekUnits = weekBucket ? weekBucket[1].units.toLocaleString() : '0';
        const weekBps   = weekBucket ? weekBucket[1].bps : 0;
        const row = document.createElement('div');
        row.className = 'week-rc-row';
        row.innerHTML = `
          <label>${week.weekLabel} – ${weekUnits} units (${weekBps} bps)</label>
          <textarea data-monthly-rc="${name}" data-week="${week.weekKey}" rows="3"
            placeholder="Root cause for ${week.weekLabel} (optional)..."></textarea>
        `;
        block.appendChild(row);
      });
      rcSection.appendChild(block);
    });
  }

  // ── MONTHLY: Generate ──
  document.getElementById('monthly-generate-btn').addEventListener('click', async () => {
    if (!monthlyParsedWeeks.length) {
      showFeedback('monthly-feedback', 'error', 'Please upload weekly Excel files first.');
      return;
    }

    const label = document.getElementById('monthly-label').value.trim()
      || `${monthlyParsedWeeks[0].weekLabel} to ${monthlyParsedWeeks[monthlyParsedWeeks.length-1].weekLabel}`;

    const rcData = {};
    document.querySelectorAll('[data-monthly-rc]').forEach(el => {
      const name = el.dataset.monthlyRc;
      const week = el.dataset.week;
      if (!rcData[name]) rcData[name] = {};
      rcData[name][week] = el.value.trim();
    });

    const actionPlan = document.getElementById('monthly-action-plan').value;
    currentMonthlyBridge = BridgeGenerator.buildMonthly(
      monthlyParsedWeeks, label, rcData, actionPlan
    );

    document.getElementById('monthly-export-btn').classList.remove('hidden');
    showFeedback('monthly-feedback', 'success', '✅ Monthly bridge ready! Click Export Word to download.');
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

  // ── SAVED: Render List ──
  async function renderSavedList() {
    const container = document.getElementById('saved-list');
    container.innerHTML = '<div class="empty-state"><div class="empty-icon">⏳</div><p>Loading saved bridges...</p></div>';
    const all = await Storage.getAll();
    if (!all.length) {
      container.innerHTML = `<div class="empty-state"><div class="empty-icon">📭</div><p>No saved bridges yet. Upload an Excel file in the Weekly tab to get started.</p></div>`;
      return;
    }
    container.innerHTML = '';
    all.forEach(bridge => {
      const card = document.createElement('div');
      card.className = 'saved-card';
      const saved = new Date(bridge.savedAt).toLocaleDateString('en-GB', { day:'numeric', month:'short', year:'numeric' });
      card.innerHTML = `
        <div class="saved-card-info">
          <h4>DEA ${bridge.weekLabel}</h4>
          <p>${bridge.totalBPS} bps &nbsp;|&nbsp; ${bridge.deaVolume.toLocaleString()} units &nbsp;|&nbsp; Saved ${saved}</p>
        </div>
        <div class="saved-card-actions">
          <button class="btn-secondary" data-export="${bridge.weekKey}">📄 Re-export</button>
          <button class="btn-danger" data-delete="${bridge.weekKey}">🗑 Delete</button>
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
        if (confirm(`Delete ${btn.dataset.delete}? This cannot be undone.`)) {
          await Storage.remove(btn.dataset.delete);
          renderSavedList();
        }
      });
    });
  }

  // ── Feedback Helper ──
  function showFeedback(id, type, msg) {
    const el = document.getElementById(id);
    el.textContent = msg;
    el.className = `feedback ${type}`;
    el.classList.remove('hidden');
    setTimeout(() => el.classList.add('hidden'), 5000);
  }
})();
