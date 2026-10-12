/* =====================================================================
   student-dashboard.js — PATCH FOR TWO STUDENT-SIDE BUGS
   (1) Today's Working Hours   (2) Project Details modal

   Everything here goes INSIDE the existing DOMContentLoaded handler,
   exactly where indicated. Nothing in Admin, project allocation,
   Submit / Resubmit / Update Progress, ProjectCompletionState or
   SessionTracker is touched.

   Edit checklist
   --------------
   A. student-dashboard.html  -> one-word HTML fix (see EDIT A)
   B. runDashboardTask(... myWorkingHoursToday ...) -> EDIT B
   C. The 60-second setInterval                     -> EDIT C
   D. PATCH 1: paste the block ABOVE renderWorkingHoursCard(), then
      REPLACE renderWorkingHoursCard() with the one below.
      (keep formatMinutes() exactly as it is)
   E. PATCH 2: paste the resolver block right AFTER the
      PROJECT_SPECIFIC_CONTENT constant, and REPLACE the existing
      getProjectContent() and renderProjectDetailsModal() with the
      versions below. PROJECT_SPECIFIC_CONTENT itself is not changed.
   ===================================================================== */


/* ---------------------------------------------------------------------
   EDIT A — student-dashboard.html
   The "2HRs—" you see is a hard-coded placeholder in the markup.
   Change:
       <div class="sc-value" id="cardWorkingHours">2HRs—</div>
   to:
       <div class="sc-value" id="cardWorkingHours">—</div>
   --------------------------------------------------------------------- */


/* ---------------------------------------------------------------------
   EDIT B — inside loadDashboard(), replace the Working Hours task with:

        // Today's Working Hours  <- /api/student/session/working-hours/today (server-computed)
        runDashboardTask(runId,
          () => Api.sessions.myWorkingHoursToday(),
          renderWorkingHoursCard,
          (err) => {
            console.error("[WorkingHours] could not load /api/student/session/working-hours/today", err);
            renderWorkingHoursCard(null);
          }),
   --------------------------------------------------------------------- */


/* ---------------------------------------------------------------------
   EDIT C — replace the body of the existing 60-second setInterval with
   (still ONE timer, still only when the Dashboard + tab are visible):

    setInterval(function () {
      if (document.hidden) return;
      const dash = document.getElementById("sec-dashboard");
      if (!dash || !dash.classList.contains("active")) return;
      Promise.resolve()
        .then(function () { return Api.sessions.myWorkingHoursToday(); })
        .then(renderWorkingHoursCard, function (err) {
          console.warn("[WorkingHours] refresh failed - keeping the last value", err);
          handleLoadError(err);
        });
    }, 60 * 1000);
   --------------------------------------------------------------------- */


/* =====================================================================
   PATCH 1 — TODAY'S WORKING HOURS
   ===================================================================== */

// Product rule: 2 hours (120 min) of authenticated website-session time per day.
// Used ONLY as the target when the backend doesn't send one - never as a worked value.
const DAILY_TARGET_MINUTES = 120;
let whRawLogged = false;   // log the real backend payload once, so the true contract is visible in the console
let whShapeWarned = false; // warn once (not every 60s) if the payload shape isn't recognised

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

// Reads ONE flat object and returns { minutes, label, targetMinutes, targetLabel, goalFlag } or null.
// Accepts the common ways a backend names these values. Nothing is invented: if neither a
// worked-time number nor a ready-made label is present, it returns null.
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
    else if (decimalHours != null) minutes = Math.floor(decimalHours * 60 + 1e-6);                     // {hours:1.58} - floored, never rounded up
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

// Handles the payload at top level, or wrapped as { data: {...} } / { result: {...} } etc.
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

// REPLACES the existing renderWorkingHoursCard(). Pass null on a failed request.
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

  // Worked time: from minutes (formatted "Xh MMm", floored) when the backend gave a number, else its own label.
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


/* =====================================================================
   PATCH 2 — PROJECT DETAILS: reliable content resolver
   Paste right after the PROJECT_SPECIFIC_CONTENT constant.
   ===================================================================== */

// Checked in this order for any piece of text, so a title that mentions React AND JavaScript
// resolves to React, and one that mentions JavaScript AND HTML resolves to JavaScript.
const PROJECT_CONTENT_MATCHERS = [
  { key: 3, re: /\breact(?:\.?js)?\b/i },
  { key: 2, re: /\bjava\s*-?script\b|\bjs\b|\bfetch\b/i },
  { key: 1, re: /\bhtml\b|\bcss\b/i }
];

function pdContentKeyFromText(v) {
  const t = String(v == null ? "" : v).replace(/_/g, " ").trim(); // "html_css" -> "html css" so \b works
  if (!t) return null;
  const hit = PROJECT_CONTENT_MATCHERS.find(function (m) { return m.re.test(t); });
  return hit ? hit.key : null;
}

// "1", 2, "STAGE_3", "STEP 01" -> 1..3 ; "React" -> 3 ; anything else -> null
function pdContentKeyFromStage(v) {
  if (v == null || v === "") return null;
  if (typeof v === "number" || /^\s*(?:stage|step)?\s*_?0*\d+\s*$/i.test(String(v))) {
    const n = parseInt(String(v).replace(/\D/g, ""), 10);
    return n >= 1 && n <= 3 ? n : null;
  }
  return pdContentKeyFromText(v);
}

// Priority: title -> technology -> stage -> normalized name -> backend id (only if it is literally 1/2/3).
// Uses the backend row only, so a template title borrowed by the journey card can never
// decide which project's content is shown.
function resolveProjectContentKey(proj, backend) {
  const b = backend || {};
  const p = proj || {};
  const steps = [
    function () { return pdContentKeyFromText(b.title); },
    function () { return pdContentKeyFromText(b.technology); },
    function () { return pdContentKeyFromStage(b.stage); },
    function () { return pdContentKeyFromText([b.name, b.projectName, b.projectTitle, b.slug, b.code].filter(Boolean).join(" ")); },
    function () {
      const id = Number(b.id != null ? b.id : p.id);
      return id === 1 || id === 2 || id === 3 ? id : null;
    }
  ];
  for (const step of steps) {
    const key = step();
    if (key != null) return key;
  }
  return null;
}

const pdWarnedUnresolved = new Set();

// REPLACES the existing getProjectContent(). Signature changed: (proj, backendData), not (projectId, backendData).
// Static content still wins over backend text for the content sections, exactly as before.
function getProjectContent(proj, backendData) {
  const b = backendData || {};
  const key = resolveProjectContentKey(proj, b);
  const specific = key != null ? PROJECT_SPECIFIC_CONTENT[key] : null;
  if (!specific) {
    const id = String(b.id != null ? b.id : (proj && proj.id));
    if (!pdWarnedUnresolved.has(id)) {
      pdWarnedUnresolved.add(id);
      console.warn("[ProjectDetails] No project-specific content matched. id / title / technology / stage:", id, b.title, b.technology, b.stage);
    }
  }
  return Object.assign({}, b, specific || {});
}

// Overlay only the values the detail endpoint actually returned (null / "" never wipe the list row's data).
function pdMergeDefined(base, overlay) {
  const out = Object.assign({}, base || {});
  if (overlay && typeof overlay === "object") {
    Object.keys(overlay).forEach(function (k) {
      const v = overlay[k];
      if (v == null || (typeof v === "string" && !v.trim())) return;
      out[k] = v;
    });
  }
  return out;
}

// REPLACES the existing renderProjectDetailsModal().
// Differences from the original are marked  // CHANGED  /  // ADDED.
function renderProjectDetailsModal(proj, detail, state) {
  const b = pdMergeDefined(proj.backend, detail); // CHANGED: was Object.assign({}, proj.backend, detail) - null detail fields could wipe row data
  // Merge in project-specific content for this project
  const projContent = getProjectContent(proj, b); // CHANGED: resolves by title/technology/stage/name/id instead of proj.id only

  viewProjectModalTitle.textContent = b.title || proj.title || "Project Details";
  viewProjectModalCategory.textContent = b.category || "";
  viewProjectModalCategory.style.display = b.category ? "" : "none"; // no empty gap when the backend sent no category
  const status = b.status || proj.status;
  viewProjectModalStatus.innerHTML = statusBadge(status);

  const pct = b.progressPercent != null && b.progressPercent !== "" && Number.isFinite(Number(b.progressPercent))
    ? Math.max(0, Math.min(100, Number(b.progressPercent))) : null;
  const meta = `
    <div class="pd-meta">
      <div class="pd-meta-item"><span>Progress</span><b>${pct != null ? pct + "%" : "—"}</b></div>
      <div class="pd-meta-item"><span>Assigned</span><b>${escapeHtml(b.assignedOn || "—")}</b></div>
      <div class="pd-meta-item"><span>Due</span><b>${escapeHtml(b.dueDate || "—")}</b></div>
    </div>`;

  const sections = [];

  // Use project-specific description if available, fall back to backend
  const description = projContent.fullDescription || pdPick(b, "description");
  if (description) sections.push(pdSection("Description", pdTextHtml(description)));

  // Objective - prefer project-specific
  const objective = projContent.objective || pdPick(b, "objective");
  if (objective) sections.push(pdSection("Objective", pdTextHtml(objective)));

  // What You Need To Build - project-specific
  const whatToBuild = projContent.whatToBuild || pdPick(b, "whatToBuild");
  if (whatToBuild) sections.push(pdSection("What You Need To Build", pdTextHtml(whatToBuild)));

  // Requirements - prefer project-specific
  const requirements = projContent.requirements || pdPick(b, "requirements");
  if (requirements) sections.push(pdSection("Requirements", pdTextHtml(requirements)));

  // Functional Requirements - project-specific
  const funcReqs = projContent.functionalRequirements || pdPick(b, "functionalRequirements");
  if (funcReqs) sections.push(pdSection("Functional Requirements", pdTextHtml(funcReqs)));

  // Technical Requirements - prefer project-specific
  const techReqs = projContent.technicalRequirements || pdPick(b, "technicalRequirements");
  if (techReqs) sections.push(pdSection("Technical Requirements", pdTextHtml(techReqs)));

  // Expected Output - prefer project-specific
  const expectedOutput = projContent.expectedOutput || pdPick(b, "expectedOutput");
  if (expectedOutput) sections.push(pdSection("Expected Output", pdTextHtml(expectedOutput)));

  // Skills - prefer project-specific
  const skills = projContent.skills || pdPick(b, "skills");
  if (skills) {
    const list = Array.isArray(skills) ? skills : String(skills).split(",").map(x => x.trim()).filter(Boolean);
    if (list.length) {
      sections.push(pdSection("Skills You Will Build",
        `<div class="project-skills-badges">${list.map(sk => `<span class="skill-badge">${escapeHtml(typeof sk === "object" ? (sk.name || sk.title || "") : sk)}</span>`).join("")}</div>`));
    }
  }

  // Submission Requirements - project-specific
  const submissionReqs = projContent.submissionRequirements;
  if (submissionReqs) sections.push(pdSection("Submission Requirements", pdTextHtml(submissionReqs)));

  if (state === "ready" && !sections.length) {
    sections.push(`<p class="pd-loading">No further project details have been added for this project yet.</p>`);
  }

  // ADDED: progress bar for THIS project (inline-styled so it doesn't depend on card-scoped CSS)
  const progressBar = pct != null
    ? `<div role="progressbar" aria-valuenow="${pct}" aria-valuemin="0" aria-valuemax="100" aria-label="Project progress" style="height:8px;border-radius:999px;background:var(--line,#e5e5e5);overflow:hidden;margin:4px 0 6px;">
         <div style="height:100%;width:${pct}%;background:#b3122d;border-radius:999px;"></div>
       </div>
       <p style="margin:0 0 10px;font-size:.84rem;color:var(--ink-soft);">Progress · ${pct}%</p>`
    : "";

  // Submission information (status comes from the backend; nothing is guessed)
  const submitted = !(status === "NOT_STARTED" || status === "IN_PROGRESS");
  let submission = progressBar + `<p>${submitted ? "Submitted" : "Not yet submitted"}</p>`; // CHANGED: progress bar prepended
  const submittedOn = pdPick(b, "submittedOn");
  if (submittedOn) submission += `<div class="pd-note"><b>Submitted On</b>${escapeHtml(submittedOn)}</div>`;
  if (b.submissionUrl) submission += `<p class="pd-link">${pdSafeLink(b.submissionUrl)}</p>`;
  if (b.submissionNote) submission += `<div class="pd-note"><b>Submission Note</b>${escapeHtml(b.submissionNote)}</div>`;
  sections.push(pdSection("Current Progress", submission));

  if (b.adminFeedback) {
    sections.push(pdSection("Reviewer Feedback",
      `<div class="pd-note"><b>Feedback</b>${escapeHtml(b.adminFeedback)}</div>`,
      status === "REVISION_REQUIRED" ? "pd-section-revision" : ""));
  }

  let footer = "";
  if (state === "loading") footer = `<p class="pd-loading">Loading full project details…</p>`;
  else if (state === "error") footer = `<p class="pd-loading">Couldn't load the full project details right now — showing what's available.</p>`;

  // Ensure modal body has proper scrolling for all content
  viewProjectModalBody.innerHTML = meta + sections.join("") + footer;
  // Force proper scroll behavior
  viewProjectModalBody.style.overflowY = "auto";
  viewProjectModalBody.style.maxHeight = "70vh";
}