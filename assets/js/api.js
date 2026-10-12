/* ==========================================================================
   Profenaa Technologies — Certificate Portal
   Shared API helper. Change API_BASE_URL to wherever the Spring Boot
   backend is deployed (e.g. https://api.profenaatechnologies.com).
   ========================================================================== */

const API_BASE_URL = 
   "https://api.profenaatechnologies.com";

const Auth = {
  getToken() { return localStorage.getItem("pft_token"); },
  getRole() { return localStorage.getItem("pft_role"); },
  getName() { return localStorage.getItem("pft_name"); },
  getStudentId() { return localStorage.getItem("pft_student_id"); },
  getSessionId() { return localStorage.getItem("pft_session_id"); },
  // Trainer's assigned department (display only - the backend re-reads it from the
  // database on every scoped request and never trusts anything sent from here).
  getDepartment() { return localStorage.getItem("pft_department") || ""; },
  getPermissions() {
    try {
      const p = localStorage.getItem("pft_permissions");
      return p ? JSON.parse(p) : [];
    } catch (e) {
      return [];
    }
  },
  save(resp) {
    localStorage.setItem("pft_token", resp.token);
    localStorage.setItem("pft_role", resp.role);
    localStorage.setItem("pft_name", resp.name || "");
    if (resp.studentId) localStorage.setItem("pft_student_id", resp.studentId);
    if (resp.sessionId) localStorage.setItem("pft_session_id", resp.sessionId);
    if (resp.permissions) {
      localStorage.setItem("pft_permissions", JSON.stringify(Array.from(resp.permissions)));
    }
    if (resp.role === "TRAINER") {
      if (resp.department) localStorage.setItem("pft_department", resp.department);
      else localStorage.removeItem("pft_department");
    }
  },
  clear() {
    localStorage.removeItem("pft_token");
    localStorage.removeItem("pft_role");
    localStorage.removeItem("pft_name");
    localStorage.removeItem("pft_student_id");
    localStorage.removeItem("pft_session_id");
    localStorage.removeItem("pft_permissions");
    localStorage.removeItem("pft_department");
  },
  requireStudent(redirectTo) {
    if (!this.getToken() || this.getRole() !== "STUDENT") {
      window.location.href = redirectTo || "student-login.html";
    }
  },
  requireAdmin(redirectTo) {
    if (!this.getToken() || this.getRole() !== "ADMIN") {
      window.location.href = redirectTo || "admin-login.html";
    }
  },
  // admin-dashboard.html is shared by ADMIN and TRAINER (Part 3/4 of the
  // Trainer spec: same login entry point, no separate Trainer page).
  // admin-dashboard.js then hides Admin-only nav/sections for a Trainer.
  requireAdminOrTrainer(redirectTo) {
    const role = this.getRole();
    if (!this.getToken() || (role !== "ADMIN" && role !== "TRAINER")) {
      window.location.href = redirectTo || "admin-login.html";
    }
  },
  isTrainer() { return this.getRole() === "TRAINER"; },
  hasPermission(perm) {
    if (this.getRole() === "ADMIN") return true;
    if (!this.isTrainer()) return false;
    return this.getPermissions().includes(perm);
  }
};

async function apiRequest(path, { method = "GET", body = null, isForm = false, auth = false } = {}) {
  const headers = {};
  if (!isForm) headers["Content-Type"] = "application/json";
  if (auth) {
    const token = Auth.getToken();
    if (token) headers["Authorization"] = "Bearer " + token;
  }

  let res;
  try {
    res = await fetch(API_BASE_URL + path, {
      method,
      headers,
      body: isForm ? body : (body ? JSON.stringify(body) : undefined)
    });
  } catch (networkErr) {
    const err = new Error("Couldn't reach the server. Please check your connection and try again.");
    err.isNetworkError = true;
    throw err;
  }

  const contentType = res.headers.get("content-type") || "";
  const data = contentType.includes("application/json") ? await res.json() : null;

  if (!res.ok) {
    // 401 gets special handling everywhere it's used: session-tracker.js and
    // the dashboards check for this specific error text to show a clean
    // "session expired" screen instead of a raw error toast.
    if (res.status === 401) {
      const message = (data && data.message) ? data.message : "Your session has expired. Please login again.";
      const err = new Error(message);
      err.isAuthError = true;
      throw err;
    }
    if (res.status === 403) {
      // The backend now always returns a real JSON body for 403s (see
      // SecurityConfig's accessDeniedHandler), so surface that message when
      // present instead of always showing the generic fallback - this is
      // what makes a real "wrong role" 403 distinguishable from anything else.
      const message = (data && data.message) ? data.message : "You do not have permission to access this section.";
      const err = new Error(message);
      err.isForbidden = true;
      throw err;
    }
    if (res.status === 413) {
      const message = (data && data.message) ? data.message : "That file is too large to upload. Please choose a smaller file.";
      const err = new Error(message);
      err.isPayloadTooLarge = true;
      throw err;
    }
    if (res.status === 422) {
      const message = (data && data.message) ? data.message : "Some of the information provided isn't valid. Please check and try again.";
      const err = new Error(message);
      err.isValidationError = true;
      throw err;
    }
    if (res.status === 409) {
      const message = (data && data.message) ? data.message : "This has already been done.";
      const err = new Error(message);
      err.isConflict = true;
      throw err;
    }
    if (res.status >= 500) {
      const message = (data && data.message) ? data.message : "The server ran into a problem. Please try again in a moment.";
      const err = new Error(message);
      err.isServerError = true;
      throw err;
    }
    const message = (data && data.message) ? data.message : "Something went wrong. Please try again.";
    throw new Error(message);
  }
  return data;
}

function showToast(message, type) {
  let toast = document.getElementById("globalToast");
  if (!toast) {
    toast = document.createElement("div");
    toast.id = "globalToast";
    toast.className = "toast";
    document.body.appendChild(toast);
  }
  toast.textContent = message;
  toast.className = "toast show" + (type ? " " + type : "");
  clearTimeout(toast._hideTimer);
  toast._hideTimer = setTimeout(() => toast.classList.remove("show"), 3200);
}

// Wires up every ".show-toggle" button next to a password input, e.g.:
// <div class="password-field-wrap">
//   <input type="password" id="pw">
//   <button type="button" class="show-toggle" data-toggle-for="pw">Show</button>
// </div>
document.addEventListener("DOMContentLoaded", function () {
  document.querySelectorAll(".show-toggle[data-toggle-for]").forEach(function (btn) {
    btn.addEventListener("click", function () {
      const input = document.getElementById(btn.dataset.toggleFor);
      if (!input) return;
      const isHidden = input.type === "password";
      input.type = isHidden ? "text" : "password";
      btn.textContent = isHidden ? "Hide" : "Show";
    });
  });
});

/* ==========================================================================
   Namespaced API methods (Part 39: organized methods, no duplicate JWT
   handling scattered across files). Every module below is a thin wrapper
   around apiRequest() - add new feature namespaces here as they're built.
   ========================================================================== */
const Api = {
  auth: {
    login(payload) { return apiRequest("/api/auth/login", { method: "POST", body: payload }); },
    register(payload) { return apiRequest("/api/auth/register", { method: "POST", body: payload }); },
    forgotPassword(payload) { return apiRequest("/api/auth/forgot-password", { method: "POST", body: payload }); },
    verifyOtp(payload) { return apiRequest("/api/auth/verify-otp", { method: "POST", body: payload }); },
    resetPassword(payload) { return apiRequest("/api/auth/reset-password", { method: "POST", body: payload }); },
    // Shared Admin/Trainer login entry point. The backend resolves the
    // "identifier" against Admin (email) then Trainer (login ID) and
    // returns a JWT whose role decides which dashboard view is shown -
    // there is no separate Trainer login endpoint (see admin-login.js).
    adminLogin(payload) { return apiRequest("/api/admin/auth/login", { method: "POST", body: payload }); }
  },
  students: {
    me() { return apiRequest("/api/students/me", { auth: true }); },
    myPerformance() { return apiRequest("/api/students/me/performance", { auth: true }); },
    updateCourse(course) {
      return apiRequest("/api/students/me/course", { method: "PUT", body: { course }, auth: true });
    },
    updateProfileDetails(details) {
      return apiRequest("/api/students/me/details", { method: "PUT", body: details, auth: true });
    },
    uploadPhoto(file) {
      const fd = new FormData();
      fd.append("photo", file);
      return apiRequest("/api/students/me/photo", { method: "POST", body: fd, isForm: true, auth: true });
    },
    adminList(params) {
      const qs = new URLSearchParams();
      if (typeof params === "string") {
        if (params) qs.set("q", params);
      } else if (params && typeof params === "object") {
        if (params.branch && params.branch !== "ALL") qs.set("branch", params.branch);
        if (params.course && params.course !== "ALL") qs.set("course", params.course);
        if (params.status && params.status !== "ALL") qs.set("status", params.status);
        if (params.q) qs.set("q", params.q);
      }
      return apiRequest(`/api/admin/students?${qs.toString()}`, { auth: true });
    },
    adminUpdateStudent(studentId, payload) {
      return apiRequest(`/api/admin/students/${encodeURIComponent(studentId)}`, { method: "PUT", body: payload, auth: true });
    },
    adminStudentDetails(studentId) {
      return apiRequest(`/api/admin/students/${encodeURIComponent(studentId)}/details`, { auth: true });
    },
    adminBranchDistribution() {
      return apiRequest("/api/admin/students/branch-distribution", { auth: true });
    },
    adminCrmSummary() {
      return apiRequest("/api/admin/students/crm-summary", { auth: true });
    },
    adminTodayLogins() {
      return apiRequest("/api/admin/students/today-logins", { auth: true });
    },
    adminTodayLoginStudents(branch) {
      return apiRequest(`/api/admin/students/today-logins/students?branch=${encodeURIComponent(branch)}`, { auth: true });
    }
  },
  sessions: {
    heartbeat(sessionId) {
      return apiRequest("/api/student/session/heartbeat", { method: "POST", body: { sessionId }, auth: true });
    },
    logout(sessionId) {
      return apiRequest("/api/student/session/logout", { method: "POST", body: { sessionId }, auth: true });
    },
    confirmActivity(sessionId) {
      return apiRequest("/api/student/session/confirm-activity", { method: "POST", body: { sessionId }, auth: true });
    },
    myHistory() { return apiRequest("/api/student/session/history", { auth: true }); },
    // Server-computed accumulated website-login time for today, against the
    // 2-hour daily requirement (Dashboard "Today's Working Hours" card).
    myWorkingHoursToday() { return apiRequest("/api/student/session/working-hours/today", { auth: true }); },
    adminList(params) {
      const qs = new URLSearchParams(Object.entries(params || {}).filter(([, v]) => v !== undefined && v !== null && v !== ""));
      return apiRequest(`/api/admin/sessions?${qs.toString()}`, { auth: true });
    },
    // Department-scoped student roster for Login & Activity (needs only LOGIN_ACTIVITY).
    adminStudents() {
      return apiRequest("/api/admin/sessions/students", { auth: true });
    }
  },
  attendance: {
    myOverview() { return apiRequest("/api/student/attendance/overview", { auth: true }); },
    adminForDate(date, q) {
      const qs = new URLSearchParams();
      if (date) qs.set("date", date);
      if (q) qs.set("q", q);
      return apiRequest(`/api/admin/attendance?${qs.toString()}`, { auth: true });
    },
    adminSummary(date) {
      const qs = new URLSearchParams();
      if (date) qs.set("date", date);
      return apiRequest(`/api/admin/attendance/summary?${qs.toString()}`, { auth: true });
    },
    mark(payload) { return apiRequest("/api/admin/attendance/mark", { method: "POST", body: payload, auth: true }); },
    batchMark(payload) { return apiRequest("/api/admin/attendance/batch-mark", { method: "POST", body: payload, auth: true }); }
  },
  leave: {
    submit(payload) { return apiRequest("/api/student/leave/submit", { method: "POST", body: payload, auth: true }); },
    myHistory() { return apiRequest("/api/student/leave/history", { auth: true }); },
    adminList(status, q) {
      const qs = new URLSearchParams();
      if (status) qs.set("status", status);
      if (q) qs.set("q", q);
      return apiRequest(`/api/admin/leave?${qs.toString()}`, { auth: true });
    },
    approve(id, comment) {
      return apiRequest(`/api/admin/leave/${id}/approve`, { method: "POST", body: { adminComment: comment || null }, auth: true });
    },
    reject(id, comment) {
      return apiRequest(`/api/admin/leave/${id}/reject`, { method: "POST", body: { adminComment: comment }, auth: true });
    }
  },

  /* ------------------------------------------------------------------
     Part 40: My Projects, Notifications, Feedback, Refer a Friend.
     These endpoints do not exist on the backend yet - see the API
     contract notes shared with the backend team. Frontend calls them
     exactly like every other namespace above so wiring up the real
     backend later is a drop-in, no frontend changes required.
     ------------------------------------------------------------------ */
  projects: {
    myList() { return apiRequest("/api/student/projects", { auth: true }); },
    myDetail(id) { return apiRequest(`/api/student/projects/${encodeURIComponent(id)}`, { auth: true }); },
    updateProgress(id, payload) {
      return apiRequest(`/api/student/projects/${encodeURIComponent(id)}/progress`, { method: "POST", body: payload, auth: true });
    },
    submit(id, payload) {
      return apiRequest(`/api/student/projects/${encodeURIComponent(id)}/submit`, { method: "POST", body: payload, auth: true });
    },
    resubmit(id, payload) {
      return apiRequest(`/api/student/projects/${encodeURIComponent(id)}/resubmit`, { method: "POST", body: payload, auth: true });
    },
    adminList(params) {
      const qs = new URLSearchParams(Object.entries(params || {}).filter(([, v]) => v !== undefined && v !== null && v !== ""));
      return apiRequest(`/api/admin/projects?${qs.toString()}`, { auth: true });
    },
    adminDetail(id) { return apiRequest(`/api/admin/projects/${encodeURIComponent(id)}`, { auth: true }); },
    adminReview(id, payload) {
      return apiRequest(`/api/admin/projects/${encodeURIComponent(id)}/review`, { method: "POST", body: payload, auth: true });
    }
  },
  notifications: {
    myList() { return apiRequest("/api/student/notifications", { auth: true }); },
    markRead(id) { return apiRequest(`/api/student/notifications/${encodeURIComponent(id)}/read`, { method: "POST", auth: true }); },
    markAllRead() { return apiRequest("/api/student/notifications/read-all", { method: "POST", auth: true }); },
    adminList() { return apiRequest("/api/admin/notifications", { auth: true }); },
    adminMarkRead(id) { return apiRequest(`/api/admin/notifications/${encodeURIComponent(id)}/read`, { method: "POST", auth: true }); },
    adminMarkAllRead() { return apiRequest("/api/admin/notifications/read-all", { method: "POST", auth: true }); },
    adminClearAll() { return apiRequest("/api/admin/notifications/clear-all", { method: "DELETE", auth: true }); }
  },
  feedback: {
    submit(payload) { return apiRequest("/api/student/feedback", { method: "POST", body: payload, auth: true }); },
    myList() { return apiRequest("/api/student/feedback", { auth: true }); },
    adminList(params) {
      const qs = new URLSearchParams(Object.entries(params || {}).filter(([, v]) => v !== undefined && v !== null && v !== ""));
      return apiRequest(`/api/admin/feedback?${qs.toString()}`, { auth: true });
    },
    adminRespond(id, payload) {
      return apiRequest(`/api/admin/feedback/${encodeURIComponent(id)}/respond`, { method: "POST", body: payload, auth: true });
    }
  },
  referral: {
    myInfo() { return apiRequest("/api/student/referral", { auth: true }); },
    submitReferral(payload) { return apiRequest("/api/student/referral", { method: "POST", body: payload, auth: true }); },
    adminList() { return apiRequest("/api/admin/referrals", { auth: true }); }
  },

  /* ------------------------------------------------------------------
     Placement module (student side): resume upload, professional
     profile links, an optional structured resume profile, and the
     companies-applied tracker. Like the Part 40 namespaces above, these
     endpoints are not implemented on the backend yet - the frontend
     calls them exactly like every other namespace so wiring up the real
     backend later is a drop-in, no frontend changes required. The
     read-only "Student Placement Profile" panel reuses students.me()
     above instead of a new endpoint, since it's the same account data.
     ------------------------------------------------------------------ */
  placement: {
    getResumeStatus() { return apiRequest("/api/student/placement/resume", { auth: true }); },
    uploadResume(file) {
      const form = new FormData();
      form.append("resume", file);
      return apiRequest("/api/student/placement/resume", { method: "POST", body: form, isForm: true, auth: true });
    },
    getLinks() { return apiRequest("/api/student/placement/links", { auth: true }); },
    saveLinks(payload) { return apiRequest("/api/student/placement/links", { method: "POST", body: payload, auth: true }); },
    getResumeProfile() { return apiRequest("/api/student/placement/resume-profile", { auth: true }); },
    saveResumeProfile(payload) { return apiRequest("/api/student/placement/resume-profile", { method: "POST", body: payload, auth: true }); },
    myCompanies() { return apiRequest("/api/student/placement/companies", { auth: true }); },
    addCompany(payload) {
      // payload is a FormData instance when a poster image is attached,
      // a plain object otherwise - apiRequest already knows how to send both.
      const isForm = payload instanceof FormData;
      return apiRequest("/api/student/placement/companies", { method: "POST", body: payload, isForm, auth: true });
    },
    deleteCompany(id) {
      return apiRequest(`/api/student/placement/companies/${encodeURIComponent(id)}`, { method: "DELETE", auth: true });
    }
  },

  /* ------------------------------------------------------------------
     Trainer user management (Admin-only creation/listing). Trainer
     authentication reuses auth.adminLogin() above through the shared
     Admin/Trainer login page (admin-login.html) - there is no separate
     trainer login endpoint or page. adminCreate() only ever sends
     {name, password} - the visible create form has no username/status
     field (Part E/R.6); if the backend needs a login identifier it
     generates one itself and returns it in the response.
     ------------------------------------------------------------------ */
  /* ------------------------------------------------------------------
     Admin -> Placements -> Applied Companies (ADMIN ONLY endpoints).
     Filters are sent as plain values; the backend derives the students.
     ------------------------------------------------------------------ */
  placementAdmin: {
    appliedCompanies(params) {
      const qs = new URLSearchParams(params || {}).toString();
      return apiRequest("/api/admin/placements/applied-companies" + (qs ? "?" + qs : ""), { auth: true });
    }
  },

  trainers: {
    adminList(q) {
      const qs = new URLSearchParams();
      if (q) qs.set("q", q);
      return apiRequest(`/api/admin/trainers?${qs.toString()}`, { auth: true });
    },
    adminCreate(payload) {
      return apiRequest("/api/admin/trainers", { method: "POST", body: payload, auth: true });
    },
    getById(id) {
      return apiRequest(`/api/admin/trainers/${encodeURIComponent(id)}`, { auth: true });
    },
    updatePermissions(id, permissions) {
      return apiRequest(`/api/admin/trainers/${encodeURIComponent(id)}/permissions`, {
        method: "PUT",
        body: { permissions },
        auth: true
      });
    },
    // Admin only: assign / change a trainer's department (data scope).
    updateDepartment(id, department) {
      return apiRequest(`/api/admin/trainers/${encodeURIComponent(id)}/department`, {
        method: "PUT",
        body: { department },
        auth: true
      });
    },
    // NEW: Delete Staff - dedicated delete endpoint, identified by the
    // trainer's unique database id only.
    deleteTrainer(id) {
      return apiRequest(`/api/admin/trainers/${encodeURIComponent(id)}`, { method: "DELETE", auth: true });
    }
  },

  /* ------------------------------------------------------------------
     Mock Interview (student side + admin/trainer analytics). Category
     is never sent by the frontend on the student side - the backend
     derives it from the authenticated student's registered course, and
     the six category strings below must exactly match the Course
     dropdown in student-register.html (master category source). Score
     is always computed and returned by the backend; the frontend never
     grades the attempt itself. These endpoints are not implemented on
     the backend yet - same drop-in-later pattern as every other
     not-yet-backed namespace above (see the API contract note at the
     end of this file's namespace list).
     ------------------------------------------------------------------ */
  mockInterview: {
    myStatus() { return apiRequest("/api/student/mock-interview/status", { auth: true }); },
    start() { return apiRequest("/api/student/mock-interview/start", { method: "POST", auth: true }); },
    saveAnswer(attemptId, questionId, optionId) {
      return apiRequest(`/api/student/mock-interview/${encodeURIComponent(attemptId)}/answer`, {
        method: "POST", body: { questionId, optionId }, auth: true
      });
    },
    submit(attemptId) {
      return apiRequest(`/api/student/mock-interview/${encodeURIComponent(attemptId)}/submit`, { method: "POST", auth: true });
    },
    myResult() { return apiRequest("/api/student/mock-interview/result", { auth: true }); },
    // Admin/Trainer analytics - six fixed categories, students within a
    // category, with the same search+pagination pattern used elsewhere.
    adminCategorySummary() { return apiRequest("/api/admin/mock-interview/categories", { auth: true }); },
    adminCategoryResults(category) {
      return apiRequest(`/api/admin/mock-interview/categories/${encodeURIComponent(category)}/results`, { auth: true });
    }
  },

  /* ------------------------------------------------------------------
     Student Performance Dashboard (replaces the old PEST-only
     presentation on the Student Performance page and Admin Student
     Skill Scores page - the PEST backend/API itself is untouched,
     students.myPerformance() above still calls it). Aggregates
     Attendance, Projects, Placement and Mock Interview for a given
     period; the frontend never computes these aggregates itself.
     ------------------------------------------------------------------ */
  performance: {
    // period is one of "this_month" | "previous_month" | "overall"
    summary(period) {
      const qs = new URLSearchParams({ period });
      return apiRequest(`/api/student/performance/summary?${qs.toString()}`, { auth: true });
    }
  },

  /* ------------------------------------------------------------------
     Job Updates — NEW, isolated feature. Admin posts a job targeted at
     one of the existing Department values; the Student endpoint returns
     only that student's own published, matching jobs (filtering happens
     on the backend, never in this file). Own namespace, own endpoints -
     does not touch any other namespace above.
     ------------------------------------------------------------------ */
  jobUpdates: {
    adminList() { return apiRequest("/api/admin/job-updates", { auth: true }); },
    adminCreate(payload) { return apiRequest("/api/admin/job-updates", { method: "POST", body: payload, auth: true }); },
    adminUpdate(id, payload) { return apiRequest(`/api/admin/job-updates/${encodeURIComponent(id)}`, { method: "PUT", body: payload, auth: true }); },
    adminDelete(id) { return apiRequest(`/api/admin/job-updates/${encodeURIComponent(id)}`, { method: "DELETE", auth: true }); },
    adminSetPublished(id, published) {
      // POST, not PATCH: the existing CORS config only allows GET/POST/PUT/
      // DELETE/OPTIONS, so this reuses POST instead of requiring a change
      // to SecurityConfig.
      return apiRequest(`/api/admin/job-updates/${encodeURIComponent(id)}/publish`, { method: "POST", body: { published }, auth: true });
    },
    myList() { return apiRequest("/api/student/job-updates", { auth: true }); }
  },

  /* ------------------------------------------------------------------
     NEW: Meeting Updates (isolated module). Admin CRUD lives under
     /api/admin/meeting-updates (ADMIN role only); students only get the
     read-only GET /api/student/meeting-updates.
     ------------------------------------------------------------------ */
  meetingUpdates: {
    adminList() { return apiRequest("/api/admin/meeting-updates", { auth: true }); },
    adminGet(id) { return apiRequest(`/api/admin/meeting-updates/${encodeURIComponent(id)}`, { auth: true }); },
    adminCreate(payload) { return apiRequest("/api/admin/meeting-updates", { method: "POST", body: payload, auth: true }); },
    adminUpdate(id, payload) { return apiRequest(`/api/admin/meeting-updates/${encodeURIComponent(id)}`, { method: "PUT", body: payload, auth: true }); },
    adminDelete(id) { return apiRequest(`/api/admin/meeting-updates/${encodeURIComponent(id)}`, { method: "DELETE", auth: true }); },
    adminSetPublished(id, published) {
      // POST, not PATCH - same convention as jobUpdates.adminSetPublished.
      return apiRequest(`/api/admin/meeting-updates/${encodeURIComponent(id)}/publish`, { method: "POST", body: { published }, auth: true });
    },
    myList() { return apiRequest("/api/student/meeting-updates", { auth: true }); }
  }
};