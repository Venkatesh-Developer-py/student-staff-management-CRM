/* ==========================================================================
   Profenaa Technologies — Student Dashboard
   Performance module (Part C). Lives directly on the Dashboard now, inside
   #dashboardPerformanceMount (see student-dashboard.html) - there is no
   separate Performance page/sidebar item anymore. Self-contained on
   purpose: it only reads/writes elements inside #dashboardPerformanceMount
   (plus the legacy PEST table, which student-dashboard.js still owns) and
   only calls Api.performance.summary(). It does not touch any other
   section's markup, listeners, or state.

   Load order matters: this file must be included BEFORE student-dashboard.js
   in student-dashboard.html. Both files register a DOMContentLoaded
   listener; listeners fire in registration order, so this file's handler
   (which sets window.loadPerformanceSection) always runs before
   student-dashboard.js's own DOMContentLoaded handler calls it as part of
   loadDashboard().

   Expected response shape per period from GET /api/student/performance/summary?period=...:
   {
     attendancePercent: number|null,
     breakdown: { attendance, projects, placement, mockInterview, leave } // 0-100 each, for the chart
     ... (additional summary fields the backend also returns are not
          rendered here - the 5 old metric cards were intentionally
          removed from the Dashboard's Performance area; only the chart
          and PEST panel remain per the current design)
   }
   Any field the backend hasn't computed yet should be sent as null/absent -
   this file never invents a 0 in its place (Part C "Empty states").
   ========================================================================== */

document.addEventListener("DOMContentLoaded", function () {

  const mount = document.getElementById("dashboardPerformanceMount");
  if (!mount) return; // this page doesn't have the Performance markup

  function escapeHtml(str) {
    if (str == null) return "";
    return String(str)
      .replaceAll("&", "&amp;").replaceAll("<", "&lt;").replaceAll(">", "&gt;")
      .replaceAll('"', "&quot;").replaceAll("'", "&#039;");
  }

  const tabRow = document.getElementById("perfTabRow");
  const chartHeading = document.getElementById("perfChartHeading");
  const chartArea = document.getElementById("perfChartArea");
  const legacyPanel = mount.querySelector(".legacy-pest-panel");

  const PERIOD_LABELS = { this_month: "This Month", previous_month: "Previous Month", overall: "Overall" };
  const cache = {}; // period -> response, so switching tabs back and forth doesn't re-fetch every time
  let currentPeriod = "this_month";
  let requestSeq = 0; // only the most recent request may paint the chart (fast tab switching / dashboard revisits)

  // Simple, dependency-free doughnut chart built with a CSS conic-gradient
  // (Part C: "clean professional chart presentation... pie/doughnut chart
  // style is acceptable"). No chart library / CDN needed, keeps the page
  // fast and matches the existing crimson/paper design system.
  const CHART_SEGMENTS = [
    { key: "attendance", label: "Attendance", color: "var(--crimson)" },
    { key: "projects", label: "Projects", color: "var(--good)" },
    { key: "placement", label: "Placement", color: "var(--warn)" },
    { key: "mockInterview", label: "Mock Interview", color: "var(--crimson-light)" },
    { key: "leave", label: "Leave / Discipline", color: "var(--ink-soft)" }
  ];

  function renderChart(data) {
    const breakdown = data && data.breakdown;
    const usable = breakdown && CHART_SEGMENTS.some(seg => typeof breakdown[seg.key] === "number");

    if (!usable) {
      chartArea.innerHTML = `<p class="perf-empty-note">No performance data available for this period yet.</p>`;
      return;
    }

    const values = CHART_SEGMENTS.map(seg => Math.max(0, Number(breakdown[seg.key]) || 0));
    const total = values.reduce((a, b) => a + b, 0);

    let stops = [];
    if (total > 0) {
      let cursor = 0;
      CHART_SEGMENTS.forEach((seg, i) => {
        const slice = (values[i] / total) * 360;
        stops.push(`${seg.color} ${cursor}deg ${cursor + slice}deg`);
        cursor += slice;
      });
    } else {
      stops.push("var(--line) 0deg 360deg");
    }

    const legendHtml = CHART_SEGMENTS.map((seg, i) => {
      const raw = breakdown[seg.key];
      const shown = typeof raw === "number" ? Math.round(raw) + (seg.key === "leave" ? "" : "%") : "—";
      return `
        <div class="perf-legend-row">
          <span class="perf-legend-dot" style="background:${seg.color};"></span>
          <span class="perf-legend-label">${escapeHtml(seg.label)}</span>
          <span class="perf-legend-value">${escapeHtml(String(shown))}</span>
        </div>
      `;
    }).join("");

    chartArea.innerHTML = `
      <div class="perf-donut-wrap">
        <div class="perf-donut" style="background: conic-gradient(${stops.join(",")});">
          <div class="perf-donut-hole">
            <span class="perf-donut-hole-value">${data.attendancePercent != null ? data.attendancePercent + "%" : "—"}</span>
            <span class="perf-donut-hole-label">Attendance</span>
          </div>
        </div>
        <div class="perf-legend">${legendHtml}</div>
      </div>
    `;
  }

  async function loadPeriod(period) {
    const seq = ++requestSeq;
    chartHeading.textContent = `Performance Overview — ${PERIOD_LABELS[period]}`;

    if (cache[period]) {
      renderChart(cache[period]);
      return;
    }

    chartArea.innerHTML = `<p style="color:var(--ink-soft); font-size:.88rem; margin:0;">Loading…</p>`;
    try {
      const data = await Api.performance.summary(period);
      if (seq !== requestSeq) return; // a newer request (another tab / a refresh) owns the chart now
      cache[period] = data || {};
      renderChart(cache[period]);
    } catch (err) {
      if (seq !== requestSeq) return;
      chartArea.innerHTML = `<p class="perf-empty-note">${escapeHtml(err.message || "Couldn't load your performance data right now.")}</p>`;
      if (err && err.isAuthError) Auth.clear(); // same handling student-dashboard.js gives every other API
    }
  }

  if (tabRow) {
    tabRow.querySelectorAll(".perf-tab").forEach(tab => {
      tab.addEventListener("click", function () {
        if (this.dataset.period === currentPeriod) return;
        tabRow.querySelectorAll(".perf-tab").forEach(t => {
          t.classList.remove("active");
          t.setAttribute("aria-selected", "false");
        });
        this.classList.add("active");
        this.setAttribute("aria-selected", "true");
        currentPeriod = this.dataset.period;
        loadPeriod(currentPeriod);
      });
    });
  }

  // Legacy PEST results stay available but are no longer the primary
  // Performance view (Part C/P) - loaded lazily only if the student
  // actually opens the collapsed panel, and only once.
  if (legacyPanel) {
    legacyPanel.addEventListener("toggle", function () {
      if (legacyPanel.open && typeof window.loadPestPerformance === "function") {
        window.loadPestPerformance();
      }
    });
  }

  // Called from student-dashboard.js's loadDashboard() on every visit to the
  // Dashboard - Performance is part of the Dashboard itself, not a separately
  // navigated section. The per-period cache is dropped each time so the chart
  // always reflects current backend data (same as the summary cards), and a
  // previously failed load is retried instead of staying broken.
  function loadPerformanceSection() {
    Object.keys(cache).forEach(k => delete cache[k]);
    loadPeriod(currentPeriod);
  }

  window.loadPerformanceSection = loadPerformanceSection;
});
