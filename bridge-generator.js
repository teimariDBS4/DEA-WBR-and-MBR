// ── Bridge Generator ──
const BridgeGenerator = (() => {

  function buildWeekly(parsed, rcData, actionPlan) {
    return {
      type:          'weekly',
      weekKey:       parsed.weekKey,
      weekLabel:     parsed.weekLabel,
      deaVolume:     parsed.deaVolume,
      totalBPS:      parsed.totalBPS,
      totalMisses:   parsed.totalMisses,
      dayLabels:     parsed.dayLabels,
      sortedBuckets: parsed.sortedBuckets,
      rcData,
      actionPlan,
      savedAt: new Date().toISOString(),
    };
  }

  function compileMonthlyStats(weeksData) {
    const bucketAgg = {};
    let totalVolume    = 0;
    let totalMissesSum = 0;

    for (const week of weeksData) {
      totalVolume    += week.deaVolume;
      totalMissesSum += week.totalMisses;
      for (const [name, data] of week.sortedBuckets) {
        if (!bucketAgg[name]) bucketAgg[name] = { unitsSum: 0, bpsSum: 0, count: 0 };
        bucketAgg[name].unitsSum += data.units;
        bucketAgg[name].bpsSum  += data.bps;
        bucketAgg[name].count   += 1;
      }
    }

    const totalBPSAvg = Math.round(
      weeksData.reduce((s, w) => s + w.totalBPS, 0) / weeksData.length
    );

    const sortedBuckets = Object.entries(bucketAgg)
      .map(([name, agg]) => [name, {
        units: agg.unitsSum,
        bps:   Math.round(agg.bpsSum / agg.count),
      }])
      .sort((a, b) => b[1].bps - a[1].bps || b[1].units - a[1].units);

    return { totalVolume, totalMissesSum, totalBPSAvg, sortedBuckets };
  }

  // ── Build per-week bucket lookup for exporter ──
  // { weekKey: { _weekLabel: 'W27 2026', 'Late Dispatch': { bps: 33, units: 1342 }, ... } }
  function buildPerWeekBucketData(weeksData) {
    const lookup = {};
    weeksData.forEach(week => {
      lookup[week.weekKey] = { _weekLabel: week.weekLabel };
      week.sortedBuckets.forEach(([name, data]) => {
        lookup[week.weekKey][name] = { bps: data.bps, units: data.units };
      });
    });
    return lookup;
  }

  // ── Auto-fill monthly RC from saved weekly bridges ──
  function autoFillMonthlyRC(selectedWeeks, sortedBuckets, savedBridges) {
    const rcData = {};

    sortedBuckets.slice(0, 2).forEach(([bucketName]) => {
      rcData[bucketName] = {};

      selectedWeeks.forEach(week => {
        const saved = savedBridges.find(b => b.weekKey === week.weekKey);

        if (saved && saved.rcData && saved.rcData[bucketName]) {
          const dayEntries = Object.entries(saved.rcData[bucketName])
            .filter(([, text]) => text && text.trim())
            .map(([dayIdx, text]) => {
              const dayLabel = saved.dayLabels && saved.dayLabels[dayIdx]
                ? saved.dayLabels[dayIdx]
                : `Day ${parseInt(dayIdx) + 1}`;
              return `${dayLabel}: ${text.trim()}`;
            });

          rcData[bucketName][week.weekKey] = dayEntries.length
            ? dayEntries.join('\n') : '';
        } else {
          rcData[bucketName][week.weekKey] = '';
        }
      });
    });

    return rcData;
  }

  function buildMonthly(weeksData, label, rcData, actionPlan) {
    const compiled = compileMonthlyStats(weeksData);

    // Build per-week lookup so exporter knows exact BPS/units per bucket per week
    const perWeekBucketData = buildPerWeekBucketData(weeksData);

    return {
      type:            'monthly',
      label,
      weekLabels:      weeksData.map(w => w.weekLabel),
      weekKeys:        weeksData.map(w => w.weekKey),
      perWeekBucketData,
      ...compiled,
      rcData,
      actionPlan,
    };
  }

  return { buildWeekly, compileMonthlyStats, autoFillMonthlyRC, buildMonthly };
})();
