// ── Main App Controller ──
(() => {
  let currentParsed = null;
  let currentMonthlyBridge = null;

  // ── Tab Navigation ──
  document.querySelectorAll('.nav-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      document.querySelectorAll('.nav-btn').forEach(b => b.classList.remove('active'));
      document.querySelectorAll('.tab-content').forEach(t => { t.classList.remove('active'); t.classList.add('hidden'); });
      btn.classList.add('active');
      const tab = document.getElementById('tab-' + btn.dataset.tab);
      tab.classList.remove('hidden');
      tab.classList.add('active');
      if (btn.dataset.tab === 'saved') renderSavedList();
      if (btn.dataset.tab === 'monthly') renderMonthlySelector();
    });
  });

  // ── Weekly: File Upload ──
  const dropZone = document.getElementById('weekly-drop-zone');
  const fileInput = document.getElementById('weekly-file-input');

  dropZone.addEventListener('dragover', e => { e.preventDefault(); dropZone.classList.add('dragover'); });
  dropZone.addEventListener('dragleave', () => dropZone.classList.remove('dragover'));
  dropZone.addEventListener('drop', e => {
    e.preventDefault();
    dropZone.classList.remove('dragover');
    handleFile(e.dataTransfer.files[0]);
  });
  dropZone.addEventListener('click', () => fileInput.click());
  fileInput.addEventListener('change', () => handleFile(fileInput.files[0]));

  function handleFile(file) {
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

  // ── Weekly: Render Summary ──
  function renderWeeklySummary(data) {
    document.getElementById('weekly-summary').classList.remove('hidden');
    document.getElementById('weekly-title').textContent = `DEA ${data.weekLabel} Summary`;
    document.getElementById('weekly-week-badge').textContent = data.weekKey;

    // Stats
    const statsEl = document.getElementById('weekly-stats');
    statsEl.innerHTML = `
      <div class="stat-box"><div class="stat-value">${data.totalBPS} bps</div><div class="stat-label">Total DEA BPS</div></div>
      <div class="stat-box"><div class="stat-value">${data.deaVolume.toLocaleString()}</div><div class="stat-label">DEA Volume (units)</div></div>
      <div class="stat-box"><div class="stat-value">${data.totalMisses.toLocaleString()}</div><div class="stat-label">Impacting Units</div></div>
    `;

    // Bucket table
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

    // RC entry blocks for top 2
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

  // ── Weekly: Collect RC Data ──
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

  // ── Weekly: Save ──
  document.getElementById('weekly-save-btn').addEventListener('click', () => {
    if (!currentParsed) return;
    const bridge = BridgeGenerator.buildWeekly(
      currentParsed,
      collectWeeklyRC(),
      document.getElementById('weekly-action-plan').value
    );
    Storage.save(bridge);
    showFeedback('weekly-feedback', 'success', `✅ ${bridge.weekLabel} saved successfully! It will appear in Saved Bridges and Monthly selector.`);
  });

  // ── Weekly: Export ──
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

  // ── Monthly: Selector ──
  function renderMonthlySelector() {
    const all = Storage.getAll();
    const container = document.getElementById('monthly-week-selector');
    container.innerHTML = '';
    if (!all.length) {
      container.innerHTML = '<p class="field-hint">No saved weekly bridges yet. Save at least 2 weekly bridges first.</p>';
      return;
    }
    all.forEach(bridge => {
      const chip = document.createElement('div');
      chip.className = 'week-chip';
      chip.dataset.weekKey = bridge.weekKey;
      chip.textContent = bridge.weekLabel;
      chip.addEventListener('click', () => {
        chip.classList.toggle('selected');
        updateMonthlyRC();
      });
      container.appendChild(chip);
    });
  }

  function getSelectedBridges() {
    const keys = [...document.querySelectorAll('.week-chip.selected')].map(c => c.dataset.weekKey);
    return keys.map(k => Storage.getByKey(k)).filter(Boolean);
  }

  function updateMonthlyRC() {
    const selected = getSelectedBridges();
    if (selected.length < 2) {
      document.getElementById('monthly-rc-section').innerHTML = '';
      return;
    }

    // Compile bucket ranking from selected bridges
    const bucketAgg = {};
    for (const b of selected) {
      for (const [name, data] of b.sortedBuckets) {
        if (!bucketAgg[name]) bucketAgg[name] = { bpsSum: 0, unitsSum: 0, count: 0 };
        bucketAgg[name].bpsSum += data.bps;
        bucketAgg[name].unitsSum += data.units;
        bucketAgg[name].count++;
      }
    }
    const top2 = Object.entries(bucketAgg)
      .map(([n,v]) => [n, { bps: Math.round(v.bpsSum/v.count), units: v.unitsSum }])
      .sort((a,b) => b[1].bps - a[1].bps)
      .slice(0,2);

    const rcSection = document.getElementById('monthly-rc-section');
    rcSection.innerHTML = '';
    top2.forEach(([name, d], rcIdx) => {
      const block = document.createElement('div');
      block.className = 'rc-block';
      block.innerHTML = `
        <h4>RC${rcIdx+1}: ${name} <span style="font-weight:400;color:#888;">(avg ${d.bps} bps)</span></h4>
        <p class="rc-sub">Enter root cause per week. Leave blank to skip that week.</p>
      `;
      selected.forEach(bridge => {
        const weekData = bridge.sortedBuckets.find(([n]) => n === name);
        const weekUnits = weekData ? weekData[1].units.toLocaleString() : '0';
        const row = document.createElement('div');
        row.className = 'week-rc-row';
        row.innerHTML = `
          <label>${bridge.weekLabel} – ${weekUnits} units</label>
          <textarea data-monthly-rc="${name}" data-week="${bridge.weekKey}" rows="3"
            placeholder="Root cause for ${bridge.weekLabel} (optional)...">${
              (bridge.rcData && bridge.rcData[name]) ? 
              Object.values(bridge.rcData[name]).filter(v=>v).join(' / ') : ''
            }</textarea>
        `;
        block.appendChild(row);
      });
      rcSection.appendChild(block);
    });
  }

  // ── Monthly: Generate ──
  document.getElementById('monthly-generate-btn').addEventListener('click', async () => {
    const selected = getSelectedBridges();
    if (selected.length < 2) {
      showFeedback('monthly-feedback', 'error', 'Please select at least 2 weekly bridges.');
      return;
    }

    const label = document.getElementById('monthly-label').value.trim()
      || selected.map(b => b.weekLabel).join(' – ');

    const rcData = {};
    document.querySelectorAll('[data-monthly-rc]').forEach(el => {
      const name = el.dataset.monthlyRc;
      const week = el.dataset.week;
      if (!rcData[name]) rcData[name] = {};
      rcData[name][week] = el.value.trim();
    });

    const actionPlan = document.getElementById('monthly-action-plan').value;
    currentMonthlyBridge = BridgeGenerator.buildMonthly(selected, label, rcData, actionPlan);

    // Show preview
    renderMonthlyPreview(currentMonthlyBridge);
    document.getElementById('monthly-export-btn').classList.remove('hidden');
    showFeedback('monthly-feedback', 'success', '✅ Monthly bridge generated! Review below and export to Word.');
  });

  function renderMonthlyPreview(bridge) {
    const { label, weekLabels, totalBPSAvg, totalVolume, totalMissesSum, sortedBuckets } = bridge;
    let txt = `Analysis of DEA ${label}\n(${weekLabels.join(', ')})\n\n`;
    txt += `Avg ${totalBPSAvg} bps  |  Volume: ${totalVolume.toLocaleString()} units  |  Misses: ${totalMissesSum.toLocaleString()}\n\n`;
    txt += `Bucket Ranking:\n`;
    sortedBuckets.forEach(([name, d], i) => {
      txt += `  ${i+1}. ${name}  ${d.units.toLocaleString()} units (${d.bps} bps avg)\n`;
    });
    const preview = document.getElementById('monthly-preview');
    preview.textContent = txt;
    preview.classList.remove('hidden');
  }

  // ── Monthly: Export ──
  document.getElementById('monthly-export-btn').addEventListener('click', async () => {
    if (!currentMonthlyBridge) return;
    try {
      await DocxExport.exportMonthly(currentMonthlyBridge);
      showFeedback('monthly-feedback', 'success', '📄 Monthly Word document downloaded!');
    } catch (e) {
      showFeedback('monthly-feedback', 'error', 'Export failed: ' + e.message);
    }
  });

  // ── Saved Bridges List ──
  function renderSavedList() {
    const all = Storage.getAll();
    const container = document.getElementById('saved-list');
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
        const bridge = Storage.getByKey(btn.dataset.export);
        if (bridge) await DocxExport.exportWeekly(bridge);
      });
    });
    container.querySelectorAll('[data-delete]').forEach(btn => {
      btn.addEventListener('click', () => {
        if (confirm(`Delete ${btn.dataset.delete}? This cannot be undone.`)) {
          Storage.remove(btn.dataset.delete);
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
