/* ==========================================================================
   Profenaa Technologies — Student Dashboard
   Mock Interview module (Part A, NEW). Self-contained on purpose: it only
   reads/writes elements inside #sec-mock-interviews (plus the sidebar/
   logout lock and the #miSubmitConfirmModal), and only calls
   Api.mockInterview.*. It does not touch any other section's markup,
   listeners, or state.

   Load order matters: this file must be included BEFORE student-dashboard.js
   in student-dashboard.html. Both files register a DOMContentLoaded
   listener; listeners fire in registration order, so this file's handler
   (which sets window.loadMockInterviewSection and window.mockInterviewGuard)
   always runs before student-dashboard.js builds its sectionLoaders map
   and wires up sidebar navigation.

   BACKEND CONTRACT THIS FILE EXPECTS (Api.mockInterview.* in api.js) -
   none of this is implemented on the backend yet, same drop-in pattern as
   every other not-yet-backed namespace:

   GET  /api/student/mock-interview/status
     -> { category: string,
          status: "NOT_STARTED" | "IN_PROGRESS" | "COMPLETED",
          attempt?: {                      // present when IN_PROGRESS - used to resume, never to start a new attempt
            attemptId, totalQuestions: 20,
            questions: [{ id, text, options: [{ id, text }] }],  // never includes a correct-answer field
            answers: { [questionId]: optionId }
          },
          result?: {                       // present when COMPLETED
            score, totalQuestions, percentage, correctCount, wrongCount, attemptedOn, category
          } }

   POST /api/student/mock-interview/start
     -> same shape as `attempt` above. The backend is the sole authority on
        whether a new attempt is allowed (one attempt only, ever) - the
        frontend never fabricates a second attempt on refresh, it always
        re-checks /status first.

   POST /api/student/mock-interview/{attemptId}/answer  { questionId, optionId }
     -> saves progress so a refresh can resume mid-interview. Best-effort:
        UI already reflects the selection locally either way.

   POST /api/student/mock-interview/{attemptId}/submit
     -> same shape as `result` above. The frontend NEVER grades the
        attempt itself - score/percentage/correct/wrong always come from
        this response.
   ========================================================================== */

/* Response-contract normalizer (student side only). The Mock Interview result
   may arrive as correctCount / wrongCount / attemptedOn (documented above) or
   as correct / wrong / attemptedDate; everything downstream - this file's
   result screen and the Dashboard's "Mock Interview Score" card - reads only
   the normalized names. Absent values stay null: nothing is defaulted. This
   is the STUDENT Mock Interview only; PEST results (/api/students/me/performance)
   are a separate system with their own contract, and the Admin Mock
   Interview analytics are not touched. */
window.normalizeMockInterviewResult = function (raw) {
  if (!raw || typeof raw !== "object") return null;
  const pick = (...vals) => vals.find(v => v !== undefined && v !== null && v !== "");
  const orNull = v => (v === undefined ? null : v);
  return Object.assign({}, raw, {
    score: orNull(pick(raw.score)),
    totalQuestions: orNull(pick(raw.totalQuestions)),
    percentage: orNull(pick(raw.percentage)),
    correctCount: orNull(pick(raw.correctCount, raw.correct)),
    wrongCount: orNull(pick(raw.wrongCount, raw.wrong)),
    attemptedOn: orNull(pick(raw.attemptedOn, raw.attemptedDate)),
    category: orNull(pick(raw.category))
  });
};

document.addEventListener("DOMContentLoaded", function () {

  const miSection = document.getElementById("sec-mock-interviews");
  if (!miSection) return; // this page doesn't have the Mock Interview markup

  function escapeHtml(str) {
    if (str == null) return "";
    return String(str)
      .replaceAll("&", "&amp;").replaceAll("<", "&lt;").replaceAll(">", "&gt;")
      .replaceAll('"', "&quot;").replaceAll("'", "&#039;");
  }

  const TOTAL_QUESTIONS = 20;
  const MOCK_INTERVIEW_CATEGORIES = [
    "Mechanical CAD", "Civil CAD", "Electrical CAD",
    "Electronic CAD", "Arts and Multimedia", "Computer Science / IT"
  ];

  const introView = document.getElementById("miIntroView");
  const interviewView = document.getElementById("miInterviewView");
  const resultView = document.getElementById("miResultView");

  const progressCount = document.getElementById("miProgressCount");
  const progressFill = document.getElementById("miProgressFill");
  const questionText = document.getElementById("miQuestionText");
  const optionsList = document.getElementById("miOptionsList");
  const interviewError = document.getElementById("miInterviewError");
  const prevBtn = document.getElementById("miPrevBtn");
  const nextBtn = document.getElementById("miNextBtn");
  const submitBtn = document.getElementById("miSubmitBtn");

  const submitModal = document.getElementById("miSubmitConfirmModal");
  const submitAnsweredCount = document.getElementById("miSubmitAnsweredCount");
  const submitCancelBtn = document.getElementById("miSubmitCancelBtn");
  const submitConfirmBtn = document.getElementById("miSubmitConfirmBtn");

  const studentSidebar = document.getElementById("studentSidebar");

  let sectionLoaded = false;
  let interviewActive = false;
  let category = null;
  let attemptId = null;
  let questions = [];
  let answers = {}; // questionId -> optionId
  let currentIndex = 0;

  // ================================================================
  // Security UX (Part A "IMPORTANT SECURITY UX" / doc2 §14): while an
  // interview is active, lock the sidebar visually AND guard clicks -
  // this is defense-in-depth only, the backend remains the real
  // authority over session/attempt ownership.
  // ================================================================
  function lockNavigation() {
    interviewActive = true;
    if (studentSidebar) studentSidebar.classList.add("mi-locked");
    window.addEventListener("beforeunload", beforeUnloadHandler);
    // Push an extra history entry so a single Back press is absorbed
    // instead of leaving the page; re-pushed every time on popstate.
    history.pushState({ miGuard: true }, "", location.href);
    window.addEventListener("popstate", popStateHandler);
  }
  function unlockNavigation() {
    interviewActive = false;
    if (studentSidebar) studentSidebar.classList.remove("mi-locked");
    window.removeEventListener("beforeunload", beforeUnloadHandler);
    window.removeEventListener("popstate", popStateHandler);
  }
  function beforeUnloadHandler(e) {
    e.preventDefault();
    e.returnValue = "";
  }
  function popStateHandler() {
    // Absorb the Back navigation: warn, then re-push so the URL/section
    // never actually changes while the interview is active.
    history.pushState({ miGuard: true }, "", location.href);
    showToast("You're in the middle of your Mock Interview. Please finish or submit it before navigating away.", "error");
  }
  // Consulted by student-dashboard.js's sidebar click handler before it
  // switches sections (see the guard added there).
  window.mockInterviewGuard = function (target) {
    if (target === "sec-mock-interviews") return true;
    if (!interviewActive) return true;
    return confirm("You're currently taking your Mock Interview. Leaving now will not save further progress on this question and you'll need to come back to finish it. Continue anyway?");
  };

  // ================================================================
  // Entry point
  // ================================================================
  function loadMockInterviewSection() {
    if (sectionLoaded) return;
    sectionLoaded = true;
    refreshStatus();
  }
  window.loadMockInterviewSection = loadMockInterviewSection;

  async function refreshStatus() {
    showIntroLoading();
    try {
      const status = await Api.mockInterview.myStatus();
      category = status.category || null;

      if (!category || !MOCK_INTERVIEW_CATEGORIES.includes(category)) {
        renderNoCategoryState();
        return;
      }

      if (status.status === "COMPLETED" && status.result) {
        renderResult(status.result, status);
        return;
      }

      if (status.status === "IN_PROGRESS" && status.attempt) {
        resumeAttempt(status.attempt);
        return;
      }

      renderIntroReady(category);
    } catch (err) {
      renderIntroError(err);
    }
  }

  function showIntroLoading() {
    introView.style.display = "";
    interviewView.style.display = "none";
    resultView.style.display = "none";
    introView.innerHTML = `<p style="color:var(--ink-soft); font-size:.9rem;">Loading your Mock Interview…</p>`;
  }

  function renderNoCategoryState() {
    introView.innerHTML = `
      <div class="panel-card">
        <h3>Mock Interview Not Assigned Yet</h3>
        <p style="color:var(--ink-soft); font-size:.92rem; margin:0 0 16px;">
          Please select and update your technical Course specialization in <b><a href="javascript:void(0)" id="miGoToProfileLink" style="color:var(--crimson); text-decoration:underline;">My Profile</a></b> to unlock your 20-question Mock Interview / Quiz.
        </p>
      </div>
    `;
    const link = document.getElementById("miGoToProfileLink");
    if (link) {
      link.addEventListener("click", function () {
        // Navigate to the Student Profile section (existing nav system),
        // then land the viewport on the existing "Course & Project Track
        // Specialization" card so the student sees the course dropdown
        // immediately, instead of just the top of the Profile page.
        if (typeof window.activateStudentSection === "function") {
          window.activateStudentSection("sec-profile");
        } else {
          const profileNav = document.querySelector(".side-nav-item[data-section='sec-profile']");
          if (profileNav) profileNav.click();
        }
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
        requestAnimationFrame(function () {
          if (!scrollToCourseCard()) setTimeout(scrollToCourseCard, 150);
        });
      });
    }
  }

  function renderIntroError(err) {
    const message = (err && err.message) ? err.message : "Something went wrong loading your Mock Interview.";
    introView.innerHTML = `
      <div class="panel-card">
        <h3>Couldn't load your Mock Interview</h3>
        <p style="color:var(--ink-soft); font-size:.9rem; margin:0 0 16px;">${escapeHtml(message)}</p>
        <button type="button" class="btn btn-outline" id="miRetryBtn" style="width:auto;">Try Again</button>
      </div>
    `;
    const retryBtn = document.getElementById("miRetryBtn");
    if (retryBtn) retryBtn.addEventListener("click", refreshStatus);
    if (typeof handleLoadError === "function") handleLoadError(err);
  }

  const CATEGORY_DESCRIPTIONS = {
    "Mechanical CAD": "Concepts, tools and workflows around mechanical design and CAD modeling.",
    "Civil CAD": "Concepts, tools and workflows around civil design and CAD drafting.",
    "Electrical CAD": "Concepts, tools and workflows around electrical design and CAD schematics.",
    "Electronic CAD": "Concepts, tools and workflows around electronic circuit design and CAD layout.",
    "Arts and Multimedia": "Concepts and tools across design, animation and multimedia production.",
    "Computer Science / IT": "Programming fundamentals, web development and core computer science concepts."
  };

  function renderIntroReady(cat) {
    introView.innerHTML = `
      <div class="panel-card mi-intro-card">
        <p class="mi-category-label">Your Category</p>
        <h3 class="mi-category-name">${escapeHtml(cat)}</h3>
        <p class="mi-category-desc">${escapeHtml(CATEGORY_DESCRIPTIONS[cat] || "")}</p>

        <ul class="mi-rules-list">
          <li>20 questions in this Mock Interview.</li>
          <li>Once submitted, you can <b>retake the quiz after a 7-day cooldown</b> period.</li>
          <li>Answer every question before submitting where possible; you can move between questions using Previous / Next.</li>
          <li>Once you start, please stay on this page until you submit — leaving mid-interview may not save further progress.</li>
          <li>Your score is calculated by our system and shown immediately after you submit.</li>
        </ul>

        <button type="button" class="btn btn-primary" id="miStartBtn" style="width:auto;">Start Mock Interview</button>
      </div>
    `;
    const startBtn = document.getElementById("miStartBtn");
    if (startBtn) startBtn.addEventListener("click", startInterview);
  }

  async function startInterview() {
    const startBtn = document.getElementById("miStartBtn");
    if (startBtn) { startBtn.disabled = true; startBtn.textContent = "Starting…"; }
    try {
      const attempt = await Api.mockInterview.start();
      beginAttempt(attempt);
    } catch (err) {
      renderIntroError(err);
    }
  }

  function resumeAttempt(attempt) {
    beginAttempt(attempt, true);
  }

  function beginAttempt(attempt, isResume) {
    attemptId = attempt.attemptId;
    questions = attempt.questions || [];
    answers = Object.assign({}, attempt.answers || {});
    currentIndex = 0;
    // Resume at the first unanswered question when possible, otherwise start at 0.
    if (isResume) {
      const firstUnanswered = questions.findIndex(q => answers[q.id] === undefined);
      currentIndex = firstUnanswered === -1 ? 0 : firstUnanswered;
    }

    introView.style.display = "none";
    resultView.style.display = "none";
    interviewView.style.display = "";
    lockNavigation();
    renderQuestion();
  }

  function renderQuestion() {
    interviewError.textContent = "";
    interviewError.classList.remove("show");

    const total = questions.length || TOTAL_QUESTIONS;
    const q = questions[currentIndex];

    progressCount.textContent = `Question ${currentIndex + 1} / ${total}`;
    progressFill.style.width = `${((currentIndex + 1) / total) * 100}%`;

    if (!q) {
      questionText.textContent = "This question couldn't be loaded.";
      optionsList.innerHTML = "";
      return;
    }

    questionText.textContent = q.text;
    const selected = answers[q.id];
    optionsList.innerHTML = (q.options || []).map(opt => `
      <button type="button" class="mi-option${selected === opt.id ? " selected" : ""}" data-option-id="${escapeHtml(opt.id)}">
        <span class="mi-option-dot"></span>
        <span class="mi-option-text">${escapeHtml(opt.text)}</span>
      </button>
    `).join("");

    optionsList.querySelectorAll(".mi-option").forEach(btn => {
      btn.addEventListener("click", function () {
        selectOption(q.id, this.dataset.optionId);
      });
    });

    prevBtn.disabled = currentIndex === 0;
    const isLast = currentIndex === total - 1;
    nextBtn.style.display = isLast ? "none" : "";
    submitBtn.style.display = isLast ? "" : "none";
  }

  function selectOption(questionId, optionId) {
    answers[questionId] = optionId;
    optionsList.querySelectorAll(".mi-option").forEach(btn => {
      btn.classList.toggle("selected", btn.dataset.optionId === optionId);
    });
    // Best-effort save so a refresh can resume here - a failure here
    // doesn't block the student, it's just retried implicitly by the
    // next answer/submit call or on resume.
    if (attemptId) {
      Api.mockInterview.saveAnswer(attemptId, questionId, optionId).catch(() => {});
    }
  }

  prevBtn.addEventListener("click", function () {
    if (currentIndex > 0) { currentIndex--; renderQuestion(); }
  });
  nextBtn.addEventListener("click", function () {
    const q = questions[currentIndex];
    if (q && answers[q.id] === undefined) {
      interviewError.textContent = "Please select an answer before moving on.";
      interviewError.classList.add("show");
      return;
    }
    if (currentIndex < questions.length - 1) { currentIndex++; renderQuestion(); }
  });

  submitBtn.addEventListener("click", function () {
    const answeredCount = questions.filter(q => answers[q.id] !== undefined).length;
    submitAnsweredCount.textContent = String(answeredCount);
    submitModal.style.display = "flex";
  });
  if (submitCancelBtn) {
    submitCancelBtn.addEventListener("click", function () { submitModal.style.display = "none"; });
  }
  if (submitModal) {
    submitModal.addEventListener("click", function (e) {
      if (e.target === submitModal) submitModal.style.display = "none";
    });
  }
  if (submitConfirmBtn) {
    submitConfirmBtn.addEventListener("click", async function () {
      submitConfirmBtn.disabled = true;
      submitConfirmBtn.textContent = "Submitting…";
      try {
        const result = await Api.mockInterview.submit(attemptId);
        submitModal.style.display = "none";
        unlockNavigation();
        renderResult(result);
      } catch (err) {
        interviewError.textContent = err.message || "Couldn't submit your interview. Please try again.";
        interviewError.classList.add("show");
        submitModal.style.display = "none";
      } finally {
        submitConfirmBtn.disabled = false;
        submitConfirmBtn.textContent = "Submit Interview";
      }
    });
  }

  function renderResult(rawResult, statusObj) {
    const result = window.normalizeMockInterviewResult(rawResult) || {};
    introView.style.display = "none";
    interviewView.style.display = "none";
    resultView.style.display = "";
    unlockNavigation();

    document.getElementById("miResultCategory").textContent = result.category || category || "—";
    // The total comes from the backend; if it isn't sent we show the bare score rather than a made-up "/ 20".
    document.getElementById("miResultScore").textContent =
      (result.score != null ? (result.totalQuestions != null ? `${result.score} / ${result.totalQuestions}` : String(result.score)) : "—");
    document.getElementById("miResultPercentage").textContent =
      (result.percentage != null ? `${Math.round(result.percentage)}%` : "—");
    document.getElementById("miResultCorrect").textContent = result.correctCount != null ? result.correctCount : "—";
    document.getElementById("miResultWrong").textContent = result.wrongCount != null ? result.wrongCount : "—";
    document.getElementById("miResultDate").textContent = result.attemptedOn || "—";

    const cooldownNotice = document.getElementById("miCooldownNotice");
    const retakeWrap = document.getElementById("miRetakeWrap");
    const daysRemainingEl = document.getElementById("miDaysRemaining");
    const nextAvailableDateEl = document.getElementById("miNextAvailableDate");

    const canRetake = !!(statusObj && statusObj.canRetake);
    const nextDate = (statusObj && statusObj.nextAvailableDate) || "";
    const daysRem = (statusObj && statusObj.daysRemaining != null) ? statusObj.daysRemaining : 7;

    if (canRetake) {
      if (cooldownNotice) cooldownNotice.style.display = "none";
      if (retakeWrap) retakeWrap.style.display = "block";
    } else {
      if (cooldownNotice) {
        if (daysRemainingEl) daysRemainingEl.textContent = String(daysRem);
        if (nextAvailableDateEl) nextAvailableDateEl.textContent = nextDate || "in 7 days";
        cooldownNotice.style.display = "inline-flex";
      }
      if (retakeWrap) retakeWrap.style.display = "none";
    }
  }

  const miRetakeBtn = document.getElementById("miRetakeBtn");
  if (miRetakeBtn) {
    miRetakeBtn.addEventListener("click", function () {
      resultView.style.display = "none";
      introView.style.display = "";
      renderIntroReady(category || "Computer Science / IT");
    });
  }
});