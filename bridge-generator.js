// ── Bridge Generator (compiles data for display + export) ──
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
      rcData,      // { bucketName: { dayIndex: 'text', ... }, ... }
      actionPlan,
      savedAt: new Date().toISOString(),
    };
  }

  function buildMonthly(selectedBridges, label, rcData, actionPlan) {
    if (!selectedBridges.length) return null;

    // Aggregate: sum units, average BPS weighted by volume
    const bucketAgg = {};
    let totalVolume = 0;
    let totalMissesSum = 0;

    for (const bridge of selectedBridges) {
      totalVolume += bridge.deaVolume;
      totalMissesSum += bridge.totalMisses;
      for (const [name, data] of bridge.sortedBuckets) {
        if (!bucketAgg[name]) bucketAgg[name] = { unitsSum: 0, bpsSum: 0, count: 0 };
        bucketAgg[name].unitsSum += data.units;
        bucketAgg[name].bpsSum += data.bps;
        bucketAgg[name].count += 1;
      }
    }

    const totalBPSAvg = Math.round(
      selectedBridges.reduce((s,b) => s + b.totalBPS, 0) / selectedBridges.length
    );

    const sortedBuckets = Object.entries(bucketAgg)
      .map(([name, agg]) => [name, {
        units: agg.unitsSum,
        bps: Math.round(agg.bpsSum / agg.count),
      }])
      .sort((a,b) => b[1].bps - a[1].bps || b[1].units - a[1].units);

    const weekLabels = selectedBridges.map(b => b.weekLabel);
    const weekKeys   = selectedBridges.map(b => b.weekKey);

    return {
      type: 'monthly',
      label,
      weekLabels,
      weekKeys,
      totalVolume,
      totalMissesSum,
      totalBPSAvg,
      sortedBuckets,
      rcData,      // { bucketName: { weekKey: 'text', ... }, ... }
      actionPlan,
    };
  }

  return { buildWeekly, buildMonthly };
})();
