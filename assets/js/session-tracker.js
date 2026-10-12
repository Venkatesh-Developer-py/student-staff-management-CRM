/* ==========================================================================
   Profenaa Technologies — Website Session Tracker
   Loaded on every STUDENT page after login. Sends a heartbeat roughly every
   2 minutes while the tab is visible, pauses while hidden/minimized, and
   resumes with an immediate heartbeat when the student comes back.

   This tracks WEBSITE LOGIN ACTIVITY only - it has nothing to do with
   physical/official training Attendance, which is a separate module.

   The student never sees any of this happen.
   ========================================================================== */

(function () {
  const HEARTBEAT_INTERVAL_MS = 2 * 60 * 1000; // ~2 minutes

  let heartbeatTimer = null;
  let sessionExpiredHandled = false;

  function hasActiveStudentSession() {
    return Auth.getRole() === "STUDENT" && Auth.getToken() && Auth.getSessionId();
  }

  let activityModalEl = null;
  let activityCountdownTimer = null;

  function formatCountdown(sec) {
    const m = Math.floor(sec / 60);
    const s = sec % 60;
    return `${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")}`;
  }

  function showActivityVerificationModal(expiresInSeconds) {
    if (activityModalEl) return;

    let remaining = (typeof expiresInSeconds === "number" && expiresInSeconds > 0) ? expiresInSeconds : 300;

    activityModalEl = document.createElement("div");
    activityModalEl.id = "activityVerificationOverlay";
    activityModalEl.className = "modal-overlay";
    activityModalEl.style.zIndex = "1900";
    activityModalEl.innerHTML = `
      <div class="modal-box" style="text-align:center; max-width:440px;">
        <div style="font-size:36px; margin-bottom:8px;">⏳</div>
        <h3 style="margin-bottom:8px; font-size:1.2rem;">Portal Activity Check</h3>
        <p style="color:var(--ink-soft); font-size:0.92rem; margin:0 0 16px; line-height:1.5;">
          You have reached <b>2 hours</b> of active portal time today! A verification email has been sent to your registered email address.
        </p>
        <div style="background:#fff1f2; border:1px solid #fecdd3; color:#be123c; padding:12px; border-radius:8px; margin-bottom:16px; font-weight:600; font-size:0.9rem;">
          Auto-logout in: <span id="activityCountdownText" style="font-size:1.1rem; font-weight:800;">${formatCountdown(remaining)}</span>
        </div>
        <p style="color:var(--ink-soft); font-size:0.82rem; margin:0 0 20px;">
          Kindly confirm you are still active by clicking the link in your email or confirming below:
        </p>
        <div style="display:flex; gap:10px;">
          <button type="button" id="confirmActiveNowBtn" class="btn btn-primary" style="flex:1;">I am Still Active</button>
        </div>
      </div>
    `;
    document.body.appendChild(activityModalEl);

    const countText = document.getElementById("activityCountdownText");
    const confirmBtn = document.getElementById("confirmActiveNowBtn");

    if (confirmBtn) {
      confirmBtn.addEventListener("click", async function () {
        confirmBtn.disabled = true;
        confirmBtn.textContent = "Confirming…";
        try {
          await Api.sessions.confirmActivity(Auth.getSessionId());
          hideActivityVerificationModal();
          if (typeof window.loadDashboard === "function") {
            try { window.loadDashboard(); } catch (e) {}
          }
        } catch (e) {
          confirmBtn.disabled = false;
          confirmBtn.textContent = "I am Still Active";
        }
      });
    }

    if (activityCountdownTimer) clearInterval(activityCountdownTimer);
    activityCountdownTimer = setInterval(function () {
      remaining--;
      if (countText) countText.textContent = formatCountdown(Math.max(0, remaining));
      if (remaining <= 0) {
        clearInterval(activityCountdownTimer);
        activityCountdownTimer = null;
        hideActivityVerificationModal();
        handleSessionExpired("Your session expired because activity was not confirmed within 5 minutes.");
      }
    }, 1000);
  }

  function hideActivityVerificationModal() {
    if (activityCountdownTimer) {
      clearInterval(activityCountdownTimer);
      activityCountdownTimer = null;
    }
    if (activityModalEl && activityModalEl.parentNode) {
      activityModalEl.parentNode.removeChild(activityModalEl);
    }
    activityModalEl = null;
  }

  async function sendHeartbeat() {
    if (!hasActiveStudentSession() || sessionExpiredHandled) return;
    try {
      const res = await Api.sessions.heartbeat(Auth.getSessionId());
      if (res && res.verificationRequired && !res.activityVerified) {
        showActivityVerificationModal(res.verificationExpiresInSeconds);
      } else if (res && res.activityVerified) {
        hideActivityVerificationModal();
      }
    } catch (err) {
      if (err.isAuthError) {
        handleSessionExpired(err.message);
      }
      // Any other transient network error is silently ignored - the next
      // heartbeat attempt will simply try again.
    }
  }

  function startHeartbeatLoop() {
    stopHeartbeatLoop();
    heartbeatTimer = setInterval(sendHeartbeat, HEARTBEAT_INTERVAL_MS);
  }

  function stopHeartbeatLoop() {
    if (heartbeatTimer) {
      clearInterval(heartbeatTimer);
      heartbeatTimer = null;
    }
  }

  // Part 8: pause heartbeats while the tab is hidden/minimized, resume with
  // an immediate heartbeat (plus restart the interval) when it's visible again.
  function handleVisibilityChange() {
    if (!hasActiveStudentSession()) return;
    if (document.visibilityState === "hidden") {
      stopHeartbeatLoop();
    } else {
      sendHeartbeat();
      startHeartbeatLoop();
    }
  }

  // Part 41: clean, non-looping session-expired UX.
  function handleSessionExpired(customMsg) {
    if (sessionExpiredHandled) return;
    sessionExpiredHandled = true;
    stopHeartbeatLoop();
    hideActivityVerificationModal();

    const msg = customMsg || "Please login again to continue.";
    const overlay = document.createElement("div");
    overlay.id = "sessionExpiredOverlay";
    overlay.innerHTML = `
      <div class="session-expired-box">
        <h3>Your session has expired</h3>
        <p>${msg}</p>
        <button type="button" class="btn btn-primary" id="sessionExpiredLoginBtn" style="width:auto; padding:12px 28px;">Login</button>
      </div>
    `;
    document.body.appendChild(overlay);

    document.getElementById("sessionExpiredLoginBtn").addEventListener("click", function () {
      Auth.clear();
      window.location.href = "student-login.html";
    });
  }

  // Explicit logout - called by the Logout button on every student page.
  // Exposed globally so student-dashboard.js (and any future student page)
  // can call it without re-implementing the fetch.
  window.SessionTracker = {
    async logout() {
      const sessionId = Auth.getSessionId();
      stopHeartbeatLoop();
      if (sessionId) {
        try { await Api.sessions.logout(sessionId); } catch (e) { /* best-effort - clear locally regardless */ }
      }
      Auth.clear();
    }
  };

  document.addEventListener("visibilitychange", handleVisibilityChange);

  document.addEventListener("DOMContentLoaded", function () {
    if (!hasActiveStudentSession()) return;
    sendHeartbeat();
    startHeartbeatLoop();
  });
})();
