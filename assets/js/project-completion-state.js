/**
 * PROJECT COMPLETION STATE MANAGER
 * Frontend-only localStorage management for tracking student project completion
 * across Dashboard and My Projects navigation, with page refresh persistence.
 * 
 * A project is marked complete when:
 * - Status becomes "APPROVED" or "COMPLETED" (from backend)
 * - Progress reaches 100% (frontend detection of completion condition)
 */

const ProjectCompletionState = (function () {
  const STORAGE_KEY = "profenaa_student_project_progress";
  const TOTAL_PROJECTS = 3;

  /**
   * Get the current logged-in student identifier for storage isolation.
   * Falls back to a default key if Auth is not available.
   */
  function getStudentId() {
    if (typeof Auth !== "undefined" && typeof Auth.getStudentId === "function") {
      return Auth.getStudentId();
    }
    return "default-student";
  }

  /**
   * Generate a student-specific storage key.
   * Ensures data isolation between different logged-in students.
   */
  function getKey() {
    return `${STORAGE_KEY}:${getStudentId()}`;
  }

  /**
   * Get the entire project completion state from localStorage.
   * Returns { projectId: { completed: boolean }, ... }
   */
  function getState() {
    try {
      const stored = localStorage.getItem(getKey());
      return stored ? JSON.parse(stored) : {};
    } catch (e) {
      console.error("Error reading project completion state:", e);
      return {};
    }
  }

  /**
   * Save the project completion state to localStorage.
   */
  function setState(state) {
    try {
      localStorage.setItem(getKey(), JSON.stringify(state));
    } catch (e) {
      console.error("Error saving project completion state:", e);
    }
  }

  /**
   * Mark a project as completed.
   * Only updates localStorage - does not change backend state.
   */
  function markCompleted(projectId) {
    const state = getState();
    if (!state[projectId]) {
      state[projectId] = {};
    }
    state[projectId].completed = true;
    setState(state);
  }

  /**
   * Check if a project is marked as completed in frontend state.
   */
  function isCompleted(projectId) {
    const state = getState();
    return state[projectId] && state[projectId].completed === true;
  }

  /**
   * Get count of completed projects.
   */
  function getCompletedCount() {
    const state = getState();
    return Object.values(state).filter(proj => proj.completed === true).length;
  }

  /**
   * Check if a project should be marked complete based on backend status.
   * Rules:
   * - APPROVED or COMPLETED status = complete
   * - 100% progress (if status is IN_PROGRESS) = complete
   */
  function shouldMarkComplete(projectStatus, projectProgress) {
    if (projectStatus === "APPROVED" || projectStatus === "COMPLETED") {
      return true;
    }
    // If status is IN_PROGRESS but progress is 100%, mark as complete
    if (projectStatus === "IN_PROGRESS" && projectProgress === 100) {
      return true;
    }
    return false;
  }

  /**
   * Update project state based on latest backend data.
   * Marks projects complete when appropriate and persists to localStorage.
   */
  function updateFromBackend(projectsList) {
    if (!Array.isArray(projectsList)) return;
    projectsList.forEach(proj => {
      if (proj.id && shouldMarkComplete(proj.status, proj.progressPercent)) {
        markCompleted(proj.id);
      }
    });
  }

  /**
   * Get the dashboard counter display text.
   * Returns "X / 3" format where X is completed count.
   */
  function getDashboardCounterText() {
    const completed = getCompletedCount();
    return `${completed} / ${TOTAL_PROJECTS}`;
  }

  /**
   * Clear all project completion state for current student.
   * Used for logout or reset scenarios.
   */
  function clear() {
    try {
      localStorage.removeItem(getKey());
    } catch (e) {
      console.error("Error clearing project completion state:", e);
    }
  }

  // Public API
  return {
    markCompleted,
    isCompleted,
    getCompletedCount,
    shouldMarkComplete,
    updateFromBackend,
    getDashboardCounterText,
    clear,
    getState
  };
})();

// Export for use in other scripts
if (typeof window !== "undefined") {
  window.ProjectCompletionState = ProjectCompletionState;
}