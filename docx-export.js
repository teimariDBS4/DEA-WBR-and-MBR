// ── Word (.docx) Exporter ──
const DocxExport = (() => {
  const { Document, Paragraph, TextRun, HeadingLevel, AlignmentType, Table,
          TableRow, TableCell, WidthType, BorderStyle, Packer } = docx;

  function bold(text, size) {
    return new TextRun({ text, bold: true, size: size || 22 });
  }
  function normal(text, size) {
    return new TextRun({ text, size: size || 22 });
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
      children: ['#','Bucket','Units','BPS','% of Misses'].map(t =>
        new TableCell({
          children: [new Paragraph({ children: [bold(t, 20)] })],
          shading: { fill: '1a1a2e' },
        })
      ),
      tableHeader: true,
    });

    const dataRows = sortedBuckets.map(([name, data], i) => {
      const pct = totalMisses > 0 ? ((data.units / totalMisses) * 100).toFixed(1) + '%' : '-';
      return new TableRow({
        children: [
          new TableCell({ children: [new Paragraph({ children: [normal(String(i+1), 20)] })] }),
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

  function buildRCSection(rcData, sortedBuckets, weekLabelsOrDays, isMonthly) {
    const paras = [];
    const top2 = sortedBuckets.slice(0, 2);

    top2.forEach(([name, data], rcIdx) => {
      const rcLabel = `RC${rcIdx + 1}: ${name}`;
      paras.push(sectionHeading(rcLabel));

      const entries = rcData[name] || {};
      let hasContent = false;

      weekLabelsOrDays.forEach((label, i) => {
        const key = isMonthly ? label : String(i);
        const text = (entries[key] || '').trim();
        if (!text) return;
        hasContent = true;
        paras.push(new Paragraph({
          children: [bold(label + ' – ', 20), normal(text, 20)],
          spacing: { after: 80 },
        }));
      });

      if (!hasContent) {
        paras.push(new Paragraph({ children: [normal('No root cause entries recorded.', 20)], spacing: { after: 80 } }));
      }
      paras.push(br());
    });

    return paras;
  }

  async function exportWeekly(bridge) {
    const { weekLabel, deaVolume, totalBPS, totalMisses, sortedBuckets, dayLabels, rcData, actionPlan } = bridge;

    const children = [];

    // Title
    children.push(new Paragraph({
      children: [bold(`DEA ${weekLabel} Summary`, 36)],
      spacing: { after: 160 },
    }));

    // Top stats line
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

    // Bucket summary
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

    // Bucket table
    children.push(buildBucketTable(sortedBuckets, totalMisses));
    children.push(br());

    // RC sections
    const rcParas = buildRCSection(rcData, sortedBuckets, dayLabels, false);
    children.push(...rcParas);

    // Action Plan
    if (actionPlan && actionPlan.trim()) {
      children.push(sectionHeading('Action Plan'));
      actionPlan.trim().split('\n').filter(l => l.trim()).forEach(line => {
        children.push(bulletPara(line.trim()));
      });
    }

    const doc = new Document({
      sections: [{ children }],
      styles: {
        default: {
          document: { run: { font: 'Calibri' } },
        },
      },
    });

    const blob = await Packer.toBlob(doc);
    triggerDownload(blob, `DEA_${bridge.weekKey}_Bridge.docx`);
  }

  async function exportMonthly(bridge) {
    const { label, weekLabels, totalVolume, totalBPSAvg, totalMissesSum, sortedBuckets, rcData, actionPlan } = bridge;

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

    children.push(sectionHeading('Root Cause Analysis (' + weekLabels.join('–') + ')'));
    children.push(buildBucketTable(sortedBuckets, totalMissesSum));
    children.push(br());

    const rcParas = buildRCSection(rcData, sortedBuckets, weekLabels, true);
    children.push(...rcParas);

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
    triggerDownload(blob, `DEA_Monthly_${label.replace(/\s+/g,'_')}_Bridge.docx`);
  }

  function triggerDownload(blob, filename) {
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url; a.download = filename; a.click();
    URL.revokeObjectURL(url);
  }

  return { exportWeekly, exportMonthly };
})();
