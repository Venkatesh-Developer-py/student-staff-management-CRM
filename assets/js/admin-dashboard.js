document.addEventListener("DOMContentLoaded", function () {
  Auth.requireAdminOrTrainer("admin-login.html");

  // Available modules configurable for Trainers
  const AVAILABLE_PERMISSIONS = [
    { code: "DASHBOARD", label: "CRM Dashboard", icon: "📊", desc: "CRM analytics, department cards and student 360 overview", sectionId: "section-dashboard" },
    { code: "STUDENTS", label: "Registered Users", icon: "📋", desc: "View registered students and details", sectionId: "section-students" },
    { code: "PROJECTS", label: "My Projects", icon: "💻", desc: "Review and evaluate student project submissions", sectionId: "section-projects" },
    { code: "ATTENDANCE", label: "Attendance", icon: "🗓️", desc: "Mark and review student attendance", sectionId: "section-attendance" },
    { code: "ASSIGN_CERTIFICATE", label: "Assign Certificate", icon: "🎓", desc: "Upload and assign student certificates", sectionId: "section-assign" },
    { code: "SKILL_SCORES", label: "Student Skill Scores", icon: "📊", desc: "Mock Interview analytics and skill scores", sectionId: "section-scores" },
    { code: "LOGIN_ACTIVITY", label: "Login & Activity", icon: "🔐", desc: "Student website sessions and login history", sectionId: "section-sessions" },
    { code: "LEAVE_MANAGEMENT", label: "Leave Management", icon: "📝", desc: "Approve or reject student leave requests", sectionId: "section-leave" },
    { code: "NOTIFICATIONS", label: "Notifications", icon: "🔔", desc: "System activity and notifications", sectionId: "section-notifications" },
    { code: "REFERRALS", label: "Referral Activity", icon: "🎁", desc: "Track student referral history", sectionId: "section-referrals" },
    { code: "JOB_UPDATES", label: "Recent Job Updates", icon: "💼", desc: "View and post job openings for the HOD's department", sectionId: "section-job-updates" },
    { code: "MEETING_UPDATES", label: "CEO Meeting Updates", icon: "📢", desc: "View and manage CEO meeting announcements", sectionId: "section-meeting-updates" }
    // NOTE: "Trainers" (section-trainers) is intentionally NOT configurable - Trainer
    // account management stays Admin-only (backend: /api/admin/trainers/** = ROLE_ADMIN).
  ];

  // "Electronics CAD" and "Electronic CAD" are the same department (same equivalence as deptMatch()).
  function normDept(d) {
    return String(d || "").trim().toLowerCase().replace(/\s+/g, " ").replace("electronics", "electronic");
  }

  const PERMISSION_TO_SECTION = {};
  AVAILABLE_PERMISSIONS.forEach(p => {
    PERMISSION_TO_SECTION[p.code] = p.sectionId;
  });

  const IS_TRAINER = Auth.isTrainer();
  const trainerPermissions = IS_TRAINER ? (Auth.getPermissions() || []) : [];
  const trainerAllowedSections = IS_TRAINER
    ? trainerPermissions.map(code => PERMISSION_TO_SECTION[code]).filter(Boolean)
    : [];

  document.getElementById("adminNameLabel").textContent = Auth.getName() || (IS_TRAINER ? "HOD" : "Admin");

  if (IS_TRAINER) {
    document.querySelector(".admin-topbar h2").textContent = "HOD Dashboard";
    // Show the assigned department (display only - the backend enforces the data scope).
    const trainerDept = Auth.getDepartment();
    if (trainerDept) {
      document.getElementById("adminNameLabel").textContent =
        (Auth.getName() || "HOD") + " · " + trainerDept;
      // A Trainer can only post jobs for their own department.
      const jobDeptSelect = document.getElementById("jobUpdateDepartment");
      if (jobDeptSelect) {
        Array.from(jobDeptSelect.options).forEach(function (opt) {
          if (opt.value && normDept(opt.value) !== normDept(trainerDept)) opt.remove();
        });
      }
    } else {
      setTimeout(function () {
        showToast("Department not assigned. Please ask the administrator to assign your department.", "error");
      }, 300);
    }
    // Hide every nav item except permitted sections
    document.querySelectorAll(".nav-item[data-section]").forEach(function (item) {
      if (!trainerAllowedSections.includes(item.dataset.section)) {
        item.style.display = "none";
      }
    });
    // Ensure Trainer lands on the first permitted section or no-access section
    setTimeout(function () {
      if (trainerAllowedSections.length > 0) {
        goToSection(trainerAllowedSections[0]);
      } else {
        goToSection("section-no-access");
      }
    }, 0);
  }

  function resolveMediaUrl(url) {
    if (!url) return "";
    const raw = String(url).trim();
    if (/^https?:\/\//i.test(raw) || raw.startsWith("data:") || raw.startsWith("blob:")) {
      return raw;
    }
    const base = (typeof API_BASE_URL !== "undefined" && API_BASE_URL) ? API_BASE_URL.replace(/\/+$/, "") : "";
    return base + (raw.startsWith("/") ? raw : "/" + raw);
  }

  if (typeof PushNotifications !== "undefined" && !IS_TRAINER) {
    PushNotifications.init({
      role: "ADMIN",
      registerUrl: "/api/admin/push/register-token",
      unregisterUrl: "/api/admin/push/unregister-token",
      onForegroundMessage: function () {
        if (typeof loadAdminNotifications === "function") loadAdminNotifications();
      }
    });
  }

  document.getElementById("logoutBtn").addEventListener("click", async function () {
    if (typeof PushNotifications !== "undefined" && !IS_TRAINER) {
      await PushNotifications.unregisterOnLogout("/api/admin/push/unregister-token");
    }
    Auth.clear();
    window.location.href = "admin-login.html";
  });

  // ---------------- Mobile sidebar drawer ----------------
  const adminSidebar = document.getElementById("adminSidebar");
  const adminSidebarBackdrop = document.getElementById("adminSidebarBackdrop");
  const adminSidebarToggleBtn = document.getElementById("adminSidebarToggleBtn");

  function openAdminSidebar() {
    if (!adminSidebar) return;
    adminSidebar.classList.add("open");
    if (adminSidebarBackdrop) adminSidebarBackdrop.classList.add("show");
    if (adminSidebarToggleBtn) {
      adminSidebarToggleBtn.setAttribute("aria-expanded", "true");
      adminSidebarToggleBtn.setAttribute("aria-label", "Close admin menu");
    }
  }
  function closeAdminSidebar() {
    if (!adminSidebar) return;
    adminSidebar.classList.remove("open");
    if (adminSidebarBackdrop) adminSidebarBackdrop.classList.remove("show");
    if (adminSidebarToggleBtn) {
      adminSidebarToggleBtn.setAttribute("aria-expanded", "false");
      adminSidebarToggleBtn.setAttribute("aria-label", "Open admin menu");
    }
  }
  if (adminSidebarToggleBtn) {
    adminSidebarToggleBtn.addEventListener("click", function () {
      if (adminSidebar.classList.contains("open")) {
        closeAdminSidebar();
      } else {
        openAdminSidebar();
      }
    });
  }
  if (adminSidebarBackdrop) {
    adminSidebarBackdrop.addEventListener("click", closeAdminSidebar);
  }

  // ================================================================
  // Generic client-side search + pagination (exactly 6 records/page)
  // Used by every admin list/table section below. Filtering happens
  // against the already-loaded dataset, THEN the result is sliced into
  // pages of 6 - so search and pagination always agree with each other.
  // ================================================================
  const LIST_PAGE_SIZE = 6;

  function matchesSearch(row, fields, rawQuery) {
    const q = (rawQuery || "").trim().toLowerCase();
    if (!q) return true;
    return fields.some(function (getVal) {
      const val = getVal(row);
      return val !== null && val !== undefined && String(val).toLowerCase().includes(q);
    });
  }

  function paginateRows(rows, page) {
    const totalPages = Math.max(1, Math.ceil(rows.length / LIST_PAGE_SIZE));
    const safePage = Math.min(Math.max(page, 0), totalPages - 1);
    const start = safePage * LIST_PAGE_SIZE;
    return { pageRows: rows.slice(start, start + LIST_PAGE_SIZE), page: safePage, totalPages };
  }

  function renderPager(el, page, totalPages, onPrev, onNext) {
    if (!el) return;
    if (totalPages <= 1) { el.innerHTML = ""; el.style.display = "none"; return; }
    el.style.display = "flex";
    el.innerHTML = `
      <button type="button" class="btn-outline btn btn-sm pager-prev-btn">&larr; Previous</button>
      <span class="pager-label">Page ${page + 1}</span>
      <button type="button" class="btn-outline btn btn-sm pager-next-btn">Next &rarr;</button>
    `;
    const prevBtn = el.querySelector(".pager-prev-btn");
    const nextBtn = el.querySelector(".pager-next-btn");
    prevBtn.disabled = page === 0;
    nextBtn.disabled = page >= totalPages - 1;
    prevBtn.addEventListener("click", onPrev);
    nextBtn.addEventListener("click", onNext);
  }

  // ---------------- Sidebar navigation ----------------
  const navItems = document.querySelectorAll(".nav-item[data-section]");
  const sections = document.querySelectorAll(".admin-section");

  function setActiveSection(target) {
    navItems.forEach(i => i.classList.toggle("active", i.dataset.section === target));
    sections.forEach(s => s.classList.toggle("active", s.id === target));
  }

  function goToSection(target) {
    // Defense in depth: a Trainer session only renders their assigned sections
    if (IS_TRAINER) {
      if (trainerAllowedSections.length === 0) {
        target = "section-no-access";
      } else if (!trainerAllowedSections.includes(target)) {
        target = trainerAllowedSections[0];
      }
    }
    setActiveSection(target);
    if (target === "section-dashboard") loadDashboardCRM();
    if (target === "section-students") loadStudents();
    if (target === "section-placements") loadPlacements();
    if (target === "section-assign") loadAssignList();
    if (target === "section-scores") loadScores();
    if (target === "section-attendance") loadAttendanceSection();
    if (target === "section-sessions") loadSessionsSection();
    if (target === "section-leave") loadLeaveSection();
    if (target === "section-projects") loadProjectsSection();
    if (target === "section-notifications") loadAdminNotifications();
    if (target === "section-referrals") loadAdminReferrals();
    if (target === "section-job-updates") loadAdminJobUpdates();
    if (target === "section-meeting-updates") loadAdminMeetingUpdates();
    if (target === "section-trainers") loadTrainers();
  }

  navItems.forEach(item => {
    item.addEventListener("click", function () {
      goToSection(this.dataset.section);

      // Mobile only effect
      closeAdminSidebar();
    });
  });

  // ================================================================
  // 0) CRM DASHBOARD & DEPARTMENT ANALYTICS
  // ================================================================
  const DEPARTMENTS = [
    { name: "Mechanical CAD", icon: "⚙️", code: "MECHANICAL_CAD", desc: "SolidWorks, AutoCAD Mechanical, CATIA, Creo" },
    { name: "Civil CAD", icon: "🏗️", code: "CIVIL_CAD", desc: "Revit, AutoCAD Civil, STAAD.Pro, 3ds Max" },
    { name: "Electrical CAD", icon: "⚡", code: "ELECTRICAL_CAD", desc: "AutoCAD Electrical, EPLAN, Circuit Simulation" },
    { name: "Electronic CAD", icon: "🔌", code: "ELECTRONIC_CAD", desc: "PCB Design, Altium, Embedded Systems, VLSI" },
    { name: "Arts and Multimedia", icon: "🎨", code: "ARTS_AND_MULTIMEDIA", desc: "Photoshop, Illustrator, Premiere, 3D Animation" },
    { name: "Computer Science / IT", icon: "💻", code: "COMPUTER_SCIENCE_IT", desc: "Full Stack, Java, Python, Web Dev, Cloud" }
  ];

  let crmStudents = [];
  let crmDeptFilter = null;
  let crmDeptPage = 0;
  let crmMockSummary = {};
  let crmAttendanceSummary = {};
  let crmTodayAttendance = [];
  let crmProjects = [];

  const crmDepartmentCardsEl = document.getElementById("crmDepartmentCards");
  const crmDeptRosterView = document.getElementById("crmDeptRosterView");
  const crmDeptStudentsTableBody = document.querySelector("#crmDeptStudentsTable tbody");
  const crmDeptStudentsPagerEl = document.getElementById("crmDeptStudentsPager");
  const deptStudentSearchInput = document.getElementById("deptStudentSearch");
  const closeDeptRosterBtn = document.getElementById("closeDeptRosterBtn");
  const refreshDashboardBtn = document.getElementById("refreshDashboardBtn");
  const deptDistributionBars = document.getElementById("deptDistributionBars");
  const deptPerformanceBars = document.getElementById("deptPerformanceBars");
  const lifecyclePipelineFlow = document.getElementById("lifecyclePipelineFlow");

  async function loadDashboardCRM() {
    try {
      // 1. Fetch Students
      crmStudents = await apiRequest("/api/admin/students", { auth: true }) || [];
      allStudents = crmStudents; // sync with registered users

      // 2. Fetch Mock Interview Category Summaries
      try {
        const mockSummaryList = await Api.mockInterview.adminCategorySummary();
        crmMockSummary = {};
        (mockSummaryList || []).forEach(row => { crmMockSummary[row.category] = row; });
      } catch (e) {
        crmMockSummary = {};
      }

      // 3. Fetch Today's Attendance
      try {
        crmAttendanceSummary = await Api.attendance.adminSummary(todayIso()) || {};
        crmTodayAttendance = await Api.attendance.adminForDate(todayIso(), "") || [];
      } catch (e) {
        crmAttendanceSummary = {};
        crmTodayAttendance = [];
      }

      // 4. Fetch Projects
      try {
        crmProjects = await Api.projects.adminList({}) || [];
      } catch (e) {
        crmProjects = [];
      }

      // Render all components
      renderCrmKpiCards();
      renderBranchDistribution();
      renderCrmDepartmentCards();
      renderCrmCharts();
      renderLifecyclePipeline();

      if (crmDeptFilter) {
        renderDeptRosterPage();
      }

      // Login summary cards: filled by the SAME loader/calculation as Login & Activity.
      const dashSummary = document.getElementById("dashLoginSummary");
      if (!IS_TRAINER || trainerPermissions.includes("LOGIN_ACTIVITY")) {
        if (dashSummary) dashSummary.style.display = "";
        loadSessionsData();
      } else if (dashSummary) {
        dashSummary.style.display = "none"; // this Trainer has no Login & Activity access
      }
    } catch (err) {
      showToast("Error loading CRM data: " + err.message, "error");
    }
  }

  async function renderBranchDistribution() {
    const container = document.getElementById("crmBranchDistributionCards");
    if (!container) return;

    let branchList = [];
    try {
      branchList = await Api.students.adminBranchDistribution() || [];
    } catch (e) {
      const branches = ["Kinathukadavu", "Pollachi", "Coimbatore", "Udumalaipettai", "Dindigul", "Thirunelveli"];
      const total = crmStudents.length || 1;
      branchList = branches.map(b => {
        const count = crmStudents.filter(s => (s.branch || "").toLowerCase() === b.toLowerCase()).length;
        return { branch: b, studentCount: count, percentage: Math.round((count * 100) / total) };
      });
    }

    if (!branchList.length) {
      container.innerHTML = `<p style="color:var(--ink-soft); font-size:.85rem;">No branch records found.</p>`;
      return;
    }

    container.innerHTML = branchList.map(b => `
      <div class="crm-branch-card">
        <div class="crm-branch-card-name">📍 ${escapeHtml(b.branch)}</div>
        <div class="crm-branch-card-count">${b.studentCount}</div>
        <div class="crm-branch-card-pct">${b.percentage}% of total students</div>
      </div>
    `).join("");
  }

  async function renderTodayLogins() {
    // One fetch, rendered into every Today Logins block (Dashboard + Login & Activity),
    // so both always show the same backend data.
    const targets = [
      ["sessionTodayLoginsCards", "sessionTodayLoginsTotal"]
    ].map(([c, t]) => [document.getElementById(c), document.getElementById(t)])
     .filter(([c, t]) => c && t);
    if (!targets.length) return;

    try {
      const data = await Api.students.adminTodayLogins() || {};
      const branches = data.branches || [];
      const cardsHtml = branches.map(b => `
        <div class="crm-branch-card">
          <div class="crm-branch-card-name">📍 ${escapeHtml(b.branch)}</div>
          <div class="crm-branch-card-count">${b.uniqueStudents}</div>
          <div class="crm-branch-card-pct">${b.uniqueStudents === 1 ? "Student" : "Students"} (unique today)</div>
          <button type="button" class="tl-view-btn" data-today-branch="${escapeHtml(b.branch)}"
                  aria-label="View students who logged in today at ${escapeHtml(b.branch)}">
            ${TL_EYE_SVG}<span>View Students</span>
          </button>
        </div>
      `).join("");
      targets.forEach(([container, totalEl]) => {
        container.innerHTML = cardsHtml;
        totalEl.textContent = data.totalUniqueStudents != null ? data.totalUniqueStudents : 0;
      });
    } catch (e) {
      targets.forEach(([container, totalEl]) => {
        container.innerHTML = `<p style="color:var(--ink-soft); font-size:.85rem;">Could not load today's login data.</p>`;
        totalEl.textContent = "—";
      });
    }
  }

  // ---- Today Logins: "View Students" modal ----
  // Read-only. The card counts above are untouched. Listeners are bound once (event
  // delegation on the cards container), so re-rendering on Refresh never stacks handlers.
  // The student list is fetched fresh on every open and never cached.
  const TL_EYE_SVG = `<svg class="tl-icon" viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M1 12s4-7.5 11-7.5S23 12 23 12s-4 7.5-11 7.5S1 12 1 12z"/><circle cx="12" cy="12" r="3.2" fill="currentColor"/></svg>`;
  const TL_USERS_SVG = `<svg class="tl-icon" viewBox="0 0 24 24" width="22" height="22" fill="currentColor" aria-hidden="true"><circle cx="9" cy="8" r="3.4"/><path d="M2.5 19c0-3.4 2.9-5.6 6.5-5.6s6.5 2.2 6.5 5.6v.6h-13z"/><circle cx="17.2" cy="9" r="2.6"/><path d="M16.6 13.6c3 .1 5 1.9 5 4.6v.6h-4.1c0-1.9-.5-3.5-1.5-4.7z"/></svg>`;
  let todayLoginsRequestSeq = 0;

  function ensureTodayLoginsStyles() {
    if (document.getElementById("todayLoginsStylesheet")) return;
    const link = document.createElement("link");
    link.id = "todayLoginsStylesheet";
    link.rel = "stylesheet";
    link.href = "assets/css/today-logins.css";
    document.head.appendChild(link);
  }

  // Rebuilds the inside of the existing #todayLoginsModal box, keeping the same overlay
  // element and the same ids (todayLoginsModalTitle / Body / Close) the page already uses.
  function ensureTodayLoginsModalMarkup() {
    const modal = document.getElementById("todayLoginsModal");
    const box = modal && modal.querySelector(".modal-box");
    if (!box) return false;
    if (box.dataset.tlBuilt) return true;
    box.dataset.tlBuilt = "1";
    box.classList.add("tl-modal-box");
    box.innerHTML = `
      <div class="tl-head">
        <div class="tl-head-icon">${TL_USERS_SVG}</div>
        <div class="tl-head-text">
          <h3 id="todayLoginsModalTitle">Today Logins</h3>
          <p class="tl-sub">Students who logged in at least once today (unique students).</p>
        </div>
        <button type="button" class="tl-x-btn" id="todayLoginsModalClose" aria-label="Close">✕</button>
      </div>
      <div id="todayLoginsModalBody" class="tl-body"></div>
      <div class="tl-foot">
        <div class="tl-total"><span class="tl-head-icon tl-total-icon">${TL_USERS_SVG}</span>
          <span>Total Students: <b id="todayLoginsModalTotal">—</b></span></div>
        <button type="button" class="tl-close-btn" id="todayLoginsModalDone">✕ Close</button>
      </div>`;
    return true;
  }

  function closeTodayLoginsModal() {
    const modal = document.getElementById("todayLoginsModal");
    if (modal) modal.style.display = "none";
    todayLoginsRequestSeq++; // ignore any response still in flight
  }

  async function openTodayLoginsModal(branch) {
    const modal = document.getElementById("todayLoginsModal");
    if (!modal || !ensureTodayLoginsModalMarkup()) return;
    const title = document.getElementById("todayLoginsModalTitle");
    const body = document.getElementById("todayLoginsModalBody");
    const totalEl = document.getElementById("todayLoginsModalTotal");

    const seq = ++todayLoginsRequestSeq;
    title.textContent = "Today Logins — " + branch;
    totalEl.textContent = "—";
    body.innerHTML = `<p class="tl-state">Loading students…</p>`;
    modal.style.display = "flex";

    try {
      const data = await Api.students.adminTodayLoginStudents(branch) || {};
      if (seq !== todayLoginsRequestSeq) return; // closed, or another branch opened meanwhile

      // Defensive de-dup: one student = one row, so the footer total always equals the rows shown.
      const seen = new Set();
      const students = [];
      (data.students || []).forEach(s => {
        const key = String(s.studentId || s.email || "").trim().toLowerCase();
        if (key && seen.has(key)) return;
        if (key) seen.add(key);
        students.push(s);
      });

      totalEl.textContent = students.length;
      if (!students.length) {
        body.innerHTML = `<p class="tl-state">No students logged in today.</p>`;
        return;
      }
      body.innerHTML = `
        <div class="tl-table-wrap">
          <table class="tl-table">
            <thead><tr><th>Student ID</th><th>Name</th><th>Email</th><th>Department</th><th>Course</th></tr></thead>
            <tbody>
              ${students.map(s => `
                <tr>
                  <td>${escapeHtml(s.studentId || "-")}</td>
                  <td>${escapeHtml(s.fullName || s.name || "-")}</td>
                  <td>${escapeHtml(s.email || "-")}</td>
                  <td>${escapeHtml(s.department || "-")}</td>
                  <td>${escapeHtml(s.course || "-")}</td>
                </tr>`).join("")}
            </tbody>
          </table>
        </div>`;
    } catch (e) {
      if (seq !== todayLoginsRequestSeq) return;
      totalEl.textContent = "—";
      body.innerHTML = `<p class="tl-state tl-error">Could not load students. ${escapeHtml(e && e.message ? e.message : "")}</p>`;
    }
  }

  function initTodayLoginsModal() {
    const modal = document.getElementById("todayLoginsModal");
    if (!modal) return;

    // Same View Students handler on every Today Logins block (bound once per block).
    ["sessionTodayLoginsCards"].forEach(id => {
      const c = document.getElementById(id);
      if (!c || c.dataset.todayBound) return;
      c.dataset.todayBound = "1";
      c.addEventListener("click", (e) => {
        const btn = e.target.closest(".tl-view-btn");
        if (btn) openTodayLoginsModal(btn.dataset.todayBranch);
      });
    });

    if (modal.dataset.todayBound) return;
    modal.dataset.todayBound = "1";

    ensureTodayLoginsStyles();
    ensureTodayLoginsModalMarkup();

    modal.addEventListener("click", (e) => {
      if (e.target === modal || e.target.closest("#todayLoginsModalClose, #todayLoginsModalDone")) closeTodayLoginsModal();
    });
    document.addEventListener("keydown", (e) => {
      if (e.key === "Escape" && modal.style.display !== "none") closeTodayLoginsModal();
    });
  }

  function renderCrmKpiCards() {
    const total = crmStudents.length;
    const issuedCerts = crmStudents.filter(s => s.certificateStatus === "ISSUED").length;
    const certPercent = total > 0 ? Math.round((issuedCerts * 100) / total) : 0;

    // Overall Attendance Rate: present / (present + absent + leave)
    const p = crmAttendanceSummary.present || 0;
    const a = crmAttendanceSummary.absent || 0;
    const l = crmAttendanceSummary.leave || 0;
    const totalMarked = p + a + l;
    const avgAtt = totalMarked > 0 ? Math.round((p * 100) / totalMarked) : (total > 0 ? 88 : 0);

    // Mock Interview total attempted count across all categories
    let totalMockAttempts = 0;
    Object.values(crmMockSummary).forEach(cat => {
      totalMockAttempts += (cat.attemptCount || 0);
    });
    const mockRate = total > 0 ? Math.min(100, Math.round((totalMockAttempts * 100) / total)) : 0;

    // Projects completed count
    const approvedProjects = crmProjects.filter(prj => prj.status === "APPROVED").length;

    // Update DOM
    const kpiTotal = document.getElementById("kpiTotalStudents");
    const kpiAtt = document.getElementById("kpiAvgAttendance");
    const kpiMock = document.getElementById("kpiMockInterviewRate");
    const kpiMockSub = document.getElementById("kpiMockCountSub");
    const kpiProj = document.getElementById("kpiProjectsRate");
    const kpiProjSub = document.getElementById("kpiProjectsSub");
    const kpiCert = document.getElementById("kpiCertificatesIssued");
    const kpiCertSub = document.getElementById("kpiCertRateSub");

    if (kpiTotal) kpiTotal.textContent = total;
    if (kpiAtt) kpiAtt.textContent = avgAtt + "%";
    if (kpiMock) kpiMock.textContent = mockRate + "%";
    if (kpiMockSub) kpiMockSub.textContent = totalMockAttempts + " Completed";
    if (kpiProj) kpiProj.textContent = approvedProjects;
    if (kpiProjSub) kpiProjSub.textContent = crmProjects.length + " Total Assigned";
    if (kpiCert) kpiCert.textContent = issuedCerts;
    if (kpiCertSub) kpiCertSub.textContent = certPercent + "% Certified";
  }

  function renderCrmDepartmentCards() {
    if (!crmDepartmentCardsEl) return;
    const totalStudents = crmStudents.length;

    crmDepartmentCardsEl.innerHTML = DEPARTMENTS.map(dept => {
      const deptStudents = crmStudents.filter(s => deptMatch(s, dept.name));
      const count = deptStudents.size || deptStudents.length;

      // Mock Interview stats for this dept
      const mockInfo = crmMockSummary[dept.name] || {};
      const mockAttempts = mockInfo.attemptCount || 0;
      const mockAvg = Math.round(mockInfo.avgPercentage || 0);

      // Attendance for this dept
      const deptAttList = crmTodayAttendance.filter(att => deptStudents.some(s => s.studentId === att.studentId));
      const presentCount = deptAttList.filter(x => x.status === "PRESENT").length;
      const markedCount = deptAttList.filter(x => x.status !== "NOT_MARKED").length;
      const attPct = markedCount > 0 ? Math.round((presentCount * 100) / markedCount) : (count > 0 ? 86 : 0);

      const isSelected = crmDeptFilter === dept.name;

      return `
        <div class="dept-crm-card ${isSelected ? 'active' : ''}" data-dept-name="${escapeHtml(dept.name)}">
          <div class="dept-crm-card-header">
            <div class="dept-icon-box">${dept.icon}</div>
            <div class="dept-crm-title-area">
              <h4 class="dept-crm-title">${escapeHtml(dept.name)}</h4>
              <p class="dept-crm-sub">${escapeHtml(dept.desc.split(',')[0])}</p>
            </div>
          </div>

          <div class="dept-student-badge">
            ${count} <small>Students Registered</small>
          </div>

          <div class="dept-metrics-row">
            <div class="dept-metric-item">
              <span class="dept-metric-label">Avg Attendance</span>
              <span class="dept-metric-val" style="color:var(--good);">${attPct}%</span>
            </div>
            <div class="dept-metric-item">
              <span class="dept-metric-label">Mock Interview</span>
              <span class="dept-metric-val" style="color:var(--crimson);">${mockAttempts} Done ${mockAvg > 0 ? `(${mockAvg}%)` : ''}</span>
            </div>
          </div>

          <button type="button" class="dept-card-footer-btn" data-dept-btn="${escapeHtml(dept.name)}">
            <span>${isSelected ? 'Viewing Students' : 'View Students'}</span>
            <span>&rarr;</span>
          </button>
        </div>
      `;
    }).join("");

    // Wire up department card clicks
    crmDepartmentCardsEl.querySelectorAll(".dept-crm-card").forEach(card => {
      card.addEventListener("click", function () {
        const deptName = this.dataset.deptName;
        openDepartmentRoster(deptName);
      });
    });
  }

  function deptMatch(studentOrCourse, deptName) {
    if (!studentOrCourse || !deptName) return false;
    let a = "";
    if (typeof studentOrCourse === "object") {
      a = ((studentOrCourse.department || "") + " " + (studentOrCourse.course || "")).trim().toLowerCase();
    } else {
      a = String(studentOrCourse).trim().toLowerCase();
    }
    let b = String(deptName).trim().toLowerCase();
    a = a.replace(/electronics/g, "electronic");
    b = b.replace(/electronics/g, "electronic");
    return a === b || a.includes(b) || b.includes(a);
  }

  function openDepartmentRoster(deptName) {
    crmDeptFilter = deptName;
    crmDeptPage = 0;
    if (deptStudentSearchInput) deptStudentSearchInput.value = "";

    // Highlight active card
    if (crmDepartmentCardsEl) {
      crmDepartmentCardsEl.querySelectorAll(".dept-crm-card").forEach(card => {
        card.classList.toggle("active", card.dataset.deptName === deptName);
      });
    }

    const deptObj = DEPARTMENTS.find(d => d.name === deptName) || { name: deptName, icon: "🏢" };
    const deptFilterIcon = document.getElementById("deptFilterIcon");
    const deptFilterTitle = document.getElementById("deptFilterTitle");
    const deptFilterCount = document.getElementById("deptFilterCount");

    if (deptFilterIcon) deptFilterIcon.textContent = deptObj.icon;
    if (deptFilterTitle) deptFilterTitle.textContent = deptName + " Students";

    const count = crmStudents.filter(s => deptMatch(s, deptName)).length;
    if (deptFilterCount) deptFilterCount.textContent = `${count} student${count === 1 ? '' : 's'} enrolled in this department`;

    if (crmDeptRosterView) {
      crmDeptRosterView.style.display = "block";
      crmDeptRosterView.scrollIntoView({ behavior: "smooth", block: "nearest" });
    }

    renderDeptRosterPage();
  }

  function closeDepartmentRoster() {
    crmDeptFilter = null;
    crmDeptPage = 0;
    if (crmDeptRosterView) crmDeptRosterView.style.display = "none";
    if (crmDepartmentCardsEl) {
      crmDepartmentCardsEl.querySelectorAll(".dept-crm-card").forEach(c => c.classList.remove("active"));
    }
  }

  if (closeDeptRosterBtn) closeDeptRosterBtn.addEventListener("click", closeDepartmentRoster);
  if (refreshDashboardBtn) {
    refreshDashboardBtn.addEventListener("click", async function () {
      refreshDashboardBtn.disabled = true;
      refreshDashboardBtn.textContent = "Refreshing…";
      await loadDashboardCRM();
      showToast("CRM Dashboard updated with live data", "success");
      refreshDashboardBtn.disabled = false;
      refreshDashboardBtn.textContent = "🔄 Refresh Data";
    });
  }

  // Shared Excel download helper (Bearer-authenticated). Used by:
  //  - Registered Users -> Export Registered Users (Excel)
  //  - Placements -> Applied Companies -> Export Applied Companies (Excel)
  async function downloadAdminExcel(btn, path, params, fileBase, okMessage, emptyPattern) {
    const originalText = btn.innerHTML;
    try {
      btn.disabled = true;
      btn.innerHTML = "⏳ Generating Excel…";
      const token = Auth.getToken();
      const base = (typeof API_BASE_URL !== "undefined" && API_BASE_URL) ? API_BASE_URL.replace(/\/+$/, "") : "";
      const qs = params ? ("?" + new URLSearchParams(params).toString()) : "";
      const res = await fetch(base + path + qs, {
        headers: {
          "Authorization": token ? ("Bearer " + token) : ""
        }
      });
      if (!res.ok) {
        let errJson = null;
        try { errJson = await res.json(); } catch (_) {}
        throw new Error((errJson && errJson.message) || ("Failed to export Excel. HTTP Status: " + res.status));
      }
      const blob = await res.blob();
      const url = window.URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `${fileBase}_${new Date().toISOString().slice(0, 10)}.xlsx`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      window.URL.revokeObjectURL(url);
      showToast(okMessage, "success");
    } catch (err) {
      console.error("Excel export error:", err);
      const msg = err.message || "Unknown error";
      // "No ... found for the selected filters" is a normal outcome, not a failure to export.
      showToast(emptyPattern && emptyPattern.test(msg) ? msg : ("Failed to export Excel: " + msg), "error");
    } finally {
      btn.disabled = false;
      btn.innerHTML = originalText;
    }
  }

  function renderDeptRosterPage() {
    if (!crmDeptStudentsTableBody) return;
    const deptStudents = crmStudents.filter(s => !crmDeptFilter || deptMatch(s, crmDeptFilter));

    const filtered = deptStudents.filter(r => matchesSearch(r, [
      x => x.studentId, x => x.fullName, x => x.email, x => x.course, x => x.department
    ], deptStudentSearchInput ? deptStudentSearchInput.value : ""));

    const { pageRows, page, totalPages } = paginateRows(filtered, crmDeptPage);
    crmDeptPage = page;
    renderDeptRosterTable(pageRows);
    renderPager(crmDeptStudentsPagerEl, crmDeptPage, totalPages,
      function () { if (crmDeptPage > 0) { crmDeptPage--; renderDeptRosterPage(); } },
      function () { crmDeptPage++; renderDeptRosterPage(); }
    );
  }

  function renderDeptRosterTable(rows) {
    if (!rows.length) {
      crmDeptStudentsTableBody.innerHTML = `<tr class="empty-row"><td colspan="7">No students found in this department.</td></tr>`;
      return;
    }
    crmDeptStudentsTableBody.innerHTML = rows.map(s => {
      const issued = s.certificateStatus === "ISSUED";
      // Find today's attendance status if available
      const attRecord = crmTodayAttendance.find(a => a.studentId === s.studentId);
      const attStatus = attRecord ? attRecord.status : "NOT_MARKED";

      return `
        <tr class="clickable-student-row" data-view-student="${s.studentId}">
          <td data-label="Student">
            <b>${escapeHtml(s.fullName)}</b><br>
            <code class="login-id-badge">${escapeHtml(s.studentId)}</code>
          </td>
          <td data-label="Course / Dept">${escapeHtml(s.course || s.department || "-")}</td>
          <td data-label="Attendance %">
            ${statusBadge(attStatus)}
          </td>
          <td data-label="Mock Score">
            <span style="font-weight:700; color:var(--crimson-dark);">Mock Interview &rarr;</span>
          </td>
          <td data-label="Projects">
            <span style="font-size:.82rem; color:var(--ink-soft);">Active</span>
          </td>
          <td data-label="Certificate">
            <span class="pill ${issued ? 'pill-issued' : 'pill-pending'}">${issued ? 'Issued' : 'Pending'}</span>
          </td>
          <td data-label="Action">
            <button type="button" class="btn btn-primary btn-sm" data-view-student="${s.studentId}">
              🔍 360° Profile
            </button>
          </td>
        </tr>
      `;
    }).join("");
  }

  if (deptStudentSearchInput) {
    deptStudentSearchInput.addEventListener("input", debounce(() => {
      crmDeptPage = 0;
      renderDeptRosterPage();
    }, 300));
  }

  function renderCrmCharts() {
    const total = Math.max(1, crmStudents.length);

    // 1. Department Distribution Bars
    if (deptDistributionBars) {
      deptDistributionBars.innerHTML = DEPARTMENTS.map(dept => {
        const count = crmStudents.filter(s => deptMatch(s, dept.name)).length;
        const pct = Math.round((count * 100) / total);
        return `
          <div class="dept-bar-item">
            <div class="dept-bar-header">
              <b>${dept.icon} ${escapeHtml(dept.name)}</b>
              <span>${count} students (${pct}%)</span>
            </div>
            <div class="dept-bar-track">
              <div class="dept-bar-fill" style="width:${pct}%;"></div>
            </div>
          </div>
        `;
      }).join("");
    }

    // 2. Department Performance Benchmarks
    if (deptPerformanceBars) {
      deptPerformanceBars.innerHTML = DEPARTMENTS.map(dept => {
        const deptStudents = crmStudents.filter(s => deptMatch(s, dept.name));
        const count = deptStudents.length;

        const mockInfo = crmMockSummary[dept.name] || {};
        const mockAvg = Math.round(mockInfo.avgPercentage || 0);

        const deptAttList = crmTodayAttendance.filter(att => deptStudents.some(s => s.studentId === att.studentId));
        const presentCount = deptAttList.filter(x => x.status === "PRESENT").length;
        const markedCount = deptAttList.filter(x => x.status !== "NOT_MARKED").length;
        const attPct = markedCount > 0 ? Math.round((presentCount * 100) / markedCount) : (count > 0 ? 85 : 0);

        return `
          <div class="dept-bar-item">
            <div class="dept-bar-header">
              <b>${dept.icon} ${escapeHtml(dept.name)}</b>
              <span>Att: <b style="color:var(--good);">${attPct}%</b> · Mock Score: <b style="color:var(--crimson);">${mockAvg > 0 ? mockAvg + '%' : '—'}</b></span>
            </div>
            <div class="dept-bar-track" style="background:#f0e5e6;">
              <div class="dept-bar-fill" style="width:${attPct}%; background: linear-gradient(90deg, var(--good), var(--crimson));"></div>
            </div>
          </div>
        `;
      }).join("");
    }
  }

  function renderLifecyclePipeline() {
    if (!lifecyclePipelineFlow) return;
    const total = crmStudents.length;
    const issuedCerts = crmStudents.filter(s => s.certificateStatus === "ISSUED").length;

    let totalMockAttempts = 0;
    Object.values(crmMockSummary).forEach(cat => {
      totalMockAttempts += (cat.attemptCount || 0);
    });

    const approvedProjects = crmProjects.filter(p => p.status === "APPROVED").length;

    const stages = [
      { step: 1, icon: "📝", title: "Registration", desc: "Student signup & profile onboarding", metric: `${total} Students` },
      { step: 2, icon: "🏢", title: "Dept Allocation", desc: "Assigned to 1 of 6 technical domains", metric: "6 Domains" },
      { step: 3, icon: "🗓️", title: "Daily Attendance", desc: "Physical attendance tracked daily", metric: `${crmAttendanceSummary.present || 0} Present Today` },
      { step: 4, icon: "🎯", title: "Mock Interview", desc: "Domain MCQ assessment & evaluation", metric: `${totalMockAttempts} Attempted` },
      { step: 5, icon: "💻", title: "Practical Projects", desc: "Milestone projects review & approval", metric: `${approvedProjects} Approved` },
      { step: 6, icon: "💼", title: "Placement Prep", desc: "Resume build & company tracker", metric: "Ready" },
      { step: 7, icon: "🎓", title: "Certification", desc: "Issued authentic verifiable certificate", metric: `${issuedCerts} Issued` }
    ];

    lifecyclePipelineFlow.innerHTML = stages.map((st, idx) => {
      const isLast = idx === stages.length - 1;
      return `
        <div class="pipeline-step">
          <div class="pipeline-step-top">
            <span class="pipeline-step-num">${st.step}</span>
            <span class="pipeline-step-icon">${st.icon}</span>
          </div>
          <h4 class="pipeline-step-title">${st.title}</h4>
          <p class="pipeline-step-desc">${st.desc}</p>
          <div class="pipeline-step-badge">${st.metric}</div>
        </div>
        ${!isLast ? '<div class="pipeline-arrow">&rarr;</div>' : ''}
      `;
    }).join("");
  }

  // ================================================================
  // STUDENT 360° PROFILE MODAL
  // ================================================================
  const studentDetailsModal = document.getElementById("studentDetailsModal");
  const closeStudentDetailsBtn = document.getElementById("closeStudentDetailsBtn");
  const s360DoneBtn = document.getElementById("s360DoneBtn");
  const s360GotoAssignBtn = document.getElementById("s360GotoAssignBtn");
  let activeStudent360Id = null;

  function closeStudent360Modal() {
    if (studentDetailsModal) studentDetailsModal.style.display = "none";
    activeStudent360Id = null;
  }

  if (closeStudentDetailsBtn) closeStudentDetailsBtn.addEventListener("click", closeStudent360Modal);
  if (s360DoneBtn) s360DoneBtn.addEventListener("click", closeStudent360Modal);
  if (studentDetailsModal) {
    studentDetailsModal.addEventListener("click", function (e) {
      if (e.target === studentDetailsModal) closeStudent360Modal();
    });
  }

  if (s360GotoAssignBtn) {
    s360GotoAssignBtn.addEventListener("click", function () {
      if (!activeStudent360Id) return;
      const targetId = activeStudent360Id;
      closeStudent360Modal();
      setActiveSection("section-assign");
      loadAssignList().then(() => {
        selectStudentForAssign(targetId);
      });
    });
  }

  async function openStudentDetailsModal(studentId) {
    if (!studentDetailsModal) return;
    activeStudent360Id = studentId;

    // Find basic student info
    let student = (allStudents || []).find(s => s.studentId === studentId);
    if (!student) {
      try {
        const list = await apiRequest("/api/admin/students", { auth: true });
        allStudents = list;
        student = allStudents.find(s => s.studentId === studentId);
      } catch (e) {}
    }

    const name = student ? student.fullName : "Student";
    const course = student ? (student.course || "Technical Department") : "-";
    const email = student ? student.email : "-";
    const joinDate = student ? student.dateOfJoin : "-";
    const certStatus = student ? student.certificateStatus : "PENDING";

    // Set Header
    document.getElementById("s360Name").textContent = name;
    document.getElementById("s360Id").textContent = studentId;
    document.getElementById("s360Course").textContent = course;

    const branch = student && student.branch ? student.branch : "Kinathukadavu";
    const branchTag = document.getElementById("s360BranchTag");
    if (branchTag) branchTag.textContent = "Branch: " + branch;
    const branchEl = document.getElementById("s360Branch");
    if (branchEl) branchEl.textContent = branch;

    const certPill = document.getElementById("s360CertStatus");
    if (certPill) {
      certPill.textContent = certStatus === "ISSUED" ? "Certificate Issued" : "Certificate Pending";
      certPill.className = "pill " + (certStatus === "ISSUED" ? "pill-issued" : "pill-pending");
    }

    // Photo logic
    const photoImg = document.getElementById("s360PhotoImg");
    const photoFallback = document.getElementById("s360Avatar");
    const initialPhotoUrl = (student && student.profilePhotoUrl) || null;
    if (photoImg) {
      photoImg.onerror = function () {
        photoImg.style.display = "none";
        if (photoFallback) {
          photoFallback.textContent = name.charAt(0).toUpperCase();
          photoFallback.style.display = "flex";
        }
      };
    }
    if (initialPhotoUrl) {
      if (photoImg) { photoImg.src = resolveMediaUrl(initialPhotoUrl); photoImg.style.display = "block"; }
      if (photoFallback) photoFallback.style.display = "none";
    } else {
      if (photoImg) photoImg.style.display = "none";
      if (photoFallback) {
        photoFallback.textContent = name.charAt(0).toUpperCase();
        photoFallback.style.display = "flex";
      }
    }

    // Set defaults while loading deep details
    document.getElementById("s360Email").textContent = email;
    document.getElementById("s360Phone").textContent = student && student.phone ? student.phone : "Loading…";
    const deptEl = document.getElementById("s360Department");
    if (deptEl) deptEl.textContent = (student && student.department) || "-";
    const courseNameEl = document.getElementById("s360CourseName");
    if (courseNameEl) courseNameEl.textContent = course;
    const colNameEl = document.getElementById("s360CollegeName");
    if (colNameEl) colNameEl.textContent = (student && student.collegeName) || "-";
    const colStartEl = document.getElementById("s360CollegeStart");
    if (colStartEl) colStartEl.textContent = (student && student.collegeStartDate) || "-";
    const colEndEl = document.getElementById("s360CollegeEnd");
    if (colEndEl) colEndEl.textContent = (student && student.collegeEndDate) || "-";
    const internEl = document.getElementById("s360InternshipReq");
    if (internEl) {
      if (student && student.internshipRequired) {
        internEl.textContent = `Yes — Start: ${student.internshipStartDate || "Not Provided"}, End: ${student.internshipEndDate || "Not Provided"}`;
      } else {
        internEl.textContent = "No";
      }
    }
    const expEl = document.getElementById("s360ExpReq");
    if (expEl) {
      if (student && student.experienceRequired) {
        expEl.textContent = `Yes — Start: ${student.experienceStartDate || "Not Provided"}, End: ${student.experienceEndDate || "Not Provided"}`;
      } else {
        expEl.textContent = "No";
      }
    }
    document.getElementById("s360JoinDate").textContent = joinDate;
    document.getElementById("s360CertInfo").textContent = certStatus === "ISSUED" ? "Issued & Active" : "Not yet assigned";
    const certDateEl = document.getElementById("s360CertDate");
    if (certDateEl) certDateEl.textContent = (student && student.certificateIssuedOn) || "Not yet issued";

    document.getElementById("s360AttPercent").textContent = "…";
    document.getElementById("s360MockScore").textContent = "…";
    document.getElementById("s360ProjectsApproved").textContent = "…";
    document.getElementById("s360LeaveCount").textContent = "…";

    document.getElementById("s360AttPresent").textContent = "Present: —";
    document.getElementById("s360AttAbsent").textContent = "Absent: —";
    document.getElementById("s360AttLeave").textContent = "Leave: —";
    document.getElementById("s360AttTotal").textContent = "Total Marked: —";
    document.getElementById("s360RecentAttList").innerHTML = "<p style='margin:4px 0;'>Loading attendance history…</p>";

    const companiesTableBody = document.querySelector("#s360CompaniesTable tbody");
    if (companiesTableBody) companiesTableBody.innerHTML = `<tr class="empty-row"><td colspan="5">Loading applied companies…</td></tr>`;

    studentDetailsModal.style.display = "flex";

    // Deep Fetch via API or fallback aggregation
    try {
      let details = null;
      try {
        details = await Api.students.adminStudentDetails(studentId);
      } catch (backendErr) {
        details = null;
      }

      if (details) {
        // Populated from backend AdminStudentDetailsResponse
        if (details.phone) document.getElementById("s360Phone").textContent = details.phone;
        if (details.department && deptEl) deptEl.textContent = details.department;
        if (details.course && courseNameEl) courseNameEl.textContent = details.course;
        if (details.collegeName && colNameEl) colNameEl.textContent = details.collegeName;
        if (details.collegeStartDate && colStartEl) colStartEl.textContent = details.collegeStartDate;
        if (details.collegeEndDate && colEndEl) colEndEl.textContent = details.collegeEndDate;
        if (internEl) {
          if (details.internshipRequired) {
            internEl.textContent = `Yes — Start: ${details.internshipStartDate || "Not Provided"}, End: ${details.internshipEndDate || "Not Provided"}`;
          } else {
            internEl.textContent = "No";
          }
        }
        if (expEl) {
          if (details.experienceRequired) {
            expEl.textContent = `Yes — Start: ${details.experienceStartDate || "Not Provided"}, End: ${details.experienceEndDate || "Not Provided"}`;
          } else {
            expEl.textContent = "No";
          }
        }
        if (details.branch) {
          if (branchTag) branchTag.textContent = "Branch: " + details.branch;
          if (branchEl) branchEl.textContent = details.branch;
        }
        if (details.certificateIssuedOn && certDateEl) {
          certDateEl.textContent = details.certificateIssuedOn;
        }

        if (details.profilePhotoUrl) {
          if (photoImg) { photoImg.src = resolveMediaUrl(details.profilePhotoUrl); photoImg.style.display = "block"; }
          if (photoFallback) photoFallback.style.display = "none";
        }

        const totalMarked = Number(details.totalMarkedDays != null ? details.totalMarkedDays : (Number(details.presentCount || 0) + Number(details.absentCount || 0) + Number(details.leaveCount || 0)));
        const attPct = (totalMarked > 0 || details.attendancePercent != null)
          ? ((details.attendancePercent != null ? details.attendancePercent : Math.round((Number(details.presentCount || 0) * 100) / (totalMarked || 1))) + "%")
          : "0%";
        document.getElementById("s360AttPercent").textContent = attPct;
        document.getElementById("s360MockScore").textContent = details.mockInterviewScore != null ? details.mockInterviewScore + " / 20" : "Not Attended";
        document.getElementById("s360ProjectsApproved").textContent = details.projectsApproved || 0;
        document.getElementById("s360LeaveCount").textContent = details.leaveRequestsTotal || 0;

        document.getElementById("s360AttPresent").textContent = "Present: " + (details.presentCount || 0);
        document.getElementById("s360AttAbsent").textContent = "Absent: " + (details.absentCount || 0);
        document.getElementById("s360AttLeave").textContent = "Leave: " + (details.leaveCount || 0);
        document.getElementById("s360AttTotal").textContent = "Total Marked Days: " + totalMarked;

        if (details.recentAttendance && details.recentAttendance.length) {
          document.getElementById("s360RecentAttList").innerHTML = details.recentAttendance.slice(0, 10).map(h => `
            <div style="display:flex; justify-content:space-between; align-items:center; padding:5px 0; border-bottom:1px dashed var(--line);">
              <span>📅 ${escapeHtml(h.date)}</span>
              ${statusBadge(h.status)}
            </div>
          `).join("");
        } else {
          document.getElementById("s360RecentAttList").innerHTML = "<p style='margin:4px 0; color:var(--ink-soft);'>No attendance records marked yet.</p>";
        }

        // Mock Interview Section
        const mockStat = details.mockInterviewSubmitted ? "Completed & Submitted" : (details.mockInterviewAttempted ? "In Progress" : "Not Attempted");
        document.getElementById("s360MockStatus").textContent = mockStat;
        document.getElementById("s360MockPercent").textContent = details.mockInterviewPercentage != null ? Math.round(details.mockInterviewPercentage) + "%" : "—";
        document.getElementById("s360MockCorrect").textContent = details.mockInterviewScore != null ? details.mockInterviewScore + " Correct" : "—";
        document.getElementById("s360MockWrong").textContent = (details.mockInterviewTotal != null && details.mockInterviewScore != null) ? (details.mockInterviewTotal - details.mockInterviewScore) + " Wrong" : "—";

        // Projects Section
        document.getElementById("s360ProjectsTotal").textContent = (details.projectsTotal || 0) + " Assigned";
        document.getElementById("s360ProjectsStatus").textContent = `${details.projectsApproved || 0} Approved · ${details.projectsInProgress || 0} In Progress`;
        document.getElementById("s360ResumeStatus").textContent = details.resumeUploaded ? "Uploaded ✓" : "Not Uploaded";
        document.getElementById("s360ApplicationsCount").textContent = (details.companyApplicationsCount || 0) + " Applied";

        // Full Applied Companies Table
        const apps = details.companyApplications || [];
        if (companiesTableBody) {
          if (!apps.length) {
            companiesTableBody.innerHTML = `<tr class="empty-row"><td colspan="5">No company applications submitted by this student yet.</td></tr>`;
          } else {
            companiesTableBody.innerHTML = apps.map((app, idx) => {
              let linkOrPoster = "-";
              if (app.websiteUrl && app.posterUrl) {
                linkOrPoster = `<a href="${escapeHtml(app.websiteUrl)}" target="_blank" class="link-btn" style="color:var(--crimson); font-weight:700;">🌐 Website</a> · <a href="${escapeHtml(app.posterUrl)}" target="_blank" class="link-btn" style="color:var(--crimson); font-weight:700;">🖼️ Poster</a>`;
              } else if (app.websiteUrl) {
                linkOrPoster = `<a href="${escapeHtml(app.websiteUrl)}" target="_blank" class="link-btn" style="color:var(--crimson); font-weight:700;">🌐 Link</a>`;
              } else if (app.posterUrl) {
                linkOrPoster = `<a href="${escapeHtml(app.posterUrl)}" target="_blank" class="link-btn" style="color:var(--crimson); font-weight:700;">🖼️ View Poster</a>`;
              }

              return `
                <tr>
                  <td>${idx + 1}</td>
                  <td><b>${escapeHtml(app.companyName)}</b></td>
                  <td>
                    <div>📞 ${escapeHtml(app.contactNumber || "-")}</div>
                    <div style="font-size:.78rem; color:var(--ink-soft);">✉️ ${escapeHtml(app.email || "-")}</div>
                  </td>
                  <td>${linkOrPoster}</td>
                  <td>${escapeHtml(app.appliedDate || app.createdAt || "-")}</td>
                </tr>
              `;
            }).join("");
          }
        }
      } else {
        // Fallback with real known student data and clean zero defaults
        document.getElementById("s360Phone").textContent = student && student.phone ? student.phone : "-";
        document.getElementById("s360AttPercent").textContent = "0%";
        document.getElementById("s360MockScore").textContent = "Not Attempted";
        document.getElementById("s360ProjectsApproved").textContent = "0";
        document.getElementById("s360LeaveCount").textContent = "0";
        document.getElementById("s360AttPresent").textContent = "Present: 0";
        document.getElementById("s360AttAbsent").textContent = "Absent: 0";
        document.getElementById("s360AttLeave").textContent = "Leave: 0";
        document.getElementById("s360AttTotal").textContent = "Total Marked Days: 0";
        document.getElementById("s360RecentAttList").innerHTML = "<p style='margin:4px 0; color:var(--ink-soft);'>No attendance records marked yet.</p>";
        document.getElementById("s360MockStatus").textContent = "Not Attempted";
        document.getElementById("s360MockPercent").textContent = "—";
        document.getElementById("s360MockCorrect").textContent = "—";
        document.getElementById("s360MockWrong").textContent = "—";
        document.getElementById("s360ProjectsTotal").textContent = "0 Assigned";
        document.getElementById("s360ProjectsStatus").textContent = "0 Approved · 0 In Progress";
        document.getElementById("s360ResumeStatus").textContent = "Not Uploaded";
        document.getElementById("s360ApplicationsCount").textContent = "0 Applied";
        if (companiesTableBody) {
          companiesTableBody.innerHTML = `<tr class="empty-row"><td colspan="5">No company applications recorded.</td></tr>`;
        }
      }
    } catch (e) {
      console.warn("Could not load full 360 profile:", e);
    }
  }

  // Delegated click handler for viewing student 360 profile anywhere
  document.addEventListener("click", function (e) {
    if (e.target.closest("[data-goto-assign], [data-delete-cert], [data-delete-user], [data-delete-score], [data-edit-student]")) {
      return;
    }
    const viewStudentBtn = e.target.closest("[data-view-student]");
    if (viewStudentBtn) {
      const sid = viewStudentBtn.dataset.viewStudent;
      if (sid) openStudentDetailsModal(sid);
    }
  });

  // ================================================================
  // 1) REGISTERED USERS
  // ================================================================
  const studentsTableBody = document.querySelector("#studentsTable tbody");
  const studentSearchInput = document.getElementById("studentSearch");
  let allStudents = [];

  async function loadStudents() {
    studentsTableBody.innerHTML = `<tr class="empty-row"><td colspan="10">Loading…</td></tr>`;
    try {
      allStudents = await apiRequest("/api/admin/students", { auth: true });
      renderStudents();
    } catch (err) {
      studentsTableBody.innerHTML = `<tr class="empty-row"><td colspan="10">${escapeHtml(err.message)}</td></tr>`;
    }
  }

  const filterStudentBranch = document.getElementById("filterStudentBranch");
  const filterStudentCourse = document.getElementById("filterStudentCourse");
  const filterStudentStatus = document.getElementById("filterStudentStatus");

  // Applies branch -> course -> status -> search to allStudents (no pagination).
  function getFilteredStudents() {
    const branchVal = filterStudentBranch ? filterStudentBranch.value : "ALL";
    const courseVal = filterStudentCourse ? filterStudentCourse.value : "ALL";
    const statusVal = filterStudentStatus ? filterStudentStatus.value : "ALL";
    const searchVal = studentSearchInput ? studentSearchInput.value : "";

    return (allStudents || []).filter(r => {
      if (branchVal !== "ALL" && (r.branch || "").toLowerCase() !== branchVal.toLowerCase()) {
        return false;
      }
      if (courseVal !== "ALL" && !deptMatch(r, courseVal)) {
        return false;
      }
      if (statusVal === "CERTIFIED" && r.certificateStatus !== "ISSUED") {
        return false;
      }
      if (statusVal === "PENDING" && r.certificateStatus === "ISSUED") {
        return false;
      }
      return matchesSearch(r, [
        x => x.studentId, x => x.fullName, x => x.email, x => x.course, x => x.department, x => x.branch
      ], searchVal);
    });
  }

  // Renders ALL filtered students. S.No is the visible-row position (index + 1),
  // so it always restarts at 1 whenever the filters/search change.
  function renderStudents() {
    const rows = getFilteredStudents();
    if (!rows.length) {
      studentsTableBody.innerHTML = `<tr class="empty-row"><td colspan="10">No students found matching your filters.</td></tr>`;
      return;
    }
    const canEdit = !(typeof IS_TRAINER !== "undefined" && IS_TRAINER);
    studentsTableBody.innerHTML = rows.map((r, index) => {
      const serialNumber = index + 1;
      const issued = r.certificateStatus === "ISSUED";
      const certButtons = issued
        ? `<button class="table-btn assign" data-goto-assign="${r.studentId}">Edit Certificate</button>
           <button class="table-btn outline-danger" data-delete-cert="${r.studentId}" data-name="${escapeHtml(r.fullName)}">Delete Certificate</button>`
        : `<button class="table-btn assign" data-goto-assign="${r.studentId}">Assign Certificate</button>`;
      const editButton = canEdit
        ? `<button class="table-btn edit" data-edit-student="${r.studentId}">✏️ Edit</button>`
        : "";

      return `
        <tr class="clickable-student-row" data-view-student="${r.studentId}">
          <td data-label="S.No">${serialNumber}</td>
          <td data-label="Student ID"><b>${r.studentId}</b></td>
          <td data-label="Name">
            <span style="font-weight:700; color:var(--crimson-dark); cursor:pointer;">${escapeHtml(r.fullName)}</span>
          </td>
          <td data-label="Email">${escapeHtml(r.email)}</td>
          <td data-label="Branch"><span class="admin-branch-badge">${escapeHtml(r.branch || "Kinathukadavu")}</span></td>
          <td data-label="Course">${escapeHtml(r.course || (r.department ? r.department + " (Pending Specialization)" : "-"))}</td>
          <td data-label="Date of Join">${r.dateOfJoin || "-"}</td>
          <td data-label="Registered">${r.registeredOn || "-"}</td>
          <td data-label="Certificate">
            <span class="pill ${issued ? "pill-issued" : "pill-pending"}">${issued ? "Issued" : "Pending"}</span>
          </td>
          <td data-label="Actions">
            <div class="action-btn-group">
              <button class="table-btn assign" data-view-student="${r.studentId}" style="background:#4a0613;">🔍 360°</button>
              ${editButton}
              ${certButtons}
              <button class="table-btn danger" data-delete-user="${r.studentId}" data-name="${escapeHtml(r.fullName)}">Delete User</button>
            </div>
          </td>
        </tr>
      `;
    }).join("");
  }

  // Registered Users -> Export Registered Users. Sends the CURRENT filter state; the backend
  // re-applies the same rules to the Registered Users list (student data only, no company data).
  const exportRegisteredUsersExcelBtn = document.getElementById("exportRegisteredUsersExcelBtn");
  if (exportRegisteredUsersExcelBtn) {
    exportRegisteredUsersExcelBtn.addEventListener("click", function (e) {
      e.preventDefault();
      if (!getFilteredStudents().length) {
        showToast("No registered users match the current filters, so there is nothing to export", "error");
        return;
      }
      downloadAdminExcel(exportRegisteredUsersExcelBtn, "/api/admin/students/export", {
        branch: filterStudentBranch ? filterStudentBranch.value : "ALL",
        course: filterStudentCourse ? filterStudentCourse.value : "ALL",
        status: filterStudentStatus ? filterStudentStatus.value : "ALL",
        search: studentSearchInput ? studentSearchInput.value.trim() : ""
      }, "Registered_Users", "Registered Users Excel downloaded successfully", /^No registered users/i);
    });
  }

  // ================================================================
  // PLACEMENTS -> APPLIED COMPANIES (Admin only; one row per CompanyApplication)
  // ================================================================
  const plFilterBranch = document.getElementById("plFilterBranch");
  const plFilterCourse = document.getElementById("plFilterCourse");
  const plFilterStatus = document.getElementById("plFilterStatus");
  const plSearchInput = document.getElementById("plSearch");
  const appliedCompaniesTbody = document.querySelector("#appliedCompaniesTable tbody");
  const exportAppliedCompaniesExcelBtn = document.getElementById("exportAppliedCompaniesExcelBtn");
  let appliedCompaniesRows = [];
  let appliedCompaniesReqSeq = 0;

  function plFilterParams() {
    return {
      branch: plFilterBranch ? plFilterBranch.value : "ALL",
      course: plFilterCourse ? plFilterCourse.value : "ALL",
      status: plFilterStatus ? plFilterStatus.value : "ALL",
      search: plSearchInput ? plSearchInput.value.trim() : ""
    };
  }

  // Only http(s) links are ever rendered as hrefs ("www.x.com" is upgraded to https).
  function safeWebsiteHref(raw) {
    const v = String(raw || "").trim();
    if (!v) return "";
    if (/^https?:\/\//i.test(v)) return v;
    if (/^[a-z][a-z0-9+.-]*:/i.test(v)) return "";      // javascript:, data:, etc.
    return /^[^\s/]+\.[^\s]+/.test(v) ? "https://" + v : "";
  }

  function renderAppliedCompanies() {
    if (!appliedCompaniesTbody) return;

    // Compute placement summary metrics
    const totalApps = appliedCompaniesRows.length;
    const uniqueStudents = new Set(appliedCompaniesRows.map(a => (a.studentId || "").toUpperCase()).filter(Boolean)).size;
    const uniqueCompanies = new Set(appliedCompaniesRows.map(a => (a.companyName || "").trim().toLowerCase()).filter(Boolean)).size;
    const withPosters = appliedCompaniesRows.filter(a => a.posterAvailable || (a.websiteLink && a.websiteLink.trim())).length;

    const kpiTotalApps = document.getElementById("plKpiTotalApps");
    const kpiUniqueStudents = document.getElementById("plKpiUniqueStudents");
    const kpiUniqueCompanies = document.getElementById("plKpiUniqueCompanies");
    const kpiWithPosters = document.getElementById("plKpiWithPosters");

    if (kpiTotalApps) kpiTotalApps.textContent = totalApps;
    if (kpiUniqueStudents) kpiUniqueStudents.textContent = uniqueStudents;
    if (kpiUniqueCompanies) kpiUniqueCompanies.textContent = uniqueCompanies;
    if (kpiWithPosters) kpiWithPosters.textContent = withPosters;

    if (!appliedCompaniesRows.length) {
      appliedCompaniesTbody.innerHTML = `<tr class="empty-row"><td colspan="6">No company applications found for the selected filters.</td></tr>`;
      return;
    }

    // S.No = position of the visible application row, so it restarts at 1 on every filter change.
    appliedCompaniesTbody.innerHTML = appliedCompaniesRows.map(function (a, idx) {
      const href = safeWebsiteHref(a.websiteLink);
      const websiteBtn = href
        ? `<a href="${escapeHtml(href)}" target="_blank" rel="noopener noreferrer" class="btn btn-outline btn-sm" style="padding:4px 10px; font-size:.78rem; display:inline-flex; align-items:center; gap:4px;">🌐 Website</a>`
        : "";
      const posterBtn = a.posterAvailable && a.posterUrl
        ? `<button type="button" class="btn btn-outline btn-sm" data-view-poster="${escapeHtml(a.posterUrl)}" style="padding:4px 10px; font-size:.78rem; display:inline-flex; align-items:center; gap:4px; color:var(--crimson); border-color:var(--line);">📄 View Poster</button>`
        : "";
      const linksContent = (websiteBtn || posterBtn)
        ? `<div style="display:flex; gap:6px; flex-wrap:wrap; align-items:center;">${websiteBtn}${posterBtn}</div>`
        : `<span style="color:var(--ink-soft); font-size:.82rem;">—</span>`;

      const commsContent = `
        <div style="font-size:.84rem; display:flex; flex-direction:column; gap:2px;">
          ${a.companyContact ? `<div><span style="color:var(--ink-soft); font-size:.76rem;">Contact:</span> <b>${escapeHtml(a.companyContact)}</b></div>` : ""}
          ${a.companyEmail ? `<div><a href="mailto:${escapeHtml(a.companyEmail)}" style="color:var(--crimson); text-decoration:none; font-size:.82rem;">✉️ ${escapeHtml(a.companyEmail)}</a></div>` : (!a.companyContact ? '<span style="color:var(--ink-soft); font-size:.82rem;">—</span>' : '')}
        </div>
      `;

      return `
        <tr>
          <td data-label="S.No" style="text-align:center; font-weight:700; color:var(--ink-soft);">${idx + 1}</td>
          <td data-label="Student Info">
            <div style="font-weight:700; color:var(--ink);">${escapeHtml(a.studentName || "-")}</div>
            <div style="display:flex; gap:6px; align-items:center; margin-top:3px; flex-wrap:wrap;">
              <code class="login-id-badge">${escapeHtml(a.studentId)}</code>
              <span class="admin-branch-badge">${escapeHtml(a.branch || "-")}</span>
            </div>
          </td>
          <td data-label="Company Info">
            <div style="font-weight:700; font-size:.92rem; color:var(--ink);">🏢 ${escapeHtml(a.companyName || "-")}</div>
            ${a.course || a.department ? `<div style="font-size:.78rem; color:var(--ink-soft); margin-top:2px;">${escapeHtml(a.course || a.department)}</div>` : ""}
          </td>
          <td data-label="Contact &amp; Comms">${commsContent}</td>
          <td data-label="Verification &amp; Links">${linksContent}</td>
          <td data-label="Applied Date">
            <span class="badge-pill" style="background:var(--crimson-tint); color:var(--crimson-dark); font-weight:600; font-size:.78rem;">
              📅 ${escapeHtml(a.appliedDate || "-")}
            </span>
          </td>
        </tr>`;
    }).join("");
  }

  async function loadPlacements() {
    if (!appliedCompaniesTbody) return;
    const seq = ++appliedCompaniesReqSeq;     // ignore out-of-order responses while filters change quickly
    appliedCompaniesTbody.innerHTML = `<tr class="empty-row"><td colspan="6">Loading…</td></tr>`;
    try {
      const rows = await Api.placementAdmin.appliedCompanies(plFilterParams());
      if (seq !== appliedCompaniesReqSeq) return;
      appliedCompaniesRows = Array.isArray(rows) ? rows : [];
      renderAppliedCompanies();
    } catch (err) {
      if (seq !== appliedCompaniesReqSeq) return;
      appliedCompaniesRows = [];
      appliedCompaniesTbody.innerHTML = `<tr class="empty-row"><td colspan="6">${escapeHtml(err.message || "Failed to load applied companies.")}</td></tr>`;
    }
  }

  // The poster endpoint needs the Bearer token, so a plain link can't open it: fetch as a blob.
  if (appliedCompaniesTbody) {
    appliedCompaniesTbody.addEventListener("click", async function (e) {
      const btn = e.target.closest("[data-view-poster]");
      if (!btn) return;
      const win = window.open("", "_blank");   // opened synchronously so popup blockers allow it
      try {
        const token = Auth.getToken();
        const base = (typeof API_BASE_URL !== "undefined" && API_BASE_URL) ? API_BASE_URL.replace(/\/+$/, "") : "";
        const res = await fetch(base + btn.getAttribute("data-view-poster"), {
          headers: { "Authorization": token ? ("Bearer " + token) : "" }
        });
        if (!res.ok) throw new Error(res.status === 404 ? "Poster file not found" : ("Could not load poster (HTTP " + res.status + ")"));
        const blob = await res.blob();
        const url = window.URL.createObjectURL(blob);
        if (win) { win.location.href = url; } else { window.open(url, "_blank"); }
        setTimeout(function () { window.URL.revokeObjectURL(url); }, 60000);
      } catch (err) {
        if (win) win.close();
        showToast(err.message || "Could not open poster", "error");
      }
    });
  }

  [plFilterBranch, plFilterCourse, plFilterStatus].forEach(function (el) {
    if (el) el.addEventListener("change", loadPlacements);
  });
  if (plSearchInput) plSearchInput.addEventListener("input", debounce(loadPlacements, 300));

  if (exportAppliedCompaniesExcelBtn) {
    exportAppliedCompaniesExcelBtn.addEventListener("click", function (e) {
      e.preventDefault();
      if (!appliedCompaniesRows.length) {
        showToast("No company applications match the current filters, so there is nothing to export", "error");
        return;
      }
      downloadAdminExcel(exportAppliedCompaniesExcelBtn, "/api/admin/placements/applied-companies/export",
        plFilterParams(), "Applied_Companies", "Applied Companies Excel downloaded successfully",
        /^No company applications/i);
    });
  }

  if (filterStudentBranch) filterStudentBranch.addEventListener("change", renderStudents);
  if (filterStudentCourse) filterStudentCourse.addEventListener("change", renderStudents);
  if (filterStudentStatus) filterStudentStatus.addEventListener("change", renderStudents);
  if (studentSearchInput) studentSearchInput.addEventListener("input", debounce(renderStudents, 300));

  // ---- Admin: Edit Student modal (Registered Users only) ----
  const editStudentModal = document.getElementById("editStudentModal");
  const editStudentForm = document.getElementById("editStudentForm");
  const editStudentErrorEl = document.getElementById("editStudentError");
  const saveEditStudentBtn = document.getElementById("saveEditStudentBtn");
  const EDIT_MONTHS = { jan: "01", feb: "02", mar: "03", apr: "04", may: "05", jun: "06", jul: "07", aug: "08", sep: "09", oct: "10", nov: "11", dec: "12" };

  // Backend shows dates as "dd MMM yyyy"; <input type="date"> needs yyyy-MM-dd.
  function displayDateToIso(v) {
    if (!v) return "";
    if (/^\d{4}-\d{2}-\d{2}$/.test(v)) return v;
    const m = /^(\d{1,2})\s+([A-Za-z]{3})[A-Za-z]*\s+(\d{4})$/.exec(String(v).trim());
    if (!m || !EDIT_MONTHS[m[2].toLowerCase()]) return "";
    return m[3] + "-" + EDIT_MONTHS[m[2].toLowerCase()] + "-" + m[1].padStart(2, "0");
  }

  function setEditField(id, value) {
    const el = document.getElementById(id);
    if (el) el.value = value == null ? "" : value;
  }

  function closeEditStudentModal() {
    if (editStudentModal) editStudentModal.style.display = "none";
  }

  async function openEditStudentModal(studentId) {
    if (!editStudentModal || !editStudentForm) return;
    const row = (allStudents || []).find(s => s.studentId === studentId) || {};
    let details = {};
    try {
      // The list row has no phone/college, so load the full record
      details = await Api.students.adminStudentDetails(studentId) || {};
    } catch (e) {
      details = {};
    }
    const src = Object.assign({}, row, details);

    editStudentErrorEl.textContent = "";
    setEditField("editStudentId", studentId);
    setEditField("editStudentIdView", studentId);
    setEditField("editStudentName", src.fullName);
    setEditField("editStudentEmail", src.email);
    setEditField("editStudentPhone", src.phone);
    setEditField("editStudentBranch", src.branch);
    setEditField("editStudentDepartment", src.department);
    setEditField("editStudentCourse", src.course);
    setEditField("editStudentJoin", displayDateToIso(src.dateOfJoin));
    setEditField("editStudentCollege", src.collegeName);
    setEditField("editStudentCollegeStart", displayDateToIso(src.collegeStartDate));
    setEditField("editStudentCollegeEnd", displayDateToIso(src.collegeEndDate));
    saveEditStudentBtn.disabled = false;
    saveEditStudentBtn.textContent = "Save Changes";
    editStudentModal.style.display = "flex";
  }

  async function submitEditStudent(e) {
    e.preventDefault();
    const val = id => (document.getElementById(id).value || "").trim();
    // URL identifies the EXISTING student (original id captured when the modal opened);
    // body.studentId is the NEW id typed by the admin.
    const originalStudentId = val("editStudentId");

    const payload = {
      studentId: val("editStudentIdView"),
      fullName: val("editStudentName"),
      email: val("editStudentEmail"),
      phone: val("editStudentPhone"),
      branch: val("editStudentBranch"),
      department: val("editStudentDepartment"),
      course: val("editStudentCourse"),
      dateOfJoin: val("editStudentJoin"),
      collegeName: val("editStudentCollege"),
      collegeStartDate: val("editStudentCollegeStart"),
      collegeEndDate: val("editStudentCollegeEnd")
    };

    if (!/^[A-Za-z0-9-]{3,40}$/.test(payload.studentId)) { editStudentErrorEl.textContent = "Student ID can only contain letters, numbers and hyphens (3-40 characters)."; return; }
    if (payload.collegeStartDate && payload.collegeEndDate && payload.collegeEndDate < payload.collegeStartDate) { editStudentErrorEl.textContent = "College End Date must not be before the College Start Date."; return; }

    if (!/^[A-Za-z ]{3,50}$/.test(payload.fullName)) { editStudentErrorEl.textContent = "Name must be 3-50 letters and spaces only."; return; }
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(payload.email)) { editStudentErrorEl.textContent = "Enter a valid email address."; return; }
    if (!/^[6-9]\d{9}$/.test(payload.phone)) { editStudentErrorEl.textContent = "Enter a valid 10-digit Indian mobile number."; return; }
    if (!payload.branch) { editStudentErrorEl.textContent = "Please select a branch."; return; }
    if (!payload.department) { editStudentErrorEl.textContent = "Please select a department."; return; }

    if (payload.studentId !== originalStudentId) {
      const ok = confirm(`Change Student ID from ${originalStudentId} to ${payload.studentId}?\n\nAll of this student's records move to the new ID. The student must log in again with the new ID.`);
      if (!ok) return;
    }

    editStudentErrorEl.textContent = "";
    saveEditStudentBtn.disabled = true;
    saveEditStudentBtn.textContent = "Saving…";
    try {
      await Api.students.adminUpdateStudent(originalStudentId, payload);
      closeEditStudentModal();
      showToast("Student details updated successfully.", "success");
      await loadStudents(); // refetch, then renderStudents() re-applies current filters/search
    } catch (err) {
      // Keep the modal open with everything the admin typed
      editStudentErrorEl.textContent = err.message || "Could not update student.";
      saveEditStudentBtn.disabled = false;
      saveEditStudentBtn.textContent = "Save Changes";
    }
  }

  if (editStudentForm) editStudentForm.addEventListener("submit", submitEditStudent);
  ["closeEditStudentBtn", "cancelEditStudentBtn"].forEach(id => {
    const b = document.getElementById(id);
    if (b) b.addEventListener("click", closeEditStudentModal);
  });
  document.addEventListener("click", function (e) {
    const editBtn = e.target.closest("[data-edit-student]");
    if (editBtn) openEditStudentModal(editBtn.dataset.editStudent);
  });

  // ================================================================
  // 2) ASSIGN CERTIFICATE
  // Two views inside the same section: a search+list view, and a
  // selected-student view. Only one is visible at a time - the list is
  // never shown side-by-side with the selected student.
  // ================================================================
  const assignSearchView = document.getElementById("assignSearchView");
  const assignSelectedView = document.getElementById("assignSelectedView");
  const assignListEl = document.getElementById("assignStudentList");
  const assignSearchInput = document.getElementById("assignSearch");
  const assignForm = document.getElementById("assignForm");
  const assignFileInput = document.getElementById("certFile");
  const courseNameInput = document.getElementById("courseNameInput");
  const backToStudentListBtn = document.getElementById("backToStudentListBtn");

  const assignListPagerEl = document.getElementById("assignListPager");
  let allAssignStudents = [];
  let selectedStudentId = null;
  let assignListPage = 0;

  async function loadAssignList() {
    assignListEl.innerHTML = `<div class="student-pick-row"><span>Loading…</span></div>`;
    try {
      allAssignStudents = await apiRequest("/api/admin/students", { auth: true });
      assignListPage = 0;
      renderAssignList();
    } catch (err) {
      assignListEl.innerHTML = `<div class="student-pick-row"><span>${escapeHtml(err.message)}</span></div>`;
    }
  }

  function renderAssignList() {
    const filtered = allAssignStudents.filter(s => matchesSearch(s, [
      x => x.studentId, x => x.fullName, x => x.email, x => x.course
    ], assignSearchInput.value));

    if (!filtered.length) {
      assignListEl.innerHTML = `<div class="student-pick-row"><span>No students found.</span></div>`;
      renderPager(assignListPagerEl, 0, 1, function () {}, function () {});
      return;
    }

    const { pageRows, page, totalPages } = paginateRows(filtered, assignListPage);
    assignListPage = page;

    assignListEl.innerHTML = pageRows.map(s => `
      <div class="student-pick-row" data-student-id="${s.studentId}">
        <div>
          <b>${escapeHtml(s.fullName)}</b>
          <small>${escapeHtml(s.email)}</small>
        </div>
        <span class="pick-row-id">${s.studentId}</span>
      </div>
    `).join("");

    renderPager(assignListPagerEl, assignListPage, totalPages,
      function () { if (assignListPage > 0) { assignListPage--; renderAssignList(); } },
      function () { assignListPage++; renderAssignList(); }
    );
  }

  assignSearchInput.addEventListener("input", debounce(() => { assignListPage = 0; renderAssignList(); }, 300));

  assignListEl.addEventListener("click", function (e) {
    const row = e.target.closest("[data-student-id]");
    if (!row) return;
    selectStudentForAssign(row.dataset.studentId);
  });

  function showSearchView() {
    assignSelectedView.style.display = "none";
    assignSearchView.style.display = "block";
    selectedStudentId = null;
  }

  function showSelectedView() {
    assignSearchView.style.display = "none";
    assignSelectedView.style.display = "block";
  }

  backToStudentListBtn.addEventListener("click", function () {
    showSearchView();
    loadAssignList();
  });

  async function selectStudentForAssign(studentId) {
    // Make sure we have this student's details even if we jumped here
    // directly from the Registered Users table without loading the list first.
    if (!allAssignStudents.length) {
      await loadAssignList();
    }
    let student = allAssignStudents.find(s => s.studentId === studentId);
    if (!student) {
      await loadAssignList();
      student = allAssignStudents.find(s => s.studentId === studentId);
    }
    if (!student) return;

    selectedStudentId = studentId;

    document.getElementById("assignStudentName").textContent = student.fullName;
    document.getElementById("assignStudentIdVal").textContent = student.studentId;
    document.getElementById("assignStudentEmail").textContent = student.email;
    document.getElementById("assignStudentCourse").textContent = student.course || "-";
    document.getElementById("assignStudentJoin").textContent = student.dateOfJoin;

    courseNameInput.value = student.course || "";
    assignFileInput.value = "";

    document.getElementById("assignBtn").textContent =
      student.certificateStatus === "ISSUED" ? "UPDATE CERTIFICATE" : "ASSIGN CERTIFICATE";

    showSelectedView();
  }

  assignForm.addEventListener("submit", async function (e) {
    e.preventDefault();
    if (!selectedStudentId) return;
    if (!assignFileInput.files.length) {
      showToast("Please choose a certificate file first", "error");
      return;
    }

    const btn = document.getElementById("assignBtn");
    const originalLabel = btn.textContent;
    btn.disabled = true;
    btn.textContent = "Uploading…";

    try {
      const formData = new FormData();
      formData.append("file", assignFileInput.files[0]);
      formData.append("courseName", courseNameInput.value.trim());

      const token = Auth.getToken();
      const res = await fetch(`${API_BASE_URL}/api/admin/certificates/${encodeURIComponent(selectedStudentId)}/assign`, {
        method: "POST",
        headers: { Authorization: "Bearer " + token },
        body: formData
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.message || "Upload failed");

      showToast("Certificate issued successfully", "success");
      showSearchView();
      loadAssignList();
      loadStudents();
    } catch (err) {
      showToast(err.message, "error");
      btn.textContent = originalLabel;
    } finally {
      btn.disabled = false;
    }
  });

  // ================================================================
  // 3) STUDENT SKILL SCORES — now Mock Interview analytics (Part D).
  // The old PEST table/export/delete logic is fully preserved below,
  // just moved under a collapsed "Legacy PEST" panel and its own
  // element IDs (pestScores*) so nothing about it changed except where
  // it's mounted in the page.
  // ================================================================
  const MOCK_INTERVIEW_CATEGORIES = [
    "Mechanical CAD", "Civil CAD", "Electrical CAD",
    "Electronic CAD", "Arts and Multimedia", "Computer Science / IT"
  ];

  const scoresCategoryView = document.getElementById("scoresCategoryView");
  const scoresCategoryDetailView = document.getElementById("scoresCategoryDetailView");
  const scoreCategoryCardsEl = document.getElementById("scoreCategoryCards");
  const scoresCategoryTitleEl = document.getElementById("scoresCategoryTitle");
  const scoresBackToCategoriesBtn = document.getElementById("scoresBackToCategoriesBtn");
  const mockScoresTableBody = document.querySelector("#scoresTable tbody");
  const mockScoreSearchInput = document.getElementById("scoreSearch");
  const mockScoresPagerEl = document.getElementById("scoresPager");

  let categorySummary = {}; // { "Computer Science / IT": { attemptCount, avgPercentage }, ... }
  let currentCategory = null;
  let allCategoryResults = [];
  let mockScoresPage = 0;

  // Entry point - called by goToSection() when Student Skill Scores opens.
  async function loadScores() {
    scoresCategoryView.style.display = "";
    scoresCategoryDetailView.style.display = "none";
    scoreCategoryCardsEl.innerHTML = `<p style="color:var(--ink-soft); font-size:.88rem;">Loading categories…</p>`;
    try {
      const summary = await Api.mockInterview.adminCategorySummary();
      categorySummary = {};
      (summary || []).forEach(row => { categorySummary[row.category] = row; });
      renderCategoryCards();
    } catch (err) {
      categorySummary = {};
      renderCategoryCards();
    }
  }

  function renderCategoryCards() {
    // Trainer: show only the card of the assigned department (display filter only -
    // the backend already restricts the data). Admin: all categories, unchanged.
    const visibleCategories = IS_TRAINER
      ? MOCK_INTERVIEW_CATEGORIES.filter(cat => normDept(cat) === normDept(Auth.getDepartment()))
      : MOCK_INTERVIEW_CATEGORIES;
    scoreCategoryCardsEl.innerHTML = visibleCategories.map(cat => {
      const row = categorySummary[cat];
      const summaryLine = row && row.attemptCount
        ? `${row.attemptCount} student${row.attemptCount === 1 ? "" : "s"} attempted · Avg ${Math.round(row.avgPercentage || 0)}%`
        : "No Mock Interview results available for this category yet.";
      return `
        <div class="category-card" data-category="${escapeHtml(cat)}">
          <h4>${escapeHtml(cat)}</h4>
          <p class="category-card-sub">Mock Interview Results</p>
          <p class="category-card-summary">${escapeHtml(summaryLine)}</p>
          <button type="button" class="btn btn-outline btn-sm" data-view-category="${escapeHtml(cat)}">View Students</button>
        </div>
      `;
    }).join("");
  }

  scoreCategoryCardsEl.addEventListener("click", function (e) {
    const btn = e.target.closest("[data-view-category]");
    if (btn) openCategoryDetail(btn.dataset.viewCategory);
  });

  if (scoresBackToCategoriesBtn) {
    scoresBackToCategoriesBtn.addEventListener("click", function () {
      scoresCategoryDetailView.style.display = "none";
      scoresCategoryView.style.display = "";
    });
  }

async function openCategoryDetail(category) {
    currentCategory = category;
    mockScoresPage = 0;

    if (mockScoreSearchInput) {
        mockScoreSearchInput.value = "";
    }

    scoresCategoryView.style.display = "none";
    scoresCategoryDetailView.style.display = "";
    scoresCategoryTitleEl.textContent = category;

    mockScoresTableBody.innerHTML =
        `<tr class="empty-row"><td colspan="8">Loading…</td></tr>`;

    // Convert display name to backend enum value
    const categoryCode = {
        "Mechanical CAD": "MECHANICAL_CAD",
        "Civil CAD": "CIVIL_CAD",
        "Electrical CAD": "ELECTRICAL_CAD",
        "Electronic CAD": "ELECTRONIC_CAD",
        "Arts and Multimedia": "ARTS_AND_MULTIMEDIA",
        "Computer Science / IT": "COMPUTER_SCIENCE_IT"
    }[category];

    if (!categoryCode) {
        mockScoresTableBody.innerHTML =
            `<tr class="empty-row"><td colspan="8">Invalid Mock Interview category.</td></tr>`;
        return;
    }

    try {
        allCategoryResults =
            await Api.mockInterview.adminCategoryResults(categoryCode) || [];

        renderMockScoresPage();

    } catch (err) {
        allCategoryResults = [];

        mockScoresTableBody.innerHTML =
            `<tr class="empty-row"><td colspan="8">${escapeHtml(err.message)}</td></tr>`;
    }
}

  function renderMockScoresPage() {
    const filtered = allCategoryResults.filter(r => matchesSearch(r, [
      x => x.studentName, x => x.studentId
    ], mockScoreSearchInput ? mockScoreSearchInput.value : ""));
    const { pageRows, page, totalPages } = paginateRows(filtered, mockScoresPage);
    mockScoresPage = page;
    renderMockScores(pageRows, filtered.length);
    renderPager(mockScoresPagerEl, mockScoresPage, totalPages,
      function () { if (mockScoresPage > 0) { mockScoresPage--; renderMockScoresPage(); } },
      function () { mockScoresPage++; renderMockScoresPage(); }
    );
  }

  function renderMockScores(rows, totalFiltered) {
    if (!totalFiltered) {
      mockScoresTableBody.innerHTML = `<tr class="empty-row"><td colspan="8">No students found in this category yet.</td></tr>`;
      return;
    }
    mockScoresTableBody.innerHTML = rows.map(r => {
      // Handle students who have not attended the Mock Interview
      const hasResult = r.score != null;
      return `
        <tr>
          <td data-label="Student Name"><b>${escapeHtml(r.studentName)}</b></td>
          <td data-label="Student ID">${escapeHtml(r.studentId)}</td>
          <td data-label="Course">${escapeHtml(r.course || currentCategory)}</td>
          <td data-label="Score / 20">${hasResult ? r.score + " / 20" : "Not Attended"}</td>
          <td data-label="Percentage">${hasResult ? Math.round(r.percentage != null ? r.percentage : (r.score / 20) * 100) + "%" : "—"}</td>
          <td data-label="Correct">${hasResult ? r.correctCount : "—"}</td>
          <td data-label="Wrong">${hasResult ? r.wrongCount : "—"}</td>
          <td data-label="Attempted Date">${hasResult ? formatDate(r.attemptedOn) : "—"}</td>
        </tr>
      `;
    }).join("");
  }

  if (mockScoreSearchInput) {
    mockScoreSearchInput.addEventListener("input", debounce(() => { mockScoresPage = 0; renderMockScoresPage(); }, 300));
  }

  // ---------------- Legacy PEST results panel (unchanged logic, Part P) ----------------
  const pestScoresTableBody = document.querySelector("#pestScoresTable tbody");
  const pestScoreSearchInput = document.getElementById("pestScoreSearch");
  const exportScoresBtn = document.getElementById("exportScoresBtn");
  const pestScoresPagerEl = document.getElementById("pestScoresPager");
  let allScores = [];
  let scoresPage = 0;
  let pestScoresLoaded = false;

  async function loadPestScores() {
    if (pestScoresLoaded) return;
    pestScoresLoaded = true;
    pestScoresTableBody.innerHTML = `<tr class="empty-row"><td colspan="7">Loading…</td></tr>`;
    try {
      allScores = await apiRequest("/api/skill-scores", { auth: true });
      scoresPage = 0;
      renderPestScoresPage();
    } catch (err) {
      pestScoresTableBody.innerHTML = `<tr class="empty-row"><td colspan="7">${escapeHtml(err.message)}</td></tr>`;
    }
  }

  function renderPestScoresPage() {
    const filtered = allScores.filter(r => matchesSearch(r, [
      x => x.name, x => x.phone, x => x.department
    ], pestScoreSearchInput.value));
    const { pageRows, page, totalPages } = paginateRows(filtered, scoresPage);
    scoresPage = page;
    renderPestScores(pageRows);
    renderPager(pestScoresPagerEl, scoresPage, totalPages,
      function () { if (scoresPage > 0) { scoresPage--; renderPestScoresPage(); } },
      function () { scoresPage++; renderPestScoresPage(); }
    );
  }

  function renderPestScores(rows) {
    if (!rows.length) {
      pestScoresTableBody.innerHTML = `<tr class="empty-row"><td colspan="7">No skill test attempts yet.</td></tr>`;
      return;
    }
    pestScoresTableBody.innerHTML = rows.map(r => `
      <tr>
        <td data-label="Name"><b>${escapeHtml(r.name)}</b></td>
        <td data-label="Phone Number">${escapeHtml(r.phone)}</td>
        <td data-label="Department">${escapeHtml(r.department)}</td>
        <td data-label="Score">${r.score} / ${r.totalMarks}</td>
        <td data-label="Correct / Total">${r.correctCount} / ${r.totalQuestions}</td>
        <td data-label="Attempted On">${formatDate(r.attemptedOn)}</td>
        <td data-label="Actions"><button class="table-btn danger" data-delete-score="${r.id}">Delete</button></td>
      </tr>
    `).join("");
  }

  if (pestScoreSearchInput) {
    pestScoreSearchInput.addEventListener("input", debounce(() => { scoresPage = 0; renderPestScoresPage(); }, 300));
  }

  // Lazily load PEST data only once the Admin actually opens the
  // collapsed legacy panel, instead of on every Student Skill Scores visit.
  const legacyPestPanel = document.querySelector(".legacy-pest-panel");
  if (legacyPestPanel) {
    legacyPestPanel.addEventListener("toggle", function () {
      if (legacyPestPanel.open) loadPestScores();
    });
  }

  if (exportScoresBtn) {
    exportScoresBtn.addEventListener("click", async function () {
      exportScoresBtn.disabled = true;
      const originalText = exportScoresBtn.textContent;
      exportScoresBtn.textContent = "Preparing file…";
      try {
        const res = await fetch(`${API_BASE_URL}/api/skill-scores/export`, {
          headers: { Authorization: "Bearer " + Auth.getToken() }
        });
        if (!res.ok) throw new Error("Could not generate the report");
        const blob = await res.blob();
        const url = URL.createObjectURL(blob);
        const a = document.createElement("a");
        a.href = url;
        a.download = "PEST-Exam-Results.xlsx";
        document.body.appendChild(a);
        a.click();
        a.remove();
      } catch (err) {
        showToast(err.message, "error");
      } finally {
        exportScoresBtn.disabled = false;
        exportScoresBtn.textContent = originalText;
      }
    });
  }

  // ================================================================
  // Single delegated click handler for every table action button
  // (Assign/Edit Certificate jump, Delete Certificate, Delete User, Delete Score)
  // ================================================================
  document.addEventListener("click", async function (e) {

    // Assign / Edit Certificate -> jump to the Assign Certificate tab, pre-selected
    const gotoBtn = e.target.closest("[data-goto-assign]");
    if (gotoBtn) {
      const studentId = gotoBtn.dataset.gotoAssign;
      goToSection("section-assign");
      selectStudentForAssign(studentId);
      return;
    }

    // Delete Certificate (reverts that student back to Pending)
    const delCertBtn = e.target.closest("[data-delete-cert]");
    if (delCertBtn) {
      const studentId = delCertBtn.dataset.deleteCert;
      const name = delCertBtn.dataset.name || studentId;
      if (!confirm(`Delete the issued certificate for ${name}? They will show as Pending again.`)) return;

      delCertBtn.disabled = true;
      try {
        await apiRequest(`/api/admin/certificates/${encodeURIComponent(studentId)}`, { method: "DELETE", auth: true });
        showToast("Certificate deleted", "success");
        loadStudents();
        if (document.getElementById("section-assign").classList.contains("active")) {
          loadAssignList();
        }
      } catch (err) {
        showToast(err.message, "error");
        delCertBtn.disabled = false;
      }
      return;
    }

    // Delete User (permanently removes the student + their certificate/files)
    const delUserBtn = e.target.closest("[data-delete-user]");
    if (delUserBtn) {
      const studentId = delUserBtn.dataset.deleteUser;
      const name = delUserBtn.dataset.name || studentId;
      if (!confirm(`Permanently delete ${name} (${studentId})? This also removes their certificate and cannot be undone.`)) return;

      delUserBtn.disabled = true;
      try {
        await apiRequest(`/api/admin/students/${encodeURIComponent(studentId)}`, { method: "DELETE", auth: true });
        showToast("Student deleted", "success");
        loadStudents();
      } catch (err) {
        showToast(err.message, "error");
        delUserBtn.disabled = false;
      }
      return;
    }

    // Delete a PEST skill-score attempt
    const delScoreBtn = e.target.closest("[data-delete-score]");
    if (delScoreBtn) {
      if (!confirm("Delete this attempt? This cannot be undone.")) return;
      delScoreBtn.disabled = true;
      try {
        await apiRequest(`/api/skill-scores/${delScoreBtn.dataset.deleteScore}`, { method: "DELETE", auth: true });
        showToast("Attempt deleted", "success");
        pestScoresLoaded = false;
        loadPestScores();
      } catch (err) {
        showToast(err.message, "error");
        delScoreBtn.disabled = false;
      }
      return;
    }
  });

  // ================================================================
  // 4) ATTENDANCE / STUDENT PERFORMANCE (Image 1 reference)
  // ================================================================
  const attendanceDateInput = document.getElementById("attendanceDateInput");
  const attDateDisplayLabel = document.getElementById("attDateDisplayLabel");
  const attendanceTableBody = document.getElementById("attendanceTableBody") || document.querySelector("#attendanceTable tbody");
  const attendancePagerEl = document.getElementById("attendancePager");
  const studentPerfContainer = document.querySelector(".student-perf-container");
  const studentPerfDrawer = document.getElementById("studentPerfDrawer");
  const perfDrawerContent = document.getElementById("perfDrawerContent");
  const closePerfDrawerBtn = document.getElementById("closePerfDrawerBtn");

  let allAttendance = [];
  let attendancePage = 0;
  const ATTENDANCE_PAGE_SIZE = 8;
  let perfSelectedStudentId = null;

  function todayIso() {
    const d = new Date();
    const pad = n => String(n).padStart(2, "0");
    return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
  }

  function formatDisplayDate(isoDate) {
    if (!isoDate) return "18 - 09 - 2026";
    const parts = isoDate.split("-");
    if (parts.length === 3) {
      return `${parts[2]} - ${parts[1]} - ${parts[0]}`;
    }
    return isoDate;
  }

  function getInitials(name) {
    if (!name) return "ST";
    const parts = name.trim().split(/\s+/);
    if (parts.length === 1) return parts[0].substring(0, 2).toUpperCase();
    return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
  }

  if (attendanceDateInput) {
    attendanceDateInput.value = todayIso();
    if (attDateDisplayLabel) {
      attDateDisplayLabel.textContent = formatDisplayDate(attendanceDateInput.value);
    }
    attendanceDateInput.addEventListener("change", function () {
      if (attDateDisplayLabel) {
        attDateDisplayLabel.textContent = formatDisplayDate(this.value);
      }
      loadAttendanceSection();
    });
  }

  function loadAttendanceSection() {
    loadAttendanceTable();
  }

  async function loadAttendanceTable() {
    if (attendanceTableBody) {
      attendanceTableBody.innerHTML = `<tr class="empty-row"><td colspan="6">Loading students…</td></tr>`;
    }
    try {
      allAttendance = await Api.attendance.adminForDate(attendanceDateInput ? attendanceDateInput.value : "", "") || [];
      attendancePage = 0;
      renderAttendancePage();
      if (perfSelectedStudentId) {
        const student = allAttendance.find(s => s.studentId === perfSelectedStudentId);
        if (student) {
          renderStudentDetailsDrawer(student);
        }
      }
    } catch (err) {
      if (attendanceTableBody) {
        attendanceTableBody.innerHTML = `<tr class="empty-row"><td colspan="6">${escapeHtml(err.message)}</td></tr>`;
      }
    }
  }

  function renderAttendancePage() {
    const totalItems = allAttendance.length;
    const totalPages = Math.max(1, Math.ceil(totalItems / ATTENDANCE_PAGE_SIZE));
    const safePage = Math.min(Math.max(attendancePage, 0), totalPages - 1);
    attendancePage = safePage;
    const start = safePage * ATTENDANCE_PAGE_SIZE;
    const pageRows = allAttendance.slice(start, start + ATTENDANCE_PAGE_SIZE);

    renderAttendanceTable(pageRows);
    renderCustomPager(attendancePagerEl, attendancePage, totalPages, totalItems, ATTENDANCE_PAGE_SIZE, "students",
      function () { if (attendancePage > 0) { attendancePage--; renderAttendancePage(); } },
      function () { if (attendancePage < totalPages - 1) { attendancePage++; renderAttendancePage(); } }
    );
  }

  function renderAttendanceTable(rows) {
    if (!attendanceTableBody) return;
    if (!rows.length) {
      attendanceTableBody.innerHTML = `<tr class="empty-row"><td colspan="6">No students found.</td></tr>`;
      return;
    }
    attendanceTableBody.innerHTML = rows.map(r => {
      const initials = getInitials(r.studentName);
      const perf = r.performancePercent != null ? r.performancePercent : 85;
      const isSelected = perfSelectedStudentId === r.studentId;

      return `
        <tr class="clickable-student-row ${isSelected ? 'row-selected' : ''}" data-student-id="${escapeHtml(r.studentId)}">
          <td data-label="Name">
            <div class="student-cell">
              <div class="avatar-initials-circle">${escapeHtml(initials)}</div>
              <span class="student-name-txt">${escapeHtml(r.studentName)}</span>
            </div>
          </td>
          <td data-label="Present" style="text-align:center;">
            <span class="badge-pill present">${r.presentCount != null ? r.presentCount : 0}</span>
          </td>
          <td data-label="Absent" style="text-align:center;">
            <span class="badge-pill absent">${r.absentCount != null ? r.absentCount : 0}</span>
          </td>
          <td data-label="Leave" style="text-align:center;">
            <span class="badge-pill leave">${r.leaveCount != null ? r.leaveCount : 0}</span>
          </td>
          <td data-label="Performance">
            <div class="perf-bar-container">
              <span class="perf-percent-txt">${perf}%</span>
              <div class="perf-bar-track">
                <div class="perf-bar-fill" style="width: ${Math.min(100, Math.max(0, perf))}%;"></div>
              </div>
            </div>
          </td>
          <td style="text-align:right;">
            <span class="row-arrow-btn">&rsaquo;</span>
          </td>
        </tr>
      `;
    }).join("");
  }

  if (attendanceTableBody) {
    attendanceTableBody.addEventListener("click", function (e) {
      const row = e.target.closest("tr[data-student-id]");
      if (!row) return;
      const studentId = row.dataset.studentId;
      perfSelectedStudentId = studentId;
      const student = allAttendance.find(s => s.studentId === studentId);
      if (student) {
        if (studentPerfContainer) studentPerfContainer.classList.add("drawer-open");
        renderStudentDetailsDrawer(student);
        renderAttendancePage();
      }
    });
  }

  if (closePerfDrawerBtn) {
    closePerfDrawerBtn.addEventListener("click", function () {
      if (studentPerfContainer) studentPerfContainer.classList.remove("drawer-open");
      perfSelectedStudentId = null;
      renderAttendancePage();
    });
  }

  function renderStudentDetailsDrawer(s) {
    if (!perfDrawerContent) return;
    const initials = getInitials(s.studentName);
    const perf = s.performancePercent != null ? s.performancePercent : 85;
    const curDateLabel = attendanceDateInput ? formatDisplayDate(attendanceDateInput.value) : "Today";
    const curStatus = s.status || "NOT_MARKED";

    perfDrawerContent.innerHTML = `
      <div class="drawer-profile-top">
        <div class="drawer-avatar-lg">${escapeHtml(initials)}</div>
        <h4 class="drawer-student-name">${escapeHtml(s.studentName)}</h4>
        <p class="drawer-student-dept">${escapeHtml(s.course || "Computer Science / IT")}</p>
      </div>

      <div class="drawer-contacts-card">
        <div class="drawer-contact-item">
          <div class="drawer-contact-icon">📞</div>
          <div class="drawer-contact-info">
            <span>Phone Number</span>
            <b>${escapeHtml(s.phone || "+91 98765 43210")}</b>
          </div>
        </div>
        <div class="drawer-contact-item">
          <div class="drawer-contact-icon">✉️</div>
          <div class="drawer-contact-info">
            <span>Email ID</span>
            <b>${escapeHtml(s.email || "student@gmail.com")}</b>
          </div>
        </div>
      </div>

      <h5 class="drawer-section-title">Attendance Summary</h5>
      <div class="drawer-summary-grid">
        <div class="drawer-sum-box present">
          <div class="drawer-sum-label">Present</div>
          <div class="drawer-sum-val">${s.presentCount != null ? s.presentCount : 0}</div>
        </div>
        <div class="drawer-sum-box absent">
          <div class="drawer-sum-label">Absent</div>
          <div class="drawer-sum-val">${s.absentCount != null ? s.absentCount : 0}</div>
        </div>
        <div class="drawer-sum-box leave">
          <div class="drawer-sum-label">Leave</div>
          <div class="drawer-sum-val">${s.leaveCount != null ? s.leaveCount : 0}</div>
        </div>
      </div>

      <div class="drawer-perf-block">
        <div class="drawer-perf-header">
          <span class="drawer-section-title" style="margin:0;">Performance</span>
          <span class="drawer-perf-val">${perf}%</span>
        </div>
        <div class="perf-bar-track" style="height:10px;">
          <div class="perf-bar-fill" style="width: ${Math.min(100, Math.max(0, perf))}%;"></div>
        </div>
      </div>

      <div class="drawer-mark-actions">
        <div class="drawer-mark-title">Mark Attendance (${escapeHtml(curDateLabel)})</div>
        <div class="drawer-mark-buttons">
          <button type="button" class="drawer-mark-btn present ${curStatus === 'PRESENT' ? 'active' : ''}" data-drawer-mark="PRESENT">Present</button>
          <button type="button" class="drawer-mark-btn absent ${curStatus === 'ABSENT' ? 'active' : ''}" data-drawer-mark="ABSENT">Absent</button>
          <button type="button" class="drawer-mark-btn leave ${curStatus === 'LEAVE' ? 'active' : ''}" data-drawer-mark="LEAVE">Leave</button>
        </div>
      </div>

      <button type="button" class="drawer-close-crimson-btn" id="drawerBottomCloseBtn">Close</button>
    `;

    const closeBtn = perfDrawerContent.querySelector("#drawerBottomCloseBtn");
    if (closeBtn) {
      closeBtn.addEventListener("click", function () {
        if (studentPerfContainer) studentPerfContainer.classList.remove("drawer-open");
        perfSelectedStudentId = null;
        renderAttendancePage();
      });
    }

    perfDrawerContent.querySelectorAll("[data-drawer-mark]").forEach(btn => {
      btn.addEventListener("click", async function () {
        const markStatus = this.dataset.drawerMark;
        this.disabled = true;
        try {
          await Api.attendance.mark({
            studentId: s.studentId,
            date: attendanceDateInput.value,
            status: markStatus
          });
          showToast(`Attendance marked as ${markStatus}`, "success");
          // Refresh list and drawer
          allAttendance = await Api.attendance.adminForDate(attendanceDateInput.value, "") || [];
          const updatedStudent = allAttendance.find(item => item.studentId === s.studentId);
          if (updatedStudent) {
            renderStudentDetailsDrawer(updatedStudent);
          }
          renderAttendancePage();
        } catch (err) {
          showToast(err.message, "error");
        } finally {
          this.disabled = false;
        }
      });
    });
  }

  // ================================================================
  // Generic Custom Pager (Matches "Showing 1 to 5 of 32 requests" & Prev/Next)
  // ================================================================
  function renderCustomPager(el, page, totalPages, totalItems, pageSize, label, onPrev, onNext) {
    if (!el) return;
    if (totalItems === 0) { el.innerHTML = ""; el.style.display = "none"; return; }
    el.style.display = "flex";
    const start = totalItems === 0 ? 0 : page * pageSize + 1;
    const end = Math.min((page + 1) * pageSize, totalItems);

    el.innerHTML = `
      <div style="font-size:.84rem; color:var(--ink-soft); font-weight:600;">
        Showing ${start} to ${end} of ${totalItems} ${label}
      </div>
      <div style="display:flex; align-items:center; gap:8px;">
        <button type="button" class="btn-outline btn btn-sm custom-prev-btn" style="border-radius:14px; font-weight:700;">&larr; Previous</button>
        <span style="font-size:.84rem; font-weight:700; color:var(--ink); padding:0 6px;">Page ${page + 1} of ${totalPages}</span>
        <button type="button" class="btn-outline btn btn-sm custom-next-btn" style="border-radius:14px; font-weight:700; color:var(--crimson); border-color:var(--line);">Next &rarr;</button>
      </div>
    `;

    const prevBtn = el.querySelector(".custom-prev-btn");
    const nextBtn = el.querySelector(".custom-next-btn");
    if (prevBtn) {
      prevBtn.disabled = page === 0;
      prevBtn.addEventListener("click", onPrev);
    }
    if (nextBtn) {
      nextBtn.disabled = page >= totalPages - 1;
      nextBtn.addEventListener("click", onNext);
    }
  }

  // ================================================================
  // 5) LOGIN & ACTIVITY (Real-time with Day, Week, Months Filtering)
  // ================================================================
  const sessionsTableBody = document.getElementById("sessionsTableBody") || document.querySelector("#sessionsTable tbody");
  const sessionSearchInput = document.getElementById("sessionSearch");
  const sessionPeriodSelect = document.getElementById("sessionPeriodSelect");
  const sessionDateRangeLabel = document.getElementById("sessionDateRangeLabel");
  const sessionsPagerEl = document.getElementById("sessionsPager");
  const sessionTrendFilter = document.getElementById("sessionTrendFilter");
  const sessionTrendChartTitle = document.getElementById("sessionTrendChartTitle");
  const sessionActiveCardLabel = document.getElementById("sessionActiveCardLabel");

  let rawStudentsList = [];
  let rawSessionRecords = [];
  let allSessions = [];
  let sessionsPage = 0;
  const SESSIONS_PAGE_SIZE = 5;

  function parseSessionDate(dateStr) {
    if (!dateStr) return null;
    const d = new Date(dateStr);
    if (!isNaN(d.getTime())) return d;
    const parts = String(dateStr).split(/[\s,]+/);
    if (parts.length >= 3) {
      const day = parseInt(parts[0], 10);
      const monthStr = parts[1];
      const year = parseInt(parts[2], 10);
      const months = ["jan", "feb", "mar", "apr", "may", "jun", "jul", "aug", "sep", "oct", "nov", "dec"];
      const monthIdx = months.indexOf((monthStr || "").toLowerCase().slice(0, 3));
      if (!isNaN(day) && monthIdx !== -1 && !isNaN(year)) {
        let hour = 0, min = 0;
        if (parts.length >= 4 && parts[3].includes(":")) {
          const [h, m] = parts[3].split(":").map(Number);
          hour = h || 0;
          min = m || 0;
          if (parts[4] && parts[4].toLowerCase() === "pm" && hour < 12) hour += 12;
          if (parts[4] && parts[4].toLowerCase() === "am" && hour === 12) hour = 0;
        }
        return new Date(year, monthIdx, day, hour, min);
      }
    }
    return null;
  }

  function getPeriodDateBounds(periodKey) {
    const now = new Date();
    const y = now.getFullYear();
    const m = now.getMonth();
    const d = now.getDate();

    switch (periodKey) {
      case "today": {
        const start = new Date(y, m, d, 0, 0, 0, 0);
        const end = new Date(y, m, d, 23, 59, 59, 999);
        return { start, end, label: formatDate(start) + " (Today)" };
      }
      case "this_week": {
        const dayOfWeek = (now.getDay() + 6) % 7; // Monday is 0
        const start = new Date(y, m, d - dayOfWeek, 0, 0, 0, 0);
        const end = new Date(y, m, d - dayOfWeek + 6, 23, 59, 59, 999);
        return { start, end, label: `${formatDate(start)} - ${formatDate(end)}` };
      }
      case "last_week": {
        const dayOfWeek = (now.getDay() + 6) % 7;
        const start = new Date(y, m, d - dayOfWeek - 7, 0, 0, 0, 0);
        const end = new Date(y, m, d - dayOfWeek - 1, 23, 59, 59, 999);
        return { start, end, label: `${formatDate(start)} - ${formatDate(end)}` };
      }
      case "this_month": {
        const start = new Date(y, m, 1, 0, 0, 0, 0);
        const end = new Date(y, m + 1, 0, 23, 59, 59, 999);
        return { start, end, label: `${formatDate(start)} - ${formatDate(end)}` };
      }
      case "month_sep_2026": {
        const start = new Date(2026, 8, 1, 0, 0, 0, 0);
        const end = new Date(2026, 8, 30, 23, 59, 59, 999);
        return { start, end, label: "01 Sep 2026 - 30 Sep 2026" };
      }
      case "month_aug_2026": {
        const start = new Date(2026, 7, 1, 0, 0, 0, 0);
        const end = new Date(2026, 7, 31, 23, 59, 59, 999);
        return { start, end, label: "01 Aug 2026 - 31 Aug 2026" };
      }
      case "month_jul_2026": {
        const start = new Date(2026, 6, 1, 0, 0, 0, 0);
        const end = new Date(2026, 6, 31, 23, 59, 59, 999);
        return { start, end, label: "01 Jul 2026 - 31 Jul 2026" };
      }
      case "all":
      default:
        return { start: null, end: null, label: "All Time" };
    }
  }

  function loadSessionsSection() {
    sessionsPage = 0;
    loadSessionsData();
    // Today Logins block at the bottom of this page (shared renderer + modal).
    renderTodayLogins();
    initTodayLoginsModal();
  }

  async function loadSessionsData() {
    if (sessionsTableBody) {
      sessionsTableBody.innerHTML = `<tr class="empty-row"><td colspan="7">Loading login records…</td></tr>`;
    }
    try {
      const [studentsResult, sessionsResult] = await Promise.all([
        // Trainer: roster comes from the Login & Activity API itself (LOGIN_ACTIVITY only,
        // department-scoped by the backend). Admin: unchanged.
        (IS_TRAINER ? Api.sessions.adminStudents() : Api.students.adminList("")).catch(() => []),
        Api.sessions.adminList({ page: 0, size: 1000 }).catch(() => ({ content: [] }))
      ]);

      rawStudentsList = Array.isArray(studentsResult) ? studentsResult : [];
      rawSessionRecords = Array.isArray(sessionsResult.content) ? sessionsResult.content : (Array.isArray(sessionsResult) ? sessionsResult : []);

      applySessionFiltersAndRender();
    } catch (err) {
      if (sessionsTableBody) {
        sessionsTableBody.innerHTML = `<tr class="empty-row"><td colspan="7">${escapeHtml(err.message)}</td></tr>`;
      }
    }
  }

  function applySessionFiltersAndRender() {
    const periodKey = sessionPeriodSelect ? sessionPeriodSelect.value : "this_week";
    const { start, end, label } = getPeriodDateBounds(periodKey);

    if (sessionDateRangeLabel) {
      sessionDateRangeLabel.textContent = label;
    }

    if (sessionActiveCardLabel) {
      const pText = periodKey === "today" ? "Today" : (periodKey === "this_week" ? "This Week" : (periodKey === "this_month" ? "This Month" : "Selected Period"));
      sessionActiveCardLabel.textContent = `Active Logins (${pText})`;
    }

    // Filter session records in period
    const inPeriodSessions = rawSessionRecords.filter(s => {
      if (!start || !end) return true;
      const sDate = parseSessionDate(s.loginTime || s.lastLogin || s.createdAt);
      if (!sDate) return true;
      return sDate >= start && sDate <= end;
    });

    // Group sessions by student
    const allSessionsByStudent = {};
    rawSessionRecords.forEach(s => {
      const sid = (s.studentId || "").toUpperCase();
      if (!allSessionsByStudent[sid]) allSessionsByStudent[sid] = [];
      allSessionsByStudent[sid].push(s);
    });

    const periodSessionsByStudent = {};
    inPeriodSessions.forEach(s => {
      const sid = (s.studentId || "").toUpperCase();
      if (!periodSessionsByStudent[sid]) periodSessionsByStudent[sid] = [];
      periodSessionsByStudent[sid].push(s);
    });

    // Build student session rows
    allSessions = rawStudentsList.map(stu => {
      const sid = (stu.studentId || "").toUpperCase();
      const allStudentSessions = allSessionsByStudent[sid] || [];
      const periodStudentSessions = periodSessionsByStudent[sid] || [];

      const totalLogins = allStudentSessions.length;
      const hasActive = periodStudentSessions.some(s => s.status === "ACTIVE" || s.status === "IDLE")
        || (periodKey === "all" ? (allStudentSessions.some(s => s.status === "ACTIVE" || s.status === "IDLE") || allStudentSessions.length > 0) : periodStudentSessions.length > 0);

      const latestSession = allStudentSessions.length > 0 ? allStudentSessions[0] : null;
      const lastLoginStr = latestSession ? (latestSession.lastLogin || latestSession.loginTime || "-") : "Never Logged In";

      return {
        studentId: stu.studentId,
        studentName: stu.fullName,
        email: stu.email || `${stu.studentId.toLowerCase()}@gmail.com`,
        course: stu.course || "-",
        lastLogin: lastLoginStr,
        status: hasActive ? "Active" : "Inactive",
        totalLogins: totalLogins
      };
    });

    // Compute live metrics
    const totalStudentsCount = rawStudentsList.length;
    const activeCount = allSessions.filter(s => s.status === "Active").length;
    const inactiveCount = Math.max(0, totalStudentsCount - activeCount);
    const totalSessionsCount = periodKey === "all" ? rawSessionRecords.length : inPeriodSessions.length;

    const kpiTot = document.getElementById("sessionKpiTotal");
    const kpiAct = document.getElementById("sessionKpiActive");
    const kpiSess = document.getElementById("sessionKpiSessions");
    const kpiInact = document.getElementById("sessionKpiInactive");
    if (kpiTot) kpiTot.textContent = totalStudentsCount;
    if (kpiAct) kpiAct.textContent = activeCount;
    if (kpiSess) kpiSess.textContent = totalSessionsCount;
    if (kpiInact) kpiInact.textContent = inactiveCount;

    // Same four values mirrored into the Dashboard summary cards (single calculation).
    [["dashKpiTotal", totalStudentsCount], ["dashKpiActive", activeCount],
     ["dashKpiSessions", totalSessionsCount], ["dashKpiInactive", inactiveCount]].forEach(([id, v]) => {
      const el = document.getElementById(id);
      if (el) el.textContent = v;
    });
    const dashActiveLabel = document.getElementById("dashActiveCardLabel");
    if (dashActiveLabel && sessionActiveCardLabel) dashActiveLabel.textContent = sessionActiveCardLabel.textContent;

    // Render trend chart and donut chart
    renderDynamicSessionTrend(inPeriodSessions, sessionTrendFilter ? sessionTrendFilter.value : "weekly", start, end);
    renderLoginDonutChart(activeCount, inactiveCount, totalStudentsCount);
    renderSessionsPage();
  }

  function renderDynamicSessionTrend(sessions, trendType, start, end) {
    const chartEl = document.getElementById("sessionWeeklyChart");
    if (!chartEl) return;

    let bars = [];
    let labels = [];

    if (trendType === "daily") {
      labels = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];
      const dayCounts = [0, 0, 0, 0, 0, 0, 0];
      sessions.forEach(s => {
        const d = parseSessionDate(s.loginTime || s.lastLogin || s.createdAt);
        if (d) {
          const idx = (d.getDay() + 6) % 7;
          dayCounts[idx]++;
        }
      });
      bars = dayCounts;
      if (sessionTrendChartTitle) sessionTrendChartTitle.textContent = "Daily Login Trend";
    } else if (trendType === "monthly") {
      labels = ["Jun", "Jul", "Aug", "Sep", "Oct", "Nov"];
      const monthIndices = [5, 6, 7, 8, 9, 10]; // Jun-Nov
      const monthCounts = [0, 0, 0, 0, 0, 0];
      sessions.forEach(s => {
        const d = parseSessionDate(s.loginTime || s.lastLogin || s.createdAt);
        if (d) {
          const m = d.getMonth();
          const p = monthIndices.indexOf(m);
          if (p !== -1) monthCounts[p]++;
        }
      });
      bars = monthCounts;
      if (sessionTrendChartTitle) sessionTrendChartTitle.textContent = "Monthly Login Trend";
    } else {
      // Weekly
      labels = ["Week 1", "Week 2", "Week 3", "Week 4"];
      const weekCounts = [0, 0, 0, 0];
      sessions.forEach(s => {
        const d = parseSessionDate(s.loginTime || s.lastLogin || s.createdAt);
        if (d) {
          const dateNum = d.getDate();
          if (dateNum <= 7) weekCounts[0]++;
          else if (dateNum <= 14) weekCounts[1]++;
          else if (dateNum <= 21) weekCounts[2]++;
          else weekCounts[3]++;
        }
      });
      bars = weekCounts;
      if (sessionTrendChartTitle) sessionTrendChartTitle.textContent = "Weekly Login Trend";
    }

    const maxCount = Math.max(...bars, 0);
    const maxVal = maxCount > 0 ? Math.max(5, Math.ceil(maxCount * 1.25)) : 5;
    const ySteps = [maxVal, Math.round(maxVal * 0.8), Math.round(maxVal * 0.6), Math.round(maxVal * 0.4), Math.round(maxVal * 0.2), 0];

    chartEl.innerHTML = `
      <div class="chart-y-axis">
        ${ySteps.map(step => `<span>${step}</span>`).join("")}
      </div>
      <div class="bar-chart-wrap">
        ${bars.map((val, i) => {
          const heightPercent = Math.min(100, Math.round((val / maxVal) * 100));
          return `
            <div class="bar-col" title="${escapeHtml(labels[i])}: ${val} logins">
              <div class="bar-fill" style="height: ${heightPercent}%;"></div>
              <span class="bar-label">${escapeHtml(labels[i])}</span>
            </div>
          `;
        }).join("")}
      </div>
    `;
  }

  function renderLoginDonutChart(active, inactive, total) {
    const donutEl = document.getElementById("sessionDonutChart");
    if (!donutEl) return;

    const safeTotal = total > 0 ? total : 0;
    const activePercent = safeTotal > 0 ? Math.round((active / safeTotal) * 100) : 0;
    const inactivePercent = safeTotal > 0 ? Math.max(0, 100 - activePercent) : 0;
    const dashOffset = safeTotal > 0 ? 251.2 - (251.2 * active / safeTotal) : 251.2;

    donutEl.innerHTML = `
      <div class="donut-svg-wrap">
        <svg viewBox="0 0 100 100" style="width:100%; height:100%; transform: rotate(-90deg);">
          <circle cx="50" cy="50" r="40" fill="none" stroke="#fecdd3" stroke-width="18"></circle>
          <circle cx="50" cy="50" r="40" fill="none" stroke="#991b1b" stroke-width="18"
            stroke-dasharray="251.2" stroke-dashoffset="${dashOffset}"
            stroke-linecap="round"></circle>
        </svg>
        <div class="donut-center-text">
          <span class="donut-center-label">Total Students</span>
          <span class="donut-center-val">${safeTotal}</span>
        </div>
      </div>
      <div class="donut-legend">
        <div class="donut-legend-item">
          <div class="donut-legend-row">
            <span class="donut-legend-dot" style="background:#10b981;"></span>
            <span>Active Logins</span>
            <b>${active} (${activePercent}%)</b>
          </div>
          <span class="donut-legend-sub" style="color:#10b981; font-weight:700;">Live in selected period</span>
        </div>
        <div class="donut-legend-item">
          <div class="donut-legend-row">
            <span class="donut-legend-dot" style="background:#f43f5e;"></span>
            <span>Inactive Students</span>
            <b>${inactive} (${inactivePercent}%)</b>
          </div>
          <span class="donut-legend-sub" style="color:#f43f5e; font-weight:700;">No login in selected period</span>
        </div>
      </div>
    `;
  }

  function renderSessionsPage() {
    const searchVal = sessionSearchInput ? sessionSearchInput.value : "";
    const filtered = allSessions.filter(r => matchesSearch(r, [
      x => x.studentId, x => x.studentName, x => x.email, x => x.course
    ], searchVal));

    const totalItems = filtered.length;
    const totalPages = Math.max(1, Math.ceil(totalItems / SESSIONS_PAGE_SIZE));
    const safePage = Math.min(Math.max(sessionsPage, 0), totalPages - 1);
    sessionsPage = safePage;
    const start = safePage * SESSIONS_PAGE_SIZE;
    const pageRows = filtered.slice(start, start + SESSIONS_PAGE_SIZE);

    renderSessionsTable(pageRows);
    renderCustomPager(sessionsPagerEl, sessionsPage, totalPages, totalItems, SESSIONS_PAGE_SIZE, "students",
      function () { if (sessionsPage > 0) { sessionsPage--; renderSessionsPage(); } },
      function () { if (sessionsPage < totalPages - 1) { sessionsPage++; renderSessionsPage(); } }
    );
  }

  function renderSessionsTable(rows) {
    if (!sessionsTableBody) return;
    if (!rows.length) {
      sessionsTableBody.innerHTML = `<tr class="empty-row"><td colspan="7">No session records found.</td></tr>`;
      return;
    }
    sessionsTableBody.innerHTML = rows.map(r => `
      <tr>
        <td data-label="STUDENT ID"><b>${escapeHtml(r.studentId)}</b></td>
        <td data-label="NAME"><b>${escapeHtml(r.studentName)}</b></td>
        <td data-label="EMAIL">${escapeHtml(r.email)}</td>
        <td data-label="COURSE">${escapeHtml(r.course || "-")}</td>
        <td data-label="LAST LOGIN">${escapeHtml(r.lastLogin)}</td>
        <td data-label="STATUS">
          <span class="badge-pill ${r.status === 'Active' ? 'active' : 'inactive'}">${escapeHtml(r.status)}</span>
        </td>
        <td data-label="TOTAL LOGINS"><b>${r.totalLogins}</b></td>
      </tr>
    `).join("");
  }

  if (sessionSearchInput) {
    sessionSearchInput.addEventListener("input", debounce(() => { sessionsPage = 0; renderSessionsPage(); }, 300));
  }

  if (sessionPeriodSelect) {
    sessionPeriodSelect.addEventListener("change", function () {
      sessionsPage = 0;
      applySessionFiltersAndRender();
    });
  }

  if (sessionTrendFilter) {
    sessionTrendFilter.addEventListener("change", function () {
      const periodKey = sessionPeriodSelect ? sessionPeriodSelect.value : "this_week";
      const { start, end } = getPeriodDateBounds(periodKey);
      const inPeriodSessions = rawSessionRecords.filter(s => {
        if (!start || !end) return true;
        const sDate = parseSessionDate(s.loginTime || s.lastLogin || s.createdAt);
        if (!sDate) return true;
        return sDate >= start && sDate <= end;
      });
      renderDynamicSessionTrend(inPeriodSessions, this.value, start, end);
    });
  }

  // ================================================================
  // 6) LEAVE MANAGEMENT (Real-time data and charts)
  // ================================================================
  const leaveTableBody = document.getElementById("leaveTableBody") || document.querySelector("#leaveTable tbody");
  const leaveSearchInput = document.getElementById("leaveSearch");
  const leaveCourseFilter = document.getElementById("leaveCourseFilter");
  const leavePeriodSelect = document.getElementById("leavePeriodSelect");
  const leaveDateRangeLabel = document.getElementById("leaveDateRangeLabel");
  const leavePagerEl = document.getElementById("leavePager");
  const rejectModalOverlay = document.getElementById("rejectModalOverlay");
  const rejectReasonInput = document.getElementById("rejectReasonInput");
  const rejectModalError = document.getElementById("rejectModalError");
  const rejectCancelBtn = document.getElementById("rejectCancelBtn");
  const rejectConfirmBtn = document.getElementById("rejectConfirmBtn");

  let rawLeaveList = [];
  let allLeave = [];
  let leavePage = 0;
  const LEAVE_PAGE_SIZE = 5;
  let pendingRejectId = null;

  function loadLeaveSection() {
    leavePage = 0;
    loadLeaveData();
  }

  async function loadLeaveData() {
    if (leaveTableBody) {
      leaveTableBody.innerHTML = `<tr class="empty-row"><td colspan="10">Loading leave requests…</td></tr>`;
    }
    try {
      const data = await Api.leave.adminList("", "");
      rawLeaveList = Array.isArray(data) ? data : [];
      applyLeaveFiltersAndRender();
    } catch (err) {
      if (leaveTableBody) {
        leaveTableBody.innerHTML = `<tr class="empty-row"><td colspan="10">${escapeHtml(err.message)}</td></tr>`;
      }
    }
  }

  function applyLeaveFiltersAndRender() {
    const periodKey = leavePeriodSelect ? leavePeriodSelect.value : "this_month";
    const { start, end, label } = getPeriodDateBounds(periodKey);

    if (leaveDateRangeLabel) {
      leaveDateRangeLabel.textContent = label;
    }

    // Filter by period
    allLeave = rawLeaveList.filter(l => {
      if (!start || !end) return true;
      const lDate = parseSessionDate(l.submittedOn || l.fromDate);
      if (!lDate) return true;
      return lDate >= start && lDate <= end;
    });

    // Real KPI counts
    const totalLeave = allLeave.length;
    const approvedCount = allLeave.filter(l => l.status === "APPROVED").length;
    const rejectedCount = allLeave.filter(l => l.status === "REJECTED").length;
    const pendingCount = allLeave.filter(l => l.status === "PENDING").length;

    const kpiTot = document.getElementById("leaveKpiTotal");
    const kpiApp = document.getElementById("leaveKpiApproved");
    const kpiRej = document.getElementById("leaveKpiRejected");
    const kpiPen = document.getElementById("leaveKpiPending");
    if (kpiTot) kpiTot.textContent = totalLeave;
    if (kpiApp) kpiApp.textContent = approvedCount;
    if (kpiRej) kpiRej.textContent = rejectedCount;
    if (kpiPen) kpiPen.textContent = pendingCount;

    renderRealLeaveTrendChart(allLeave);
    renderLeaveStatusDonut(approvedCount, rejectedCount, pendingCount, totalLeave);
    renderLeavePage();
  }

  function renderRealLeaveTrendChart(leaveItems) {
    const chartEl = document.getElementById("leaveWeeklyChart");
    if (!chartEl) return;

    const weeks = ["Week 1", "Week 2", "Week 3", "Week 4"];
    const weekCounts = [0, 0, 0, 0];

    leaveItems.forEach(l => {
      const d = parseSessionDate(l.submittedOn || l.fromDate);
      if (d) {
        const dateNum = d.getDate();
        if (dateNum <= 7) weekCounts[0]++;
        else if (dateNum <= 14) weekCounts[1]++;
        else if (dateNum <= 21) weekCounts[2]++;
        else weekCounts[3]++;
      }
    });

    const maxCount = Math.max(...weekCounts, 0);
    const maxVal = maxCount > 0 ? Math.max(5, Math.ceil(maxCount * 1.25)) : 5;
    const ySteps = [maxVal, Math.round(maxVal * 0.75), Math.round(maxVal * 0.5), Math.round(maxVal * 0.25), 0];

    chartEl.innerHTML = `
      <div class="chart-y-axis">
        ${ySteps.map(s => `<span>${s}</span>`).join("")}
      </div>
      <div class="bar-chart-wrap">
        ${weekCounts.map((val, i) => {
          const heightPercent = Math.min(100, Math.round((val / maxVal) * 100));
          return `
            <div class="bar-col" title="${escapeHtml(weeks[i])}: ${val} requests">
              <div class="bar-fill" style="height: ${heightPercent}%;"></div>
              <span class="bar-label">${weeks[i]}</span>
            </div>
          `;
        }).join("")}
      </div>
    `;
  }

  function renderLeaveStatusDonut(approved, rejected, pending, total) {
    const donutEl = document.getElementById("leaveStatusDonut");
    if (!donutEl) return;

    const safeTotal = total > 0 ? total : 0;
    const appPct = safeTotal > 0 ? Math.round((approved / safeTotal) * 100) : 0;
    const rejPct = safeTotal > 0 ? Math.round((rejected / safeTotal) * 100) : 0;
    const penPct = safeTotal > 0 ? Math.round((pending / safeTotal) * 100) : 0;

    const circumference = 251.2;
    const appLength = safeTotal > 0 ? (approved / safeTotal) * circumference : 0;
    const rejLength = safeTotal > 0 ? (rejected / safeTotal) * circumference : 0;
    const penLength = safeTotal > 0 ? (pending / safeTotal) * circumference : 0;

    donutEl.innerHTML = `
      <div class="donut-svg-wrap">
        <svg viewBox="0 0 100 100" style="width:100%; height:100%; transform: rotate(-90deg);">
          <circle cx="50" cy="50" r="40" fill="none" stroke="#e5e7eb" stroke-width="18"></circle>
          ${safeTotal > 0 ? `
            <circle cx="50" cy="50" r="40" fill="none" stroke="#10b981" stroke-width="18"
              stroke-dasharray="${appLength} ${circumference}" stroke-dashoffset="0"></circle>
            <circle cx="50" cy="50" r="40" fill="none" stroke="#ef4444" stroke-width="18"
              stroke-dasharray="${rejLength} ${circumference}" stroke-dashoffset="-${appLength}"></circle>
            <circle cx="50" cy="50" r="40" fill="none" stroke="#f59e0b" stroke-width="18"
              stroke-dasharray="${penLength} ${circumference}" stroke-dashoffset="-${appLength + rejLength}"></circle>
          ` : ''}
        </svg>
        <div class="donut-center-text">
          <span class="donut-center-label">Total</span>
          <span class="donut-center-val">${safeTotal}</span>
        </div>
      </div>
      <div class="donut-legend">
        <div class="donut-legend-item">
          <div class="donut-legend-row">
            <span class="donut-legend-dot" style="background:#10b981;"></span>
            <span>Approved</span>
            <b>${approved} (${appPct}%)</b>
          </div>
        </div>
        <div class="donut-legend-item">
          <div class="donut-legend-row">
            <span class="donut-legend-dot" style="background:#ef4444;"></span>
            <span>Rejected</span>
            <b>${rejected} (${rejPct}%)</b>
          </div>
        </div>
        <div class="donut-legend-item">
          <div class="donut-legend-row">
            <span class="donut-legend-dot" style="background:#f59e0b;"></span>
            <span>Pending</span>
            <b>${pending} (${penPct}%)</b>
          </div>
        </div>
      </div>
    `;
  }

  function renderLeavePage() {
    const searchVal = leaveSearchInput ? leaveSearchInput.value : "";
    const courseVal = leaveCourseFilter ? leaveCourseFilter.value : "";

    const filtered = allLeave.filter(r => {
      if (courseVal && r.course !== courseVal) return false;
      return matchesSearch(r, [
        x => x.studentName, x => x.studentEmail, x => x.course, x => x.leaveType, x => x.reason
      ], searchVal);
    });

    const totalItems = filtered.length;
    const totalPages = Math.max(1, Math.ceil(totalItems / LEAVE_PAGE_SIZE));
    const safePage = Math.min(Math.max(leavePage, 0), totalPages - 1);
    leavePage = safePage;
    const start = safePage * LEAVE_PAGE_SIZE;
    const pageRows = filtered.slice(start, start + LEAVE_PAGE_SIZE);

    renderLeaveTable(pageRows);
    renderCustomPager(leavePagerEl, leavePage, totalPages, totalItems, LEAVE_PAGE_SIZE, "requests",
      function () { if (leavePage > 0) { leavePage--; renderLeavePage(); } },
      function () { if (leavePage < totalPages - 1) { leavePage++; renderLeavePage(); } }
    );
  }

  function renderLeaveTable(rows) {
    if (!leaveTableBody) return;
    if (!rows.length) {
      leaveTableBody.innerHTML = `<tr class="empty-row"><td colspan="10">No leave requests found.</td></tr>`;
      return;
    }
    leaveTableBody.innerHTML = rows.map(r => {
      const isPending = r.status === "PENDING";
      const statusClass = r.status ? r.status.toLowerCase() : "pending";
      const statusLabel = r.status ? (r.status.charAt(0) + r.status.slice(1).toLowerCase()) : "Pending";

      return `
        <tr>
          <td data-label="NAME"><b>${escapeHtml(r.studentName)}</b></td>
          <td data-label="EMAIL">${escapeHtml(r.studentEmail || "-")}</td>
          <td data-label="COURSE">${escapeHtml(r.course || "-")}</td>
          <td data-label="LEAVE TYPE">${escapeHtml(r.leaveType)}</td>
          <td data-label="FROM DATE">${escapeHtml(r.fromDate)}</td>
          <td data-label="TO DATE">${escapeHtml(r.toDate)}</td>
          <td data-label="DAYS" style="text-align:center;"><b>${r.days || 1}</b></td>
          <td data-label="REASON">${escapeHtml(r.reason)}</td>
          <td data-label="STATUS">
            <span class="badge-pill ${statusClass}">${escapeHtml(statusLabel)}</span>
          </td>
          <td data-label="ACTION">
            <div class="leave-actions-cell">
              ${isPending ? `
                <button class="btn-leave-approve" data-leave-approve="${r.id}">Approve</button>
                <button class="btn-leave-reject" data-leave-reject="${r.id}">Reject</button>
              ` : `
                <span style="font-size:.82rem; color:var(--ink-soft);">Reviewed</span>
              `}
            </div>
          </td>
        </tr>
      `;
    }).join("");
  }

  if (leaveSearchInput) {
    leaveSearchInput.addEventListener("input", debounce(() => { leavePage = 0; renderLeavePage(); }, 300));
  }
  if (leaveCourseFilter) {
    leaveCourseFilter.addEventListener("change", () => { leavePage = 0; renderLeavePage(); });
  }
  if (leavePeriodSelect) {
    leavePeriodSelect.addEventListener("change", function () {
      leavePage = 0;
      applyLeaveFiltersAndRender();
    });
  }

  if (leaveTableBody) {
    leaveTableBody.addEventListener("click", async function (e) {
      const approveBtn = e.target.closest("[data-leave-approve]");
      if (approveBtn) {
        const leaveId = approveBtn.dataset.leaveApprove;
        approveBtn.disabled = true;
        try {
          await Api.leave.approve(leaveId);
          showToast("Leave request approved", "success");
          loadLeaveData();
        } catch (err) {
          showToast(err.message, "error");
          approveBtn.disabled = false;
        }
        return;
      }

      const rejectBtn = e.target.closest("[data-leave-reject]");
      if (rejectBtn) {
        pendingRejectId = rejectBtn.dataset.leaveReject;
        if (rejectReasonInput) rejectReasonInput.value = "";
        if (rejectModalError) rejectModalError.classList.remove("show");
        if (rejectModalOverlay) {
          rejectModalOverlay.style.display = "flex";
          if (rejectReasonInput) rejectReasonInput.focus();
        }
      }
    });
  }

  if (rejectCancelBtn) {
    rejectCancelBtn.addEventListener("click", function () {
      if (rejectModalOverlay) rejectModalOverlay.style.display = "none";
      pendingRejectId = null;
    });
  }

  if (rejectConfirmBtn) {
    rejectConfirmBtn.addEventListener("click", async function () {
      const reason = rejectReasonInput ? rejectReasonInput.value.trim() : "";
      if (!reason) {
        if (rejectModalError) {
          rejectModalError.textContent = "Please enter a reason for rejecting this request.";
          rejectModalError.classList.add("show");
        }
        return;
      }

      rejectConfirmBtn.disabled = true;
      rejectConfirmBtn.textContent = "Rejecting…";
      try {
        await Api.leave.reject(pendingRejectId, reason);
        showToast("Leave request rejected", "success");
        if (rejectModalOverlay) rejectModalOverlay.style.display = "none";
        pendingRejectId = null;
        loadLeaveData();
      } catch (err) {
        if (rejectModalError) {
          rejectModalError.textContent = err.message;
          rejectModalError.classList.add("show");
        }
      } finally {
        rejectConfirmBtn.disabled = false;
        rejectConfirmBtn.textContent = "Confirm Reject";
      }
    });
  }

  // ================================================================
  // 7) MY PROJECTS (admin)
  // Endpoints (Api.projects.*) are new - see the API contract shared
  // with the backend team. Frontend flow is fully wired; will populate
  // as soon as the backend implements these routes.
  // ================================================================
  const projectsTableBody = document.querySelector("#projectsTable tbody");
  const projectSearchInput = document.getElementById("projectSearch");
  const projectFilterChips = document.querySelectorAll("[data-project-filter]");
  const projectsPagerEl = document.getElementById("projectsPager");
  let projectStatusFilter = "";
  let allProjects = [];
  let projectsPage = 0;

  function loadProjectsSection() {
    projectsPage = 0;
    loadProjectsTable();
  }

  async function loadProjectsTable() {
    projectsTableBody.innerHTML = `<tr class="empty-row"><td colspan="6">Loading…</td></tr>`;
    try {
      allProjects = await Api.projects.adminList({ status: projectStatusFilter }) || [];
      renderProjectsPage();
    } catch (err) {
      projectsTableBody.innerHTML = `<tr class="empty-row"><td colspan="6">${escapeHtml(err.message)}</td></tr>`;
    }
  }

  function renderProjectsPage() {
    const filtered = allProjects.filter(p => matchesSearch(p, [
      x => x.studentId, x => x.studentName, x => x.title
    ], projectSearchInput.value));
    const { pageRows, page, totalPages } = paginateRows(filtered, projectsPage);
    projectsPage = page;
    renderProjectsTable(pageRows);
    renderPager(projectsPagerEl, projectsPage, totalPages,
      function () { if (projectsPage > 0) { projectsPage--; renderProjectsPage(); } },
      function () { projectsPage++; renderProjectsPage(); }
    );
  }

  function renderProjectsTable(rows) {
    if (!rows.length) {
      projectsTableBody.innerHTML = `<tr class="empty-row"><td colspan="6">No projects found.</td></tr>`;
      return;
    }
    projectsTableBody.innerHTML = rows.map(p => {
      const percent = Math.max(0, Math.min(100, p.progressPercent || 0));
      const needsReview = p.status === "SUBMITTED" || p.status === "UNDER_REVIEW";
      const actions = needsReview
        ? `<button class="table-btn review" data-review-project="${p.id}">Review</button>`
        : "";
      return `
        <tr>
          <td data-label="Student"><b>${escapeHtml(p.studentName)}</b><br><small style="color:var(--ink-soft);">${escapeHtml(p.studentId)}</small></td>
          <td data-label="Title">${escapeHtml(p.title)}</td>
          <td data-label="Due Date">${escapeHtml(p.dueDate || "-")}</td>
          <td data-label="Progress">${percent}%</td>
          <td data-label="Status">${statusBadge(p.status)}</td>
          <td data-label="Actions">${actions}</td>
        </tr>
      `;
    }).join("");
  }

  projectSearchInput.addEventListener("input", debounce(() => { projectsPage = 0; renderProjectsPage(); }, 300));

  projectFilterChips.forEach(chip => {
    chip.addEventListener("click", function () {
      projectFilterChips.forEach(c => c.classList.remove("active"));
      this.classList.add("active");
      projectStatusFilter = this.dataset.projectFilter;
      projectsPage = 0;
      loadProjectsTable();
    });
  });

  // ---- Review Project modal ----
  const reviewProjectModalOverlay = document.getElementById("reviewProjectModalOverlay");
  const reviewDecisionSelect = document.getElementById("reviewDecisionSelect");
  const reviewFeedbackInput = document.getElementById("reviewFeedbackInput");
  const reviewProjectModalError = document.getElementById("reviewProjectModalError");
  const reviewProjectCancelBtn = document.getElementById("reviewProjectCancelBtn");
  const reviewProjectConfirmBtn = document.getElementById("reviewProjectConfirmBtn");
  let pendingReviewProjectId = null;

  projectsTableBody.addEventListener("click", function (e) {
    const btn = e.target.closest("[data-review-project]");
    if (!btn) return;
    pendingReviewProjectId = btn.dataset.reviewProject;
    reviewDecisionSelect.value = "APPROVED";
    reviewFeedbackInput.value = "";
    reviewProjectModalError.classList.remove("show");
    reviewProjectModalOverlay.style.display = "flex";
  });

  reviewProjectCancelBtn.addEventListener("click", function () {
    reviewProjectModalOverlay.style.display = "none";
    pendingReviewProjectId = null;
  });

  reviewProjectConfirmBtn.addEventListener("click", async function () {
    reviewProjectConfirmBtn.disabled = true;
    reviewProjectConfirmBtn.textContent = "Saving…";
    try {
      await Api.projects.adminReview(pendingReviewProjectId, {
        decision: reviewDecisionSelect.value,
        adminFeedback: reviewFeedbackInput.value.trim()
      });
      showToast("Review submitted", "success");
      reviewProjectModalOverlay.style.display = "none";
      pendingReviewProjectId = null;
      loadProjectsTable();
    } catch (err) {
      reviewProjectModalError.textContent = err.message;
      reviewProjectModalError.classList.add("show");
    } finally {
      reviewProjectConfirmBtn.disabled = false;
      reviewProjectConfirmBtn.textContent = "Submit Review";
    }
  });

  // ================================================================
  // 8) NOTIFICATIONS (admin)
  // ================================================================
  const adminNotifListEl = document.getElementById("adminNotifList");
  const adminNotifPagerEl = document.getElementById("adminNotifPager");
  const adminNotifSearchInput = document.getElementById("adminNotifSearch");
  const notifCategoryTabsContainer = document.getElementById("notifCategoryTabs");
  const notifPeriodSelect = document.getElementById("notifPeriodSelect");
  const notifDateRangeLabel = document.getElementById("notifDateRangeLabel");
  const notifMarkAllReadBtn = document.getElementById("notifMarkAllReadBtn");
  const notifClearAllBtn = document.getElementById("notifClearAllBtn");
  const notifSettingsBtn = document.getElementById("notifSettingsBtn");
  const notifManagePrefBtn = document.getElementById("notifManagePrefBtn");
  const recentUnreadListEl = document.getElementById("recentUnreadList");
  const viewAllUnreadBtn = document.getElementById("viewAllUnreadBtn");

  let allAdminNotifs = [];
  let currentNotifCategory = "ALL";
  let adminNotifPage = 0;

  function getNotifTypeMeta(type, title, message) {
    const raw = (type || "").toUpperCase();
    const t = (title || "").toLowerCase();
    const m = (message || "").toLowerCase();

    if (raw === "LEAVE_REQUEST" || raw === "LEAVE" || t.includes("leave") || m.includes("leave")) {
      return { tagClass: "tag-leave", circleClass: "leave", icon: "✉️", label: "Leave Request", category: "LEAVE_REQUEST" };
    }
    if (raw === "REGISTRATION" || raw === "STUDENT" || t.includes("registration") || m.includes("register") || m.includes("student account")) {
      return { tagClass: "tag-reg", circleClass: "reg", icon: "👤", label: "Registration", category: "REGISTRATION" };
    }
    if (raw === "ATTENDANCE" || t.includes("attendance") || m.includes("attendance")) {
      return { tagClass: "tag-att", circleClass: "att", icon: "🗓️", label: "Attendance", category: "ATTENDANCE" };
    }
    if (raw === "CERTIFICATE" || t.includes("certificate") || m.includes("certificate")) {
      return { tagClass: "tag-cert", circleClass: "cert", icon: "🎓", label: "Certificate", category: "CERTIFICATE" };
    }
    if (raw === "PROJECT" || t.includes("project") || m.includes("project")) {
      return { tagClass: "tag-update", circleClass: "system", icon: "💻", label: "Project", category: "SYSTEM" };
    }
    return { tagClass: "tag-system", circleClass: "alert", icon: "🔔", label: "System", category: "SYSTEM" };
  }

  function updateNotifCounters() {
    let unreadCount = 0;
    let leaveCount = 0;
    let regCount = 0;
    let attCount = 0;
    let certCount = 0;
    let sysCount = 0;

    allAdminNotifs.forEach(n => {
      if (!n.read) unreadCount++;
      const meta = getNotifTypeMeta(n.type, n.title, n.message);
      if (meta.category === "LEAVE_REQUEST") leaveCount++;
      else if (meta.category === "REGISTRATION") regCount++;
      else if (meta.category === "ATTENDANCE") attCount++;
      else if (meta.category === "CERTIFICATE") certCount++;
      else sysCount++;
    });

    const totalEl = document.getElementById("notifKpiTotal");
    const unreadEl = document.getElementById("notifKpiUnread");
    const leaveEl = document.getElementById("notifKpiLeave");
    const sysEl = document.getElementById("notifKpiSystem");

    if (totalEl) totalEl.textContent = allAdminNotifs.length;
    if (unreadEl) unreadEl.textContent = unreadCount;
    if (leaveEl) leaveEl.textContent = leaveCount;
    if (sysEl) sysEl.textContent = sysCount;

    const tabLeave = document.getElementById("tabCountLeave");
    const tabReg = document.getElementById("tabCountReg");
    const tabAtt = document.getElementById("tabCountAtt");
    const tabCert = document.getElementById("tabCountCert");
    const tabSys = document.getElementById("tabCountSys");

    if (tabLeave) tabLeave.textContent = leaveCount;
    if (tabReg) tabReg.textContent = regCount;
    if (tabAtt) tabAtt.textContent = attCount;
    if (tabCert) tabCert.textContent = certCount;
    if (tabSys) tabSys.textContent = sysCount;
  }

  function renderRecentUnreadSidebar() {
    if (!recentUnreadListEl) return;
    const unreadItems = allAdminNotifs.filter(n => !n.read).slice(0, 4);
    if (!unreadItems.length) {
      recentUnreadListEl.innerHTML = `<div style="color:var(--ink-soft); font-size:.82rem; padding:8px 0;">All caught up! No unread notifications.</div>`;
      return;
    }
    recentUnreadListEl.innerHTML = unreadItems.map(n => {
      const meta = getNotifTypeMeta(n.type, n.title, n.message);
      const title = n.title || meta.label;
      return `
        <div class="recent-unread-item">
          <span class="unread-dot" style="margin-top: 4px;"></span>
          <div class="recent-unread-txt">
            <div class="recent-unread-top">
              <span class="recent-unread-title">${escapeHtml(title)}</span>
              <span class="recent-unread-time">${escapeHtml(n.createdOn || "")}</span>
            </div>
            <div class="recent-unread-sub">${escapeHtml(n.message || "")}</div>
          </div>
        </div>
      `;
    }).join("");
  }

  async function loadAdminNotifications() {
    if (!adminNotifListEl) return;
    adminNotifListEl.innerHTML = `<div class="empty-row-padded">Loading notifications…</div>`;
    try {
      allAdminNotifs = await Api.notifications.adminList() || [];
      adminNotifPage = 0;
      updateNotifCounters();
      renderRecentUnreadSidebar();
      renderAdminNotificationsPage();
    } catch (err) {
      adminNotifListEl.innerHTML = `<div class="empty-row-padded" style="color:var(--crimson);">${escapeHtml(err.message)}</div>`;
    }
  }

  function getFilteredNotifications() {
    const query = (adminNotifSearchInput ? adminNotifSearchInput.value : "").trim().toLowerCase();
    return allAdminNotifs.filter(n => {
      const meta = getNotifTypeMeta(n.type, n.title, n.message);
      
      // Category Tab filter
      if (currentNotifCategory !== "ALL") {
        if (meta.category !== currentNotifCategory) return false;
      }

      // Search Query filter
      if (query) {
        const fullTxt = `${n.title || ""} ${n.message || ""} ${meta.label} ${n.createdOn || ""}`.toLowerCase();
        if (!fullTxt.includes(query)) return false;
      }

      return true;
    });
  }

  function renderAdminNotificationsPage() {
    const filtered = getFilteredNotifications();
    const { pageRows, page, totalPages } = paginateRows(filtered, adminNotifPage);
    adminNotifPage = page;
    renderAdminNotifications(pageRows);
    renderPager(adminNotifPagerEl, adminNotifPage, totalPages,
      function () { if (adminNotifPage > 0) { adminNotifPage--; renderAdminNotificationsPage(); } },
      function () { adminNotifPage++; renderAdminNotificationsPage(); }
    );
  }

  function renderAdminNotifications(rows) {
    if (!adminNotifListEl) return;
    if (!rows.length) {
      adminNotifListEl.innerHTML = `
        <div class="empty-state" style="padding:40px 20px; text-align:center;">
          <div class="empty-icon" style="font-size:2rem; margin-bottom:8px;">🔔</div>
          <h4 style="margin:0 0 6px; font-weight:800; color:var(--ink);">No notifications found</h4>
          <p style="margin:0; font-size:.84rem; color:var(--ink-soft);">No activities match your current filter.</p>
        </div>
      `;
      return;
    }

    adminNotifListEl.innerHTML = rows.map(n => {
      const meta = getNotifTypeMeta(n.type, n.title, n.message);
      const title = n.title || meta.label;
      const isUnread = !n.read;
      return `
        <div class="notif-item-row" data-id="${escapeHtml(n.id)}">
          <div class="notif-lead">
            <div class="notif-icon-circle ${meta.circleClass}">
              ${escapeHtml(n.icon || meta.icon)}
            </div>
            <div class="notif-text-block">
              <div class="notif-title-row">
                <span class="notif-title-txt">${escapeHtml(title)}</span>
                ${isUnread ? '<span class="unread-dot"></span>' : ''}
              </div>
              <div class="notif-desc-txt">${escapeHtml(n.message || "")}</div>
            </div>
          </div>
          <div>
            <span class="notif-tag ${meta.tagClass}">${escapeHtml(meta.label)}</span>
          </div>
          <div>
            <span class="notif-datetime-txt">${escapeHtml(n.createdOn || "-")}</span>
          </div>
          <div class="notif-action-cell">
            <button type="button" class="btn-notif-view" data-id="${escapeHtml(n.id)}">View</button>
            <button type="button" class="btn-notif-more" data-id="${escapeHtml(n.id)}">⋮</button>
          </div>
        </div>
      `;
    }).join("");

    // Bind action listeners
    adminNotifListEl.querySelectorAll(".btn-notif-view").forEach(btn => {
      btn.addEventListener("click", async function () {
        const id = this.getAttribute("data-id");
        const notif = allAdminNotifs.find(x => String(x.id) === String(id));
        if (notif && !notif.read) {
          try {
            await Api.notifications.adminMarkRead(id);
            notif.read = true;
            updateNotifCounters();
            renderRecentUnreadSidebar();
            renderAdminNotificationsPage();
          } catch (e) {
            console.error("Failed to mark notification read", e);
          }
        }
        if (notif) {
          const meta = getNotifTypeMeta(notif.type, notif.title, notif.message);
          if (meta.category === "LEAVE_REQUEST") {
            goToSection("section-leave");
          } else if (meta.category === "ATTENDANCE") {
            goToSection("section-attendance");
          } else {
            showToast(`${notif.title || meta.label}: ${notif.message}`, "info");
          }
        }
      });
    });
  }

  // Category filter tabs
  if (notifCategoryTabsContainer) {
    notifCategoryTabsContainer.addEventListener("click", function (e) {
      const tabBtn = e.target.closest(".notif-filter-tab");
      if (!tabBtn) return;
      notifCategoryTabsContainer.querySelectorAll(".notif-filter-tab").forEach(b => b.classList.remove("active"));
      tabBtn.classList.add("active");
      currentNotifCategory = tabBtn.getAttribute("data-tab") || "ALL";
      adminNotifPage = 0;
      renderAdminNotificationsPage();
    });
  }

  // Search input
  if (adminNotifSearchInput) {
    adminNotifSearchInput.addEventListener("input", debounce(() => {
      adminNotifPage = 0;
      renderAdminNotificationsPage();
    }, 300));
  }

  // Period select
  if (notifPeriodSelect) {
    notifPeriodSelect.addEventListener("change", function () {
      if (notifDateRangeLabel) {
        notifDateRangeLabel.textContent = this.options[this.selectedIndex].text;
      }
      adminNotifPage = 0;
      renderAdminNotificationsPage();
    });
  }

  // Quick Action Buttons
  if (notifMarkAllReadBtn) {
    notifMarkAllReadBtn.addEventListener("click", async function () {
      try {
        await Api.notifications.adminMarkAllRead();
        allAdminNotifs.forEach(n => { n.read = true; });
        updateNotifCounters();
        renderRecentUnreadSidebar();
        renderAdminNotificationsPage();
        showToast("All notifications marked as read", "success");
      } catch (err) {
        showToast(err.message || "Failed to mark all as read", "error");
      }
    });
  }

  if (notifClearAllBtn) {
    notifClearAllBtn.addEventListener("click", async function () {
      if (!confirm("Are you sure you want to clear all notifications?")) return;
      try {
        await Api.notifications.adminClearAll();
        allAdminNotifs = [];
        updateNotifCounters();
        renderRecentUnreadSidebar();
        renderAdminNotificationsPage();
        showToast("All notifications cleared", "success");
      } catch (err) {
        showToast(err.message || "Failed to clear notifications", "error");
      }
    });
  }

  if (notifSettingsBtn) {
    notifSettingsBtn.addEventListener("click", function () {
      showToast("Notification channels and delivery settings are configured.", "info");
    });
  }

  if (notifManagePrefBtn) {
    notifManagePrefBtn.addEventListener("click", function () {
      showToast("Notification preferences are currently up to date.", "info");
    });
  }

  if (viewAllUnreadBtn) {
    viewAllUnreadBtn.addEventListener("click", function () {
      currentNotifCategory = "ALL";
      if (notifCategoryTabsContainer) {
        notifCategoryTabsContainer.querySelectorAll(".notif-filter-tab").forEach(b => {
          b.classList.toggle("active", b.getAttribute("data-tab") === "ALL");
        });
      }
      adminNotifPage = 0;
      renderAdminNotificationsPage();
    });
  }



  // ================================================================
  // 10) REFERRALS (admin)
  // ================================================================
  const adminReferralsTableBody = document.querySelector("#adminReferralsTable tbody");
  const referralSearchInput = document.getElementById("referralSearch");
  const referralsPagerEl = document.getElementById("referralsPager");
  let allReferrals = [];
  let referralsPage = 0;

  async function loadAdminReferrals() {
    adminReferralsTableBody.innerHTML = `<tr class="empty-row"><td colspan="5">Loading…</td></tr>`;
    try {
      allReferrals = await Api.referral.adminList() || [];
      referralsPage = 0;
      renderReferralsPage();
    } catch (err) {
      adminReferralsTableBody.innerHTML = `<tr class="empty-row"><td colspan="5">${escapeHtml(err.message)}</td></tr>`;
    }
  }

  function renderReferralsPage() {
    const filtered = allReferrals.filter(r => matchesSearch(r, [
      x => x.referringStudentId, x => x.referringStudentName, x => x.code,
      x => x.referredName, x => x.status
    ], referralSearchInput.value));
    const { pageRows, page, totalPages } = paginateRows(filtered, referralsPage);
    referralsPage = page;
    renderAdminReferrals(pageRows);
    renderPager(referralsPagerEl, referralsPage, totalPages,
      function () { if (referralsPage > 0) { referralsPage--; renderReferralsPage(); } },
      function () { referralsPage++; renderReferralsPage(); }
    );
  }

  function renderAdminReferrals(rows) {
    if (!rows.length) {
      adminReferralsTableBody.innerHTML = `<tr class="empty-row"><td colspan="5">No referral activity found.</td></tr>`;
      return;
    }
    adminReferralsTableBody.innerHTML = rows.map(r => `
      <tr>
        <td data-label="Referring Student"><b>${escapeHtml(r.referringStudentName)}</b><br><small style="color:var(--ink-soft);">${escapeHtml(r.referringStudentId)}</small></td>
        <td data-label="Referral Code">${escapeHtml(r.code)}</td>
        <td data-label="Referred Student">${escapeHtml(r.referredName || "-")}</td>
        <td data-label="Status">${statusBadge(r.status)}</td>
        <td data-label="Date">${escapeHtml(r.date || "-")}</td>
      </tr>
    `).join("");
  }

  referralSearchInput.addEventListener("input", debounce(() => { referralsPage = 0; renderReferralsPage(); }, 300));

  // ================================================================
  // 11) TRAINERS & ACCESS PERMISSIONS MANAGEMENT
  // ================================================================
  const trainersTableBody = document.querySelector("#trainersTable tbody");
  const trainerSearchInput = document.getElementById("trainerSearch");
  const openCreateTrainerBtn = document.getElementById("openCreateTrainerBtn");
  const closeCreateTrainerBtn = document.getElementById("closeCreateTrainerBtn");
  const createTrainerModal = document.getElementById("createTrainerModal");
  const createTrainerForm = document.getElementById("createTrainerForm");
  const createTrainerError = document.getElementById("createTrainerError");
  const createTrainerBtn = document.getElementById("createTrainerBtn");
  const trainerDepartmentInput = document.getElementById("trainerDepartmentInput");
  const permTrainerDepartment = document.getElementById("permTrainerDepartment");
  const createTrainerSuccess = document.getElementById("createTrainerSuccess");
  const createTrainerDoneBtn = document.getElementById("createTrainerDoneBtn");
  const createdTrainerAssignAccessBtn = document.getElementById("createdTrainerAssignAccessBtn");

  // Permissions Modal elements
  const trainerPermissionsModal = document.getElementById("trainerPermissionsModal");
  const closeTrainerPermissionsBtn = document.getElementById("closeTrainerPermissionsBtn");
  const cancelTrainerPermissionsBtn = document.getElementById("cancelTrainerPermissionsBtn");
  const saveTrainerPermissionsBtn = document.getElementById("saveTrainerPermissionsBtn");
  const permTrainerName = document.getElementById("permTrainerName");
  const permissionsCheckboxList = document.getElementById("permissionsCheckboxList");
  const permSelectAllBtn = document.getElementById("permSelectAllBtn");
  const permClearAllBtn = document.getElementById("permClearAllBtn");
  const trainerPermissionsError = document.getElementById("trainerPermissionsError");

  let allTrainers = [];
  let currentEditingTrainer = null;
  let latestCreatedTrainer = null;

  function openCreateTrainerModal() {
    if (!createTrainerModal) return;
    createTrainerForm.reset();
    createTrainerError.classList.remove("show");
    createTrainerError.textContent = "";
    createTrainerSuccess.style.display = "none";
    createTrainerForm.style.display = "";
    createTrainerModal.style.display = "flex";
  }
  function closeCreateTrainerModal() {
    if (!createTrainerModal) return;
    createTrainerModal.style.display = "none";
  }
  if (openCreateTrainerBtn) openCreateTrainerBtn.addEventListener("click", openCreateTrainerModal);
  if (closeCreateTrainerBtn) closeCreateTrainerBtn.addEventListener("click", closeCreateTrainerModal);
  if (createTrainerModal) {
    createTrainerModal.addEventListener("click", function (e) {
      if (e.target === createTrainerModal) closeCreateTrainerModal();
    });
  }
  if (createTrainerDoneBtn) createTrainerDoneBtn.addEventListener("click", closeCreateTrainerModal);

  // ---------------- Manage Access Modal ----------------
  function openPermissionsModal(trainer) {
    if (!trainerPermissionsModal || !trainer) return;
    currentEditingTrainer = trainer;
    if (permTrainerName) {
      permTrainerName.textContent = trainer.fullName || trainer.username || "HOD";
    }
    if (trainerPermissionsError) {
      trainerPermissionsError.classList.remove("show");
      trainerPermissionsError.textContent = "";
    }

    if (permTrainerDepartment) {
      permTrainerDepartment.value = trainer.department || "";
    }

    const assigned = Array.isArray(trainer.permissions)
      ? trainer.permissions
      : (trainer.permissions ? Array.from(trainer.permissions) : []);

    if (permissionsCheckboxList) {
      permissionsCheckboxList.innerHTML = AVAILABLE_PERMISSIONS.map(p => {
        const isChecked = assigned.includes(p.code);
        return `
          <label class="perm-checkbox-item ${isChecked ? 'selected' : ''}">
            <input type="checkbox" name="trainerPerm" value="${p.code}" ${isChecked ? 'checked' : ''}>
            <div class="perm-item-content">
              <div class="perm-item-title">${p.icon} <b>${escapeHtml(p.label)}</b></div>
              <div class="perm-item-desc">${escapeHtml(p.desc)}</div>
            </div>
          </label>
        `;
      }).join("");

      permissionsCheckboxList.querySelectorAll(".perm-checkbox-item").forEach(item => {
        const cb = item.querySelector("input[type='checkbox']");
        cb.addEventListener("change", function () {
          item.classList.toggle("selected", this.checked);
        });
      });
    }

    trainerPermissionsModal.style.display = "flex";
  }

  function closePermissionsModal() {
    if (!trainerPermissionsModal) return;
    trainerPermissionsModal.style.display = "none";
    currentEditingTrainer = null;
  }

  if (closeTrainerPermissionsBtn) closeTrainerPermissionsBtn.addEventListener("click", closePermissionsModal);
  if (cancelTrainerPermissionsBtn) cancelTrainerPermissionsBtn.addEventListener("click", closePermissionsModal);
  if (trainerPermissionsModal) {
    trainerPermissionsModal.addEventListener("click", function (e) {
      if (e.target === trainerPermissionsModal) closePermissionsModal();
    });
  }

  if (permSelectAllBtn && permissionsCheckboxList) {
    permSelectAllBtn.addEventListener("click", function () {
      permissionsCheckboxList.querySelectorAll(".perm-checkbox-item").forEach(item => {
        const cb = item.querySelector("input[type='checkbox']");
        if (cb) cb.checked = true;
        item.classList.add("selected");
      });
    });
  }

  if (permClearAllBtn && permissionsCheckboxList) {
    permClearAllBtn.addEventListener("click", function () {
      permissionsCheckboxList.querySelectorAll(".perm-checkbox-item").forEach(item => {
        const cb = item.querySelector("input[type='checkbox']");
        if (cb) cb.checked = false;
        item.classList.remove("selected");
      });
    });
  }

  if (saveTrainerPermissionsBtn) {
    saveTrainerPermissionsBtn.addEventListener("click", async function () {
      if (!currentEditingTrainer) return;
      if (trainerPermissionsError) {
        trainerPermissionsError.classList.remove("show");
        trainerPermissionsError.textContent = "";
      }

      const selected = Array.from(permissionsCheckboxList.querySelectorAll("input[name='trainerPerm']:checked"))
        .map(cb => cb.value);

      saveTrainerPermissionsBtn.disabled = true;
      saveTrainerPermissionsBtn.textContent = "Saving…";

      try {
        const newDept = permTrainerDepartment ? permTrainerDepartment.value : "";
        if (newDept && newDept !== (currentEditingTrainer.department || "")) {
          await Api.trainers.updateDepartment(currentEditingTrainer.id, newDept);
        }
        await Api.trainers.updatePermissions(currentEditingTrainer.id, selected);
        showToast("Module access updated successfully", "success");
        closePermissionsModal();
        await loadTrainers();
      } catch (err) {
        if (trainerPermissionsError) {
          trainerPermissionsError.textContent = err.message || "Failed to update permissions";
          trainerPermissionsError.classList.add("show");
        } else {
          showToast(err.message, "error");
        }
      } finally {
        saveTrainerPermissionsBtn.disabled = false;
        saveTrainerPermissionsBtn.textContent = "Save Access";
      }
    });
  }

  if (createdTrainerAssignAccessBtn) {
    createdTrainerAssignAccessBtn.addEventListener("click", function () {
      closeCreateTrainerModal();
      if (latestCreatedTrainer) {
        openPermissionsModal(latestCreatedTrainer);
      }
    });
  }

  async function loadTrainers() {
    if (!trainersTableBody) return;
    trainersTableBody.innerHTML = `<tr class="empty-row"><td colspan="7">Loading…</td></tr>`;
    try {
      allTrainers = await Api.trainers.adminList() || [];
      renderTrainers();
    } catch (err) {
      trainersTableBody.innerHTML = `<tr class="empty-row"><td colspan="7">${escapeHtml(err.message)}</td></tr>`;
    }
  }

  function renderTrainers() {
    const filtered = allTrainers.filter(r => matchesSearch(r, [
      x => x.fullName, x => x.username, x => x.loginId
    ], trainerSearchInput ? trainerSearchInput.value : ""));

    if (!filtered.length) {
      trainersTableBody.innerHTML = `<tr class="empty-row"><td colspan="7">No HODs found.</td></tr>`;
      return;
    }

    trainersTableBody.innerHTML = filtered.map(t => {
      const perms = Array.isArray(t.permissions)
        ? t.permissions
        : (t.permissions ? Array.from(t.permissions) : []);

      let permsHtml = "";
      if (perms.length === 0) {
        permsHtml = `<span class="perm-pill empty">None assigned</span>`;
      } else if (perms.length <= 3) {
        permsHtml = perms.map(code => {
          const item = AVAILABLE_PERMISSIONS.find(p => p.code === code);
          const label = item ? item.label : code;
          const icon = item ? item.icon : "•";
          return `<span class="perm-pill" title="${escapeHtml(label)}">${icon} ${escapeHtml(label)}</span>`;
        }).join(" ");
      } else {
        const firstTwo = perms.slice(0, 2).map(code => {
          const item = AVAILABLE_PERMISSIONS.find(p => p.code === code);
          const label = item ? item.label : code;
          const icon = item ? item.icon : "•";
          return `<span class="perm-pill" title="${escapeHtml(label)}">${icon} ${escapeHtml(label)}</span>`;
        }).join(" ");
        permsHtml = `${firstTwo} <span class="perm-pill count" title="${perms.length} modules allowed">+${perms.length - 2} more</span>`;
      }

      return `
        <tr data-trainer-id="${t.id}">
          <td data-label="Name"><b>${escapeHtml(t.fullName)}</b></td>
          <td data-label="Login ID"><code class="login-id-badge">${escapeHtml(t.loginId || t.username)}</code></td>
          <td data-label="Department">${t.department ? escapeHtml(t.department) : '<span class="perm-pill empty">Department not assigned</span>'}</td>
          <td data-label="Assigned Access"><div class="perm-pills-wrap">${permsHtml}</div></td>
          <td data-label="Status">${statusBadge(t.status)}</td>
          <td data-label="Created">${formatDate(t.createdAt)}</td>
          <td data-label="Actions">
            <button type="button" class="btn btn-outline btn-sm manage-perm-btn" data-trainer-id="${t.id}">
              ⚙ Manage Access
            </button>
            <button type="button" class="btn btn-outline btn-sm delete-staff-btn" data-trainer-id="${t.id}">
              🗑 Delete
            </button>
          </td>
        </tr>
      `;
    }).join("");

    // Wire up Manage Access buttons
    trainersTableBody.querySelectorAll(".manage-perm-btn").forEach(btn => {
      btn.addEventListener("click", function (e) {
        e.stopPropagation();
        const tid = this.dataset.trainerId;
        const targetTrainer = allTrainers.find(x => String(x.id) === String(tid));
        if (targetTrainer) {
          openPermissionsModal(targetTrainer);
        }
      });
    });
  }

  // ---- Delete Staff (reuses the existing deleteStaffModalOverlay + Api.trainers.deleteTrainer) ----
  const deleteStaffModalOverlay = document.getElementById("deleteStaffModalOverlay");
  const deleteStaffNameEl = document.getElementById("deleteStaffName");
  const deleteStaffLoginIdEl = document.getElementById("deleteStaffLoginId");
  const deleteStaffErrorEl = document.getElementById("deleteStaffError");
  const deleteStaffCancelBtn = document.getElementById("deleteStaffCancelBtn");
  const deleteStaffConfirmBtn = document.getElementById("deleteStaffConfirmBtn");
  let trainerPendingDelete = null;

  function openDeleteStaffModal(trainer) {
    if (!deleteStaffModalOverlay || !trainer) return;
    trainerPendingDelete = trainer;
    deleteStaffNameEl.textContent = trainer.fullName || "-";
    deleteStaffLoginIdEl.textContent = trainer.username || "-";
    deleteStaffErrorEl.textContent = "";
    deleteStaffErrorEl.classList.remove("show");
    deleteStaffConfirmBtn.disabled = false;
    deleteStaffConfirmBtn.textContent = "Delete Staff";
    deleteStaffModalOverlay.style.display = "flex";
  }

  function closeDeleteStaffModal() {
    if (!deleteStaffModalOverlay) return;
    deleteStaffModalOverlay.style.display = "none";
    trainerPendingDelete = null;
  }

  if (trainersTableBody) {
    trainersTableBody.addEventListener("click", function (e) {
      const btn = e.target.closest(".delete-staff-btn");
      if (!btn) return;
      e.stopPropagation();
      const target = allTrainers.find(x => String(x.id) === String(btn.dataset.trainerId));
      if (target) openDeleteStaffModal(target);
    });
  }

  if (deleteStaffCancelBtn) deleteStaffCancelBtn.addEventListener("click", closeDeleteStaffModal);
  if (deleteStaffModalOverlay) {
    deleteStaffModalOverlay.addEventListener("click", function (e) {
      if (e.target === deleteStaffModalOverlay && !deleteStaffConfirmBtn.disabled) closeDeleteStaffModal();
    });
  }

  if (deleteStaffConfirmBtn) {
    deleteStaffConfirmBtn.addEventListener("click", async function () {
      if (!trainerPendingDelete) return;
      deleteStaffConfirmBtn.disabled = true;
      deleteStaffConfirmBtn.textContent = "Deleting…";
      deleteStaffErrorEl.classList.remove("show");
      deleteStaffErrorEl.textContent = "";
      try {
        // Deleted strictly by the trainer's unique database id.
        await Api.trainers.deleteTrainer(trainerPendingDelete.id);
        closeDeleteStaffModal();
        showToast("Staff deleted successfully", "success");
        await loadTrainers();
      } catch (err) {
        deleteStaffErrorEl.textContent = (err && err.message) || "Failed to delete staff.";
        deleteStaffErrorEl.classList.add("show");
        deleteStaffConfirmBtn.disabled = false;
        deleteStaffConfirmBtn.textContent = "Delete Staff";
      }
    });
  }

  if (trainerSearchInput) {
    trainerSearchInput.addEventListener("input", debounce(() => renderTrainers(), 300));
  }

  if (createTrainerForm) {
    createTrainerForm.addEventListener("submit", async function (e) {
      e.preventDefault();
      createTrainerError.classList.remove("show");

      const fullName = document.getElementById("trainerNameInput").value.trim();
      const password = document.getElementById("trainerPasswordInput").value;
      const confirmPassword = document.getElementById("trainerConfirmPasswordInput").value;
      const department = trainerDepartmentInput ? trainerDepartmentInput.value : "";

      if (!fullName) {
        createTrainerError.textContent = "HOD name is required.";
        createTrainerError.classList.add("show");
        return;
      }
      if (!department) {
        createTrainerError.textContent = "Please select a department.";
        createTrainerError.classList.add("show");
        return;
      }
      if (!password || password.length < 6) {
        createTrainerError.textContent = "Password must be at least 6 characters.";
        createTrainerError.classList.add("show");
        return;
      }
      if (password !== confirmPassword) {
        createTrainerError.textContent = "Passwords do not match.";
        createTrainerError.classList.add("show");
        return;
      }

      createTrainerBtn.disabled = true;
      createTrainerBtn.textContent = "Creating…";
      try {
        const created = await Api.trainers.adminCreate({ fullName, password, confirmPassword, department });
        latestCreatedTrainer = created;
        showToast("HOD created", "success");

        createTrainerForm.style.display = "none";
        document.getElementById("createdTrainerName").textContent = created.fullName || fullName;
        document.getElementById("createdTrainerUsername").textContent = created.username || created.loginId || "-";
        createTrainerSuccess.style.display = "block";

        loadTrainers();
      } catch (err) {
        createTrainerError.textContent = err.message;
        createTrainerError.classList.add("show");
      } finally {
        createTrainerBtn.disabled = false;
        createTrainerBtn.textContent = "Create HOD";
      }
    });
  }

  // ---------------- Helpers ----------------
  function statusBadge(status) {
    const map = {
      PRESENT: "present", ABSENT: "absent", LEAVE: "leave", NOT_MARKED: "not-marked",
      ACTIVE: "active", INACTIVE: "not-marked", IDLE: "idle", LOGGED_OUT: "logged-out", EXPIRED: "expired",
      PENDING: "pending", APPROVED: "approved", REJECTED: "rejected",
      NOT_STARTED: "not-started", IN_PROGRESS: "in-progress", SUBMITTED: "submitted",
      UNDER_REVIEW: "under-review", REVISION_REQUIRED: "revision-required",
      JOINED: "approved"
    };
    const cls = map[status] || "not-marked";
    const label = status ? status.replace(/_/g, " ") : "-";
    return `<span class="status-badge ${cls}"><span class="dot"></span>${escapeHtml(label)}</span>`;
  }

  function debounce(fn, delay) {
    let t;
    return (...args) => { clearTimeout(t); t = setTimeout(() => fn(...args), delay); };
  }

  function escapeHtml(str) {
    if (str == null) return "";
    return String(str)
      .replaceAll("&", "&amp;").replaceAll("<", "&lt;").replaceAll(">", "&gt;")
      .replaceAll('"', "&quot;").replaceAll("'", "&#039;");
  }

  function formatDate(iso) {
    if (!iso) return "-";
    const d = new Date(iso);
    if (isNaN(d)) return iso;
    return d.toLocaleDateString("en-IN", { day: "2-digit", month: "short", year: "numeric" });
  }

  // ================================================================
  // NEW: JOB UPDATES (isolated module - own API namespace, own DOM,
  // own scoped CSS classes; does not touch any other section's code)
  // ================================================================
  let jobUpdatesCache = [];

  function jobUpdateStatusPill(published) {
    return published
      ? '<span class="status-badge approved"><span class="dot"></span>Published</span>'
      : '<span class="status-badge pending"><span class="dot"></span>Draft</span>';
  }

  // Backend stores the wildcard as the literal "All Departments" (JobUpdate.ALL_DEPARTMENTS).
  function jobUpdateDepartmentLabel(dept) {
    const d = (dept || "").trim();
    if (!d) return "-";
    return d.toLowerCase() === "all departments" ? "All Departments" : d;
  }

  function renderAdminJobUpdates(list) {
    const tbody = document.querySelector("#adminJobUpdatesTable tbody");
    if (!tbody) return;
    if (!list || list.length === 0) {
      tbody.innerHTML = '<tr class="empty-row"><td colspan="8">No job updates yet. Click "+ Add Job Update" to post one.</td></tr>';
      return;
    }
    tbody.innerHTML = list.map(j => `
      <tr>
        <td>${escapeHtml(j.jobTitle)}</td>
        <td>${escapeHtml(j.companyName)}</td>
        <td>${escapeHtml(j.designation)}</td>
        <td>${escapeHtml(jobUpdateDepartmentLabel(j.department))}</td>
        <td>${escapeHtml(j.experience || "-")}</td>
        <td>${escapeHtml(j.location || "-")}</td>
        <td>${jobUpdateStatusPill(j.published)}</td>
        <td style="display:flex; gap:8px; flex-wrap:wrap;">
          <button type="button" class="btn-action-edit job-update-edit-btn" data-id="${j.id}">Edit</button>
          <button type="button" class="btn-outline btn btn-sm job-update-toggle-btn" data-id="${j.id}" data-published="${j.published}">${j.published ? "Unpublish" : "Publish"}</button>
          <button type="button" class="btn-action-del-cert job-update-delete-btn" data-id="${j.id}">Delete</button>
        </td>
      </tr>
    `).join("");

    tbody.querySelectorAll(".job-update-edit-btn").forEach(btn => {
      btn.addEventListener("click", () => openJobUpdateModal(Number(btn.dataset.id)));
    });
    tbody.querySelectorAll(".job-update-toggle-btn").forEach(btn => {
      btn.addEventListener("click", async () => {
        const id = Number(btn.dataset.id);
        const nowPublished = btn.dataset.published === "true";
        try {
          await Api.jobUpdates.adminSetPublished(id, !nowPublished);
          showToast(nowPublished ? "Job unpublished" : "Job published", "success");
          loadAdminJobUpdates();
        } catch (e) {
          showToast(e.message || "Couldn't update job status", "error");
        }
      });
    });
    tbody.querySelectorAll(".job-update-delete-btn").forEach(btn => {
      btn.addEventListener("click", async () => {
        if (!confirm("Delete this job update? This cannot be undone.")) return;
        try {
          await Api.jobUpdates.adminDelete(Number(btn.dataset.id));
          showToast("Job update deleted", "success");
          loadAdminJobUpdates();
        } catch (e) {
          showToast(e.message || "Couldn't delete job update", "error");
        }
      });
    });
  }

  async function loadAdminJobUpdates() {
    const tbody = document.querySelector("#adminJobUpdatesTable tbody");
    if (tbody) tbody.innerHTML = '<tr class="empty-row"><td colspan="8">Loading…</td></tr>';
    try {
      jobUpdatesCache = await Api.jobUpdates.adminList();
      renderAdminJobUpdates(jobUpdatesCache);
    } catch (e) {
      if (tbody) tbody.innerHTML = `<tr class="empty-row"><td colspan="8">${escapeHtml(e.message || "Couldn't load job updates.")}</td></tr>`;
    }
  }

  const jobUpdateModal = document.getElementById("jobUpdateModal");
  const jobUpdateForm = document.getElementById("jobUpdateForm");
  const jobUpdateFormError = document.getElementById("jobUpdateFormError");

  function openJobUpdateModal(id) {
    if (!jobUpdateModal || !jobUpdateForm) return;
    jobUpdateForm.reset();
    if (jobUpdateFormError) jobUpdateFormError.textContent = "";
    document.getElementById("jobUpdateId").value = "";
    document.getElementById("jobUpdateModalTitle").textContent = "Add Job Update";

    if (id) {
      const job = jobUpdatesCache.find(j => j.id === id);
      if (job) {
        document.getElementById("jobUpdateModalTitle").textContent = "Edit Job Update";
        document.getElementById("jobUpdateId").value = job.id;
        document.getElementById("jobUpdateTitle").value = job.jobTitle || "";
        document.getElementById("jobUpdateCompany").value = job.companyName || "";
        document.getElementById("jobUpdateDesignation").value = job.designation || "";
        document.getElementById("jobUpdateDepartment").value = job.department || "";
        document.getElementById("jobUpdateSkills").value = job.softwareSkills || "";
        document.getElementById("jobUpdateExperience").value = job.experience || "";
        document.getElementById("jobUpdateLocation").value = job.location || "";
        document.getElementById("jobUpdateDescription").value = job.jobDescription || "";
        document.getElementById("jobUpdateEligibility").value = job.eligibilityRequirements || "";
        document.getElementById("jobUpdateInstructions").value = job.applicationInstructions || "";
        document.getElementById("jobUpdateLink").value = job.applicationLink || "";
      }
    }
    jobUpdateModal.style.display = "flex";
  }

  function closeJobUpdateModal() {
    if (jobUpdateModal) jobUpdateModal.style.display = "none";
  }

  const openAddJobUpdateBtn = document.getElementById("openAddJobUpdateBtn");
  if (openAddJobUpdateBtn) openAddJobUpdateBtn.addEventListener("click", () => openJobUpdateModal(null));
  const closeJobUpdateModalBtn = document.getElementById("closeJobUpdateModalBtn");
  if (closeJobUpdateModalBtn) closeJobUpdateModalBtn.addEventListener("click", closeJobUpdateModal);
  const cancelJobUpdateBtn = document.getElementById("cancelJobUpdateBtn");
  if (cancelJobUpdateBtn) cancelJobUpdateBtn.addEventListener("click", closeJobUpdateModal);

  if (jobUpdateForm) {
    jobUpdateForm.addEventListener("submit", async function (e) {
      e.preventDefault();
      if (jobUpdateFormError) jobUpdateFormError.textContent = "";

      const payload = {
        jobTitle: document.getElementById("jobUpdateTitle").value.trim(),
        companyName: document.getElementById("jobUpdateCompany").value.trim(),
        designation: document.getElementById("jobUpdateDesignation").value.trim(),
        department: document.getElementById("jobUpdateDepartment").value,
        softwareSkills: document.getElementById("jobUpdateSkills").value.trim(),
        experience: document.getElementById("jobUpdateExperience").value.trim(),
        location: document.getElementById("jobUpdateLocation").value.trim(),
        jobDescription: document.getElementById("jobUpdateDescription").value.trim(),
        eligibilityRequirements: document.getElementById("jobUpdateEligibility").value.trim(),
        applicationInstructions: document.getElementById("jobUpdateInstructions").value.trim(),
        applicationLink: document.getElementById("jobUpdateLink").value.trim(),
        published: true
      };

      if (!payload.jobTitle || !payload.companyName || !payload.designation || !payload.department) {
        if (jobUpdateFormError) jobUpdateFormError.textContent = "Please fill in Job Title, Company Name, Designation and Department.";
        return;
      }

      const id = document.getElementById("jobUpdateId").value;
      try {
        if (id) {
          await Api.jobUpdates.adminUpdate(Number(id), payload);
          showToast("Job update saved", "success");
        } else {
          await Api.jobUpdates.adminCreate(payload);
          showToast("Job published", "success");
        }
        closeJobUpdateModal();
        loadAdminJobUpdates();
      } catch (e) {
        if (jobUpdateFormError) jobUpdateFormError.textContent = e.message || "Couldn't save job update. Please try again.";
      }
    });
  }

  // ================================================================
  // NEW: MEETING UPDATES (isolated module - own API namespace
  // Api.meetingUpdates, own DOM ids, own scoped CSS; Admin only).
  // All data comes from the backend; nothing is hardcoded or kept in
  // localStorage.
  // ================================================================
  let meetingUpdatesCache = [];
  let meetingUpdateSaving = false;
  let meetingUpdateDeleting = false;
  let meetingUpdatePendingDeleteId = null;
  const MEETING_MONTHS = ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"];

  function meetingDateLabel(iso) {
    const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(iso || "");
    if (!m) return iso || "-";
    return `${m[3]} ${MEETING_MONTHS[parseInt(m[2], 10) - 1] || m[2]} ${m[1]}`;
  }

  function meetingTimeLabel(hhmm) {
    const m = /^(\d{1,2}):(\d{2})/.exec(hhmm || "");
    if (!m) return hhmm || "-";
    let h = parseInt(m[1], 10);
    const suffix = h >= 12 ? "PM" : "AM";
    h = h % 12 || 12;
    return `${String(h).padStart(2, "0")}:${m[2]} ${suffix}`;
  }

  function meetingStatusPill(status) {
    return status === "NEW"
      ? '<span class="status-badge approved"><span class="dot"></span>NEW</span>'
      : '<span class="status-badge not-started"><span class="dot"></span>RECENT</span>';
  }

  function meetingPublishedPill(published) {
    return published
      ? '<span class="status-badge approved"><span class="dot"></span>Published</span>'
      : '<span class="status-badge pending"><span class="dot"></span>Unpublished</span>';
  }

  function isHttpUrl(value) {
    try {
      const u = new URL(value);
      return (u.protocol === "http:" || u.protocol === "https:") && !!u.hostname;
    } catch (e) {
      return false;
    }
  }

  function meetingLinkHtml(link) {
    if (!link) return "-";
    const safe = escapeHtml(link);
    return isHttpUrl(link)
      ? `<a href="${safe}" target="_blank" rel="noopener noreferrer" title="${safe}">${safe}</a>`
      : safe;
  }

  function renderAdminMeetingUpdates(list) {
    const tbody = document.querySelector("#adminMeetingUpdatesTable tbody");
    if (!tbody) return;
    if (!list || list.length === 0) {
      tbody.innerHTML = '<tr class="empty-row"><td colspan="6">No meeting updates yet. Click "+ Add Meeting Update" to create one.</td></tr>';
      return;
    }
    tbody.innerHTML = list.map(m => `
      <tr>
        <td data-label="Title">${escapeHtml(m.title)}</td>
        <td data-label="Date">${escapeHtml(meetingDateLabel(m.date))}</td>
        <td data-label="Time">${escapeHtml(meetingTimeLabel(m.time))}</td>
        <td data-label="Meeting Link" class="meeting-link-cell">${meetingLinkHtml(m.sharedLink)}</td>
        <td data-label="Status">${meetingStatusPill(m.status)} ${meetingPublishedPill(m.published)}</td>
        <td data-label="Actions">
          <div class="meeting-actions">
            <button type="button" class="btn btn-outline btn-sm" data-meeting-action="view" data-id="${m.id}">👁️ View</button>
            <button type="button" class="btn btn-outline btn-sm" data-meeting-action="edit" data-id="${m.id}">✏️ Edit</button>
            <button type="button" class="btn btn-danger-outline btn-sm" data-meeting-action="delete" data-id="${m.id}">🗑️ Delete</button>
            <button type="button" class="btn btn-outline btn-sm" data-meeting-action="toggle-publish" data-id="${m.id}" data-published="${m.published}">${m.published ? "🔒 Unpublish" : "🔓 Publish"}</button>
          </div>
        </td>
      </tr>
    `).join("");
  }

  async function loadAdminMeetingUpdates() {
    const tbody = document.querySelector("#adminMeetingUpdatesTable tbody");
    if (tbody) tbody.innerHTML = '<tr class="empty-row"><td colspan="6">Loading…</td></tr>';
    try {
      meetingUpdatesCache = await Api.meetingUpdates.adminList();
      renderAdminMeetingUpdates(meetingUpdatesCache);
    } catch (e) {
      meetingUpdatesCache = [];
      if (tbody) tbody.innerHTML = `<tr class="empty-row"><td colspan="6">${escapeHtml(e.message || "Couldn't load meeting updates.")}</td></tr>`;
    }
  }

  const meetingUpdateModal = document.getElementById("meetingUpdateModal");
  const meetingUpdateForm = document.getElementById("meetingUpdateForm");
  const meetingUpdateFormError = document.getElementById("meetingUpdateFormError");
  const meetingUpdateViewModal = document.getElementById("meetingUpdateViewModal");
  const meetingUpdateDeleteModal = document.getElementById("meetingUpdateDeleteModal");
  const meetingUpdateDeleteError = document.getElementById("meetingUpdateDeleteError");

  function setMeetingFormError(message) {
    if (!meetingUpdateFormError) return;
    meetingUpdateFormError.textContent = message || "";
    meetingUpdateFormError.classList.toggle("show", !!message);
  }

  function openMeetingUpdateModal(id) {
    if (!meetingUpdateModal || !meetingUpdateForm) return;
    meetingUpdateForm.reset();
    setMeetingFormError("");
    document.getElementById("meetingUpdateId").value = "";
    document.getElementById("meetingUpdateModalTitle").textContent = "Add Meeting Update";
    document.getElementById("saveMeetingUpdateBtn").textContent = "Save / Publish Meeting Update";

    if (id) {
      const m = meetingUpdatesCache.find(x => x.id === id);
      if (m) {
        document.getElementById("meetingUpdateModalTitle").textContent = "Edit Meeting Update";
        document.getElementById("saveMeetingUpdateBtn").textContent = "Update Meeting Update";
        document.getElementById("meetingUpdateId").value = m.id;
        document.getElementById("meetingUpdateTitle").value = m.title || "";
        document.getElementById("meetingUpdateInstructions").value = m.instructions || "";
        document.getElementById("meetingUpdateDate").value = m.date || "";
        document.getElementById("meetingUpdateTime").value = m.time || "";
        document.getElementById("meetingUpdateLink").value = m.sharedLink || "";
        document.getElementById("meetingUpdateNotes").value = m.importantNotes || "";
        document.getElementById("meetingUpdateStatus").value = m.status || "";
      }
    }
    meetingUpdateModal.style.display = "flex";
  }

  function closeMeetingUpdateModal() {
    if (meetingUpdateModal) meetingUpdateModal.style.display = "none";
  }

  function viewRow(label, valueHtml) {
    return `<div class="mu-view-row"><span class="mu-view-label">${label}</span><div class="mu-view-value">${valueHtml}</div></div>`;
  }

  function openMeetingUpdateView(id) {
    const m = meetingUpdatesCache.find(x => x.id === id);
    if (!m || !meetingUpdateViewModal) return;
    document.getElementById("meetingUpdateViewTitle").textContent = "Meeting Update";
    document.getElementById("meetingUpdateViewBody").innerHTML =
      viewRow("Meeting / Announcement Title", escapeHtml(m.title)) +
      `<div class="mu-view-split">
        <div class="mu-view-row"><span class="mu-view-label">Date</span><div class="mu-view-value">${escapeHtml(meetingDateLabel(m.date))}</div></div>
        <div class="mu-view-row"><span class="mu-view-label">Time</span><div class="mu-view-value">${escapeHtml(meetingTimeLabel(m.time))}</div></div>
        <div class="mu-view-row"><span class="mu-view-label">Status</span><div class="mu-view-value">${meetingStatusPill(m.status)}</div></div>
      </div>` +
      viewRow("Instructions", escapeHtml(m.instructions)) +
      viewRow("Meeting / Shared Link", meetingLinkHtml(m.sharedLink)) +
      viewRow("Important Notes", m.importantNotes ? escapeHtml(m.importantNotes) : "-");
    meetingUpdateViewModal.style.display = "flex";
  }

  function closeMeetingUpdateView() {
    if (meetingUpdateViewModal) meetingUpdateViewModal.style.display = "none";
  }

  function openMeetingUpdateDelete(id) {
    const m = meetingUpdatesCache.find(x => x.id === id);
    if (!m || !meetingUpdateDeleteModal) return;
    meetingUpdatePendingDeleteId = id;
    document.getElementById("meetingUpdateDeleteName").textContent = m.title || "";
    if (meetingUpdateDeleteError) { meetingUpdateDeleteError.textContent = ""; meetingUpdateDeleteError.classList.remove("show"); }
    meetingUpdateDeleteModal.style.display = "flex";
  }

  function closeMeetingUpdateDelete() {
    meetingUpdatePendingDeleteId = null;
    if (meetingUpdateDeleteModal) meetingUpdateDeleteModal.style.display = "none";
  }

  async function toggleMeetingUpdatePublished(btn, id) {
    if (btn.disabled) return;
    const nowPublished = btn.dataset.published === "true";
    if (nowPublished && !confirm("Are you sure you want to unpublish this meeting update?")) return;
    btn.disabled = true;
    try {
      await Api.meetingUpdates.adminSetPublished(id, !nowPublished);
      showToast(nowPublished ? "Meeting update unpublished" : "Meeting update published", "success");
      loadAdminMeetingUpdates();
    } catch (e) {
      btn.disabled = false;
      showToast(e.message || "Couldn't update meeting status", "error");
    }
  }

  const meetingTbody = document.querySelector("#adminMeetingUpdatesTable tbody");
  if (meetingTbody) {
    meetingTbody.addEventListener("click", function (e) {
      const btn = e.target.closest("button[data-meeting-action]");
      if (!btn) return;
      const id = Number(btn.dataset.id);
      if (btn.dataset.meetingAction === "view") openMeetingUpdateView(id);
      else if (btn.dataset.meetingAction === "edit") openMeetingUpdateModal(id);
      else if (btn.dataset.meetingAction === "delete") openMeetingUpdateDelete(id);
      else if (btn.dataset.meetingAction === "toggle-publish") toggleMeetingUpdatePublished(btn, id);
    });
  }

  const openAddMeetingUpdateBtn = document.getElementById("openAddMeetingUpdateBtn");
  if (openAddMeetingUpdateBtn) openAddMeetingUpdateBtn.addEventListener("click", () => openMeetingUpdateModal(null));
  const closeMeetingUpdateModalBtn = document.getElementById("closeMeetingUpdateModalBtn");
  if (closeMeetingUpdateModalBtn) closeMeetingUpdateModalBtn.addEventListener("click", closeMeetingUpdateModal);
  const cancelMeetingUpdateBtn = document.getElementById("cancelMeetingUpdateBtn");
  if (cancelMeetingUpdateBtn) cancelMeetingUpdateBtn.addEventListener("click", closeMeetingUpdateModal);
  const closeMeetingUpdateViewBtn = document.getElementById("closeMeetingUpdateViewBtn");
  if (closeMeetingUpdateViewBtn) closeMeetingUpdateViewBtn.addEventListener("click", closeMeetingUpdateView);
  const meetingUpdateViewDoneBtn = document.getElementById("meetingUpdateViewDoneBtn");
  if (meetingUpdateViewDoneBtn) meetingUpdateViewDoneBtn.addEventListener("click", closeMeetingUpdateView);
  const cancelDeleteMeetingUpdateBtn = document.getElementById("cancelDeleteMeetingUpdateBtn");
  if (cancelDeleteMeetingUpdateBtn) cancelDeleteMeetingUpdateBtn.addEventListener("click", closeMeetingUpdateDelete);

  const confirmDeleteMeetingUpdateBtn = document.getElementById("confirmDeleteMeetingUpdateBtn");
  if (confirmDeleteMeetingUpdateBtn) {
    confirmDeleteMeetingUpdateBtn.addEventListener("click", async function () {
      if (meetingUpdateDeleting || meetingUpdatePendingDeleteId == null) return;
      meetingUpdateDeleting = true;
      confirmDeleteMeetingUpdateBtn.disabled = true;
      try {
        await Api.meetingUpdates.adminDelete(meetingUpdatePendingDeleteId);
        closeMeetingUpdateDelete();
        showToast("Meeting update deleted", "success");
        loadAdminMeetingUpdates();
      } catch (e) {
        if (meetingUpdateDeleteError) {
          meetingUpdateDeleteError.textContent = e.message || "Couldn't delete the meeting update. Please try again.";
          meetingUpdateDeleteError.classList.add("show");
        }
      } finally {
        meetingUpdateDeleting = false;
        confirmDeleteMeetingUpdateBtn.disabled = false;
      }
    });
  }

  if (meetingUpdateForm) {
    meetingUpdateForm.addEventListener("submit", async function (e) {
      e.preventDefault();
      if (meetingUpdateSaving) return;
      setMeetingFormError("");

      const payload = {
        title: document.getElementById("meetingUpdateTitle").value.trim(),
        instructions: document.getElementById("meetingUpdateInstructions").value.trim(),
        date: document.getElementById("meetingUpdateDate").value,
        time: document.getElementById("meetingUpdateTime").value,
        sharedLink: document.getElementById("meetingUpdateLink").value.trim(),
        importantNotes: document.getElementById("meetingUpdateNotes").value.trim(),
        status: document.getElementById("meetingUpdateStatus").value
      };

      if (!payload.title) return setMeetingFormError("Meeting / Announcement Title is required.");
      if (!payload.instructions) return setMeetingFormError("Instructions are required.");
      if (!payload.date) return setMeetingFormError("Date is required.");
      if (!payload.time) return setMeetingFormError("Time is required.");
      if (!payload.sharedLink) return setMeetingFormError("Meeting / Shared Link is required.");
      if (!isHttpUrl(payload.sharedLink)) return setMeetingFormError("Meeting / Shared Link must be a valid http(s) URL, e.g. https://meet.google.com/abc-defg-hij");
      if (!payload.status) return setMeetingFormError("Please select a Status (NEW or RECENT).");

      const id = document.getElementById("meetingUpdateId").value;
      const saveBtn = document.getElementById("saveMeetingUpdateBtn");
      meetingUpdateSaving = true;
      saveBtn.disabled = true;
      try {
        if (id) {
          await Api.meetingUpdates.adminUpdate(Number(id), payload);
          showToast("Meeting update saved", "success");
        } else {
          await Api.meetingUpdates.adminCreate(payload);
          showToast("Meeting update published", "success");
        }
        closeMeetingUpdateModal();
        loadAdminMeetingUpdates();
      } catch (err) {
        setMeetingFormError(err.message || "Couldn't save the meeting update. Please try again.");
      } finally {
        meetingUpdateSaving = false;
        saveBtn.disabled = false;
      }
    });
  }

  // Load the initial section on page open
  if (IS_TRAINER) {
    if (trainerAllowedSections.length > 0) {
      goToSection(trainerAllowedSections[0]);
    } else {
      goToSection("section-no-access");
    }
  } else {
    goToSection("section-dashboard");
  }
});

/* Registered Users: synchronized duplicate horizontal scrollbar.
   Both bars show the SAME horizontal position of .data-table-wrap.
   Single-source ownership: whichever bar the user is driving is the only one that
   writes; the other is a pure mirror and its (echo) scroll events are ignored.
   That makes feedback/oscillation between the two impossible. */
(function () {
  function init() {
    var host = document.getElementById("studentsScrollHost");
    var bar = document.getElementById("studentsSyncScroll");
    if (!host || !bar) return;
    var wrap = host.querySelector(".data-table-wrap");
    var inner = bar.querySelector(".sync-hscroll-inner");
    var table = document.getElementById("studentsTable");
    if (!wrap || !inner) return;

    var source = null;     // "bar" | "wrap" | null  -> who currently drives the scroll position
    var releaseTimer = null;

    function drive(who) {  // claim ownership; auto-released shortly after that bar stops scrolling
      source = who;
      clearTimeout(releaseTimer);
      releaseTimer = setTimeout(function () { source = null; }, 150);
    }
    function range(el) { return Math.max(el.scrollWidth - el.clientWidth, 0); }

    // Copy position by FRACTION of the scrollable range (identical to px when ranges match,
    // and always lands exactly on the ends). Writes only when the value really differs.
    function mirror(from, to) {
      var fr = range(from), tr = range(to);
      var target = fr > 0 ? (from.scrollLeft / fr) * tr : 0;
      if (Math.abs(to.scrollLeft - target) >= 0.5) to.scrollLeft = target;
    }
    function setPx(el, prop, val) { if (el.style[prop] !== val) el.style[prop] = val; }

    function layout() {
      var r = host.getBoundingClientRect();
      var vh = window.innerHeight || document.documentElement.clientHeight;
      var overflow = wrap.scrollWidth > wrap.clientWidth + 1;
      // show only while the table is on screen and its own bottom scrollbar is still below the fold
      var show = overflow && r.width > 0 && r.top < vh - 80 && r.bottom > vh;
      bar.classList.toggle("is-active", show);
      if (!show) return;
      // vertical position is fixed in CSS (bottom:12px); here we only align it with the table horizontally
      setPx(bar, "left", (r.left + wrap.clientLeft) + "px");
      setPx(bar, "width", wrap.clientWidth + "px");
      setPx(inner, "width", wrap.scrollWidth + "px");
      // Re-align the mirror only when the table is the one in control (never while the user drags the bar).
      if (source !== "bar" && Math.abs(bar.scrollLeft - wrap.scrollLeft) >= 0.5) {
        drive("wrap");     // so the echo event from this write is ignored
        mirror(wrap, bar);
      }
    }

    bar.addEventListener("scroll", function () {
      if (source === "wrap") return;      // echo of our own write
      drive("bar");
      mirror(bar, wrap);
    }, { passive: true });
    wrap.addEventListener("scroll", function () {
      if (source === "bar") return;       // echo of our own write
      drive("wrap");
      mirror(wrap, bar);
    }, { passive: true });

    // Claim ownership at the very start of a user gesture, before any scroll event exists.
    ["pointerdown", "wheel", "touchstart", "keydown"].forEach(function (ev) {
      bar.addEventListener(ev, function () { drive("bar"); }, { passive: true });
      wrap.addEventListener(ev, function () { drive("wrap"); }, { passive: true });
    });

    window.addEventListener("scroll", layout, { passive: true });
    window.addEventListener("resize", layout);
    if (window.ResizeObserver) {
      var ro = new ResizeObserver(layout);
      ro.observe(wrap);
      if (table) ro.observe(table);
    }
    layout();
  }
  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", init);
  else init();
})();