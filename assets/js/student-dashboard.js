document.addEventListener("DOMContentLoaded", async function () {
    Auth.requireStudent("student-login.html");

    document.getElementById("welcomeName").textContent = Auth.getName() || "Student";
    const dashWelcomeName = document.getElementById("dashWelcomeName");
    if (dashWelcomeName) dashWelcomeName.textContent = Auth.getName() || "Student";

    // Extends the existing in-app notification system with real OS/browser
    // push delivery - see assets/js/push-notifications.js. Safe no-op if the
    // browser doesn't support push or Firebase isn't configured yet.
    if (typeof PushNotifications !== "undefined") {
      PushNotifications.init({
        role: "STUDENT",
        registerUrl: "/api/student/push/register-token",
        unregisterUrl: "/api/student/push/unregister-token",
        onForegroundMessage: function () {
          if (notificationsLoaded) refreshNotifications();
        }
      });
    }

    // ---------------- Logout (goes through SessionTracker so the session
    // record is properly closed server-side, then clears local auth) ----------------
    document.getElementById("logoutBtn").addEventListener("click", async function () {
      if (typeof PushNotifications !== "undefined") {
        await PushNotifications.unregisterOnLogout("/api/student/push/unregister-token");
      }
      await SessionTracker.logout();
      window.location.href = "student-login.html";
    });

    // ================================================================
    // Sidebar navigation (desktop fixed / tablet+mobile drawer)
    // ================================================================
    const sideNavItems = document.querySelectorAll(".side-nav-item[data-section]");
    const studentSections = document.querySelectorAll(".student-section");
    const sidebar = document.getElementById("studentSidebar");
    const sidebarBackdrop = document.getElementById("sidebarBackdrop");
    const sidebarToggleBtn = document.getElementById("sidebarToggleBtn");

    function openSidebar() {
      sidebar.classList.add("open");
      sidebarBackdrop.classList.add("show");
    }
    function closeSidebar() {
      sidebar.classList.remove("open");
      sidebarBackdrop.classList.remove("show");
    }
    sidebarToggleBtn.addEventListener("click", openSidebar);
    sidebarBackdrop.addEventListener("click", closeSidebar);

    const sectionLoaders = {
      "sec-dashboard": loadDashboard,
      "sec-profile": loadProfileSection,
      "sec-attendance": loadAttendance,
      "sec-activity": loadLoginActivity,
      "sec-leave": loadLeaveSection,
      "sec-projects": loadProjects,
      "sec-notifications": loadNotifications,
      "sec-certificates": loadCertificate,
      "sec-feedback": loadFeedbackSection,
      "sec-placement": typeof loadPlacementSection === "function" ? loadPlacementSection : function () {},
      "sec-mock-interviews": typeof loadMockInterviewSection === "function" ? loadMockInterviewSection : function () {},
      "sec-career-guidance": function () {},
      "sec-referral": loadReferralSection,
      "sec-job-updates": loadStudentJobUpdates
    };

    function resolveMediaUrl(url) {
      if (!url) return null;
      if (url.startsWith("http://") || url.startsWith("https://") || url.startsWith("data:") || url.startsWith("blob:")) {
        return url;
      }
      const base = typeof API_BASE_URL !== "undefined" ? API_BASE_URL : "";
      return base + (url.startsWith("/") ? url : "/" + url);
    }

    // Initialize topbar avatar on boot
    apiRequest("/api/students/me", { auth: true }).then(p => {
      if (p && p.profilePhotoUrl) {
        const fullPhotoUrl = resolveMediaUrl(p.profilePhotoUrl);
        const topbarImg = document.getElementById("topbarAvatarImg");
        const topbarText = document.getElementById("topbarAvatarText");
        if (topbarImg) { topbarImg.src = fullPhotoUrl; topbarImg.style.display = "block"; }
        if (topbarText) topbarText.style.display = "none";
      }
    }).catch(() => {});

    function activateSection(target) {
      if (!target) return;
      if (typeof window.mockInterviewGuard === "function" && !window.mockInterviewGuard(target)) return;

      sideNavItems.forEach(i => i.classList.toggle("active", i.dataset.section === target));
      studentSections.forEach(s => s.classList.toggle("active", s.id === target));
      closeSidebar();
      window.scrollTo({ top: 0, behavior: "smooth" });

      if (target === "sec-dashboard") dashboardLoaded = false;
      const loader = sectionLoaders[target];
      if (loader) loader();
    }
    window.activateStudentSection = activateSection;

    sideNavItems.forEach(item => {
      item.addEventListener("click", function () {
        activateSection(this.dataset.section);
      });
    });

    // ================================================================
    // DASHBOARD — summary cards + Performance + recent activity
    // ================================================================
    let dashboardLoaded = false;
    let dashboardRun = 0; // bumped on every (re)load so a slow response from an earlier visit can never overwrite newer data

    // Runs ONE Dashboard data source end-to-end on its own: fetch -> render.
    // A rejected request, or an exception while rendering, only ever affects
    // this source's own card(s) (they fall back to "—" via renderFailed) - the
    // other cards, the Performance chart, the PEST panel and Recent Activity
    // are separate tasks and keep going. Nothing here substitutes a made-up
    // value (0, 0%, 2 hours ...) for data the backend did not return.
    function runDashboardTask(runId, fetcher, render, renderFailed) {
      return Promise.resolve()
        .then(fetcher)
        .then(
          function (data) {
            if (runId !== dashboardRun) return;
            try { render(data); }
            catch (e) { console.error(e); try { renderFailed(e); } catch (_) { /* ignore */ } }
          },
          function (err) {
            if (runId !== dashboardRun) return;
            handleLoadError(err);
            try { renderFailed(err); } catch (e) { console.error(e); }
          }
        );
    }

    function setCardText(id, text) {
      const el = document.getElementById(id);
      if (el) el.textContent = text;
    }

    // ---- Project completion: the BACKEND project status is the only source of truth ----
    // Used by BOTH the Dashboard "Projects" card and the Project Journey summary so the two
    // numbers can never disagree. Nothing here reads localStorage / ProjectCompletionState.
    //   APPROVED  = completed          COMPLETED = completed (if the backend ever returns it)
    //   NOT_STARTED / IN_PROGRESS / SUBMITTED / UNDER_REVIEW / REVISION_REQUIRED = not completed
    function isProjectCompleted(p) {
      return !!p && (p.status === "APPROVED" || p.status === "COMPLETED");
    }
    function countCompletedProjects(rows) {
      return Array.isArray(rows) ? rows.filter(isProjectCompleted).length : 0;
    }
    // "X / 3" (the 3-stage journey; only grows past 3 if the backend ever returns more rows)
    function projectsCompletedText(rows) {
      const total = Math.max(TOTAL_JOURNEY_STAGES, Array.isArray(rows) ? rows.length : 0);
      return `${countCompletedProjects(rows)} / ${total}`;
    }

    async function loadDashboard() {
      if (dashboardLoaded) return; // cheap cache - refreshed on every return to the Dashboard (see nav handler)
      dashboardLoaded = true;
      const runId = ++dashboardRun;

      // Performance chart is embedded in the Dashboard (assets/js/performance.js)
      // and fetches/renders itself independently.
      if (typeof loadPerformanceSection === "function") {
        try { loadPerformanceSection(); } catch (e) { console.error(e); }
      }

      await Promise.all([
        // Certification Status  <- /api/students/me
        runDashboardTask(runId,
          () => apiRequest("/api/students/me", { auth: true }),
          renderCertificationCard,
          () => setCardText("cardCertification", "—")),

        // Attendance  <- /api/student/attendance/overview
        runDashboardTask(runId,
          () => Api.attendance.myOverview(),
          renderAttendanceCard,
          () => setCardText("cardAttendance", "—")),

        // Login Status + Recent Activity  <- /api/student/session/history (one request, two consumers)
        runDashboardTask(runId,
          () => Api.sessions.myHistory(),
          function (sessions) { renderLoginStatusCard(sessions); renderRecentActivity(sessions); },
          function () { setCardText("cardLoginStatus", "—"); renderRecentActivity(null); }),

        // Today's Working Hours  <- /api/student/session/working-hours/today (server-computed)
        runDashboardTask(runId,
          () => Api.sessions.myWorkingHoursToday(),
          renderWorkingHoursCard,
          (err) => {
            console.error("[WorkingHours] request to /api/student/session/working-hours/today failed:", err);
            renderWorkingHoursCard(null);
          }),

        // Projects  <- /api/student/projects  ("X / 3" = APPROVED/COMPLETED rows, straight from the backend status)
        runDashboardTask(runId,
          () => Api.projects.myList(),
          function (rows) {
            if (Array.isArray(rows)) {
              // Kept only so any other script that still reads ProjectCompletionState keeps working;
              // it is NOT used for the number shown here.
              if (typeof ProjectCompletionState !== "undefined") ProjectCompletionState.updateFromBackend(rows);
              setCardText("cardProjects", projectsCompletedText(rows));
            } else {
              setCardText("cardProjects", "—");
            }
          },
          () => setCardText("cardProjects", "—")),

        // Placement Applications  <- /api/student/placement/companies
        runDashboardTask(runId,
          () => Api.placement.myCompanies(),
          function (rows) { setCardText("cardPlacement", Array.isArray(rows) ? String(rows.length) : "—"); },
          () => setCardText("cardPlacement", "—")),

        // Mock Interview Score  <- /api/student/mock-interview/status
        runDashboardTask(runId,
          () => (typeof Api.mockInterview !== "undefined" ? Api.mockInterview.myStatus() : Promise.resolve(null)),
          renderMockScoreCard,
          () => setCardText("cardMockScore", "—")),

        // Sidebar unread badge  <- /api/student/notifications (on failure the badge is simply left as it was)
        runDashboardTask(runId,
          () => Api.notifications.myList(),
          function (rows) { if (Array.isArray(rows)) setNotifBadge(countUnread(rows)); },
          function () { /* keep current badge */ })
      ]);
    }

    function renderAttendanceCard(attendance) {
      setCardText("cardAttendance",
        attendance && attendance.overallPercent != null ? attendance.overallPercent + "%" : "—");
    }

    function renderLoginStatusCard(sessions) {
      const latestSession = Array.isArray(sessions) ? sessions[0] : null;
      setCardText("cardLoginStatus", latestSession ? statusLabel(latestSession.status) : "—");
    }

    function renderCertificationCard(profile) {
      if (!profile || typeof profile !== "object" || profile.certificateStatus == null) {
        setCardText("cardCertification", "—");
        return;
      }
      setCardText("cardCertification",
        (profile.certificateStatus === "ISSUED" && profile.certificateAvailable) ? "Issued" : "Pending");
    }

    // "Xh MMm" from a minute count the BACKEND supplied. Only used when the
    // response carries minutes but no ready-made label; never used to invent a value.
    function formatMinutes(m) {
      if (m == null || m === "" || !Number.isFinite(Number(m)) || Number(m) < 0) return null;
      const total = Math.floor(Number(m));
      return `${Math.floor(total / 60)}h ${String(total % 60).padStart(2, "0")}m`;
    }

    // ---- Today's Working Hours ----
    // Working hours are computed by the BACKEND (authenticated website-session time,
    // cumulative for the calendar day). This card only displays what
    // /api/student/session/working-hours/today returns - it never measures browser-open time,
    // never uses localStorage, and never invents a value. The response is normalised here
    // because backends name these fields differently.

    // Product rule: 2 hours (120 min) per day. Used ONLY as the target when the backend
    // doesn't send one - never as a worked value.
    const DAILY_TARGET_MINUTES = 120;
    let whRawLogged = false;   // logs the real backend payload once, so the true contract is visible in the console
    let whShapeWarned = false; // warns once (not every 60s) if the payload shape isn't recognised

    // Non-negative finite number from a number or numeric string; anything else -> null.
    function whNum(v) {
      if (typeof v === "string") v = v.trim();
      if (v == null || v === "" || typeof v === "boolean") return null;
      const n = Number(v);
      return Number.isFinite(n) && n >= 0 ? n : null;
    }
    function whPickNum(src, keys) {
      for (const k of keys) { const n = whNum(src[k]); if (n != null) return n; }
      return null;
    }
    function whPickStr(src, keys) {
      for (const k of keys) { const v = src[k]; if (typeof v === "string" && v.trim()) return v.trim(); }
      return null;
    }

    // One flat object -> { minutes, label, targetMinutes, targetLabel, goalFlag } or null.
    // With neither a worked-time number nor a ready-made label it returns null (nothing invented).
    function whReadObject(src) {
      if (!src || typeof src !== "object" || Array.isArray(src)) return null;

      // 1) explicit "total" minutes
      let minutes = whPickNum(src, [
        "totalMinutes", "workedMinutes", "workingMinutes", "totalWorkingMinutes",
        "todayMinutes", "activeMinutes", "durationMinutes", "completedMinutes"
      ]);

      // 2) explicit "total" seconds
      if (minutes == null) {
        const secs = whPickNum(src, ["totalSeconds", "workedSeconds", "workingSeconds", "totalWorkingSeconds", "durationSeconds", "activeSeconds"]);
        if (secs != null) minutes = Math.floor(secs / 60);
      }

      // 3) bare { minutes } / { hours, minutes } / { hours } / { seconds }
      if (minutes == null) {
        const mins = whNum(src.minutes);
        const wholeHours = whNum(src.hours);
        const decimalHours = whPickNum(src, ["totalHours", "workedHours", "workingHours", "hours"]);
        const bareSecs = whNum(src.seconds);
        if (mins != null && wholeHours != null) minutes = Math.floor(wholeHours) * 60 + Math.floor(mins); // {hours:1, minutes:35}
        else if (mins != null) minutes = Math.floor(mins);                                                 // {minutes:95}
        else if (decimalHours != null) minutes = Math.floor(decimalHours * 60 + 1e-6);                     // {hours:1.58} floored, never rounded up
        else if (bareSecs != null) minutes = Math.floor(bareSecs / 60);                                    // {seconds:5700}
      }

      let targetMinutes = whPickNum(src, ["targetMinutes", "dailyTargetMinutes", "requiredMinutes", "goalMinutes"]);
      if (targetMinutes == null) {
        const th = whPickNum(src, ["targetHours", "dailyTargetHours", "requiredHours", "goalHours"]);
        if (th != null) targetMinutes = Math.floor(th * 60 + 1e-6);
      }

      const label = whPickStr(src, ["label", "totalLabel", "workedLabel", "formatted", "durationLabel", "display"]);
      const targetLabel = whPickStr(src, ["targetLabel", "goalLabel", "requiredLabel"]);
      const goalFlag = ["goalReached", "completed", "targetReached", "goalMet", "dailyGoalReached", "isGoalReached", "isCompleted"]
        .some(function (k) { return src[k] === true; });

      if (minutes == null && label == null) return null;
      return { minutes: minutes, label: label, targetMinutes: targetMinutes, targetLabel: targetLabel, goalFlag: goalFlag };
    }

    // Top-level payload, or wrapped as { data | result | payload | workingHours | response: {...} }
    function normalizeWorkingHours(raw) {
      let wh = whReadObject(raw);
      if (!wh && raw && typeof raw === "object") {
        for (const k of ["data", "result", "payload", "workingHours", "response"]) {
          wh = whReadObject(raw[k]);
          if (wh) break;
        }
      }
      return wh;
    }

    // Pass the backend response, or null when the request failed.
    function renderWorkingHoursCard(raw) {
      const valueEl = document.getElementById("cardWorkingHours");
      const subEl = document.getElementById("cardWorkingHoursSub");
      if (!valueEl) return;

      if (raw != null && !whRawLogged) {
        whRawLogged = true;
        console.info("[WorkingHours] raw response from /api/student/session/working-hours/today:", raw);
      }

      const wh = normalizeWorkingHours(raw);
      if (!wh) {
        if (raw != null && !whShapeWarned) {
          whShapeWarned = true;
          console.warn("[WorkingHours] response received but no worked-time field was recognised - the card stays at \u2014. Raw response:", raw);
        }
        valueEl.textContent = "\u2014"; // never a fake value
        if (subEl) subEl.textContent = "Working hours unavailable";
        return;
      }

      // Worked time: "Xh MMm" from minutes (floored, never rounded up) when the backend sent a number, else its own label.
      valueEl.textContent = wh.minutes != null ? formatMinutes(wh.minutes) : wh.label;

      if (subEl) {
        const targetMinutes = wh.targetMinutes != null ? wh.targetMinutes : DAILY_TARGET_MINUTES;
        const reached = wh.goalFlag || (wh.minutes != null && wh.minutes >= targetMinutes);
        if (reached) {
          subEl.textContent = "Daily goal reached \u2705";
        } else {
          const targetLabel = wh.targetMinutes != null
            ? formatMinutes(wh.targetMinutes)
            : (wh.targetLabel || formatMinutes(DAILY_TARGET_MINUTES));
          subEl.textContent = targetLabel ? "of " + targetLabel + " target" : "";
        }
      }
    }

    // Keep the working-hours card current while the student sits on the
    // Dashboard (their active session keeps accruing time on the backend). ONE
    // timer for the whole page; it only re-fetches this one card, only while the
    // Dashboard is the visible section and the tab is visible, and on failure it
    // leaves the last good value on screen.
    setInterval(function () {
      if (document.hidden) return;
      const dash = document.getElementById("sec-dashboard");
      if (!dash || !dash.classList.contains("active")) return;
      Promise.resolve()
        .then(function () { return Api.sessions.myWorkingHoursToday(); })
        .then(function (raw) {
          // An empty / unrecognised refresh never blanks a good value that is already on screen.
          if (normalizeWorkingHours(raw)) renderWorkingHoursCard(raw);
          else console.warn("[WorkingHours] refresh returned no usable value - keeping the last one", raw);
        }, function (err) {
          console.warn("[WorkingHours] refresh failed - keeping the last value", err);
          handleLoadError(err);
        });
    }, 60 * 1000);

    function renderMockScoreCard(status) {
      const el = document.getElementById("cardMockScore");
      if (!el) return;
      if (!status || typeof status !== "object") { el.textContent = "—"; return; }
      if (status.status === "COMPLETED") {
        const norm = typeof window.normalizeMockInterviewResult === "function"
          ? window.normalizeMockInterviewResult
          : function (r) { return r; };
        const result = status.result ? norm(status.result) : null;
        if (result && result.score != null) {
          el.textContent = result.totalQuestions != null ? `${result.score} / ${result.totalQuestions}` : String(result.score);
        } else {
          el.textContent = "—";
        }
      } else if (status.status === "IN_PROGRESS") {
        el.textContent = "In progress";
      } else if (status.status === "NOT_STARTED") {
        el.textContent = "Not attempted";
      } else {
        el.textContent = "—";
      }
    }


    // Real unread-notification count, shared by the sidebar badge and the
    // Notifications section - single source of truth so both always agree.
    function countUnread(rows) {
      return (rows || []).filter(n => n.read === false).length;
    }

    function setNotifBadge(count) {
      document.querySelectorAll("[data-notif-badge]").forEach(badge => {
        if (count > 0) {
          badge.textContent = count > 99 ? "99+" : String(count);
          badge.style.display = "inline-flex";
        } else {
          badge.style.display = "none";
        }
      });
    }

    function statusLabel(status) {
      if (status === "ACTIVE") return "Online";
      if (status === "IDLE") return "Idle";
      if (status === "EXPIRED") return "Offline";
      return "Logged Out";
    }

    function renderRecentActivity(sessions) {
      const feed = document.getElementById("recentActivityFeed");
      if (!feed) return;
      if (!Array.isArray(sessions)) {
        feed.innerHTML = `<li class="activity-item"><span class="activity-text" style="color:var(--ink-soft);">Couldn't load your recent activity right now.</span></li>`;
        return;
      }
      if (!sessions.length) {
        feed.innerHTML = `<li class="activity-item"><span class="activity-text" style="color:var(--ink-soft);">No recent activity yet.</span></li>`;
        return;
      }
      // Built from real session data only (login / logout / session-expired events) -
      // this app doesn't yet log fine-grained page views, so we don't fabricate them.
      const recent = sessions.slice(0, 5);
      feed.innerHTML = recent.map(s => {
        const items = [];
        items.push({ time: extractTime(s.loginTime), text: "Logged in" });
        if (s.status === "LOGGED_OUT" && s.logoutTime) {
          items.push({ time: s.logoutTime, text: "Logged out" });
        } else if (s.status === "EXPIRED") {
          items.push({ time: s.logoutTime || "", text: "Session expired" });
        }
        return items.map(i => `
          <li class="activity-item">
            <span class="activity-time">${escapeHtml(i.time)}</span>
            <span class="activity-text">${escapeHtml(i.text)}</span>
          </li>
        `).join("");
      }).join("");
    }

    function extractTime(loginTimeLabel) {
      // loginTime comes as "18 Aug 2026, 09:00 AM" - show just the time part on the card.
      if (!loginTimeLabel) return "-";
      const parts = loginTimeLabel.split(",");
      return parts.length > 1 ? parts[1].trim() : loginTimeLabel;
    }

    // ================================================================
    // ATTENDANCE
    // ================================================================
    let attendanceLoaded = false;
    async function loadAttendance() {
      if (attendanceLoaded) return;
      attendanceLoaded = true;

      const historyBody = document.querySelector("#attendanceHistoryTable tbody");
      try {
        const overview = await Api.attendance.myOverview();

        // Missing backend values render as "—" - never as a made-up 0 / "null%".
        const orDash = v => (v == null || v === "" ? "—" : v);
        document.getElementById("attOverall").textContent = overview.overallPercent != null ? overview.overallPercent + "%" : "—";
        document.getElementById("attPresent").textContent = orDash(overview.presentCount);
        document.getElementById("attAbsent").textContent = orDash(overview.absentCount);
        overview.monthly = overview.monthly || [];
        overview.history = overview.history || [];

        const monthlyList = document.getElementById("monthlyAttendanceList");
        if (!overview.monthly.length) {
          monthlyList.innerHTML = `<p style="color:var(--ink-soft); font-size:.88rem; margin:0;">No monthly data yet.</p>`;
        } else {
          monthlyList.innerHTML = overview.monthly.map(m => `
            <div class="monthly-attendance-row">
              <span class="month-label">${escapeHtml(m.month)}</span>
              <div class="monthly-bar-track"><div class="monthly-bar-fill" style="width:${m.percent}%;"></div></div>
              <span class="month-percent">${m.percent}%</span>
            </div>
          `).join("");
        }

        if (!overview.history.length) {
          historyBody.innerHTML = `<tr class="empty-row"><td colspan="2">No attendance records yet.</td></tr>`;
        } else {
          historyBody.innerHTML = overview.history.map(h => `
            <tr>
              <td data-label="Date">${escapeHtml(h.date)}</td>
              <td data-label="Status">${statusBadge(h.status)}</td>
            </tr>
          `).join("");
        }
      } catch (err) {
        attendanceLoaded = false; // allow a retry on the next visit
        historyBody.innerHTML = `<tr class="empty-row"><td colspan="2">${escapeHtml(err.message)}</td></tr>`;
        handleLoadError(err);
      }
    }

    // ================================================================
    // PROFILE DASHBOARD (Full Profile details, Photo, Progress %, Course Change)
    // ================================================================
    let profileLoaded = false;
    let currentStudentProfile = null;

    const DEPARTMENT_COURSES = {
      "Mechanical CAD": [
        "CATIA",
        "Creo PTC",
        "Solidworks",
        "AutoCAD 2D & 3D",
        "Master CAM",
        "AutoDesk inventor",
        "Ansys",
        "NX CAD",
        "Hypermech",
        "Reverse Engineering",
        "GD&T",
        "PP (Process Planning)",
        "Creo Schematic",
        "Creo Cabling",
        "Catia Wiring Harness",
        "Advanced Diploma in 3D Printing Technology",
        "Master Diploma In product Design",
        "Advanced Diploma In Product Design",
        "Diploma In Product Design",
        "Advanced Diploma In CAM (Computer Aided Manufacturing)",
        "Advanced Diploma In CAE (Computer Aided Engineering)",
        "Post Diploma in Product Design",
        "Mechanical CAD",
        "AutoCAD Mechanical",
        "CATIA (Part, Assembly & Surface)",
        "PTC Creo Parametric",
        "SolidWorks Design & Simulation",
        "Autodesk Inventor Professional",
        "ANSYS FEA & CFD Simulation",
        "Siemens NX CAD & CAM",
        "HyperMesh CAE Simulation",
        "Mastercam CNC Programming",
        "3D Printing & Additive Manufacturing",
        "Product Design & Reverse Engineering",
        "GD&T (Geometric Dimensioning & Tolerancing)"
      ],
      "Civil CAD": [
        "Auto CAD civil",
        "Revit Structure",
        "STAAD Pro",
        "3DS Max",
        "Primavera",
        "SketchUp",
        "MEP",
        "Tekla",
        "E Tabs",
        "V Ray",
        "Lumion",
        "Revit Architecture",
        "Master Diploma In Architectural & Structural Design",
        "Advanced Diploma In Architectural Design & Structural Design",
        "Advanced Diploma In Structural Design",
        "Diploma In Architectural Design",
        "Master Diploma In MEP",
        "Post Diploma In Architectural & Structural Design",
        "Civil CAD",
        "AutoCAD Civil & Architectural",
        "Autodesk Revit Architecture & Structure",
        "STAAD.Pro Structural Analysis",
        "Primavera P6 Project Management",
        "Trimble SketchUp & V-Ray",
        "Tekla Structures Detailing",
        "ETABS Building Analysis",
        "Lumion 3D Visualization",
        "MEP Drafting (Mechanical, Electrical, Plumbing)",
        "3ds Max Architectural Modeling"
      ],
      "Electrical CAD": [
        "Electrical Cad",
        "Electrical Harness",
        "Scada",
        "Skelion (Skelion for Solar design plugin renewable energy",
        "Helioscope (Solar software)",
        "PVsyst",
        "Master Diploma In Electrical Design (Cabling & Wiring harness)",
        "Diploma in Solar Design",
        "Master Diploma In Solar Design",
        "POST DIPLOMA IN SOLAR DESIGN",
        "Diploma in Wiring Harnness",
        "Master Diploma In Electrical Automation",
        "Advanced Diploma In Electrical Automation",
        "Diploma In Electrical Automation",
        "Master Diploma In Electrical Wiring Harness using Creo",
        "Master Diploma In Electrical Wiring Harness using CATIA",
        "Diploma In Electrical Wiring Harness",
        "Post Diploma In Electrical Automation",
        "Post Diploma In Electrical Wiring Harness using CATIA",
        "Post Diploma In Electrical Wiring Harness using CREO PTC",
        "Electrical CAD",
        "AutoCAD Electrical",
        "EPLAN Electric P8",
        "Electrical Harness & Cabling Design",
        "Solar PV System Design (HelioScope / PVsyst)",
        "Industrial Automation & SCADA",
        "PLC Programming (Siemens / Allen-Bradley / Delta)"
      ],
      "Electronic CAD": [
        "Embedded Systems",
        "PCB Design",
        "Mat Lab",
        "PLC",
        "Lab View",
        "VLSI (Design & Verification - UVM & RTL)",
        "VLSI Deep Learning (ASIC & FPGA)",
        "Embedded C",
        "Advanced Embedded System",
        "Master Diploma In Electronics Automation",
        "Advanced Diploma In Electronics Automation",
        "Diploma In Electronics Automation",
        "Master Diploma In VLSI",
        "Diploma In VLSI",
        "Post Diploma In Electronics Automation",
        "Post Diploma In VLSI",
        "Electronic CAD",
        "Electronics CAD",
        "Embedded Systems (ARM / Arduino / PIC / ESP32)",
        "PCB Design & Fabrication (Altium / KiCAD)",
        "VLSI Design & Verification (Verilog / VHDL / FPGA)",
        "MATLAB & Simulink",
        "LabVIEW Instrumentation",
        "IoT & Robotics Engineering"
      ],
      "Arts and Multimedia": [
        "Photo Shop",
        "Coral Draw",
        "Adobe Illustrator",
        "Adobe After Effects",
        "3DS Max",
        "Blender",
        "Master Diploma in Multimedia",
        "Master Diploma in UI / UX Design",
        "Diploma in Multimedia",
        "Diploma in UI / UX Design",
        "Master Diploma in Accounting & Multimedia",
        "Diploma in Digital Marketing",
        "Diploma in Accounting & Multimedia",
        "ISST",
        "Adobe XD",
        "Adobe Figma",
        "Organic Marketing (Un-paid SEO Based)",
        "In-organic Marketing (Paid Promotion)",
        "On Job Training – Digital Marketing",
        "On Job Training – Web Design",
        "Master Diploma In UI/UX Design (Web Design)",
        "Master Diploma In Digital Marketing",
        "Post Diploma In Digital Maketing",
        "Post Diploma In UIUX Design (Web Design)",
        "Advanced Diploma In Graphic design",
        "Master Diploma in Accounting and Graphic design",
        "Master Diploma In Graphic Design & Multimedia",
        "Post Diploma In Graphic Design & Multimedia",
        "Arts and Multimedia",
        "Graphic Design Masterclass (Photoshop, Illustrator, Corel)",
        "UI/UX Design (Figma, Adobe XD, Prototyping)",
        "2D Animation & Motion Graphics (After Effects, Premiere)",
        "3D Animation & VFX (Blender, Maya)",
        "Digital Marketing & SEO Strategy",
        "Web Design & Frontend UI (HTML5, CSS3, JS)"
      ],
      "Computer Science / IT": [
        "Core Python",
        "Core JAVA",
        ".Net",
        "IoT",
        "Oracle",
        "Networking CCNA",
        "C/C++",
        "MS OFFICE",
        "TALLY ERP9.0 with GST",
        "Tally prime",
        "Master Diploma in Full Stack Development using Python",
        "Master Diploma In Data Science",
        "Master Diploma In AI & ML",
        "Master Diploma In Fullstack Development using Java",
        "Diploma in Full Stack Development using Python",
        "Diploma In Data Science",
        "Diploma In AI & ML",
        "Diploma In Fullstack Development using Java",
        "Front End (HTML , CSS , Java Script)",
        "SQL",
        "Mongo DB",
        "Django Python",
        "Spring Boot",
        "React JS",
        "Node JS",
        "Angular JS",
        "Express JS",
        "Java Selenium",
        "TDD Frame work (J Unit , Test NG)",
        "BDD Frame work (Cucumber)",
        "Manual Testing",
        "Power BI",
        "Tableau",
        "Numpy & Pandas",
        "Scikitlearn",
        "Matplotlib",
        "Keras",
        "Tensor Flow",
        "Master Diploma In SAP",
        "About ERP",
        "SAP MM",
        "Post Diploma in Software Development using python",
        "Post Diploma in software Development using JAVA",
        "On Job Training – Web & Software Development",
        "On Job Training – Data Analytics",
        "Master Diploma In Full Stack / Software Development (Java)",
        "Diploma In Full Stack / Software Development (Java)",
        "Master Diploma In Full Stack / Software Development (Python)",
        "Diploma In Full Stack / Software Development (Python)",
        "Master Diploma In Software Testing",
        "Diploma In Software Testing",
        "Diploma In Front End Development",
        "Master Diploma in MEAN stack Development",
        "Master Diploma in MERN stack Development",
        "Post Diploma In Full Stack Software Development (Java).",
        "Post Diploma In Full Stack Software Development (Python).",
        "Post Diploma in MEAN stack Development",
        "Post Diploma In Software Testing",
        "Diploma in Programming",
        "Master Diploma In Data Analytics",
        "Diploma In Data Analytics",
        "Master Diploma In AI/ML",
        "Diploma In AI/ML",
        "Diploma In Accounting",
        "Diploma in Montessori and Child Education",
        "Advanced Diploma In Montessori and Child Education [ 6 months ]",
        "Advanced Diploma In Montessori and Child Education [ One Year ]",
        "Advanced Diploma In Montessori,Kindergarten & Nursery Education",
        "Advanced Diploma In Montessori and Primary Education",
        "Advanced Diploma In Montessori and Grade Level Education",
        "Diploma In Nursery Education",
        "Diploma In Medical Laboratory Technology [ 2 years ]",
        "Diploma In X-Ray Technology [ 2 years ]",
        "Emergency Patient Care Technician [ 1 year ]",
        "Physiotherapy Technician [ 1 year ]",
        "Diploma In General Healthcare & Maternity Assistant [ 2 years ]",
        "Diploma In Dental Assistant [ 1 year ]",
        "Advanced Diploma In Clinical Laboratory Technology [ 2 years ]",
        "Diploma In Operation Theatre Technology [ 2 years ]",
        "Day Care",
        "Play Group",
        "Nursery",
        "Junior KG",
        "Senior KG",
        "NEET",
        "JEE",
        "Certificate",
        "Internship",
        "Value Added Course",
        "Project Training"
      ]
    };

    function normalizeDept(dept) {
      if (!dept) return "";
      const d = dept.trim().toLowerCase();
      if (d.includes("electronic")) return "Electronic CAD";
      if (d.includes("electric")) return "Electrical CAD";
      if (d.includes("mechanical")) return "Mechanical CAD";
      if (d.includes("civil")) return "Civil CAD";
      if (d.includes("art") || d.includes("multimedia")) return "Arts and Multimedia";
      if (d.includes("computer") || d.includes("software") || d.includes("it")) return "Computer Science / IT";
      return dept.trim();
    }

    async function loadProfileSection() {
      try {
        const p = await apiRequest("/api/students/me", { auth: true });
        currentStudentProfile = p;
        renderProfileSection(p);
      } catch (err) {
        showToast(err.message, "error");
        handleLoadError(err);
      }
    }

    function renderProfileSection(p) {
      if (!p) return;

      const name = p.name || Auth.getName() || "Student";
      document.getElementById("profileHeroName").textContent = name;
      document.getElementById("profileHeroId").textContent = p.studentId || "-";
      document.getElementById("profileHeroBranch").textContent = "Branch: " + (p.branch || "Kinathukadavu");
      document.getElementById("profileHeroCourse").textContent = p.course || "Technical Course";

      const certBadge = document.getElementById("profileHeroCertBadge");
      if (certBadge) {
        const isIssued = p.certificateStatus === "ISSUED";
        certBadge.textContent = isIssued ? "Certificate Issued" : "Certificate Pending";
        certBadge.style.background = isIssued ? "#1f9d55" : "#eab308";
      }

      // Photos & Avatars (Hero, Topbar, Fixed Badge & Modal)
      const photoImg = document.getElementById("profilePhotoImg");
      const photoFallback = document.getElementById("profilePhotoFallback");
      const topbarImg = document.getElementById("topbarAvatarImg");
      const topbarText = document.getElementById("topbarAvatarText");
      const fixedAvatarImg = document.getElementById("fixedProfileAvatarImg");
      const fixedAvatarText = document.getElementById("fixedProfileAvatarText");
      const fixedName = document.getElementById("fixedProfileName");
      const modalAvatarImg = document.getElementById("modalProfileAvatarImg");
      const modalAvatarText = document.getElementById("modalProfileAvatarText");
      const fullPhotoUrl = resolveMediaUrl(p.profilePhotoUrl);

      if (fixedName) fixedName.textContent = name;

      if (fullPhotoUrl) {
        if (photoImg) { photoImg.src = fullPhotoUrl; photoImg.style.display = "block"; }
        if (photoFallback) { photoFallback.style.display = "none"; }
        if (topbarImg) { topbarImg.src = fullPhotoUrl; topbarImg.style.display = "block"; }
        if (topbarText) { topbarText.style.display = "none"; }
        if (fixedAvatarImg) { fixedAvatarImg.src = fullPhotoUrl; fixedAvatarImg.style.display = "block"; }
        if (fixedAvatarText) { fixedAvatarText.style.display = "none"; }
        if (modalAvatarImg) { modalAvatarImg.src = fullPhotoUrl; modalAvatarImg.style.display = "block"; }
        if (modalAvatarText) { modalAvatarText.style.display = "none"; }
      } else {
        const initial = name.charAt(0).toUpperCase();
        if (photoImg) { photoImg.style.display = "none"; }
        if (photoFallback) { photoFallback.textContent = initial; photoFallback.style.display = "flex"; }
        if (topbarImg) { topbarImg.style.display = "none"; }
        if (topbarText) { topbarText.textContent = initial; topbarText.style.display = "flex"; }
        if (fixedAvatarImg) { fixedAvatarImg.style.display = "none"; }
        if (fixedAvatarText) { fixedAvatarText.textContent = initial; fixedAvatarText.style.display = "flex"; }
        if (modalAvatarImg) { modalAvatarImg.style.display = "none"; }
        if (modalAvatarText) { modalAvatarText.textContent = initial; modalAvatarText.style.display = "flex"; }
      }

      // Quick Profile Modal Details
      const modalName = document.getElementById("modalProfileName");
      if (modalName) modalName.textContent = name;
      const modalId = document.getElementById("modalProfileStudentId");
      if (modalId) modalId.textContent = "ID: " + (p.studentId || "-");
      const modalBranch = document.getElementById("modalProfileBranch");
      if (modalBranch) modalBranch.textContent = "Branch: " + (p.branch || "Kinathukadavu");
      const modalCert = document.getElementById("modalProfileCertStatus");
      if (modalCert) {
        const isIssued = p.certificateStatus === "ISSUED";
        modalCert.textContent = isIssued ? "Certificate Issued" : "Certificate Pending";
        modalCert.style.background = isIssued ? "#1f9d55" : "#eab308";
      }
      if (document.getElementById("modalProfileEmail")) document.getElementById("modalProfileEmail").textContent = p.email || "-";
      if (document.getElementById("modalProfilePhone")) document.getElementById("modalProfilePhone").textContent = p.phone || "-";
      if (document.getElementById("modalProfileDepartment")) document.getElementById("modalProfileDepartment").textContent = p.department || "-";
      if (document.getElementById("modalProfileCourse")) document.getElementById("modalProfileCourse").textContent = p.course || "Pending Specialization";
      if (document.getElementById("modalProfileCollegeName")) document.getElementById("modalProfileCollegeName").textContent = p.collegeName || "-";
      if (document.getElementById("modalProfileCollegeDates")) {
        document.getElementById("modalProfileCollegeDates").textContent = (p.collegeStartDate || p.collegeEndDate) ? `${p.collegeStartDate || "—"} to ${p.collegeEndDate || "—"}` : "-";
      }
      if (document.getElementById("modalProfileInternship")) {
        document.getElementById("modalProfileInternship").textContent = p.internshipRequired ? `Required (${p.internshipStartDate || "—"} to ${p.internshipEndDate || "—"})` : "Not Required";
      }
      if (document.getElementById("modalProfileExperience")) {
        document.getElementById("modalProfileExperience").textContent = p.experienceRequired ? `Required (${p.experienceStartDate || "—"} to ${p.experienceEndDate || "—"})` : "Not Required";
      }
      if (document.getElementById("modalProfileJoinDate")) document.getElementById("modalProfileJoinDate").textContent = p.dateOfJoin || "-";
      if (document.getElementById("modalProfileProgressPct")) document.getElementById("modalProfileProgressPct").textContent = `${p.profileProgressPercent || 20}%`;

      // Common Details
      document.getElementById("profileDetailName").textContent = name;
      document.getElementById("profileDetailStudentId").textContent = p.studentId || "-";
      document.getElementById("profileDetailEmail").textContent = p.email || "-";
      document.getElementById("profileDetailPhone").textContent = p.phone || "-";
      const deptEl = document.getElementById("profileDetailDepartment");
      if (deptEl) deptEl.textContent = p.department || "-";
      document.getElementById("profileDetailBranch").textContent = p.branch || "Kinathukadavu";
      document.getElementById("profileDetailJoinDate").textContent = p.dateOfJoin || "-";

      const colNameEl = document.getElementById("profileDetailCollegeName");
      if (colNameEl) colNameEl.textContent = p.collegeName || "-";

      const collegeDatesEl = document.getElementById("profileDetailCollegeDates");
      if (collegeDatesEl) {
        if (p.collegeStartDate || p.collegeEndDate) {
          collegeDatesEl.textContent = `${p.collegeStartDate || "—"} to ${p.collegeEndDate || "—"}`;
        } else {
          collegeDatesEl.textContent = "-";
        }
      }

      const internEl = document.getElementById("profileDetailInternship");
      if (internEl) {
        internEl.textContent = p.internshipRequired ? `Required (${p.internshipStartDate || "—"} to ${p.internshipEndDate || "—"})` : "Not Required";
      }

      const expEl = document.getElementById("profileDetailExperience");
      if (expEl) {
        expEl.textContent = p.experienceRequired ? `Required (${p.experienceStartDate || "—"} to ${p.experienceEndDate || "—"})` : "Not Required";
      }

      document.getElementById("profileDetailCertStatus").textContent = p.certificateStatus === "ISSUED" ? "Issued ✓" : "Pending Processing";
      document.getElementById("profileDetailCertDate").textContent = p.certificateIssuedOn || "Not yet issued";

      // Prefill Academic & Certificate Edit Form
      const inputColName = document.getElementById("profileCollegeNameInput");
      if (inputColName) inputColName.value = p.collegeName || "";
      const inputColStart = document.getElementById("profileCollegeStartDateInput");
      if (inputColStart) inputColStart.value = p.collegeStartDate || "";
      const inputColEnd = document.getElementById("profileCollegeEndDateInput");
      if (inputColEnd) inputColEnd.value = p.collegeEndDate || "";
      const inputInternReq = document.getElementById("profileInternshipReqSelect");
      if (inputInternReq) inputInternReq.value = p.internshipRequired ? "true" : "false";
      const inputInternStart = document.getElementById("profileInternshipStartDateInput");
      if (inputInternStart) inputInternStart.value = p.internshipStartDate || "";
      const inputInternEnd = document.getElementById("profileInternshipEndDateInput");
      if (inputInternEnd) inputInternEnd.value = p.internshipEndDate || "";
      const inputExpReq = document.getElementById("profileExperienceReqSelect");
      if (inputExpReq) inputExpReq.value = p.experienceRequired ? "true" : "false";
      const inputExpStart = document.getElementById("profileExperienceStartDateInput");
      if (inputExpStart) inputExpStart.value = p.experienceStartDate || "";
      const inputExpEnd = document.getElementById("profileExperienceEndDateInput");
      if (inputExpEnd) inputExpEnd.value = p.experienceEndDate || "";

      // Course Select Dynamic Population and Locking
      const courseSelect = document.getElementById("profileCourseSelect");
      const updateCourseBtn = document.getElementById("profileUpdateCourseBtn");
      const lockedNotice = document.getElementById("profileCourseLockedNotice");
      const canonicalDept = normalizeDept(p.department);
      const coursesForDept = DEPARTMENT_COURSES[canonicalDept] || null;

      if (courseSelect) {
        courseSelect.innerHTML = "";
        const defaultOpt = document.createElement("option");
        defaultOpt.value = "";
        defaultOpt.textContent = canonicalDept ? `Select your ${canonicalDept} course` : "Select your course specialization";
        courseSelect.appendChild(defaultOpt);

        if (coursesForDept && coursesForDept.length > 0) {
          coursesForDept.forEach(c => {
            const opt = document.createElement("option");
            opt.value = c;
            opt.textContent = c;
            courseSelect.appendChild(opt);
          });
        } else {
          // If no specific department found, list all grouped by department
          Object.keys(DEPARTMENT_COURSES).forEach(deptName => {
            const group = document.createElement("optgroup");
            group.label = deptName;
            DEPARTMENT_COURSES[deptName].forEach(c => {
              const opt = document.createElement("option");
              opt.value = c;
              opt.textContent = c;
              group.appendChild(opt);
            });
            courseSelect.appendChild(group);
          });
        }

        const isCourseChosen = Boolean(p.course && p.course.trim());
        if (isCourseChosen) {
          // If the assigned course is not in the list, dynamically append it
          let optionFound = false;
          for (let i = 0; i < courseSelect.options.length; i++) {
            if (courseSelect.options[i].value === p.course) {
              optionFound = true;
              break;
            }
          }
          if (!optionFound) {
            const customOpt = document.createElement("option");
            customOpt.value = p.course;
            customOpt.textContent = p.course;
            courseSelect.appendChild(customOpt);
          }

          courseSelect.value = p.course;
          courseSelect.disabled = true;
          courseSelect.title = "Course specialization has been confirmed and locked.";

          if (updateCourseBtn) {
            updateCourseBtn.disabled = true;
            updateCourseBtn.textContent = "Course Locked";
            updateCourseBtn.style.opacity = "0.6";
            updateCourseBtn.style.cursor = "not-allowed";
          }
          if (lockedNotice) {
            lockedNotice.style.display = "block";
          }
        } else {
          courseSelect.disabled = false;
          courseSelect.value = "";
          courseSelect.removeAttribute("title");

          if (updateCourseBtn) {
            updateCourseBtn.disabled = false;
            updateCourseBtn.textContent = "Confirm Course";
            updateCourseBtn.style.opacity = "1";
            updateCourseBtn.style.cursor = "pointer";
          }
          if (lockedNotice) {
            lockedNotice.style.display = "none";
          }
        }
      }

      // Progress calculation according to exact user spec:
      // Base: 20%
      // Resume: +15% (35%)
      // LinkedIn, Naukri, Indeed profiles: +15% (50%)
      // Companies Applied: +30% (80%)
      // 3 Projects completed: +20% (100%)
      const hasResume = !!(p.resumeUploaded || p.resumeProfileExists);
      const hasProfiles = !!(p.linkedinUrl || p.naukriUrl || p.indeedUrl);
      const hasCompanies = Number(p.companiesAppliedCount || 0) > 0;
      const completedProjects = Number(p.projectsCompletedCount || 0);
      const totalProjects = Number(p.projectsTotalCount || 3);
      const allProjectsDone = completedProjects >= totalProjects && completedProjects >= 3;

      let progressPct = 20;
      if (hasResume) progressPct += 15;
      if (hasProfiles) progressPct += 15;
      if (hasCompanies) progressPct += 30;
      if (allProjectsDone) {
        progressPct += 20;
      } else if (completedProjects > 0) {
        progressPct += Math.round((20 * completedProjects) / (totalProjects || 3));
      }
      progressPct = Math.min(100, Math.max(20, progressPct));

      const finalPercent = p.profileProgressPercent != null ? p.profileProgressPercent : progressPct;

      const progressText = document.getElementById("profileProgressPercentText");
      if (progressText) progressText.textContent = finalPercent + "%";

      const progressBar = document.getElementById("profileProgressBarFill");
      if (progressBar) progressBar.style.width = finalPercent + "%";

      // Step indicators
      const stepResume = document.getElementById("stepResume");
      const stepResumeWeight = document.getElementById("stepResumeWeight");
      const stepResumeIcon = document.getElementById("stepResumeIcon");
      if (stepResume) {
        stepResume.classList.toggle("done", hasResume);
        if (hasResume) {
          stepResumeIcon.textContent = "✓";
          stepResumeWeight.textContent = "+15% · Uploaded";
        } else {
          stepResumeIcon.textContent = "📄";
          stepResumeWeight.textContent = "+15% · Pending";
        }
      }

      const stepProfiles = document.getElementById("stepProfiles");
      const stepProfilesWeight = document.getElementById("stepProfilesWeight");
      const stepProfilesIcon = document.getElementById("stepProfilesIcon");
      if (stepProfiles) {
        stepProfiles.classList.toggle("done", hasProfiles);
        if (hasProfiles) {
          stepProfilesIcon.textContent = "✓";
          stepProfilesWeight.textContent = "+15% · Portals Added";
        } else {
          stepProfilesIcon.textContent = "🌐";
          stepProfilesWeight.textContent = "+15% · LinkedIn / Naukri";
        }
      }

      const stepCompanies = document.getElementById("stepCompanies");
      const stepCompaniesWeight = document.getElementById("stepCompaniesWeight");
      const stepCompaniesIcon = document.getElementById("stepCompaniesIcon");
      if (stepCompanies) {
        stepCompanies.classList.toggle("done", hasCompanies);
        if (hasCompanies) {
          stepCompaniesIcon.textContent = "✓";
          stepCompaniesWeight.textContent = `+30% · ${p.companiesAppliedCount} Applied`;
        } else {
          stepCompaniesIcon.textContent = "🏢";
          stepCompaniesWeight.textContent = "+30% · Placement Tracker";
        }
      }

      const stepProjects = document.getElementById("stepProjects");
      const stepProjectsWeight = document.getElementById("stepProjectsWeight");
      const stepProjectsIcon = document.getElementById("stepProjectsIcon");
      if (stepProjects) {
        stepProjects.classList.toggle("done", allProjectsDone);
        if (allProjectsDone) {
          stepProjectsIcon.textContent = "✓";
          stepProjectsWeight.textContent = "+20% · 3 / 3 Approved";
        } else {
          stepProjectsIcon.textContent = "💻";
          stepProjectsWeight.textContent = `+20% · ${completedProjects} / ${totalProjects || 3} Done`;
        }
      }
    }

    function compressImage(file, maxDimension = 800, quality = 0.85) {
      return new Promise((resolve) => {
        try {
          const reader = new FileReader();
          reader.onload = function (e) {
            const img = new Image();
            img.onload = function () {
              let width = img.width;
              let height = img.height;

              if (width > height) {
                if (width > maxDimension) {
                  height = Math.round((height * maxDimension) / width);
                  width = maxDimension;
                }
              } else {
                if (height > maxDimension) {
                  width = Math.round((width * maxDimension) / height);
                  height = maxDimension;
                }
              }

              const canvas = document.createElement("canvas");
              canvas.width = width;
              canvas.height = height;
              const ctx = canvas.getContext("2d");
              ctx.drawImage(img, 0, 0, width, height);

              canvas.toBlob(
                (blob) => {
                  if (!blob) {
                    resolve(file);
                    return;
                  }
                  const safeName = (file.name || "profile.jpg").replace(/\.[^/.]+$/, ".jpg");
                  const compressedFile = new File([blob], safeName, {
                    type: "image/jpeg",
                    lastModified: Date.now()
                  });
                  resolve(compressedFile);
                },
                "image/jpeg",
                quality
              );
            };
            img.onerror = () => resolve(file);
            img.src = e.target.result;
          };
          reader.onerror = () => resolve(file);
          reader.readAsDataURL(file);
        } catch (_) {
          resolve(file);
        }
      });
    }

    // Photo Upload Listener with Automatic Compression
    const photoInput = document.getElementById("profilePhotoInput");
    if (photoInput) {
      photoInput.addEventListener("change", async function () {
        if (!this.files || !this.files[0]) return;
        const rawFile = this.files[0];
        if (!rawFile.type.startsWith("image/")) {
          showToast("Please select a valid image file (JPG, PNG, WebP).", "error");
          return;
        }

        try {
          showToast("Optimizing and uploading profile photo…", "info");
          const fileToUpload = await compressImage(rawFile, 800, 0.85);
          await Api.students.uploadPhoto(fileToUpload);
          showToast("Profile photo updated successfully!", "success");
          await loadProfileSection();
        } catch (err) {
          showToast(err.message || "Failed to upload photo", "error");
        } finally {
          photoInput.value = "";
        }
      });
    }

    // Course Confirmation & Locking Listener
    const updateCourseBtn = document.getElementById("profileUpdateCourseBtn");
    if (updateCourseBtn) {
      updateCourseBtn.addEventListener("click", async function () {
        if (currentStudentProfile && currentStudentProfile.course && currentStudentProfile.course.trim()) {
          showToast("Course specialization has already been confirmed and locked.", "info");
          return;
        }

        const newCourse = document.getElementById("profileCourseSelect").value;
        if (!newCourse) {
          showToast("Please select a valid course.", "error");
          return;
        }

        const ok = confirm(`Are you sure you want to enroll in "${newCourse}"?\n\nIMPORTANT: Once confirmed, your course specialization is locked and cannot be changed. This will allocate your 3 practical projects and configure your Mock Interview quiz.`);
        if (!ok) return;

        updateCourseBtn.disabled = true;
        updateCourseBtn.textContent = "Confirming Course…";
        try {
          await Api.students.updateCourse(newCourse);
          showToast("Course confirmed and locked successfully! Projects and Quiz allocated.", "success");
          cachedStudentCourse = newCourse;
          projectsLoaded = false;
          dashboardLoaded = false;
          await loadProfileSection();
        } catch (err) {
          showToast(err.message || "Failed to confirm course", "error");
          updateCourseBtn.disabled = false;
          updateCourseBtn.textContent = "Confirm Course";
        }
      });
    }

    // Form submission for Academic & Certificate Details
    const profileDetailsForm = document.getElementById("profileDetailsForm");
    if (profileDetailsForm) {
      profileDetailsForm.addEventListener("submit", async function (e) {
        e.preventDefault();
        const successEl = document.getElementById("profileDetailsFormSuccess");
        const errorEl = document.getElementById("profileDetailsFormError");
        const saveBtn = document.getElementById("profileSaveDetailsBtn");
        if (successEl) successEl.style.display = "none";
        if (errorEl) errorEl.style.display = "none";

        if (saveBtn) {
          saveBtn.disabled = true;
          saveBtn.textContent = "Saving Details…";
        }

        const payload = {
          collegeName: document.getElementById("profileCollegeNameInput").value.trim() || null,
          collegeStartDate: document.getElementById("profileCollegeStartDateInput").value || null,
          collegeEndDate: document.getElementById("profileCollegeEndDateInput").value || null,
          internshipRequired: document.getElementById("profileInternshipReqSelect").value === "true",
          internshipStartDate: document.getElementById("profileInternshipStartDateInput").value || null,
          internshipEndDate: document.getElementById("profileInternshipEndDateInput").value || null,
          experienceRequired: document.getElementById("profileExperienceReqSelect").value === "true",
          experienceStartDate: document.getElementById("profileExperienceStartDateInput").value || null,
          experienceEndDate: document.getElementById("profileExperienceEndDateInput").value || null
        };

        try {
          const updatedProfile = await Api.students.updateProfileDetails(payload);
          currentStudentProfile = updatedProfile;
          renderProfileSection(updatedProfile);
          showToast("Academic & Certificate details updated successfully!", "success");
          if (successEl) {
            successEl.textContent = "Profile details saved successfully!";
            successEl.style.display = "block";
          }
        } catch (err) {
          showToast(err.message || "Failed to update profile details", "error");
          if (errorEl) {
            errorEl.textContent = err.message || "Failed to update profile details";
            errorEl.style.display = "block";
          }
        } finally {
          if (saveBtn) {
            saveBtn.disabled = false;
            saveBtn.textContent = "Save Profile Details";
          }
        }
      });
    }

    // Fixed Top-Right Profile Button & Topbar Avatar Listeners -> Directly shows entire Profile Section
    const fixedTopProfileBtn = document.getElementById("fixedTopProfileBtn");
    if (fixedTopProfileBtn) {
      fixedTopProfileBtn.addEventListener("click", function () {
        activateSection("sec-profile");
      });
    }

    // Clicking topbar avatar navigates directly to My Profile
    const topbarAvatar = document.getElementById("topbarAvatar");
    if (topbarAvatar) {
      topbarAvatar.addEventListener("click", function () {
        activateSection("sec-profile");
      });
    }

    // ================================================================
    // LOGIN & ACTIVITY (student's own session history only)
    // ================================================================
    let activityLoaded = false;
    async function loadLoginActivity() {
      if (activityLoaded) return;
      activityLoaded = true;

      const body = document.querySelector("#sessionHistoryTable tbody");
      try {
        const rows = await Api.sessions.myHistory();
        if (!rows.length) {
          body.innerHTML = `<tr class="empty-row"><td colspan="4">No login history yet.</td></tr>`;
          return;
        }
        body.innerHTML = rows.map(r => `
          <tr>
            <td data-label="Login Time">${escapeHtml(r.loginTime)}</td>
            <td data-label="Logout Time">${escapeHtml(r.logoutTime || "-")}</td>
            <td data-label="Duration">${escapeHtml(r.durationLabel)}</td>
            <td data-label="Status">${statusBadge(r.status)}</td>
          </tr>
        `).join("");
      } catch (err) {
        body.innerHTML = `<tr class="empty-row"><td colspan="4">${escapeHtml(err.message)}</td></tr>`;
        handleLoadError(err);
      }
    }

    // ================================================================
    // LEAVE REQUEST
    // ================================================================
    const leaveForm = document.getElementById("leaveForm");
    const leaveFormError = document.getElementById("leaveFormError");
    const leaveFormSuccess = document.getElementById("leaveFormSuccess");
    const submitLeaveBtn = document.getElementById("submitLeaveBtn");

    function loadLeaveSection() {
      loadLeaveHistory();
    }

    async function loadLeaveHistory() {
      const body = document.querySelector("#leaveHistoryTable tbody");
      try {
        const rows = await Api.leave.myHistory();
        if (!rows.length) {
          body.innerHTML = `<tr class="empty-row"><td colspan="5">No leave requests yet.</td></tr>`;
          return;
        }
        body.innerHTML = rows.map(r => `
          <tr>
            <td data-label="Dates">${escapeHtml(r.fromDate)} &ndash; ${escapeHtml(r.toDate)}</td>
            <td data-label="Type">${escapeHtml(titleCase(r.leaveType))}</td>
            <td data-label="Reason">${escapeHtml(r.reason)}</td>
            <td data-label="Submitted">${escapeHtml(r.submittedOn)}</td>
            <td data-label="Status">
              ${statusBadge(r.status)}
              ${r.status === "REJECTED" && r.adminComment ? `<div style="font-size:.78rem; color:var(--ink-soft); margin-top:6px;">Reason: ${escapeHtml(r.adminComment)}</div>` : ""}
            </td>
          </tr>
        `).join("");
      } catch (err) {
        body.innerHTML = `<tr class="empty-row"><td colspan="5">${escapeHtml(err.message)}</td></tr>`;
        handleLoadError(err);
      }
    }

    function titleCase(s) {
      if (!s) return "-";
      return s.charAt(0) + s.slice(1).toLowerCase();
    }

    leaveForm.addEventListener("submit", async function (e) {
      e.preventDefault();
      leaveFormError.classList.remove("show");
      leaveFormSuccess.classList.remove("show");

      const payload = {
        leaveType: document.getElementById("leaveType").value,
        fromDate: document.getElementById("leaveFromDate").value,
        toDate: document.getElementById("leaveToDate").value,
        reason: document.getElementById("leaveReason").value.trim()
      };

      if (!payload.leaveType) {
        leaveFormError.textContent = "Please select a leave type.";
        leaveFormError.classList.add("show");
        return;
      }
      if (!payload.fromDate || !payload.toDate) {
        leaveFormError.textContent = "Please select a from date and a to date.";
        leaveFormError.classList.add("show");
        return;
      }
      if (payload.toDate < payload.fromDate) {
        leaveFormError.textContent = "To date cannot be before the from date.";
        leaveFormError.classList.add("show");
        return;
      }
      if (payload.reason.length < 5) {
        leaveFormError.textContent = "Please enter a reason for your leave (at least 5 characters).";
        leaveFormError.classList.add("show");
        return;
      }

      submitLeaveBtn.disabled = true;
      submitLeaveBtn.textContent = "Submitting…";
      try {
        await Api.leave.submit(payload);
        leaveFormSuccess.classList.add("show");
        leaveForm.reset();
        loadLeaveHistory();
      } catch (err) {
        leaveFormError.textContent = err.message;
        leaveFormError.classList.add("show");
        handleLoadError(err);
      } finally {
        submitLeaveBtn.disabled = false;
        submitLeaveBtn.textContent = "Submit Request";
      }
    });

    // ================================================================
    // PEST PERFORMANCE (legacy, unchanged logic) — now mounted inside a
    // collapsed "View Your PEST Skill-Test Results" panel on the new
    // Performance Dashboard (assets/js/performance.js) instead of being
    // the primary Performance view. Exposed globally so that file can
    // lazily trigger it only once the panel is actually opened.
    // ================================================================
    let performanceLoaded = false;
    async function loadPerformance() {
      if (performanceLoaded) return;
      performanceLoaded = true;

      const body = document.querySelector("#performanceTable tbody");
      try {
        const rows = await Api.students.myPerformance();
        if (!Array.isArray(rows)) throw new Error("Couldn't load your PEST results right now.");
        if (!rows.length) {
          body.innerHTML = `<tr class="empty-row"><td colspan="4">No PEST skill-test attempts found for your registered phone number yet.</td></tr>`;
          return;
        }
        body.innerHTML = rows.map(r => `
          <tr>
            <td data-label="Department">${escapeHtml(r.department != null && r.department !== "" ? r.department : "—")}</td>
            <td data-label="Score">${(r.score != null && r.totalMarks != null) ? `${escapeHtml(r.score)} / ${escapeHtml(r.totalMarks)}` : "—"}</td>
            <td data-label="Correct / Total">${(r.correctCount != null && r.totalQuestions != null) ? `${escapeHtml(r.correctCount)} / ${escapeHtml(r.totalQuestions)}` : "—"}</td>
            <td data-label="Attempted On">${escapeHtml(r.attemptedOn != null && r.attemptedOn !== "" ? r.attemptedOn : "—")}</td>
          </tr>
        `).join("");
      } catch (err) {
        performanceLoaded = false; // a failed load may be retried the next time the panel is opened
        body.innerHTML = `<tr class="empty-row"><td colspan="4">${escapeHtml(err.message || "Couldn't load your PEST results right now.")}</td></tr>`;
        handleLoadError(err);
      }
    }
    window.loadPestPerformance = loadPerformance;

    // ================================================================
    // CERTIFICATES — UNCHANGED existing logic, just triggered on-demand now
    // ================================================================
    let certificateLoaded = false;
    async function loadCertificate() {
      if (certificateLoaded) return;
      certificateLoaded = true;

      try {
        const profile = await apiRequest("/api/students/me", { auth: true });
        renderProfile(profile);
      } catch (err) {
        showToast(err.message, "error");
        handleLoadError(err);
      }
    }

    function renderProfile(p) {
      document.getElementById("detailStudentId").textContent = p.studentId;
      document.getElementById("detailEmail").textContent = p.email;
      document.getElementById("detailPhone").textContent = p.phone || "-";
      document.getElementById("detailCourse").textContent = p.course || "-";
      document.getElementById("detailJoin").textContent = p.dateOfJoin || "-";

      const badge = document.getElementById("certStatusBadge");
      const actions = document.getElementById("certActions");
      const emptyNote = document.getElementById("emptyCertNote");

      if (p.certificateStatus === "ISSUED" && p.certificateAvailable) {
        badge.textContent = "● Issued" + (p.certificateIssuedOn ? " on " + p.certificateIssuedOn : "");
        badge.className = "cert-status-badge issued";
        actions.style.display = "flex";
        emptyNote.style.display = "none";

        document.getElementById("viewCertBtn").href =
          `${API_BASE_URL}/api/certificates/${encodeURIComponent(p.studentId)}?mode=view`;
        document.getElementById("downloadCertBtn").href =
          `${API_BASE_URL}/api/certificates/${encodeURIComponent(p.studentId)}?mode=download`;
      } else {
        badge.textContent = "● Pending";
        badge.className = "cert-status-badge pending";
        actions.style.display = "none";
        emptyNote.style.display = "block";
      }
    }

    // ================================================================
    // MY PROJECTS
    // Endpoints (Api.projects.*) are new - see the API contract shared
    // with the backend team. Not implemented server-side yet, so this
    // will show an empty/error state until the backend is live; the
    // frontend flow is fully wired and needs no further changes then.
    // ================================================================
    let projectsLoaded = false;
    let currentProjects = []; // normalized journey stages - see normalizeProjectJourney()
    let activeProjectId = null; // which project the open modal action applies to

    // Cached separately from the dashboard's own profile fetch (this section
    // can be opened first) so the empty-project state can tell "CSE/IT student,
    // journey just hasn't been created yet" apart from "different course -
    // projects aren't offered yet" without an extra round trip on repeat visits.
    let cachedStudentCourse = null;
    async function getStudentCourse() {
      if (cachedStudentCourse !== null) return cachedStudentCourse;
      try {
        const profile = await apiRequest("/api/students/me", { auth: true });
        cachedStudentCourse = (profile && profile.course) || "";
      } catch (err) {
        cachedStudentCourse = "";
      }
      return cachedStudentCourse;
    }
    function hasProjectJourney(course) {
      if (!course) return false;
      const c = String(course).trim().toLowerCase();
      return c.includes("mechanical") || c.includes("civil") || c.includes("electrical") || c.includes("electronic") || c.includes("computer") || c.includes("it") || c.includes("cse");
    }

    function isCseItCourse(course) {
      return hasProjectJourney(course);
    }

    const TOTAL_JOURNEY_STAGES = 3;

    const DEPARTMENT_STAGE_DEFS = {
      mechanical: [
        {
          stage: 1, match: ["FLANGE", "COUPLING"], label: "LEVEL 01", icon: "⚙️",
          title: "Flange Coupling (Half View)", category: "Basic 2D Drafting & Simple Components",
          description: "Basic symmetrical component drafting using layers and line types.",
          skills: ["AutoCAD / CAD", "2D Drafting", "Layers & Line Types", "Symmetrical Drafting", "Mechanical Detailing"]
        },
        {
          stage: 2, match: ["PIPE JOINT", "FLANGED PIPE", "PROTECTED FLANGED"], label: "LEVEL 02", icon: "📐",
          title: "Protected Flanged Pipe Joint", category: "Complex 2D Detailing & 3D Modeling Basics",
          description: "Multi-component assembly drawing with a parts list (BOM - Bill of Materials).",
          skills: ["Assembly Drafting", "Bill of Materials (BOM)", "GD&T", "Section Views", "3D Modeling Basics"]
        },
        {
          stage: 3, match: ["TAILSTOCK", "LATHE"], label: "LEVEL 03", icon: "🏭",
          title: "Lathe Tailstock Assembly", category: "Full Industrial Assemblies & Production Drawings",
          description: "Multi-part mechanical assembly containing sliding mechanisms, screws, and handwheels.",
          skills: ["Industrial Assembly", "Kinematic Constraints", "Production Drawings", "Detailed Part Modeling", "Tolerance Fit Analysis"]
        }
      ],
      civil: [
        {
          stage: 1, match: ["BUILDING SYMBOLS", "SYMBOLS LIBRARY", "ARCHITECTURAL SYMBOLS"], label: "LEVEL 01", icon: "🏛️",
          title: "Building Symbols Library", category: "Basic 2D Drafting & Building Symbols",
          description: "Drawing standard architectural symbols like doors, windows, ventilators, and stairs.",
          skills: ["AutoCAD Civil", "Architectural Symbols", "Layer Standards", "Block Creation", "Drafting Scales"]
        },
        {
          stage: 2, match: ["FRONT ELEVATION", "SECTIONAL ELEVATION", "ELEVATION"], label: "LEVEL 02", icon: "🏠",
          title: "Front Elevation & Sectional Elevation", category: "2D Floor Plans & Elevations",
          description: "Drawing the exterior look of a single-story house and a cross-section passing through the staircase or verandah.",
          skills: ["Architectural Elevation", "Sectional Drafting", "Hatching & Materials", "Structural Slabs & Lintels", "Staircase Detailing"]
        },
        {
          stage: 3, match: ["WORKING DRAWING", "2BHK", "3BHK", "SITE LAYOUT"], label: "LEVEL 03", icon: "🏗️",
          title: "Complete Working Drawing Set (2BHK/3BHK)", category: "Complete Working Drawings & Site Layouts",
          description: "Ground floor plan, roof plan, front elevation, cross-section, area statement table, and site orientation.",
          skills: ["Complete Working Drawings", "2BHK/3BHK Floor Plans", "Area Statement Calculations", "Site Orientation & North Marker", "Municipal Approval Drafting"]
        }
      ],
      electrical: [
        {
          stage: 1, match: ["ELECTRICAL SYMBOLS", "IEC", "IEEE", "WIRING DIAGRAMS"], label: "LEVEL 01", icon: "⚡",
          title: "Electrical Symbols Library", category: "Basic Electrical Symbols & Wiring Diagrams",
          description: "Drawing standard IEC/IEEE electrical symbols like switches, sockets, fuses, circuit breakers (MCB, ELCB), relays, and transformers.",
          skills: ["AutoCAD Electrical", "IEC/IEEE Standards", "Circuit Symbols", "Schematic Drafting", "Block Attributes"]
        },
        {
          stage: 2, match: ["DOL", "MOTOR STARTER", "POWER CIRCUIT", "CONTROL CIRCUIT"], label: "LEVEL 02", icon: "🔌",
          title: "DOL Motor Starter Control & Power Circuit", category: "Residential Layouts & Motor Control Schematics",
          description: "Power and control wiring diagram for a Three-Phase induction motor using a Direct Online (DOL) starter.",
          skills: ["Motor Control Circuitry", "3-Phase Power Wiring", "Contactor & Thermal Overload Protection", "Pushbutton Interlocking", "Wire Tagging"]
        },
        {
          stage: 3, match: ["CONTROL PANEL", "PANEL LAYOUT", "PLC PANEL", "MCC", "POWER DISTRIBUTION"], label: "LEVEL 03", icon: "🎛️",
          title: "Industrial Control Panel Layout & Wiring Drawing", category: "Industrial Power Distribution & Panel Design",
          description: "Front layout and internal component arrangement drawing for a PLC panel or Motor Control Center (MCC).",
          skills: ["Control Panel GA Layout", "DIN Rail & Cable Duct", "PLC I/O Wiring", "Thermal Clearance", "Power Distribution Busbars"]
        }
      ],
      electronic: [
        {
          stage: 1, match: ["DUAL-RAIL", "POWER SUPPLY", "LM7812", "LM7912", "REGULATED DC"], label: "LEVEL 01", icon: "🔋",
          title: "Dual-Rail Regulated DC Power Supply (+12V / -12V)", category: "Component Schematics & Regulated Power Supplies",
          description: "A complete schematic featuring a center-tapped transformer, bridge rectifiers, filter capacitors, and LM7812/LM7912 voltage regulators.",
          skills: ["KiCad / EDA Tools", "Schematic Capture", "Linear Voltage Regulators", "Bridge Rectifiers", "Power Filtering & Decoupling"]
        },
        {
          stage: 2, match: ["MICROCONTROLLER", "DEVELOPMENT BOARD", "ATMEGA328P", "ARDUINO NANO", "CH340"], label: "LEVEL 02", icon: "💡",
          title: "Microcontroller Development Board Schematic (e.g., ATmega328P / Arduino Nano style)", category: "Sensor Interfacing, Op-Amps & Control Boards",
          description: "A complete schematic mapping out a microcontroller, crystal oscillator, reset circuit, USB-to-UART bridge (CH340), and breakout header pins.",
          skills: ["Microcontroller Schematic", "USB-to-UART Bridge (CH340)", "16MHz Crystal Oscillator", "Reset Circuitry", "GPIO Breakout Header"]
        },
        {
          stage: 3, match: ["IOT", "SENSOR NODE", "ESP32", "ESP8266", "PMIC", "MIXED-SIGNAL"], label: "LEVEL 03", icon: "📡",
          title: "IoT-Enabled Sensor Node Schematic (ESP32 / ESP8266 based)", category: "Mixed-Signal Systems, Communication Modules & Multi-Sheet Documentation",
          description: "A multi-sheet schematic detailing an RF microcontroller, power management IC (PMIC), level shifters, and peripheral sensor interfaces.",
          skills: ["Multi-Sheet Schematics", "RF Microcontroller (ESP32)", "Battery Power Management (PMIC)", "I2C/SPI Sensor Interfacing", "Level Shifting"]
        }
      ],
      cse: [
        {
          stage: 1, match: ["HTML", "CSS"], label: "STEP 01", icon: "🌐",
          title: "HTML & CSS Project", category: "Frontend Foundation",
          description: "Build a responsive website using semantic HTML and modern CSS.",
          skills: ["HTML5", "CSS3", "Responsive Design", "Flexbox", "CSS Grid"]
        },
        {
          stage: 2, match: ["JAVASCRIPT", "JS", "FETCH"], label: "STEP 02", icon: "⚡",
          title: "JavaScript Project", category: "Dynamic Web Development",
          description: "Build an interactive web experience using JavaScript, DOM manipulation and browser APIs.",
          skills: ["JavaScript", "DOM", "Events", "Fetch API", "Async/Await"]
        },
        {
          stage: 3, match: ["REACT"], label: "STEP 03", icon: "⚛️",
          title: "React Project", category: "Modern Frontend Development",
          description: "Build a modern component-based web application using React.",
          skills: ["React", "Components", "Hooks", "State Management", "Routing", "API Integration"]
        }
      ]
    };

    function getDeptKey(course) {
      if (!course) return null;
      const c = String(course).toLowerCase();
      if (c.includes("mechanical")) return "mechanical";
      if (c.includes("civil")) return "civil";
      if (c.includes("electrical")) return "electrical";
      if (c.includes("electronic")) return "electronic";
      if (c.includes("computer") || c.includes("it") || c.includes("cse")) return "cse";
      return null;
    }

    function findStageDef(project, idx, course) {
      const haystack = `${project.technology || ""} ${project.title || ""} ${project.category || ""}`.toUpperCase();
      
      // Check all departments by keyword match first
      for (const deptKey of Object.keys(DEPARTMENT_STAGE_DEFS)) {
        const list = DEPARTMENT_STAGE_DEFS[deptKey];
        const byMatch = list.find(def => def.match.some(k => haystack.includes(k)));
        if (byMatch) return byMatch;
      }

      // If course is provided or cached, match by course department
      const deptKey = getDeptKey(course || cachedStudentCourse);
      if (deptKey && DEPARTMENT_STAGE_DEFS[deptKey]) {
        const list = DEPARTMENT_STAGE_DEFS[deptKey];
        if (project.stage && list[project.stage - 1]) return list[project.stage - 1];
        if (list[idx]) return list[idx];
      }

      // Default fallback to CSE/IT
      const cseList = DEPARTMENT_STAGE_DEFS.cse;
      if (project.stage && cseList[project.stage - 1]) return cseList[project.stage - 1];
      return cseList[idx] || null;
    }

    // Normalizes whatever shape the backend's project API currently returns
    // into the journey the UI renders.
    function normalizeProjectJourney(rows, course) {
      return (rows || [])
        .map((p, idx) => {
          const def = findStageDef(p, idx, course);
          return {
            id: p.id,
            stage: def ? def.stage : idx + 1,
            label: def ? def.label : `STEP ${String(idx + 1).padStart(2, "0")}`,
            skills: def ? def.skills : [],
            title: p.title || (def ? def.title : "Project"),
            category: p.category || (def ? def.category : ""),
            description: p.description || (def ? def.description : ""),
            status: p.status || "NOT_STARTED",
            progress: Math.max(0, Math.min(100, p.progressPercent || 0)),
            dueDate: p.dueDate || null,
            assignedOn: p.assignedOn || null,
            adminFeedback: p.adminFeedback || null,
            submissionUrl: p.submissionUrl || null,
            submissionNote: p.submissionNote || null,
            backend: p
          };
        })
        .sort((a, b) => a.stage - b.stage);
    }

    async function loadProjects() {
      if (projectsLoaded) return;
      projectsLoaded = true;
      renderProjectsLoading();

      try {
        const [rows, course] = await Promise.all([Api.projects.myList(), getStudentCourse()]);
        if (typeof ProjectCompletionState !== "undefined") {
          ProjectCompletionState.updateFromBackend(rows);
        }
        currentProjects = normalizeProjectJourney(rows, course);
        renderProjects(currentProjects, course);
        // Sync dashboard counter if dashboard is loaded
        dashboardLoaded = false;
      } catch (err) {
        projectsLoaded = false; // allow "Try Again" to re-fetch
        renderProjectsError(err);
        handleLoadError(err);
      }
    }

    function renderProjectsLoading() {
      const grid = document.getElementById("projectsGrid");
      const summary = document.getElementById("projectJourneySummary");
      if (summary) summary.style.display = "none";
      grid.innerHTML = `
        <p style="color:var(--ink-soft); font-size:.88rem; margin:0 0 18px;">Loading your project journey…</p>
        <div class="project-journey-skeleton" aria-hidden="true">
          ${[0, 1, 2].map(() => `
            <div class="project-stage">
              <div class="journey-node upcoming"></div>
              <div class="project-stage-card">
                <div class="pjs-skel-line" style="width:40%;"></div>
                <div class="pjs-skel-line" style="width:70%;"></div>
                <div class="pjs-skel-line" style="width:92%; height:8px;"></div>
              </div>
            </div>
          `).join("")}
        </div>
      `;
    }

    function renderProjectsError(err) {
      const grid = document.getElementById("projectsGrid");
      const summary = document.getElementById("projectJourneySummary");
      if (summary) summary.style.display = "none";
      grid.innerHTML = `
        <div class="panel-card">
          <div class="empty-state project-journey-error">
            <div class="empty-icon">💻</div>
            <h4>Unable to load your project journey</h4>
            <p>${escapeHtml(err.message || "Please try again.")}</p>
            <button type="button" class="btn btn-outline btn-sm" data-retry-projects>Try Again</button>
          </div>
        </div>
      `;
    }

    // Per-project node state, derived only from that project's own backend
    // status - never from frontend progression rules. "active" also covers
    // the first not-yet-started stage so the journey shows the student
    // where to begin, without disabling or gating any other stage.
    function journeyNodeState(status, isFirstIncomplete) {
      if (status === "COMPLETED" || status === "APPROVED") return "completed";
      if (status === "REVISION_REQUIRED") return "revision";
      if (status === "SUBMITTED" || status === "UNDER_REVIEW") return "waiting";
      if (status === "IN_PROGRESS") return "active";
      if (status === "NOT_STARTED" && isFirstIncomplete) return "active";
      return "upcoming";
    }

    const NODE_STATE_ICON = { completed: "✓", revision: "!", waiting: "…" };
    const NODE_STATE_LABEL = {
      completed: "Completed", revision: "Revision required", waiting: "Waiting for review",
      active: "In progress", upcoming: "Not started yet"
    };

    function renderProjects(stages, course) {
      const grid = document.getElementById("projectsGrid");
      const summary = document.getElementById("projectJourneySummary");
      const summaryCount = document.getElementById("projectJourneyCount");

      if (!stages.length) {
        if (summary) summary.style.display = "none";
        if (!course || String(course).trim() === "") {
          grid.innerHTML = `<div class="panel-card"><div class="empty-state"><div class="empty-icon">🎯</div><h4>No Course Specialization Selected</h4><p>Please select and update your technical course specialization in <b><a href="javascript:void(0)" id="projGoToProfileLink" style="color:var(--crimson); text-decoration:underline;">My Profile</a></b> to get your 3 practical projects assigned.</p></div></div>`;
          const link = document.getElementById("projGoToProfileLink");
          if (link) {
            link.addEventListener("click", () => {
              // Navigate to the Student Profile section (existing nav system),
              // then land the viewport on the existing "Course & Project Track
              // Specialization" card so the student sees the course dropdown
              // immediately, instead of just the top of the Profile page.
              activateSection("sec-profile");
              const scrollToCourseCard = () => {
                const target = document.getElementById("profileCourseSelect");
                if (target) {
                  target.scrollIntoView({ behavior: "smooth", block: "center" });
                  return true;
                }
                return false;
              };
              // The Profile section is already in the DOM (just toggled visible),
              // but give layout a tick to settle before measuring scroll position.
              requestAnimationFrame(() => {
                if (!scrollToCourseCard()) setTimeout(scrollToCourseCard, 150);
              });
            });
          }
          return;
        }
        grid.innerHTML = isCseItCourse(course)
          ? `<div class="panel-card"><div class="empty-state"><div class="empty-icon">💻</div><h4>Your project journey is getting ready</h4><p>Your assigned projects will appear here once they are available.</p></div></div>`
          : `<div class="panel-card"><div class="empty-state"><div class="empty-icon">🛠️</div><h4>Projects are being prepared for your course</h4><p>We're finalizing the project track for your course. Check back soon.</p></div></div>`;
        return;
      }

      const isDone = isProjectCompleted; // same backend-status rule as the Dashboard card
      if (summary) {
        summary.style.display = "flex";
        summaryCount.textContent = `${projectsCompletedText(stages)} Completed`;
      }

      const firstIncompleteIndex = stages.findIndex(s => !isDone(s));

      const cardsHtml = stages.map((s, idx) => {
        const completed = isDone(s);
        const nodeState = journeyNodeState(s.status, idx === firstIncompleteIndex);
        const nodeGlyph = NODE_STATE_ICON[nodeState] || s.stage;
        const nodeAriaLabel = `Stage ${s.stage}: ${NODE_STATE_LABEL[nodeState] || ""}`;

        const canUpdateProgress = s.status === "NOT_STARTED" || s.status === "IN_PROGRESS";
        const canSubmit = s.status === "NOT_STARTED" || s.status === "IN_PROGRESS";
        const canResubmit = s.status === "REVISION_REQUIRED";
        const titleAttr = escapeHtml(s.title);

        let actions = "";
        // FIXED ORDER: Submit Project → Update Progress → View Project
        if (canSubmit) actions += `<button class="btn btn-primary btn-sm" data-submit-project="${s.id}" aria-label="Submit ${titleAttr}">Submit Project</button>`;
        if (canResubmit) actions += `<button class="btn btn-primary btn-sm" data-resubmit-project="${s.id}" aria-label="Resubmit ${titleAttr}">Resubmit</button>`;
        if (canUpdateProgress) actions += `<button class="btn btn-outline btn-sm" data-progress-project="${s.id}" aria-label="Update progress for ${titleAttr}">Update Progress</button>`;
        actions += `<button class="btn btn-outline btn-sm" data-view-project="${s.id}" aria-label="View details for ${titleAttr}">View Project</button>`;

        const skillsHtml = s.skills && s.skills.length
          ? ``
          : "";

        const difficulty = s.difficultyLevel || (s.stage === 1 ? "Easy" : (s.stage === 2 ? "Easy - Medium" : "Medium"));
        const diffNormalized = String(difficulty).toLowerCase();
        const diffClass = (diffNormalized.includes("medium") && !diffNormalized.includes("easy -") && !diffNormalized.includes("easy-")) ? "medium" : (diffNormalized.includes("easy -") || diffNormalized.includes("easy-") ? "easy-medium" : "easy");
        const diffBadgeHtml = `<span class="difficulty-badge ${diffClass}" style="margin-left:6px;">⚡ ${escapeHtml(difficulty)}</span>`;

        return `
          <div class="project-stage${completed ? " is-completed" : ""}" role="listitem">
            <div class="journey-node ${nodeState}" aria-label="${nodeAriaLabel}">${nodeGlyph}</div>
            <div class="journey-stage-label">${escapeHtml(s.label)}</div>
            <div class="project-stage-card">
              <div class="project-card-head">
                <div>
                  <div style="display:flex; align-items:center; flex-wrap:wrap; gap:6px;">
                    <h4 style="margin:0;">${titleAttr}</h4>
                    ${diffBadgeHtml}
                  </div>
                  ${s.category ? `<span class="project-stage-category">${escapeHtml(s.category)}</span>` : ""}
                </div>
                <span class="project-stage-status">${statusBadge(s.status)}</span>
              </div>
              ${s.description ? `<p class="project-desc">${escapeHtml(s.description)}</p>` : ""}
              ${skillsHtml}
              <div class="project-meta-row">
                ${s.assignedOn ? `<span>Assigned: <b>${escapeHtml(s.assignedOn)}</b></span>` : ""}
                ${s.dueDate ? `<span>Due: <b>${escapeHtml(s.dueDate)}</b></span>` : ""}
              </div>
              <div class="project-progress-track" role="progressbar" aria-valuenow="${s.progress}" aria-valuemin="0" aria-valuemax="100" aria-label="Progress for ${titleAttr}">
                <div class="project-progress-fill" style="width:${s.progress}%;"></div>
              </div>
              <div class="project-progress-label">Progress · ${s.progress}%</div>
              ${s.adminFeedback ? `<div class="project-feedback-box"><b>Reviewer Feedback</b>${escapeHtml(s.adminFeedback)}</div>` : ""}
              <div class="project-card-actions">${actions}</div>
            </div>
          </div>
        `;
      }).join("");

      grid.innerHTML = cardsHtml + `
        <p class="project-journey-motivation">Keep building. Every project takes you one step closer to becoming a professional developer.</p>
      `;
    }

    // ---- Update Progress modal ----
    const progressModalOverlay = document.getElementById("progressModalOverlay");
    const progressPercentInput = document.getElementById("progressPercentInput");
    const progressNoteInput = document.getElementById("progressNoteInput");
    const progressModalError = document.getElementById("progressModalError");
    const progressCancelBtn = document.getElementById("progressCancelBtn");
    const progressConfirmBtn = document.getElementById("progressConfirmBtn");

    // ---- Submit / Resubmit modal ----
    const submitProjectModalOverlay = document.getElementById("submitProjectModalOverlay");
    const submitProjectModalTitle = document.getElementById("submitProjectModalTitle");
    const submissionUrlInput = document.getElementById("submissionUrlInput");
    const submissionNoteInput = document.getElementById("submissionNoteInput");
    const submitProjectModalError = document.getElementById("submitProjectModalError");
    const submitProjectCancelBtn = document.getElementById("submitProjectCancelBtn");
    const submitProjectConfirmBtn = document.getElementById("submitProjectConfirmBtn");
    let submitModalMode = "submit"; // "submit" | "resubmit"

    // ---- Project Details modal ----
    const viewProjectModalOverlay = document.getElementById("viewProjectModalOverlay");
    const viewProjectModalTitle = document.getElementById("viewProjectModalTitle");
    const viewProjectModalCategory = document.getElementById("viewProjectModalCategory");
    const viewProjectModalStatus = document.getElementById("viewProjectModalStatus");
    const viewProjectModalBody = document.getElementById("viewProjectModalBody");
    const viewProjectCloseBtn = document.getElementById("viewProjectCloseBtn");

    viewProjectCloseBtn.addEventListener("click", function () {
      viewProjectModalOverlay.style.display = "none";
    });

    // ---- Project Details: real backend data only ----
    // The card grid may borrow journey-template copy (STEP label, suggested
    // description, skills) when the backend row is sparse. This modal never does:
    // it shows the student's own assigned project exactly as the backend returns
    // it - first the list row it already has, then GET /api/student/projects/{id}
    // layered on top - and simply omits any field the backend didn't send.
    const PD_ALIASES = {
      description: ["description"],
      objective: ["objective", "objectives"],
      requirements: ["requirements", "requirement"],
      technicalRequirements: ["technicalRequirements", "technical_requirements", "techRequirements"],
      expectedOutput: ["expectedOutput", "expected_output", "expectedOutcome"],
      skills: ["skills", "skillsRequired", "technologies"],
      submittedOn: ["submittedOn", "submittedAt", "submittedDate"]
    };

    function pdPick(src, field) {
      const keys = PD_ALIASES[field] || [field];
      for (const k of keys) {
        const v = src ? src[k] : null;
        if (v == null) continue;
        if (typeof v === "string" && !v.trim()) continue;
        if (Array.isArray(v) && !v.length) continue;
        return v;
      }
      return null;
    }

    // string -> paragraph (line breaks preserved); array / newline-bulleted text -> list
    function pdTextHtml(value) {
      if (value == null) return "";
      const items = Array.isArray(value)
        ? value.map(v => (v && typeof v === "object" ? (v.title || v.name || v.text || "") : String(v))).filter(t => String(t).trim())
        : null;
      if (items) return `<ul class="pd-list">${items.map(t => `<li>${escapeHtml(t)}</li>`).join("")}</ul>`;
      return `<p style="white-space:pre-line;">${escapeHtml(String(value))}</p>`;
    }

    function pdSection(title, innerHtml, extraClass) {
      return `<div class="pd-section${extraClass ? " " + extraClass : ""}"><h4>${escapeHtml(title)}</h4>${innerHtml}</div>`;
    }

    function pdSafeLink(url) {
      const u = String(url || "").trim();
      if (/^https?:\/\//i.test(u)) {
        return `<a href="${escapeHtml(u)}" target="_blank" rel="noopener noreferrer">${escapeHtml(u)}</a>`;
      }
      return escapeHtml(u); // anything that isn't plain http(s) is shown as text, never as a link
    }

    // Project-specific content definitions for detailed modals
    // Project-specific content definitions for detailed modals
    const PROJECT_SPECIFIC_CONTENT = {
      // ----------------- COMPUTER SCIENCE / IT -----------------
      1: {
        // Project 1: HTML + CSS Responsive Design
        fullDescription: "Build a responsive website using semantic HTML and modern CSS with a mobile-first approach. This foundational project teaches you the essentials of front-end development, focusing on clean code, accessibility, and responsive design principles.",
        objective: "Create a fully responsive multi-page website that works seamlessly across all device sizes using semantic HTML5 and modern CSS3 techniques.",
        whatToBuild: [
          "A responsive website with multiple pages (Home, About, Services, Contact)",
          "Semantic HTML5 structure for better accessibility",
          "Mobile-first CSS approach with media queries",
          "Flexbox and CSS Grid layouts",
          "Responsive navigation (hamburger menu for mobile)",
          "Contact form with basic styling"
        ],
        requirements: [
          "Must be responsive (mobile, tablet, desktop)",
          "Valid semantic HTML5",
          "No external CSS frameworks (build from scratch)",
          "Cross-browser compatibility",
          "Proper use of meta tags and accessibility features"
        ],
        functionalRequirements: [
          "Responsive grid/flexbox layouts",
          "Mobile navigation toggle",
          "Form validation styling",
          "Smooth transitions and hover effects",
          "Optimized images for different screen sizes"
        ],
        technicalRequirements: [
          "HTML5 semantic tags",
          "CSS3 (Flexbox, Grid, Media Queries)",
          "Mobile-first approach",
          "CSS variables for maintainability",
          "No JavaScript required (pure HTML/CSS)"
        ],
        expectedOutput: "A fully responsive, production-ready website that demonstrates mastery of HTML and CSS fundamentals.",
        skills: ["HTML5", "CSS3", "Responsive Design", "Flexbox", "CSS Grid", "Mobile-First Approach", "Semantic HTML", "Accessibility", "Media Queries"],
        submissionRequirements: [
          "GitHub repository link with clean commit history",
          "Deployed live link (GitHub Pages, Netlify, or similar)",
          "README with screenshots showing responsive behavior",
          "Lighthouse performance report (90+ scores)"
        ]
      },
      2: {
        // Project 2: JavaScript + Fetch API + Third-party API
        fullDescription: "Build an interactive web application using JavaScript and integrate with a public third-party API. This project teaches you asynchronous programming, API integration, error handling, and dynamic DOM manipulation.",
        objective: "Create a dynamic web application that fetches and displays data from a public API, with proper error handling, loading states, and user interactivity.",
        whatToBuild: [
          "A weather application using a weather API (OpenWeatherMap, etc.)",
          "Display current weather, forecast, and city search",
          "Dynamic DOM updates based on API responses",
          "Error handling for failed requests and edge cases",
          "Loading spinners and user feedback",
          "Local storage for favorite cities"
        ],
        requirements: [
          "Functional integration with a real public API",
          "Proper error handling and validation",
          "Loading states during API calls",
          "User-friendly interface with clear feedback",
          "No backend - frontend only with fetch API"
        ],
        functionalRequirements: [
          "Search for locations/items via API",
          "Display dynamic results",
          "Handle network errors gracefully",
          "Cache recent searches in localStorage",
          "Show loading indicators during API calls",
          "Implement debouncing for search input"
        ],
        technicalRequirements: [
          "Fetch API for HTTP requests",
          "Promises and async/await",
          "JSON data parsing",
          "DOM manipulation (getElementById, querySelector, etc.)",
          "Event listeners for user interactions",
          "LocalStorage for persistence",
          "Error handling and validation"
        ],
        expectedOutput: "A fully functional web application that seamlessly integrates with an external API and provides a smooth user experience.",
        skills: ["JavaScript", "Fetch API", "Promises", "Async/Await", "DOM Manipulation", "API Integration", "Error Handling", "JSON", "Events", "LocalStorage"],
        submissionRequirements: [
          "GitHub repository with complete source code",
          "Live demo link",
          "README explaining API used and how to run locally",
          "Documented API key setup instructions (if applicable)"
        ]
      },
      3: {
        // Project 3: React E-Commerce Website
        fullDescription: "Build a modern e-commerce website using React with component-based architecture, state management, and routing. This project teaches you modern JavaScript frameworks, component composition, and building scalable applications.",
        objective: "Create a fully functional e-commerce platform with product listings, shopping cart, checkout process, and order management using React best practices.",
        whatToBuild: [
          "Product listing page with filtering and sorting",
          "Product detail pages with images and descriptions",
          "Shopping cart with add/remove/update quantities",
          "Checkout process with order summary",
          "User authentication simulation",
          "Order history page",
          "Responsive design for all devices"
        ],
        requirements: [
          "React with functional components and hooks",
          "Component-based architecture",
          "State management (Context API or Redux)",
          "Client-side routing",
          "Mock API or JSON data",
          "No real payment processing required"
        ],
        functionalRequirements: [
          "Product filtering by category, price, rating",
          "Shopping cart persistence (localStorage or state)",
          "User authentication simulation",
          "Order history display",
          "Responsive navigation",
          "Search functionality",
          "Add to cart/Wishlist features"
        ],
        technicalRequirements: [
          "React 18+ with functional components",
          "React Hooks (useState, useEffect, useContext)",
          "React Router for navigation",
          "Component composition and reusability",
          "State management (Context API)",
          "Conditional rendering",
          "Array methods (map, filter, reduce)"
        ],
        expectedOutput: "A complete e-commerce web application demonstrating advanced React skills and professional code organization.",
        skills: ["React", "Components", "Hooks", "State Management", "Routing", "Props", "Conditional Rendering", "API Integration", "CSS Modules", "E-commerce Logic"],
        submissionRequirements: [
          "GitHub repository with complete React project",
          "Live deployment (Vercel, Netlify, or similar)",
          "README with project setup instructions",
          "Component documentation and architecture explanation",
          "Lighthouse performance report"
        ]
      },

      // ----------------- MECHANICAL CAD -----------------
      "mech_1": {
        // Mechanical CAD - Level 1: Flange Coupling (Half View)
        fullDescription: "Draft a half-sectional view of a standard Flange Coupling component. This project establishes foundational mechanical drafting principles including layer management, line types, symmetrical drafting, and standard dimensioning.",
        objective: "Produce an accurate 2D engineering drawing of a Flange Coupling (Half View) with appropriate sectional views, layers, and line types conforming to standard engineering drafting practices.",
        whatToBuild: [
          "Front half-sectional view showing hub, flange, and keyway",
          "Side view showing bolt pitch circle diameter (PCD) and bolt holes",
          "Proper layer hierarchy (Object, Hidden, Center, Dimension, Hatch)",
          "Standard title block with projection symbol, scale, and material details"
        ],
        requirements: [
          "AutoCAD / Mechanical CAD drafting software",
          "Adherence to ISO / ASME standard drafting symbols",
          "Accurate representation of counterbored holes and keyways",
          "Consistent dimensioning and layer assignment"
        ],
        functionalRequirements: [
          "Draft symmetrical components using mirror and offset tools",
          "Apply standard hatching patterns for cast iron / mild steel",
          "Set up proper dimension styles and tolerances",
          "Generate exported PDF and source CAD file"
        ],
        technicalRequirements: [
          "AutoCAD 2020+ / SolidWorks / Fusion 360",
          "2D Drafting & Annotation Workspace",
          "Layer standards: Contours (0.5mm), Center (0.25mm), Dimensions (0.25mm)",
          "Scale: 1:1 or 1:2"
        ],
        expectedOutput: "A clean, production-ready 2D CAD drawing sheet of a Flange Coupling (Half View) in DWG and PDF formats.",
        skills: ["Mechanical CAD", "2D Drafting", "Section Views", "Layers & Line Types", "Geometric Dimensioning", "Fastener Representation"],
        submissionRequirements: [
          "CAD project file (.dwg / .dxf / .step)",
          "High-resolution PDF drawing sheet with title block",
          "Brief design notes describing dimensions and tolerances used"
        ]
      },
      "mech_2": {
        // Mechanical CAD - Level 2: Protected Flanged Pipe Joint
        fullDescription: "Create a detailed multi-component assembly drawing of a Protected Flanged Pipe Joint along with an itemized Bill of Materials (BOM). This project builds intermediate mechanical CAD competency in component assembly, GD&T, and documentation.",
        objective: "Model and draft a complete assembly drawing of a Protected Flanged Pipe Joint with part callouts, sectional assembly view, and a standardized Bill of Materials.",
        whatToBuild: [
          "Assembly cross-section of two flanged pipe ends with protective circumferential rims",
          "Gasket interface, hex bolts, nuts, and washers modeled and detailed",
          "Balloon callouts numbering each component part",
          "Itemized Bill of Materials (BOM) table detailing item number, part name, material, and quantity"
        ],
        requirements: [
          "Correct alignment and mate constraints between mating flanges",
          "Gasket compression clearance representation",
          "Standard ISO fastener sizing (e.g., M16/M20 bolts)",
          "Complete Bill of Materials included directly on the drawing sheet"
        ],
        functionalRequirements: [
          "Draft half or full sectional assembly view",
          "Number each component sequentially using leader lines and balloons",
          "Specify surface finishes and gasket material specifications",
          "Provide overall and center-to-center installation dimensions"
        ],
        technicalRequirements: [
          "Parametric 2D/3D CAD tool (AutoCAD Mechanical / SolidWorks / Inventor)",
          "Standard drawing template with BOM table style",
          "Standard thread profiles and bolt clearance holes",
          "GD&T symbols and fit tolerances"
        ],
        expectedOutput: "A complete assembly drawing sheet of the Protected Flanged Pipe Joint with BOM table, balloons, and dimensional specifications.",
        skills: ["Assembly Drafting", "Bill of Materials (BOM)", "GD&T", "Fastener Selection", "Sectional Assembly", "Pipe Joint Mechanics"],
        submissionRequirements: [
          "CAD Assembly file (.dwg / .sldasm / .iam)",
          "Complete assembly drawing sheet in PDF",
          "BOM table exported as PDF or spreadsheet"
        ]
      },
      "mech_3": {
        // Mechanical CAD - Level 3: Lathe Tailstock Assembly
        fullDescription: "Design and draft a comprehensive industrial Lathe Tailstock assembly containing sliding mechanisms, feed screw, handwheel, barrel, and clamping levers. This advanced project demonstrates mastery in complex industrial machine assemblies and production-grade manufacturing drawings.",
        objective: "Produce a full industrial-grade assembly drawing, exploded view, and detailed production drawing package for a conventional Lathe Tailstock assembly.",
        whatToBuild: [
          "Tailstock body base and sub-base with clamping wedge mechanism",
          "Tailstock barrel/spindle with internal Morse taper (MT-3/MT-4) socket",
          "Square / Acme thread feed screw, bronze nut, and handwheel with revolving handle",
          "Barrel lock and base clamping eccentric shaft and levers",
          "Exploded view with assembly sequence and comprehensive BOM"
        ],
        requirements: [
          "Full assembly drawing showing longitudinal section through the spindle axis",
          "Individual production detail drawings for key manufactured parts",
          "Proper tolerance fits (e.g., H7/g6 sliding fit for barrel in body)",
          "Complete BOM with material grades and heat treatments"
        ],
        functionalRequirements: [
          "Represent mechanical motion: sliding quill stroke and handwheel rotation",
          "Include lubrication grooves and wiper seal details",
          "Specify surface roughness (Ra values) on sliding and mating surfaces",
          "Complete exploded assembly view with balloons"
        ],
        technicalRequirements: [
          "3D CAD Modeling & Assembly Environment (SolidWorks / Creo / CATIA / AutoCAD Mechanical)",
          "Geometric Dimensioning & Tolerancing (GD&T) to ASME Y14.5",
          "Standard drawing border (A1/A2 size) with multi-sheet drawing set",
          "Fit and limit calculations for sliding spindle"
        ],
        expectedOutput: "A complete industrial manufacturing package including 3D model, 2D assembly drawing, exploded view, and component production sheets.",
        skills: ["Industrial Assembly Modeling", "Kinematic Constraints", "Production Drawings", "Tolerance & Fits (GD&T)", "Exploded Views", "Mechanism Design"],
        submissionRequirements: [
          "3D CAD assembly and component model files (.step / .sldasm / native)",
          "Multi-sheet PDF drawing set (Assembly, Exploded view, Component details)",
          "Project report detailing mechanism operations, fits, and manufacturing notes"
        ]
      },

      // ----------------- CIVIL CAD -----------------
      "civil_1": {
        // Civil CAD - Level 1: Building Symbols Library
        fullDescription: "Create a standardized library of 2D architectural building symbols and reusable dynamic blocks. This beginner project establishes foundational architectural drafting skills, layering conventions, and national building code symbol standards.",
        objective: "Draft a comprehensive, organized CAD symbols library featuring architectural doors, windows, ventilators, stairs, and sanitary fittings.",
        whatToBuild: [
          "Standard single-leaf, double-leaf, and sliding door symbols with swing arcs",
          "Window symbols (casement, sliding, louvered) with sill and lintel representations",
          "Ventilators and exhaust openings",
          "Staircase conventions (dog-legged, straight flight) with up/down direction arrows",
          "Standard sanitary and plumbing architectural symbols (WC, washbasin, shower)"
        ],
        requirements: [
          "All symbols created on standard designated layers (e.g., ARCH-DOOR, ARCH-WIND)",
          "Created at 1:1 real-world scale (metric / imperial)",
          "Reusable CAD blocks with insertion base points correctly placed",
          "Organized reference palette / drawing sheet"
        ],
        functionalRequirements: [
          "Dynamic block parameters for door swing angles and window widths",
          "Consistent line weights and text annotation styles",
          "Standard architectural hatching for glass, wood, and masonry",
          "Legend sheet organizing symbols by category"
        ],
        technicalRequirements: [
          "AutoCAD / AutoCAD Architecture / Civil 3D",
          "Standard layering guidelines (AIA / ISO 13567)",
          "Dynamic Blocks & Block Attributes",
          "Clean purge of unused layers and nested blocks"
        ],
        expectedOutput: "A standardized CAD Block Library file (.dwg) and reference catalog sheet in PDF format.",
        skills: ["AutoCAD Civil / Architecture", "Architectural Symbols", "Dynamic Blocks", "Layer Standardization", "Drafting Scales", "Building Codes"],
        submissionRequirements: [
          "CAD Block Library (.dwg file)",
          "Reference Sheet PDF showing all symbols with dimensions",
          "Documentation notes on layer structure and insertion points"
        ]
      },
      "civil_2": {
        // Civil CAD - Level 2: Front Elevation & Sectional Elevation
        fullDescription: "Draft the complete Front Elevation and Cross-Sectional Elevation of a single-story residential building passing through the staircase or verandah. This intermediate project teaches projection techniques, material hatching, and vertical structural detailing.",
        objective: "Produce high-precision exterior front elevation and structural cross-section drawings projected directly from a residential floor plan.",
        whatToBuild: [
          "Front exterior elevation showing parapet walls, roof overhang, porch/verandah, doors, windows, and decorative cornices",
          "Sectional elevation cutting through the staircase/verandah, foundation, plinth, lintel, and roof slab",
          "Level markers (Ground Level GL, Plinth Level PL, Floor Finish Level FFL, Ceiling Level, Parapet Top)",
          "Structural hatch patterns for concrete, brick masonry, DPC, sand filling, and compacted earth"
        ],
        requirements: [
          "Exact vertical dimensioning (floor heights, lintel levels, parapet height)",
          "True vertical projection matching the provided floor plan",
          "Detailed staircase section showing riser, tread, waist slab, and railing details",
          "Standard architectural notes and material specifications"
        ],
        functionalRequirements: [
          "Draft parapet, sunshades (chajja), and weather-shades accurately",
          "Indicate foundation footing steps and plinth beam detail",
          "Apply appropriate material hatch textures and depth line weights",
          "Include scale bar and level callouts"
        ],
        technicalRequirements: [
          "AutoCAD Civil / Revit Architecture",
          "Standard architectural drafting scale (1:50 or 1:100)",
          "Line weight differentiation (heavy for cut section, light for background elevations)",
          "Proper annotation styles and dimension chains"
        ],
        expectedOutput: "A scaled, fully annotated architectural drawing sheet containing Front Elevation and Sectional Elevation.",
        skills: ["Architectural Elevation", "Cross-Sectional Drafting", "Structural Slab & Foundation Detailing", "Material Hatching", "Staircase Calculations", "Vertical Projections"],
        submissionRequirements: [
          "CAD Drawing file (.dwg)",
          "Exported High-Resolution PDF drawing sheet",
          "Calculations sheet for staircase riser/tread and plinth levels"
        ]
      },
      "civil_3": {
        // Civil CAD - Level 3: Complete Working Drawing Set (2BHK/3BHK)
        fullDescription: "Prepare a complete municipal-submission-grade working drawing set for a 2BHK/3BHK residential bungalow. This advanced project encompasses floor plans, roof drainage plans, elevations, sections, area statements, and site orientation plans.",
        objective: "Develop a comprehensive, municipal-approval ready architectural working drawing set for a 2BHK or 3BHK residential building complying with local development control regulations.",
        whatToBuild: [
          "Detailed ground floor plan with room dimensions, wall thicknesses, and furniture/sanitary layout",
          "Roof terrace plan indicating slopes, rainwater harvesting pipes, and parapet walls",
          "Front and side exterior elevations",
          "Longitudinal and transverse cross-sections through critical structural areas",
          "Site layout plan showing plot boundaries, setbacks, access roads, and North orientation arrow",
          "Area statement table calculating Plot Area, Built-Up Area (BUA), Carpet Area, and FSI/FAR"
        ],
        requirements: [
          "Complete grid line system and dual-chain dimensioning (internal room dimensions & external wall lines)",
          "Door and window schedule (D/W Schedule) with opening sizes, sill, and lintel heights",
          "Compliance with standard setbacks, ventilation, and room area minimums",
          "Standard submission sheet title block with owner, architect, and municipality signature zones"
        ],
        functionalRequirements: [
          "Prepare layout in accordance with National Building Code (NBC) / municipal bylaws",
          "Calculate FAR/FSI and ground coverage percentages in the area statement table",
          "Include structural column layout grid markings",
          "Organize into a cohesive multi-sheet drawing set"
        ],
        technicalRequirements: [
          "AutoCAD / Revit / Civil 3D",
          "Standard A1 or A0 drawing sheets with title blocks",
          "Layer standardization with plot style tables (.ctb)",
          "Scale ratios: 1:100 for plans/elevations/sections, 1:200 for site plan"
        ],
        expectedOutput: "A complete municipal approval working drawing package in DWG and multi-page PDF format.",
        skills: ["Working Drawing Sets", "2BHK/3BHK Residential Planning", "Area Statement & FSI Calculations", "Site Orientation & Setbacks", "Municipal Bylaws Compliance", "Door/Window Schedules"],
        submissionRequirements: [
          "Complete CAD project drawing file (.dwg)",
          "Multi-sheet PDF submission set (Plans, Elevations, Sections, Site Layout)",
          "Area statement and FSI calculation spreadsheet / report"
        ]
      },

      // ----------------- ELECTRICAL CAD -----------------
      "elec_1": {
        // Electrical CAD - Level 1: Electrical Symbols Library
        fullDescription: "Draft a comprehensive standardized library of IEC and IEEE electrical symbols and schematic components. This beginner project builds core skills in electrical schematic drafting, symbol standardization, and block attributes.",
        objective: "Create an extensive CAD library of IEC 60617 and IEEE standard electrical symbols for single-line diagrams (SLD) and control schematics.",
        whatToBuild: [
          "Power distribution symbols: Transformers, generators, AC/DC motors, busbars, and earth connections",
          "Switchgear and protective device symbols: MCB, MCCB, ELCB, RCCB, fuses, contactors, and thermal overload relays",
          "Control & instrumentation symbols: Pushbuttons, selector switches, limit switches, proximity sensors, relays, timers, and indicator lamps",
          "Terminal strip symbols, cable tags, and wire connection markers"
        ],
        requirements: [
          "Strict compliance with IEC 60617 / IEEE 315 standards",
          "Uniform grid spacing (e.g., 2.5mm / 5mm snap grid) for wire connectivity",
          "Parametric block attributes for device tags, ratings, and terminal numbers",
          "Organized layout by equipment classification"
        ],
        functionalRequirements: [
          "Create smart electrical blocks with automatic wire break connection points",
          "Define default tag numbering conventions (e.g., K for relays, Q for breakers)",
          "Establish layer conventions (e.g., WIRE_POWER, WIRE_CONTROL, SYMBOLS)",
          "Generate reference symbol chart"
        ],
        technicalRequirements: [
          "AutoCAD Electrical / EPLAN / SolidWorks Electrical",
          "Standard Schematic Library workspace",
          "Attribute definitions (TAG, RATING, DESC, MFG)",
          "Vector-clean block definitions"
        ],
        expectedOutput: "Standardized electrical CAD symbol library file (.dwg) and catalog PDF.",
        skills: ["AutoCAD Electrical", "IEC 60617 / IEEE Standards", "Single-Line Diagram (SLD) Symbols", "Electrical Block Attributes", "Schematic Drafting"],
        submissionRequirements: [
          "CAD symbol library file (.dwg)",
          "Reference catalog PDF organizing symbols by category",
          "Symbol attributes documentation note"
        ]
      },
      "elec_2": {
        // Electrical CAD - Level 2: DOL Motor Starter Control & Power Circuit
        fullDescription: "Design and draft the complete 3-phase power circuit and 230V/24V control circuit schematics for a Direct Online (DOL) Induction Motor Starter. This intermediate project teaches industrial motor control circuitry, interlocking, and protection systems.",
        objective: "Produce industrial-standard schematic wiring diagrams for a 3-Phase induction motor Direct Online (DOL) starter including power wiring, control logic, protection, and indicator circuits.",
        whatToBuild: [
          "3-Phase 415V power circuit featuring isolator/MCCB, main contactor (KM1), thermal overload relay (OLR), and squirrel-cage induction motor (M1)",
          "Control circuit (230VAC or 24VDC) with control fuse/MCB, emergency stop, stop pushbutton, start pushbutton, contactor coil, and seal-in auxiliary contact (KM1 NO)",
          "Indicator lamp circuits for Motor RUN (Green), Motor STOP (Red), and Motor TRIP (Amber)",
          "Terminal connection diagram and wire ferrule numbering chart"
        ],
        requirements: [
          "Proper electrical interlocking to prevent contactor chattering",
          "Thermal overload protection contact (95-96 NC) wired in series with coil",
          "Overload trip alarm contact (97-98 NO) wired to trip indicator",
          "Standard ladder diagram / European style schematic representation"
        ],
        functionalRequirements: [
          "Assign unique wire numbers (ferrules) across all connections",
          "Calculate fuse and thermal overload relay current trip settings based on motor kW rating",
          "Specify cable cross-sectional area for power and control wiring",
          "Generate Bill of Materials (BOM) for switchgear components"
        ],
        technicalRequirements: [
          "AutoCAD Electrical / EPLAN Electric P8",
          "Standard ladder / cross-referencing schematic format",
          "Wire numbering and cable schedule generation",
          "Component ratings table (contactor AC-3 rating, coil voltage, OLR range)"
        ],
        expectedOutput: "Industrial-grade schematic drawing set for DOL starter power and control circuits with ferrule schedules.",
        skills: ["Motor Control Schematics", "3-Phase Power Distribution", "Contactor & OLR Sizing", "Pushbutton Control Logic", "Ferrule Numbering", "Switchgear Selection"],
        submissionRequirements: [
          "Electrical schematic CAD files (.dwg / .dxf)",
          "Complete multi-page schematic drawing in PDF format",
          "Component BOM and motor sizing calculation report"
        ]
      },
      "elec_3": {
        // Electrical CAD - Level 3: Industrial Control Panel Layout & Wiring Drawing
        fullDescription: "Develop the general arrangement (GA), internal equipment layout, and detailed wiring drawing for an industrial PLC control panel or Motor Control Center (MCC). This advanced project covers panel architecture, DIN rail placement, thermal clearance, busbar layout, and power distribution.",
        objective: "Design a comprehensive industrial control panel package including enclosure exterior GA, internal back-plate component layout, power distribution wiring, and PLC I/O wiring schedules.",
        whatToBuild: [
          "Front door exterior GA layout: HMI display, door-interlocked main isolator handle, illuminated pushbuttons, selector switches, pilot lights, and emergency stop",
          "Internal back-plate mounting layout: Main incomer MCCB, power distribution busbars, 24VDC SMPS, PLC CPU & I/O racks, intermediate relays, terminal blocks, DIN rails, and PVC cable ducts",
          "Complete AC/DC power distribution schematic and field wiring terminal charts",
          "Internal panel earth bonding plan and cable entry gland plate layout"
        ],
        requirements: [
          "Adherence to IP54 / IP65 enclosure standards and heat dissipation clearance rules",
          "Proper segregation between high-voltage power wiring and sensitive low-voltage PLC signals",
          "Standard cable duct sizing (40% wire fill ratio limit)",
          "Detailed Bill of Materials with enclosure dimensions and component manufacturer part numbers"
        ],
        functionalRequirements: [
          "Dimension internal DIN rail spacings and cable trunking runs",
          "Map PLC digital/analog inputs and outputs to designated terminal strips",
          "Calculate panel heat dissipation and ventilation fan CFM requirements",
          "Produce cable and terminal schedules with wire ferrule cross-references"
        ],
        technicalRequirements: [
          "AutoCAD Electrical / EPLAN Pro Panel / SolidWorks Electrical",
          "2D/3D Panel layout workspace",
          "Standard enclosure sizing (e.g., 1800x800x400 mm)",
          "Component clearance and wiring channel fill verification"
        ],
        expectedOutput: "A complete industrial control panel design package containing GA drawings, internal layout, wiring tables, and BOM.",
        skills: ["Control Panel GA Layout", "DIN Rail & Cable Duct Sizing", "PLC I/O Interfacing", "Thermal Clearance & Enclosure Design", "Industrial Power Distribution", "Terminal Block Schedules"],
        submissionRequirements: [
          "CAD layout drawings (.dwg / .dxf)",
          "Multi-sheet engineering drawing package (PDF)",
          "Enclosure Bill of Materials and terminal wiring spreadsheet"
        ]
      },

      // ----------------- ELECTRONIC CAD -----------------
      "electr_1": {
        // Electronic CAD - Level 1: Dual-Rail Regulated DC Power Supply (+12V / -12V)
        fullDescription: "Design a regulated dual-rail DC power supply (+12V, GND, -12V) schematic using a center-tapped transformer, bridge rectifiers, bulk filter capacitors, and linear voltage regulators (LM7812 / LM7912). This beginner project builds foundational electronics schematic capture and power supply design skills.",
        objective: "Create a clean, production-grade electronic schematic for a dual-polarity regulated DC power supply capable of powering analog op-amp circuits and audio hardware.",
        whatToBuild: [
          "AC mains input with fuse protection, power switch, and center-tapped transformer interface",
          "Full-wave bridge rectifier circuit converting AC to raw dual-rail DC",
          "Smoothing filter stage using bulk electrolytic capacitors and high-frequency ceramic decoupling caps",
          "Voltage regulation stage featuring LM7812 (+12V) and LM7912 (-12V) linear regulators with reverse-protection diodes",
          "Output LED power indicators with current-limiting resistors and screw terminal connectors"
        ],
        requirements: [
          "Correct pinout and polarities for LM7812 (In-Gnd-Out) and LM7912 (Gnd-In-Out)",
          "Appropriate capacitor voltage ratings (minimum 25V/35V ratings for 12V rails)",
          "Reverse-bias protection diodes (1N4007) across regulators to prevent back-EMF damage",
          "Proper electrical rules check (ERC) clearance with zero schematic errors"
        ],
        functionalRequirements: [
          "Calculate ripple voltage and filter capacitor values for 1A output current",
          "Determine regulator power dissipation and heatsink requirements",
          "Assign unique component reference designators (C1, R1, U1, D1) and values",
          "Include standard power net labels (+12V, -12V, GND)"
        ],
        technicalRequirements: [
          "KiCad / Altium Designer / Autodesk Eagle / EasyEDA",
          "Schematic Capture Workspace",
          "ERC (Electrical Rules Check) validation",
          "Component footprint assignment for future PCB layout"
        ],
        expectedOutput: "A verified electronic schematic diagram, component netlist, and itemized Bill of Materials.",
        skills: ["Schematic Capture", "Linear Voltage Regulators", "Dual-Rail Power Supplies", "Bridge Rectifiers & Filtering", "Electrical Rules Check (ERC)", "EDA Tools"],
        submissionRequirements: [
          "EDA schematic project file (.kicad_sch / .sch)",
          "High-resolution schematic PDF with title block",
          "Component BOM with ratings, tolerances, and manufacturer part numbers"
        ]
      },
      "electr_2": {
        // Electronic CAD - Level 2: Microcontroller Development Board Schematic (ATmega328P / Arduino Nano)
        fullDescription: "Design a complete microcontroller development board schematic centered on the ATmega328P (Arduino Nano style) featuring a 16MHz crystal oscillator, reset circuit, USB-to-UART bridge (CH340), onboard 5V/3.3V power regulation, and GPIO breakout headers.",
        objective: "Design a reliable, standalone 8-bit microcontroller development board schematic ready for embedded system prototyping and firmware programming.",
        whatToBuild: [
          "ATmega328P-AU microcontroller core with power decoupling capacitors on all VCC/AVCC pins",
          "16MHz crystal oscillator circuit with 22pF load capacitors positioned close to XTAL pins",
          "Active-low reset circuitry with 10k pull-up resistor, 100nF DTR auto-reset capacitor, and tactile reset button",
          "USB Type-C or Micro-USB interface with ESD protection and CH340N USB-to-UART bridge",
          "AMS1117-5.0V / AMS1117-3.3V dual LDO power regulation with reverse polarity protection",
          "ICSP 6-pin programming header and standard 2.54mm pitch dual-row GPIO breakout pins",
          "Status indicator LEDs (Power, TX, RX, and D13 user LED)"
        ],
        requirements: [
          "Bypass capacitors (100nF ceramic) placed on every power pin",
          "Proper USB D+ / D- differential signal handling and CC1/CC2 pull-down resistors for USB-C",
          "Complete pin mapping and readable net labels across all functional blocks",
          "Pass Electrical Rules Check (ERC) with zero unresolved warnings"
        ],
        functionalRequirements: [
          "Group schematic logically into sub-circuits (Power, MCU, USB, Breakout)",
          "Define test points for 5V, 3.3V, GND, and reset line",
          "Select low-cost, readily available SMD components (0805 / 0603 passive packages)",
          "Generate complete PCB netlist and Bill of Materials"
        ],
        technicalRequirements: [
          "KiCad 7+ / Altium Designer / Eagle",
          "Standard 8-bit MCU architecture design guidelines",
          "USB 2.0 full-speed compliance guidelines",
          "ERC validation and schematic sheet annotation"
        ],
        expectedOutput: "A fully annotated, ERC-verified microcontroller development board schematic and production BOM.",
        skills: ["Microcontroller System Design", "USB-to-UART Interfacing", "Crystal Oscillator Sizing", "Reset & In-Circuit Programming (ICSP)", "Power Distribution & Decoupling", "Schematic Architecture"],
        submissionRequirements: [
          "EDA project schematic files",
          "Schematic drawing PDF with modular block layout",
          "Itemized BOM spreadsheet with manufacturer part numbers and package footprints"
        ]
      },
      "electr_3": {
        // Electronic CAD - Level 3: IoT-Enabled Sensor Node Schematic (ESP32 / ESP8266 based)
        fullDescription: "Design a multi-sheet, mixed-signal schematic for an industrial IoT-enabled sensor node based on the ESP32 / ESP8266 RF microcontroller. The design includes lithium battery management (PMIC & charging), ultra-low power sleep circuitry, logic level shifters, and I2C/SPI sensor interfaces.",
        objective: "Produce a professional multi-sheet hierarchical electronic schematic for an IoT sensor node capable of wireless telemetry, battery power management, and multi-sensor data acquisition.",
        whatToBuild: [
          "Sheet 1: Power Management (TP4056 / MCP73831 Li-Po battery charger, 3.3V high-efficiency buck-boost regulator, battery voltage monitor divider, and USB/battery auto-switching circuit)",
          "Sheet 2: Microcontroller & RF (ESP32-WROOM-32E module, auto-programming transistor circuit, strapping pin resistors, and RF antenna keep-out notes)",
          "Sheet 3: Sensor Interfaces & Signal Conditioning (I2C bus with pull-up resistors for temperature/humidity sensors, SPI bus for external flash/SD card, and precision analog front-end op-amp circuit for gas/environmental sensors)",
          "Sheet 4: Connectors, Level Shifters & Protection (Bidirectional I2C level shifters, external sensor terminal blocks, and TVS diode array surge protection)"
        ],
        requirements: [
          "Hierarchical schematic sheet structure with global power nets and local signal labels",
          "Low quiescent current components to ensure extended battery operational life",
          "ESD / overvoltage protection on all user-facing external sensor ports",
          "Complete design rule checks (DRC) and Electrical Rules Checks (ERC) with zero errors"
        ],
        functionalRequirements: [
          "Implement hardware deep sleep wake-up timer and external interrupt pin routing",
          "Include status LEDs for battery charging, battery full, Wi-Fi status, and system fault",
          "Provide test pads for RF calibration and power consumption profiling",
          "Generate complete engineering documentation and manufacturer BOM"
        ],
        technicalRequirements: [
          "KiCad 7+ / Altium Designer / Cadence OrCAD",
          "Multi-sheet hierarchical schematic architecture",
          "Mixed-signal design principles (analog/digital ground isolation)",
          "Component footprint and sourcing lifecycle validation"
        ],
        expectedOutput: "A professional multi-sheet mixed-signal IoT hardware schematic package, netlist, and comprehensive BOM.",
        skills: ["Hierarchical Schematics", "RF Microcontrollers (ESP32)", "Battery Power Management (PMIC)", "I2C / SPI Sensor Interfacing", "Mixed-Signal Design", "ESD / Surge Protection"],
        submissionRequirements: [
          "Complete multi-sheet EDA schematic project",
          "Multi-page schematic PDF document with sheet index",
          "Comprehensive BOM with sourcing links, electrical ratings, and design documentation"
        ]
      }
    };

    // ---- Project-content resolver ----
    const PROJECT_CONTENT_TITLES = {
      // CSE/IT
      1: "HTML + CSS Responsive Design",
      2: "JavaScript + Fetch API + Third-party API",
      3: "React E-Commerce Website",
      // Mechanical CAD
      "mech_1": "Flange Coupling (Half View)",
      "mech_2": "Protected Flanged Pipe Joint",
      "mech_3": "Lathe Tailstock Assembly",
      // Civil CAD
      "civil_1": "Building Symbols Library",
      "civil_2": "Front Elevation & Sectional Elevation",
      "civil_3": "Complete Working Drawing Set (2BHK/3BHK)",
      // Electrical CAD
      "elec_1": "Electrical Symbols Library",
      "elec_2": "DOL Motor Starter Control & Power Circuit",
      "elec_3": "Industrial Control Panel Layout & Wiring Drawing",
      // Electronic CAD
      "electr_1": "Dual-Rail Regulated DC Power Supply (+12V / -12V)",
      "electr_2": "Microcontroller Development Board Schematic (e.g., ATmega328P / Arduino Nano style)",
      "electr_3": "IoT-Enabled Sensor Node Schematic (ESP32 / ESP8266 based)"
    };

    // Keyword matchers ordered specifically to prevent ambiguities
    const PROJECT_CONTENT_MATCHERS = [
      // Mechanical CAD
      { key: "mech_3", re: /\b(?:tailstock|lathe\s*tailstock)\b/i },
      { key: "mech_2", re: /\b(?:pipe\s*joint|flanged\s*pipe|protected\s*flanged)\b/i },
      { key: "mech_1", re: /\b(?:flange\s*coupling)\b/i },
      // Civil CAD
      { key: "civil_3", re: /\b(?:2bhk|3bhk|working\s*drawing\s*set)\b/i },
      { key: "civil_2", re: /\b(?:front\s*elevation|sectional\s*elevation)\b/i },
      { key: "civil_1", re: /\b(?:building\s*symbols)\b/i },
      // Electrical CAD
      { key: "elec_3", re: /\b(?:industrial\s*control\s*panel|control\s*panel\s*layout|panel\s*wiring|plc\s*panel|mcc)\b/i },
      { key: "elec_2", re: /\b(?:dol\s*motor|motor\s*starter|power\s*circuit)\b/i },
      { key: "elec_1", re: /\b(?:electrical\s*symbols)\b/i },
      // Electronic CAD
      { key: "electr_3", re: /\b(?:iot|sensor\s*node|esp32|esp8266)\b/i },
      { key: "electr_2", re: /\b(?:microcontroller\s*development|atmega328p|arduino\s*nano|ch340)\b/i },
      { key: "electr_1", re: /\b(?:dual-rail|regulated\s*dc|power\s*supply|lm7812|lm7912)\b/i },
      // CSE / IT
      { key: 3, re: /\breact(?:\.?js)?\b/i },
      { key: 2, re: /\bjava\s*-?script\b|\bjs\b|\bfetch\b/i },
      { key: 1, re: /\bhtml\b|\bcss\b/i }
    ];

    function pdNormalizeTitle(v) {
      return String(v == null ? "" : v).toLowerCase().replace(/[^a-z0-9]+/g, "");
    }

    function pdContentKeyFromText(v) {
      const t = String(v == null ? "" : v).replace(/_/g, " ").trim();
      if (!t) return null;
      const norm = pdNormalizeTitle(t);
      const exact = Object.keys(PROJECT_CONTENT_TITLES).find(function (k) { return pdNormalizeTitle(PROJECT_CONTENT_TITLES[k]) === norm; });
      if (exact) return exact;
      const hit = PROJECT_CONTENT_MATCHERS.find(function (m) { return m.re.test(t); });
      return hit ? hit.key : null;
    }

    function pdContentKeyFromStage(v, course) {
      if (v == null || v === "") return null;
      let stageNum = null;
      if (typeof v === "number" || /^\s*(?:stage|step|level)?\s*_?0*\d+\s*$/i.test(String(v))) {
        stageNum = parseInt(String(v).replace(/\D/g, ""), 10);
      }
      if (stageNum >= 1 && stageNum <= 3) {
        const c = String(course || cachedStudentCourse || "").toLowerCase();
        if (c.includes("mechanical")) return "mech_" + stageNum;
        if (c.includes("civil")) return "civil_" + stageNum;
        if (c.includes("electrical")) return "elec_" + stageNum;
        if (c.includes("electronic")) return "electr_" + stageNum;
        if (c.includes("computer") || c.includes("it") || c.includes("cse")) return stageNum;
      }
      return pdContentKeyFromText(v);
    }

    function resolveProjectContentKey(projectId, backend) {
      const b = backend || {};
      const course = b.course || cachedStudentCourse;
      const steps = [
        function () { return pdContentKeyFromText(b.title); },
        function () { return pdContentKeyFromText(b.technology); },
        function () { return pdContentKeyFromStage(b.stage, course); },
        function () { return pdContentKeyFromText([b.name, b.projectName, b.projectTitle, b.slug, b.code].filter(Boolean).join(" ")); },
        function () {
          const id = Number(b.id != null ? b.id : projectId);
          if (id === 1 || id === 2 || id === 3) return pdContentKeyFromStage(id, course) || id;
          return null;
        }
      ];
      for (const step of steps) {
        const key = step();
        if (key != null) return key;
      }
      return null;
    }

    const pdWarnedUnresolved = new Set();

    // Get project-specific content, merged with the backend row. PROJECT_SPECIFIC_CONTENT supplies only the
    // educational specification; every backend field (id, title, status, progressPercent, assignedOn, dueDate,
    // submissionUrl, submissionNote, adminFeedback ...) passes through untouched and stays authoritative.
    function getProjectContent(projectId, backendData) {
      const b = backendData || {};
      const key = resolveProjectContentKey(projectId, b);
      const specific = key != null ? PROJECT_SPECIFIC_CONTENT[key] : null;
      if (!specific) {
        const id = String(b.id != null ? b.id : projectId);
        if (!pdWarnedUnresolved.has(id)) {
          pdWarnedUnresolved.add(id);
          console.warn("[ProjectDetails] No project-specific content matched. id / title / technology / stage:", id, b.title, b.technology, b.stage);
        }
      }
      return Object.assign({}, b, specific || {});
    }

    function renderProjectDetailsModal(proj, detail, state) {
      // The list row first, then the detail endpoint layered on top - but only with values the detail
      // endpoint actually returned. null / "" never wipe the row's real title, progress, dates or status.
      const b = Object.assign({}, proj.backend || {});
      Object.keys(detail || {}).forEach(function (k) {
        const v = detail[k];
        if (v == null || (typeof v === "string" && !v.trim())) return; // keep the list row's value
        b[k] = v;
      });
      // Merge in project-specific content for this project (resolved by title/technology/stage/name, not id alone)
      const projContent = getProjectContent(proj.id, b);

      const titleText = b.title || proj.title || "Project Details";
      viewProjectModalTitle.textContent = titleText;
      viewProjectModalCategory.textContent = b.category || "";
      viewProjectModalCategory.style.display = b.category ? "" : "none"; // no empty gap when the backend sent no category
      const status = b.status || proj.status || "NOT_STARTED";
      viewProjectModalStatus.innerHTML = statusBadge(status);

      const rawPct = b.progressPercent != null && b.progressPercent !== "" ? b.progressPercent : proj.progressPercent;
      const pct = (rawPct != null && Number.isFinite(Number(rawPct)))
        ? Math.max(0, Math.min(100, Number(rawPct))) : 0;
      const meta = `
        <div class="pd-meta">
          <div class="pd-meta-item"><span>Current Progress</span><b>${pct}%</b></div>
          <div class="pd-meta-item"><span>Assigned</span><b>${escapeHtml(b.assignedOn || "—")}</b></div>
          <div class="pd-meta-item"><span>Due Date</span><b>${escapeHtml(b.dueDate || "—")}</b></div>
        </div>`;

      const sections = [];
      
      // 1. Description
      const description = projContent.fullDescription || projContent.description || pdPick(b, "description") ||
        `Comprehensive project implementation for ${titleText}. Complete all required modules, follow engineering design specifications, and test functionality thoroughly.`;
      sections.push(pdSection("Description", pdTextHtml(description)));
      
      // 2. Objective
      const objective = projContent.objective || pdPick(b, "objective") ||
        `Demonstrate industry-standard competencies in ${titleText} by developing verified deliverables conforming to technical benchmarks.`;
      sections.push(pdSection("Objective", pdTextHtml(objective)));
      
      // 3. What You Need To Build
      const whatToBuild = projContent.whatToBuild || pdPick(b, "whatToBuild") || [
        `Complete architecture and core functional components for ${titleText}`,
        "Structured implementation adhering to modular design principles",
        "Functional validation tests with proper error handling and edge-case coverage",
        "Comprehensive documentation and demonstration artifact"
      ];
      sections.push(pdSection("What You Need To Build", pdTextHtml(whatToBuild)));
      
      // 4. Requirements (General, Functional & Technical)
      let requirementsList = [];
      const reqRaw = projContent.requirements || pdPick(b, "requirements");
      if (reqRaw) {
        if (Array.isArray(reqRaw)) requirementsList.push(...reqRaw);
        else requirementsList.push(String(reqRaw));
      }
      const funcReqs = projContent.functionalRequirements || pdPick(b, "functionalRequirements");
      if (funcReqs) {
        if (Array.isArray(funcReqs)) requirementsList.push(...funcReqs);
        else requirementsList.push(String(funcReqs));
      }
      const techReqs = projContent.technicalRequirements || pdPick(b, "technicalRequirements");
      if (techReqs) {
        if (Array.isArray(techReqs)) requirementsList.push(...techReqs);
        else requirementsList.push(String(techReqs));
      }
      if (!requirementsList.length) {
        requirementsList = [
          "Complete working implementation with zero critical defects",
          "Adherence to standard industry coding / drafting / engineering guidelines",
          "Verification of all primary functional test scenarios and constraints",
          "Clean deliverables package (Source code / CAD / Schematic / Documentation)"
        ];
      }
      sections.push(pdSection("Requirements", pdTextHtml(requirementsList)));
      
      // 5. Expected Output
      const expectedOutput = projContent.expectedOutput || pdPick(b, "expectedOutput") ||
        `A fully verified, production-ready deliverable package for ${titleText} meeting all specified evaluation criteria.`;
      sections.push(pdSection("Expected Output", pdTextHtml(expectedOutput)));

      // Skills (if available)
      const skills = projContent.skills || pdPick(b, "skills");
      if (skills) {
        const list = Array.isArray(skills) ? skills : String(skills).split(",").map(x => x.trim()).filter(Boolean);
        if (list.length) {
          sections.push(pdSection("Skills You Will Build",
            `<div class="project-skills-badges">${list.map(sk => `<span class="skill-badge">${escapeHtml(typeof sk === "object" ? (sk.name || sk.title || "") : sk)}</span>`).join("")}</div>`));
        }
      }

      // Submission Requirements (if defined)
      const submissionReqs = projContent.submissionRequirements;
      if (submissionReqs) sections.push(pdSection("Submission Requirements", pdTextHtml(submissionReqs)));

      // 6. Current Progress & Submission Details
      const submitted = !(status === "NOT_STARTED" || status === "IN_PROGRESS");
      let statusLabel = "Not Started";
      if (status === "IN_PROGRESS") statusLabel = "In Progress";
      else if (status === "SUBMITTED") statusLabel = "Submitted (Under Review)";
      else if (status === "UNDER_REVIEW") statusLabel = "Under Review";
      else if (status === "APPROVED") statusLabel = "Approved ✓";
      else if (status === "REVISION_REQUIRED") statusLabel = "Revision Required";

      let submissionHtml = `
        <div style="margin-bottom:12px;">
          <div style="display:flex; justify-content:space-between; font-size:.82rem; font-weight:700; margin-bottom:5px;">
            <span>Current Progress: <b>${pct}%</b></span>
            <span>Status: <b style="color:var(--crimson);">${escapeHtml(statusLabel)}</b></span>
          </div>
          <div style="background:var(--paper, #f1f5f9); border-radius:999px; height:8px; overflow:hidden; border:1px solid var(--line);">
            <div style="background:var(--crimson, #e02b54); height:100%; width:${pct}%; transition:width 0.3s ease;"></div>
          </div>
        </div>`;

      const submittedOn = pdPick(b, "submittedOn");
      if (submittedOn) submissionHtml += `<div class="pd-note"><b>Submitted On</b>${escapeHtml(submittedOn)}</div>`;
      if (b.progressNote) submissionHtml += `<div class="pd-note"><b>Progress Note</b>${escapeHtml(b.progressNote)}</div>`;
      if (b.submissionUrl) submissionHtml += `<p class="pd-link" style="margin:8px 0;"><strong>Submission Link:</strong> ${pdSafeLink(b.submissionUrl)}</p>`;
      if (b.submissionNote) submissionHtml += `<div class="pd-note"><b>Submission Note</b>${escapeHtml(b.submissionNote)}</div>`;
      if (!submitted && !b.progressNote) {
        submissionHtml += `<p style="margin:0; font-size:.85rem; color:var(--ink-soft);">No submission recorded yet. Use the <strong>Update Progress</strong> or <strong>Submit Project</strong> button on the project card to track your work.</p>`;
      }
      sections.push(pdSection("Current Progress", submissionHtml));

      if (b.adminFeedback) {
        sections.push(pdSection("Reviewer Feedback",
          `<div class="pd-note"><b>Feedback</b>${escapeHtml(b.adminFeedback)}</div>`,
          status === "REVISION_REQUIRED" ? "pd-section-revision" : ""));
      }

      let footer = "";
      if (state === "loading") footer = `<p class="pd-loading">Loading full project details…</p>`;
      else if (state === "error") footer = `<p class="pd-loading">Couldn't load the full project details right now — showing what's available.</p>`;

      viewProjectModalBody.innerHTML = meta + sections.join("") + footer;
      // Long specification: the body scrolls inside the modal (header and Close button stay put).
      viewProjectModalBody.style.overflowY = "auto";
      viewProjectModalBody.style.maxHeight = "70vh";
      viewProjectModalBody.style.maxHeight = "min(70vh, calc(100vh - 220px))"; // small screens; ignored by browsers without min()
      viewProjectModalBody.style.overscrollBehavior = "contain";
    }

    let projectDetailsRequestId = 0;
    async function openProjectDetails(proj) {
      const reqId = ++projectDetailsRequestId;
      const stillOpen = () => reqId === projectDetailsRequestId && viewProjectModalOverlay.style.display !== "none";
      renderProjectDetailsModal(proj, null, "loading");
      viewProjectModalOverlay.style.display = "flex";
      viewProjectModalBody.scrollTop = 0; // every project opens at the top (the later "ready" re-render keeps the scroll position)
      try {
        const detail = await Api.projects.myDetail(proj.id);
        if (!stillOpen()) return;
        renderProjectDetailsModal(proj, detail && typeof detail === "object" ? detail : null, "ready");
      } catch (err) {
        if (!stillOpen()) return;
        renderProjectDetailsModal(proj, null, "error");
        handleLoadError(err);
      }
    }

    document.getElementById("projectsGrid").addEventListener("click", function (e) {
      const retryBtn = e.target.closest("[data-retry-projects]");
      if (retryBtn) {
        projectsLoaded = false;
        loadProjects();
        return;
      }

      const viewBtn = e.target.closest("[data-view-project]");
      if (viewBtn) {
        const proj = currentProjects.find(p => String(p.id) === String(viewBtn.dataset.viewProject));
        if (proj) openProjectDetails(proj);
        return;
      }

      const progressBtn = e.target.closest("[data-progress-project]");
      if (progressBtn) {
        activeProjectId = progressBtn.dataset.progressProject;
        const proj = currentProjects.find(p => String(p.id) === String(activeProjectId));
        progressPercentInput.value = (proj && proj.progress) || "";
        progressNoteInput.value = "";
        progressModalError.classList.remove("show");
        progressModalOverlay.style.display = "flex";
        return;
      }
      const submitBtn = e.target.closest("[data-submit-project]");
      const resubmitBtn = e.target.closest("[data-resubmit-project]");
      if (submitBtn || resubmitBtn) {
        activeProjectId = (submitBtn || resubmitBtn).dataset.submitProject || (submitBtn || resubmitBtn).dataset.resubmitProject;
        submitModalMode = resubmitBtn ? "resubmit" : "submit";
        submitProjectModalTitle.textContent = resubmitBtn ? "Resubmit Project" : "Submit Project";
        submissionUrlInput.value = "";
        submissionNoteInput.value = "";
        submitProjectModalError.classList.remove("show");
        submitProjectModalOverlay.style.display = "flex";
      }
    });

    progressCancelBtn.addEventListener("click", function () {
      progressModalOverlay.style.display = "none";
      activeProjectId = null;
    });

    progressConfirmBtn.addEventListener("click", async function () {
      const percent = Number(progressPercentInput.value);
      if (progressPercentInput.value === "" || isNaN(percent) || percent < 0 || percent > 100) {
        progressModalError.textContent = "Enter a progress percentage between 0 and 100.";
        progressModalError.classList.add("show");
        return;
      }
      progressConfirmBtn.disabled = true;
      progressConfirmBtn.textContent = "Saving…";
      try {
        await Api.projects.updateProgress(activeProjectId, {
          progressPercent: percent,
          progressNote: progressNoteInput.value.trim()
        });
        showToast("Progress updated", "success");
        progressModalOverlay.style.display = "none";
        activeProjectId = null;
        projectsLoaded = false;
        loadProjects();
        dashboardLoaded = false;
      } catch (err) {
        progressModalError.textContent = err.message;
        progressModalError.classList.add("show");
        handleLoadError(err);
      } finally {
        progressConfirmBtn.disabled = false;
        progressConfirmBtn.textContent = "Save Progress";
      }
    });

    submitProjectCancelBtn.addEventListener("click", function () {
      submitProjectModalOverlay.style.display = "none";
      activeProjectId = null;
    });

    submitProjectConfirmBtn.addEventListener("click", async function () {
      const note = submissionNoteInput.value.trim();
      if (!note) {
        submitProjectModalError.textContent = "Please add a short note for your reviewer.";
        submitProjectModalError.classList.add("show");
        return;
      }
      submitProjectConfirmBtn.disabled = true;
      submitProjectConfirmBtn.textContent = "Submitting…";
      try {
        const payload = { submissionUrl: submissionUrlInput.value.trim() || null, submissionNote: note };
        if (submitModalMode === "resubmit") {
          await Api.projects.resubmit(activeProjectId, payload);
        } else {
          await Api.projects.submit(activeProjectId, payload);
        }
        showToast("Project submitted", "success");
        submitProjectModalOverlay.style.display = "none";
        activeProjectId = null;
        projectsLoaded = false;
        loadProjects();
        dashboardLoaded = false;
      } catch (err) {
        submitProjectModalError.textContent = err.message;
        submitProjectModalError.classList.add("show");
        handleLoadError(err);
      } finally {
        submitProjectConfirmBtn.disabled = false;
        submitProjectConfirmBtn.textContent = "Submit";
      }
    });

    // ================================================================
    // NOTIFICATIONS
    // ================================================================
    let notificationsLoaded = false;

    async function loadNotifications() {
      if (notificationsLoaded) return;
      notificationsLoaded = true;
      await refreshNotifications();
    }

    async function refreshNotifications() {
      const list = document.getElementById("notifList");
      try {
        const rows = await Api.notifications.myList();
        renderNotifications(rows || []);
        setNotifBadge(countUnread(rows));
        // A meaningful action happened (read state changed) - make sure the
        // dashboard summary/badge picks it up next time it's visited.
        dashboardLoaded = false;
      } catch (err) {
        list.innerHTML = `<p style="color:var(--ink-soft); margin:0;">${escapeHtml(err.message)}</p>`;
        handleLoadError(err);
      }
    }

    function renderNotifications(rows) {
      const list = document.getElementById("notifList");
      if (!rows.length) {
        list.innerHTML = `<div class="empty-state"><div class="empty-icon">🔔</div><h4>No notifications yet</h4><p>Updates about your leaves, projects and certificates will show up here.</p></div>`;
        return;
      }
      list.innerHTML = rows.map(n => `
        <div class="notif-item ${n.read ? "" : "unread"}">
          <span class="notif-icon">${escapeHtml(n.icon || "🔔")}</span>
          <div class="notif-body">
            <p class="notif-text">${escapeHtml(n.message)}</p>
            <span class="notif-time">${escapeHtml(n.createdOn || "")}</span>
          </div>
          ${n.read ? "" : `<button class="notif-mark-read-btn" data-mark-read="${n.id}">Mark read</button>`}
        </div>
      `).join("");
    }

    document.getElementById("notifList").addEventListener("click", async function (e) {
      const btn = e.target.closest("[data-mark-read]");
      if (!btn) return;
      btn.disabled = true;
      try {
        await Api.notifications.markRead(btn.dataset.markRead);
        await refreshNotifications();
      } catch (err) {
        showToast(err.message, "error");
        btn.disabled = false;
      }
    });

    document.getElementById("markAllReadBtn").addEventListener("click", async function () {
      const btn = this;
      btn.disabled = true;
      try {
        await Api.notifications.markAllRead();
        await refreshNotifications();
      } catch (err) {
        showToast(err.message, "error");
      } finally {
        btn.disabled = false;
      }
    });

    // ================================================================
    // FEEDBACK
    // ================================================================
    let feedbackLoaded = false;
    let selectedRating = 0;

    const starRatingInput = document.getElementById("starRatingInput");
    const feedbackForm = document.getElementById("feedbackForm");
    const feedbackFormError = document.getElementById("feedbackFormError");
    const feedbackFormSuccess = document.getElementById("feedbackFormSuccess");
    const submitFeedbackBtn = document.getElementById("submitFeedbackBtn");

    function renderStars() {
      starRatingInput.querySelectorAll("button[data-star]").forEach(btn => {
        btn.classList.toggle("filled", Number(btn.dataset.star) <= selectedRating);
      });
    }

    starRatingInput.addEventListener("click", function (e) {
      const btn = e.target.closest("[data-star]");
      if (!btn) return;
      selectedRating = Number(btn.dataset.star);
      renderStars();
    });

    function loadFeedbackSection() {
      if (feedbackLoaded) return;
      feedbackLoaded = true;
      loadFeedbackHistory();
    }

    async function loadFeedbackHistory() {
      const list = document.getElementById("feedbackHistoryList");
      try {
        const rows = await Api.feedback.myList();
        renderFeedbackHistory(rows || []);
      } catch (err) {
        list.innerHTML = `<p style="color:var(--ink-soft); margin:0;">${escapeHtml(err.message)}</p>`;
        handleLoadError(err);
      }
    }

    function renderFeedbackHistory(rows) {
      const list = document.getElementById("feedbackHistoryList");
      if (!rows.length) {
        list.innerHTML = `<div class="empty-state"><div class="empty-icon">💬</div><h4>No feedback submitted yet</h4><p>Feedback you submit will appear here along with any response.</p></div>`;
        return;
      }
      list.innerHTML = rows.map(f => `
        <div class="feedback-history-item">
          <div class="feedback-stars-readonly">${"★".repeat(f.rating || 0)}${"☆".repeat(5 - (f.rating || 0))}</div>
          <p class="feedback-comment">${escapeHtml(f.comment)}</p>
          <span class="notif-time">${escapeHtml(f.submittedOn || "")}</span>
          ${f.response ? `<div class="feedback-response-box" style="margin-top:10px;"><b>Response from Profenaa Technologies</b>${escapeHtml(f.response)}</div>` : ""}
        </div>
      `).join("");
    }

    feedbackForm.addEventListener("submit", async function (e) {
      e.preventDefault();
      feedbackFormError.classList.remove("show");
      feedbackFormSuccess.classList.remove("show");

      const comment = document.getElementById("feedbackComment").value.trim();
      if (!selectedRating) {
        feedbackFormError.textContent = "Please select a rating.";
        feedbackFormError.classList.add("show");
        return;
      }
      if (comment.length < 5) {
        feedbackFormError.textContent = "Please enter a comment (at least 5 characters).";
        feedbackFormError.classList.add("show");
        return;
      }

      submitFeedbackBtn.disabled = true;
      submitFeedbackBtn.textContent = "Submitting…";
      try {
        await Api.feedback.submit({ rating: selectedRating, comment });
        feedbackFormSuccess.classList.add("show");
        feedbackForm.reset();
        selectedRating = 0;
        renderStars();
        loadFeedbackHistory();
      } catch (err) {
        feedbackFormError.textContent = err.message;
        feedbackFormError.classList.add("show");
        handleLoadError(err);
      } finally {
        submitFeedbackBtn.disabled = false;
        submitFeedbackBtn.textContent = "Submit Feedback";
      }
    });

    // ================================================================
    // REFER A FRIEND
    // ================================================================
    let referralLoaded = false;
    let referralDataCache = null;

    function loadReferralSection() {
      if (referralLoaded) return;
      referralLoaded = true;
      loadReferralData();
    }

    async function loadReferralData() {
      const codeEl = document.getElementById("referralCodeValue");
      const totalEl = document.getElementById("referralTotalCount");
      const joinedEl = document.getElementById("referralJoinedCount");
      const tbody = document.querySelector("#referralHistoryTable tbody");

      if (tbody) tbody.innerHTML = '<tr class="empty-row"><td colspan="3">Loading…</td></tr>';

      try {
        const resp = await Api.referral.myInfo();
        referralDataCache = resp;
        const code = resp && resp.code ? resp.code : "—";
        if (codeEl) codeEl.textContent = code;

        const history = (resp && Array.isArray(resp.history)) ? resp.history : [];
        if (totalEl) totalEl.textContent = String(history.length);
        if (joinedEl) joinedEl.textContent = String(history.filter(h => (h.status || "").toUpperCase() === "JOINED" || (h.status || "").toUpperCase() === "APPROVED").length);

        if (tbody) {
          if (!history.length) {
            tbody.innerHTML = '<tr class="empty-row"><td colspan="3">No referrals yet. Share your code to invite friends!</td></tr>';
          } else {
            tbody.innerHTML = history.map(h => `
              <tr>
                <td>${escapeHtml(h.referredName || "—")}</td>
                <td><span class="status-badge approved"><span class="dot"></span>${escapeHtml(h.status || "JOINED")}</span></td>
                <td>${escapeHtml(h.date || "—")}</td>
              </tr>
            `).join("");
          }
        }
      } catch (err) {
        console.error("[Referral] Failed to load referral info:", err);
        if (codeEl) codeEl.textContent = "—";
        if (totalEl) totalEl.textContent = "—";
        if (joinedEl) joinedEl.textContent = "—";
        if (tbody) tbody.innerHTML = `<tr class="empty-row"><td colspan="3">${escapeHtml(err.message || "Couldn't load referral information.")}</td></tr>`;
        handleLoadError(err);
      }
    }

    const copyReferralBtn = document.getElementById("copyReferralBtn");
    if (copyReferralBtn) {
      copyReferralBtn.addEventListener("click", function () {
        const code = referralDataCache && referralDataCache.code ? referralDataCache.code : (document.getElementById("referralCodeValue")?.textContent || "").trim();
        if (!code || code === "—") {
          showToast("No referral code available to copy", "error");
          return;
        }
        if (navigator.clipboard && navigator.clipboard.writeText) {
          navigator.clipboard.writeText(code).then(() => {
            showToast("Referral code copied to clipboard!", "success");
          }).catch(() => {
            showToast("Failed to copy code", "error");
          });
        } else {
          const ta = document.createElement("textarea");
          ta.value = code;
          document.body.appendChild(ta);
          ta.select();
          document.execCommand("copy");
          document.body.removeChild(ta);
          showToast("Referral code copied to clipboard!", "success");
        }
      });
    }

    const shareReferralBtn = document.getElementById("shareReferralBtn");
    if (shareReferralBtn) {
      shareReferralBtn.addEventListener("click", function () {
        const code = referralDataCache && referralDataCache.code ? referralDataCache.code : (document.getElementById("referralCodeValue")?.textContent || "").trim();
        if (!code || code === "—") {
          showToast("No referral code available to share", "error");
          return;
        }
        const shareText = `Join Profenaa Technologies training portal with my referral code: ${code}`;
        if (navigator.share) {
          navigator.share({
            title: "Join Profenaa Technologies",
            text: shareText,
            url: window.location.origin
          }).catch(() => {});
        } else {
          if (navigator.clipboard && navigator.clipboard.writeText) {
            navigator.clipboard.writeText(shareText).then(() => {
              showToast("Share text copied to clipboard!", "success");
            });
          }
        }
      });
    }

    // Submit a friend's referral code (post-registration)
    const submitReferralBtn = document.getElementById("submitReferralBtn");
    const friendReferralInput = document.getElementById("friendReferralCode");
    const friendReferralError = document.getElementById("friendReferralError");
    function setFriendReferralError(msg) {
      if (!friendReferralError) return;
      friendReferralError.textContent = msg || "";
      friendReferralError.classList.toggle("show", !!msg);
      if (friendReferralInput) friendReferralInput.classList.toggle("invalid", !!msg);
    }
    if (submitReferralBtn && friendReferralInput) {
      friendReferralInput.addEventListener("input", () => setFriendReferralError(""));
      friendReferralInput.addEventListener("keydown", (e) => {
        if (e.key === "Enter") { e.preventDefault(); submitReferralBtn.click(); }
      });
      submitReferralBtn.addEventListener("click", async function () {
        if (submitReferralBtn.disabled) return;
        const referralCode = friendReferralInput.value.trim();
        if (!referralCode) {
          setFriendReferralError("Please enter a referral code.");
          return;
        }
        setFriendReferralError("");
        submitReferralBtn.disabled = true;
        submitReferralBtn.textContent = "Submitting...";
        try {
          await Api.referral.submitReferral({ referralCode });
          friendReferralInput.value = "";
          showToast("Referral submitted successfully.", "success");
          loadReferralData();
        } catch (err) {
          setFriendReferralError(err.message || "Couldn't submit the referral. Please try again.");
          if (err.isAuthError && typeof handleLoadError === "function") handleLoadError(err);
        } finally {
          submitReferralBtn.disabled = false;
          submitReferralBtn.textContent = "Submit Referral";
        }
      });
    }

    // ================================================================
    // JOB UPDATES (Student side)
    // ================================================================
    let jobUpdatesLoaded = false;

    function loadStudentJobUpdates() {
      if (jobUpdatesLoaded) return;
      jobUpdatesLoaded = true;
      loadStudentJobUpdatesData();
    }

    async function loadStudentJobUpdatesData() {
      const deptEl = document.getElementById("jobUpdatesDeptValue");
      const listEl = document.getElementById("jobUpdatesList");

      if (listEl) listEl.innerHTML = '<p style="color:var(--ink-soft); margin:0;">Loading job updates…</p>';

      try {
        const [meResp, jobsResp] = await Promise.all([
          apiRequest("/api/students/me", { auth: true }).catch(() => null),
          Api.jobUpdates.myList().catch(err => { throw err; })
        ]);

        if (deptEl) {
          const dept = (meResp && (meResp.department || meResp.branch || meResp.course)) ? (meResp.department || meResp.branch || meResp.course) : "General";
          deptEl.textContent = dept;
        }

        renderStudentJobUpdates(jobsResp || []);
      } catch (err) {
        console.error("[JobUpdates] Failed to load job updates:", err);
        if (listEl) {
          listEl.innerHTML = `
            <div class="empty-state">
              <div class="empty-icon">⚠️</div>
              <h4>Couldn't load job updates</h4>
              <p>${escapeHtml(err.message || "Please check your network and try again.")}</p>
            </div>
          `;
        }
        handleLoadError(err);
      }
    }

    function renderStudentJobUpdates(list) {
      const listEl = document.getElementById("jobUpdatesList");
      if (!listEl) return;

      if (!list || !list.length) {
        listEl.innerHTML = `
          <div class="empty-state">
            <div class="empty-icon">💼</div>
            <h4>No job updates found</h4>
            <p>There are no active job openings matching your department at this time. Check back later!</p>
          </div>
        `;
        return;
      }

      listEl.innerHTML = list.map(j => `
        <div class="panel-card job-update-card" style="margin-bottom:16px; border-left:4px solid var(--crimson);">
          <div style="display:flex; justify-content:space-between; align-items:flex-start; flex-wrap:wrap; gap:12px; margin-bottom:12px;">
            <div>
              <h3 style="margin:0 0 4px; font-size:1.15rem; color:var(--ink);">${escapeHtml(j.jobTitle || "Job Opportunity")}</h3>
              <div style="color:var(--crimson); font-weight:600; font-size:.95rem;">${escapeHtml(j.companyName || "")} ${j.designation ? " · " + escapeHtml(j.designation) : ""}</div>
            </div>
            <span class="status-badge approved"><span class="dot"></span>${escapeHtml(j.department || "All Departments")}</span>
          </div>

          <div class="job-update-meta">
            ${j.experience ? `<div class="job-update-meta-item"><span class="job-update-meta-label">Experience:</span> <span class="job-update-meta-value">${escapeHtml(j.experience)}</span></div>` : ""}
            ${j.location ? `<div class="job-update-meta-item"><span class="job-update-meta-label">Location:</span> <span class="job-update-meta-value">${escapeHtml(j.location)}</span></div>` : ""}
            ${j.softwareSkills ? `<div class="job-update-meta-item"><span class="job-update-meta-label">Skills:</span> <span class="job-update-meta-value">${escapeHtml(j.softwareSkills)}</span></div>` : ""}
          </div>

          ${j.jobDescription ? `
            <div style="margin-bottom:12px;">
              <b style="font-size:.88rem; color:var(--ink);">Job Description:</b>
              <p style="margin:4px 0 0; font-size:.9rem; color:var(--ink-soft); line-height:1.5; white-space:pre-line;">${escapeHtml(j.jobDescription)}</p>
            </div>
          ` : ""}

          ${j.eligibilityRequirements ? `
            <div style="margin-bottom:12px;">
              <b style="font-size:.88rem; color:var(--ink);">Eligibility Requirements:</b>
              <p style="margin:4px 0 0; font-size:.9rem; color:var(--ink-soft); line-height:1.5; white-space:pre-line;">${escapeHtml(j.eligibilityRequirements)}</p>
            </div>
          ` : ""}

          ${j.applicationInstructions ? `
            <div style="margin-bottom:12px;">
              <b style="font-size:.88rem; color:var(--ink);">Application Instructions:</b>
              <p style="margin:4px 0 0; font-size:.9rem; color:var(--ink-soft); line-height:1.5; white-space:pre-line;">${escapeHtml(j.applicationInstructions)}</p>
            </div>
          ` : ""}

          ${j.applicationLink ? `
            <div style="margin-top:16px; padding-top:12px; border-top:1px solid var(--line);">
              <a href="${escapeHtml(j.applicationLink)}" target="_blank" rel="noopener noreferrer" class="btn btn-primary btn-sm" style="display:inline-block; text-decoration:none;">Apply Now ↗</a>
            </div>
          ` : ""}
        </div>
      `).join("");
    }

    // ---------------- Helpers ----------------
    function statusBadge(status) {
      const map = {
        PRESENT: "present", ABSENT: "absent", LEAVE: "leave", NOT_MARKED: "not-marked",
        ACTIVE: "active", IDLE: "idle", LOGGED_OUT: "logged-out", EXPIRED: "expired",
        PENDING: "pending", APPROVED: "approved", REJECTED: "rejected",
        NOT_STARTED: "not-started", IN_PROGRESS: "in-progress", SUBMITTED: "submitted",
        UNDER_REVIEW: "under-review", REVISION_REQUIRED: "revision-required",
        COMPLETED: "completed", JOINED: "approved"
      };
      const cls = map[status] || "not-marked";
      const label = status ? status.replace(/_/g, " ") : "-";
      return `<span class="status-badge ${cls}"><span class="dot"></span>${escapeHtml(label)}</span>`;
    }

    function handleLoadError(err) {
      if (err.isAuthError) {
        // session-tracker.js's heartbeat will also catch this and show the overlay;
        // this covers the case where the very first page load already has a dead session.
        Auth.clear();
      }
    }

    function escapeHtml(str) {
      if (str == null) return "";
      return String(str)
        .replaceAll("&", "&amp;").replaceAll("<", "&lt;").replaceAll(">", "&gt;")
        .replaceAll('"', "&quot;").replaceAll("'", "&#039;");
    }

    // Load the first (Dashboard) section on page open
    loadDashboard();
  });

  // The certificate links point straight at the API, so we attach the JWT
  // as a query-friendly approach isn't possible with a plain <a> tag —
  // instead we intercept the click and fetch the file with the Authorization
  // header, then hand the browser a blob URL. UNCHANGED from the existing app.
  document.addEventListener("click", async function (e) {
    const link = e.target.closest("#viewCertBtn, #downloadCertBtn");
    if (!link) return;
    e.preventDefault();

    const mode = link.id === "viewCertBtn" ? "view" : "download";
    const studentId = Auth.getStudentId();

    try {
      const res = await fetch(`${API_BASE_URL}/api/certificates/${encodeURIComponent(studentId)}?mode=${mode}`, {
        headers: { Authorization: "Bearer " + Auth.getToken() }
      });
      if (!res.ok) throw new Error("Could not load certificate");

      // Pull the real filename (with its extension) out of Content-Disposition,
      // e.g. attachment; filename="certificate.pdf" - otherwise the downloaded
      // file has no extension and the OS won't know how to open it.
      const disposition = res.headers.get("Content-Disposition") || "";
      const match = disposition.match(/filename="?([^"]+)"?/);
      const fileName = match ? match[1] : "certificate";

      const blob = await res.blob();
      const url = URL.createObjectURL(blob);

      if (mode === "view") {
        window.open(url, "_blank");
      } else {
        const a = document.createElement("a");
        a.href = url;
        a.download = fileName;
        document.body.appendChild(a);
        a.click();
        a.remove();
      }
    } catch (err) {
      showToast(err.message, "error");
    }
  });