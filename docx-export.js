// ── Word (.docx) Exporter ──
const DocxExport = (() => {
  const { Document, Paragraph, TextRun, Table, TableRow, TableCell,
          WidthType, Packer } = docx;

  function bold(text, size) {
    return new TextRun({ text: String(text), bold: true, size: size || 22 });
  }
  function normal(text, size) {
    return new TextRun({ text: String(text), size: size || 22 });
  }
  function br() {
    return new Paragraph({ children: [new TextRun('')] });
  }
  function sectionHeading(text) {
    return new Paragraph({
      children: [bold(text, 26)],
      spacing: { before: 240, after: 100 },
    });
  }
  function bulletPara(text) {
    return new Paragraph({
      children: [normal(text, 20)],
      bullet: { level: 0 },
      spacing: { after: 60 },
    });
  }

  function buildBucketTable(sortedBuckets, totalMisses) {
    const headerRow = new TableRow({
      children: ['#', 'Bucket', 'Units', 'BPS', '% of Misses'].map(t =>
        new TableCell({
          children: [new Paragraph({ children: [bold(t, 20)] })],
          shading: { fill: '1a1a2e' },
        })
      ),
      tableHeader: true,
    });

    const dataRows = sortedBuckets.map(([name, data], i) => {
      const pct = totalMisses > 0
        ? ((data.units / totalMisses) * 100).toFixed(1) + '%' : '-';
      return new TableRow({
        children: [
          new TableCell({ children: [new Paragraph({ children: [normal(String(i + 1), 20)] })] }),
          new TableCell({ children: [new Paragraph({ children: [bold(name, 20)] })] }),
          new TableCell({ children: [new Paragraph({ children: [normal(data.units.toLocaleString(), 20)] })] }),
          new TableCell({ children: [new Paragraph({ children: [bold(String(data.bps) + ' bps', 20)] })] }),
          new TableCell({ children: [new Paragraph({ children: [normal(pct, 20)] })] }),
        ],
      });
    });

    return new Table({
      rows: [headerRow, ...dataRows],
      width: { size: 100, type: WidthType.PERCENTAGE },
    });
  }

  // ── Weekly RC: sorted by highest BPS day first ──
  function buildWeeklyRCSection(rcData, sortedBuckets, dayLabels) {
    const paras = [];

    sortedBuckets.slice(0, 2).forEach(([name, data], rcIdx) => {
      paras.push(sectionHeading(`RC${rcIdx + 1}: ${name}`));

      const entries = rcData ? (rcData[name] || {}) : {};

      const filledDays = [];
      Object.entries(entries).forEach(([dayIdx, text]) => {
        if (!text || !text.trim()) return;
        const idx      = parseInt(dayIdx);
        const label    = dayLabels && dayLabels[idx] ? dayLabels[idx] : `Day ${idx + 1}`;
        const dayBps   = data.bpsByDay && data.bpsByDay[idx] ? data.bpsByDay[idx] : 0;
        const dayUnits = data.unitsByDay && data.unitsByDay[idx] ? data.unitsByDay[idx] : 0;
        filledDays.push({ label, text: text.trim(), bps: dayBps, units: dayUnits });
      });

      if (!filledDays.length) {
        paras.push(new Paragraph({
          children: [normal('No root cause entries recorded.', 20)],
          spacing: { after: 80 },
        }));
        paras.push(br());
        return;
      }

      // Sort by BPS descending
      filledDays.sort((a, b) => b.bps - a.bps || b.units - a.units);

      filledDays.forEach(({ label, text, units }) => {
        const unitsStr = units > 0 ? ` (${units.toLocaleString()} units)` : '';
        paras.push(new Paragraph({
          children: [
            bold(`${label}${unitsStr} – `, 20),
            normal(text, 20),
          ],
          spacing: { after: 80 },
        }));
      });

      paras.push(br());
    });

    return paras;
  }

  // ── Monthly RC: sorted by highest BPS week first ──
  // Format: "W27 2026 – [RC text] (33 bps / 1,342 units)"
  function buildMonthlyRCSection(rcData, sortedBuckets, perWeekBucketData) {
    const paras = [];

    sortedBuckets.slice(0, 2).forEach(([name, data], rcIdx) => {
      // Header shows avg bps and total units for this bucket across all weeks
      paras.push(sectionHeading(`RC${rcIdx + 1}: ${name}`));
      paras.push(new Paragraph({
        children: [normal(`avg ${data.bps} bps / ${data.units.toLocaleString()} total units`, 20)],
        spacing: { after: 100 },
      }));

      const entries = rcData ? (rcData[name] || {}) : {};

      // Build entries with per-week BPS and units for this specific bucket
      const filledWeeks = [];
      Object.entries(entries).forEach(([weekKey, text]) => {
        if (!text || !text.trim()) return;

        // Get the actual BPS and units for THIS bucket in THIS week
        const weekData  = perWeekBucketData[weekKey];
        const weekBps   = weekData && weekData[name] ? weekData[name].bps   : 0;
        const weekUnits = weekData && weekData[name] ? weekData[name].units : 0;
        const weekLabel = weekData ? weekData._weekLabel : weekKey;

        filledWeeks.push({
          weekLabel,
          text: text.trim(),
          bps:   weekBps,
          units: weekUnits,
        });
      });

      if (!filledWeeks.length) {
        paras.push(new Paragraph({
          children: [normal('No root cause entries recorded.', 20)],
          spacing: { after: 80 },
        }));
        paras.push(br());
        return;
      }

      // Sort by BPS descending - highest impacting week first
      filledWeeks.sort((a, b) => b.bps - a.bps || b.units - a.units);

      filledWeeks.forEach(({ weekLabel, text, bps, units }) => {
        paras.push(new Paragraph({
          children: [
            bold(`${weekLabel} – `, 20),
            normal(text, 20),
            normal(` (${bps} bps / ${units.toLocaleString()} units)`, 20),
          ],
          spacing: { after: 80 },
        }));
      });

      paras.push(br());
    });

    return paras;
  }

  // ── Export Weekly ──
  async function exportWeekly(bridge) {
    const {
      weekLabel, deaVolume, totalBPS, totalMisses,
      sortedBuckets, dayLabels, rcData, actionPlan,
    } = bridge;

    const children = [];

    children.push(new Paragraph({
      children: [bold(`DEA ${weekLabel} Summary`, 36)],
      spacing: { after: 160 },
    }));

    children.push(new Paragraph({
      children: [
        bold(`${totalBPS} bps`, 24),
        normal('   |   DEA Volume: ', 22),
        bold(deaVolume.toLocaleString() + ' units', 22),
        normal('   |   Impacting Units: ', 22),
        bold(totalMisses.toLocaleString(), 22),
      ],
      spacing: { after: 200 },
    }));

    children.push(sectionHeading('Root Cause Summary'));
    sortedBuckets.forEach(([name, data]) => {
      children.push(new Paragraph({
        children: [
          bold(name, 22),
          normal(`   ${data.units.toLocaleString()} units (${data.bps} bps)`, 22),
        ],
        spacing: { after: 80 },
      }));
    });
    children.push(br());

    children.push(buildBucketTable(sortedBuckets, totalMisses));
    children.push(br());

    children.push(...buildWeeklyRCSection(rcData, sortedBuckets, dayLabels));

    if (actionPlan && actionPlan.trim()) {
      children.push(sectionHeading('Action Plan'));
      actionPlan.trim().split('\n').filter(l => l.trim()).forEach(line => {
        children.push(bulletPara(line.trim()));
      });
    }

    const doc = new Document({
      sections: [{ children }],
      styles: { default: { document: { run: { font: 'Calibri' } } } },
    });

    const blob = await Packer.toBlob(doc);
    triggerDownload(blob, `DEA_${bridge.weekKey}_Bridge.docx`);
  }

  // ── Export Monthly ──
  async function exportMonthly(bridge) {
    const {
      label, weekLabels, weekKeys, totalVolume,
      totalBPSAvg, totalMissesSum, sortedBuckets,
      rcData, actionPlan, perWeekBucketData,
    } = bridge;

    const children = [];

    children.push(new Paragraph({
      children: [bold(`Analysis of DEA ${label}`, 36)],
      spacing: { after: 80 },
    }));
    children.push(new Paragraph({
      children: [normal(`(${weekLabels.join(', ')})`, 20)],
      spacing: { after: 200 },
    }));

    children.push(new Paragraph({
      children: [
        bold(`Avg ${totalBPSAvg} bps`, 24),
        normal('   |   Total Volume: ', 22),
        bold(totalVolume.toLocaleString() + ' units', 22),
        normal('   |   Total Misses: ', 22),
        bold(totalMissesSum.toLocaleString(), 22),
      ],
      spacing: { after: 200 },
    }));

    children.push(sectionHeading(`Root Cause Analysis (${weekLabels.join(' – ')})`));
    sortedBuckets.forEach(([name, data]) => {
      children.push(new Paragraph({
        children: [
          bold(name, 22),
          normal(`   ${data.units.toLocaleString()} units (avg ${data.bps} bps)`, 22),
        ],
        spacing: { after: 80 },
      }));
    });
    children.push(br());

    children.push(buildBucketTable(sortedBuckets, totalMissesSum));
    children.push(br());

    // RC section with per-week BPS data
    children.push(...buildMonthlyRCSection(rcData, sortedBuckets, perWeekBucketData));

    if (actionPlan && actionPlan.trim()) {
      children.push(sectionHeading('Action Plan'));
      actionPlan.trim().split('\n').filter(l => l.trim()).forEach(line => {
        children.push(bulletPara(line.trim()));
      });
    }

    const doc = new Document({
      sections: [{ children }],
      styles: { default: { document: { run: { font: 'Calibri' } } } },
    });

    const blob = await Packer.toBlob(doc);
    triggerDownload(blob, `DEA_Monthly_${label.replace(/\s+/g, '_')}_Bridge.docx`);
  }

  function triggerDownload(blob, filename) {
    const url = URL.createObjectURL(blob);
    const a   = document.createElement('a');
    a.href = url; a.download = filename; a.click();
    URL.revokeObjectURL(url);
  }

  return { exportWeekly, exportMonthly };
})();
