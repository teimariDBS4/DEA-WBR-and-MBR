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

  function compileMonthlyStats(parsedWeeks) {
    const bucketAgg = {};
    let totalVolume = 0;
    let totalMissesSum = 0;

    for (const week of parsedWeeks) {
      totalVolume += week.deaVolume;
      totalMissesSum += week.totalMisses;
      for (const [name, data] of week.sortedBuckets) {
        if (!bucketAgg[name]) bucketAgg[name] = { unitsSum: 0, bpsSum: 0, count: 0 };
        bucketAgg[name].unitsSum += data.units;
        bucketAgg[name].bpsSum  += data.bps;
        bucketAgg[name].count   += 1;
      }
    }

    const totalBPSAvg = Math.round(
      parsedWeeks.reduce((s, b) => s + b.totalBPS, 0) / parsedWeeks.length
    );

    const sortedBuckets = Object.entries(bucketAgg)
      .map(([name, agg]) => [name, {
        units: agg.unitsSum,
        bps: Math.round(agg.bpsSum / agg.count),
      }])
      .sort((a, b) => b[1].bps - a[1].bps || b[1].units - a[1].units);

    return { totalVolume, totalMissesSum, totalBPSAvg, sortedBuckets };
  }

  function buildMonthly(parsedWeeks, label, rcData, actionPlan) {
    const compiled = compileMonthlyStats(parsedWeeks);
    return {
      type: 'monthly',
      label,
      weekLabels: parsedWeeks.map(w => w.weekLabel),
      weekKeys:   parsedWeeks.map(w => w.weekKey),
      ...compiled,
      rcData,
      actionPlan,
    };
  }

  return { buildWeekly, compileMonthlyStats, buildMonthly };
})();
