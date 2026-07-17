// ── Bridge Generator ──
const BridgeGenerator = (() => {

  function buildWeekly(parsed, rcData, actionPlan) {
    return {
      type: 'weekly',
      weekKey: parsed.weekKey,
      weekLabel: parsed.weekLabel,
      deaVolume: parsed.deaVolume,
      totalBPS: parsed.totalBPS,
      totalMisses: parsed.totalMisses,
      dayLabels: parsed.dayLabels,
      sortedBuckets: parsed.sortedBuckets,
      rcData,
      actionPlan,
      savedAt: new Date().toISOString(),
    };
  }

  function compileMonthlyStats(weeksData) {
    const bucketAgg = {};
    let totalVolume = 0;
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

  // ── NEW: Auto-generate RC text for top 2 buckets ──
  // For each top bucket, find the highest impacting week from saved bridges
  // and pull the RC text already entered in that weekly bridge.
  function autoFillMonthlyRC(selectedWeeks, sortedBuckets, savedBridges) {
    const rcData = {};

    const top2 = sortedBuckets.slice(0, 2);

    top2.forEach(([bucketName]) => {
      rcData[bucketName] = {};

      selectedWeeks.forEach(week => {
        // Try to find a saved weekly bridge for this week
        const saved = savedBridges.find(b => b.weekKey === week.weekKey);

        if (saved && saved.rcData && saved.rcData[bucketName]) {
          // Collect all non-empty day entries from the saved weekly RC
          const dayEntries = Object.entries(saved.rcData[bucketName])
            .filter(([, text]) => text && text.trim())
            .map(([dayIdx, text]) => {
              // Try to get the day label e.g. "MON-06-JUL"
              const dayLabel = saved.dayLabels && saved.dayLabels[dayIdx]
                ? saved.dayLabels[dayIdx]
                : `Day ${parseInt(dayIdx) + 1}`;
              return `${dayLabel}: ${text.trim()}`;
            });

          if (dayEntries.length) {
            // Join all day entries for this week into one block
            rcData[bucketName][week.weekKey] = dayEntries.join('\n');
          } else {
            rcData[bucketName][week.weekKey] = '';
          }
        } else {
          rcData[bucketName][week.weekKey] = '';
        }
      });
    });

    return rcData;
  }

  function buildMonthly(weeksData, label, rcData, actionPlan) {
    const compiled = compileMonthlyStats(weeksData);
    return {
      type: 'monthly',
      label,
      weekLabels: weeksData.map(w => w.weekLabel),
      weekKeys:   weeksData.map(w => w.weekKey),
      ...compiled,
      rcData,
      actionPlan,
    };
  }

  return { buildWeekly, compileMonthlyStats, autoFillMonthlyRC, buildMonthly };
})();
