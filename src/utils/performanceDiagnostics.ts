/** Optional, local-only diagnostics. No requests, identifiers or question data. */
export function installPerformanceDiagnostics(): void {
  if (typeof window === 'undefined' || typeof PerformanceObserver === 'undefined' ||
      new URLSearchParams(window.location.search).get('perf') !== '1') return;
  const observers: PerformanceObserver[] = [];
  let largestPaint = 0, longestTask = 0, layoutShift = 0, taskCount = 0;
  const supported = PerformanceObserver.supportedEntryTypes ?? [];
  function observe(type: string, consume: (entries: PerformanceEntry[]) => void) {
    if (!supported.includes(type)) return;
    const observer = new PerformanceObserver(list => consume(list.getEntries()));
    try { observer.observe({type, buffered: true}); observers.push(observer); }
    catch { observer.disconnect(); }
  }
  observe('largest-contentful-paint', entries => {
    for (const entry of entries) largestPaint = Math.max(largestPaint, entry.startTime);
  });
  observe('longtask', entries => {
    for (const entry of entries) {
      taskCount += 1;
      longestTask = Math.max(longestTask, entry.duration);
    }
  });
  // Layout shift sum is a diagnostic, not the official CLS session-window metric.
  observe('layout-shift', entries => {
    for (const entry of entries) {
      const shift = entry as PerformanceEntry & { value: number; hadRecentInput: boolean };
      if (!shift.hadRecentInput) layoutShift += shift.value;
    }
  });
  const report = () => {
    const nav = performance.getEntriesByType('navigation')[0] as PerformanceNavigationTiming | undefined;
    console.info('[YH performance]', {
      navigationTtfbMs: nav ? Math.round(nav.responseStart) : null,
      largestPaintMs: supported.includes('largest-contentful-paint') ? Math.round(largestPaint) : null,
      longTasks: supported.includes('longtask') ? taskCount : null,
      longestTaskMs: supported.includes('longtask') ? Math.round(longestTask) : null,
      layoutShiftSum: supported.includes('layout-shift') ? Number(layoutShift.toFixed(3)) : null,
    });
  };
  const onHidden = () => { if (document.hidden) report(); };
  const cleanup = () => {
    report();
    for (const observer of observers) observer.disconnect();
    document.removeEventListener('visibilitychange', onHidden);
    window.removeEventListener('pagehide', cleanup);
  };
  document.addEventListener('visibilitychange', onHidden);
  window.addEventListener('pagehide', cleanup, { once: true });
}
