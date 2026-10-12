/* ==========================================================================
   Profenaa Technologies — Student Dashboard
   Placement module (NEW). Self-contained on purpose: it only reads/writes
   elements inside #sec-placement and its own modal, and only calls the
   Api.placement.* / Api.students.me() methods. It does not touch any other
   section's markup, listeners, or state.

   Load order matters: this file must be included BEFORE student-dashboard.js
   in student-dashboard.html. Both files register a DOMContentLoaded
   listener; listeners fire in registration order, so this file's handler
   (which sets window.loadPlacementSection) always runs before
   student-dashboard.js builds its sectionLoaders map and looks that name up.

   Like the other not-yet-backed sections (My Projects, Notifications,
   Feedback), every Api.placement.* call here is a real network call. If the
   backend endpoint doesn't exist yet, the user sees the real error message
   from that failed call - nothing is faked as a success.
   ========================================================================== */

document.addEventListener("DOMContentLoaded", function () {

  const placementSection = document.getElementById("sec-placement");
  if (!placementSection) return; // this page doesn't have the Placement markup

  // ---------------- local helpers (kept local so this file doesn't
  // depend on anything defined inside student-dashboard.js's closure) ----------------
  function escapeHtml(str) {
    if (str == null) return "";
    return String(str)
      .replaceAll("&", "&amp;").replaceAll("<", "&lt;").replaceAll(">", "&gt;")
      .replaceAll('"', "&quot;").replaceAll("'", "&#039;");
  }

  function setText(id, value) {
    const el = document.getElementById(id);
    if (el) el.textContent = (value === null || value === undefined || value === "") ? "-" : value;
  }

  function setValue(id, value) {
    const el = document.getElementById(id);
    if (el) el.value = value || "";
  }

  function isValidEmail(v) { return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(v); }
  function isValidIndianMobile(v) { return /^[6-9]\d{9}$/.test(v); }
  function isValidHttpUrl(v, requireHttps) {
    try {
      const u = new URL(v);
      if (requireHttps) return u.protocol === "https:";
      return u.protocol === "http:" || u.protocol === "https:";
    } catch {
      return false;
    }
  }

  let placementLoaded = false;
  function loadPlacement() {
    if (placementLoaded) return;
    placementLoaded = true;
    loadPlacementProfile();
    loadResumeStatus();
    loadProfileLinks();
    loadResumeProfileData();
    loadCompanies();
  }

  // Expose the loader for student-dashboard.js's sectionLoaders map.
  window.loadPlacementSection = loadPlacement;

  // ================================================================
  // STUDENT PLACEMENT PROFILE — read-only, reuses the same student
  // profile endpoint already used by the Certificates section. No
  // second registration form, no separate profile data source.
  // ================================================================
  async function loadPlacementProfile() {
    try {
      const p = await Api.students.me();
      setText("placementDetailName", Auth.getName() || p.name);
      setText("placementDetailStudentId", p.studentId);
      setText("placementDetailEmail", p.email);
      setText("placementDetailPhone", p.phone);
      setText("placementDetailCourse", p.course);
      setText("placementDetailJoin", p.dateOfJoin);
    } catch (err) {
      showToast(err.message, "error");
    }
  }

  // ================================================================
  // RESUME UPLOAD (DOC/DOCX only — no PDF, no Drive/Dropbox links)
  // ================================================================
  const resumeInput = document.getElementById("placementResumeInput");
  const resumeChooseBtn = document.getElementById("placementResumeChooseBtn");
  const resumeFileName = document.getElementById("placementResumeFileName");
  const resumeError = document.getElementById("placementResumeError");
  const resumeSuccess = document.getElementById("placementResumeSuccess");
  const resumeUploadBtn = document.getElementById("placementResumeUploadBtn");
  const resumeStatusBadge = document.getElementById("placementResumeStatusBadge");

  const RESUME_MAX_BYTES = 5 * 1024 * 1024; // 5MB
  const RESUME_EXT_RE = /\.(doc|docx)$/i;
  let selectedResumeFile = null;

  async function loadResumeStatus() {
    if (!resumeStatusBadge) return;
    try {
      const status = await Api.placement.getResumeStatus();
      if (status && status.uploaded) {
        resumeStatusBadge.textContent = "● Resume on file" + (status.uploadedOn ? " — " + status.uploadedOn : "");
        resumeStatusBadge.className = "cert-status-badge issued";
      } else {
        resumeStatusBadge.textContent = "● No resume uploaded yet";
        resumeStatusBadge.className = "cert-status-badge pending";
      }
    } catch {
      // Feature not live on the backend yet - keep the honest default
      // state rather than claiming anything was uploaded.
      resumeStatusBadge.textContent = "● No resume uploaded yet";
      resumeStatusBadge.className = "cert-status-badge pending";
    }
  }

  if (resumeChooseBtn && resumeInput) {
    resumeChooseBtn.addEventListener("click", function () { resumeInput.click(); });
  }

  if (resumeInput) {
    resumeInput.addEventListener("change", function () {
      resumeError.classList.remove("show");
      resumeSuccess.classList.remove("show");
      selectedResumeFile = null;
      resumeUploadBtn.disabled = true;

      const file = resumeInput.files[0];
      if (!file) {
        resumeFileName.textContent = "No file chosen";
        return;
      }

      if (!RESUME_EXT_RE.test(file.name)) {
        resumeError.textContent = "Only .doc or .docx files are supported. PDF and external Drive/Dropbox links are not accepted.";
        resumeError.classList.add("show");
        resumeInput.value = "";
        resumeFileName.textContent = "No file chosen";
        return;
      }
      if (file.size > RESUME_MAX_BYTES) {
        resumeError.textContent = "That file is too large. Please upload a resume under 5MB.";
        resumeError.classList.add("show");
        resumeInput.value = "";
        resumeFileName.textContent = "No file chosen";
        return;
      }

      selectedResumeFile = file;
      resumeFileName.textContent = file.name;
      resumeUploadBtn.disabled = false;
    });
  }

  if (resumeUploadBtn) {
    resumeUploadBtn.addEventListener("click", async function () {
      if (!selectedResumeFile) return;
      resumeError.classList.remove("show");
      resumeSuccess.classList.remove("show");
      resumeUploadBtn.disabled = true;
      resumeUploadBtn.textContent = "Uploading…";
      try {
        await Api.placement.uploadResume(selectedResumeFile);
        resumeSuccess.textContent = "Resume uploaded successfully.";
        resumeSuccess.classList.add("show");
        selectedResumeFile = null;
        resumeInput.value = "";
        resumeFileName.textContent = "No file chosen";
        loadResumeStatus();
      } catch (err) {
        resumeError.textContent = err.message;
        resumeError.classList.add("show");
      } finally {
        resumeUploadBtn.disabled = !selectedResumeFile;
        resumeUploadBtn.textContent = "Upload Resume";
      }
    });
  }

  // ================================================================
  // PROFESSIONAL PROFILES (LinkedIn / Naukri / Indeed)
  // ================================================================
  const linksForm = document.getElementById("placementLinksForm");
  const linksError = document.getElementById("placementLinksError");
  const linksSuccess = document.getElementById("placementLinksSuccess");
  const saveLinksBtn = document.getElementById("placementSaveLinksBtn");

  async function loadProfileLinks() {
    try {
      const links = await Api.placement.getLinks();
      if (links) {
        setValue("placementLinkedin", links.linkedin);
        setValue("placementNaukri", links.naukri);
        setValue("placementIndeed", links.indeed);
        updateSavedBadges(links);
      }
    } catch {
      // Nothing saved yet (or endpoint not live) - leave fields blank,
      // this is an optional panel so no error toast on load.
    }
  }

  // Part B/doc2 §16: a clear "✓ Saved" indicator per field once it has a
  // value, without ever forcing the student to re-enter it - the field
  // stays editable (Edit/Update/Save again all happen through the same
  // always-editable input + Save Profiles button).
  function updateSavedBadges(links) {
    const l = links || {};
    const linkedinBadge = document.getElementById("linkedinSavedBadge");
    const naukriBadge = document.getElementById("naukriSavedBadge");
    const indeedBadge = document.getElementById("indeedSavedBadge");
    if (linkedinBadge) linkedinBadge.style.display = l.linkedin ? "" : "none";
    if (naukriBadge) naukriBadge.style.display = l.naukri ? "" : "none";
    if (indeedBadge) indeedBadge.style.display = l.indeed ? "" : "none";
  }

  if (linksForm) {
    linksForm.addEventListener("submit", async function (e) {
      e.preventDefault();
      linksError.classList.remove("show");
      linksSuccess.classList.remove("show");

      const linkedin = document.getElementById("placementLinkedin").value.trim();
      const naukri = document.getElementById("placementNaukri").value.trim();
      const indeed = document.getElementById("placementIndeed").value.trim();

      const checks = [["LinkedIn", linkedin], ["Naukri", naukri], ["Indeed", indeed]];
      for (const [label, value] of checks) {
        if (value && !isValidHttpUrl(value, true)) {
          linksError.textContent = `Please enter a valid ${label} URL starting with https://`;
          linksError.classList.add("show");
          return;
        }
      }

      saveLinksBtn.disabled = true;
      saveLinksBtn.textContent = "Saving…";
      try {
        await Api.placement.saveLinks({
          linkedin: linkedin || null,
          naukri: naukri || null,
          indeed: indeed || null
        });
        linksSuccess.classList.add("show");
        updateSavedBadges({ linkedin, naukri, indeed });
      } catch (err) {
        linksError.textContent = err.message;
        linksError.classList.add("show");
      } finally {
        saveLinksBtn.disabled = false;
        saveLinksBtn.textContent = "Save Profiles";
      }
    });
  }

  // ================================================================
  // RESUME PROFILE (optional structured info)
  // ================================================================
  const resumeProfileForm = document.getElementById("placementResumeProfileForm");
  const resumeProfileError = document.getElementById("placementResumeProfileError");
  const resumeProfileSuccess = document.getElementById("placementResumeProfileSuccess");
  const saveResumeProfileBtn = document.getElementById("placementSaveResumeProfileBtn");

  async function loadResumeProfileData() {
    try {
      const rp = await Api.placement.getResumeProfile();
      if (rp) {
        setValue("placementHeadline", rp.headline);
        setValue("placementObjective", rp.objective);
        setValue("placementSkills", rp.skills);
        setValue("placementEducation", rp.education);
        setValue("placementExperience", rp.experience);
        setValue("placementCertifications", rp.certifications);
      }
    } catch {
      // Optional panel, nothing saved yet - leave blank.
    }
  }

  if (resumeProfileForm) {
    resumeProfileForm.addEventListener("submit", async function (e) {
      e.preventDefault();
      resumeProfileError.classList.remove("show");
      resumeProfileSuccess.classList.remove("show");

      const payload = {
        headline: document.getElementById("placementHeadline").value.trim(),
        objective: document.getElementById("placementObjective").value.trim(),
        skills: document.getElementById("placementSkills").value.trim(),
        education: document.getElementById("placementEducation").value.trim(),
        experience: document.getElementById("placementExperience").value.trim(),
        certifications: document.getElementById("placementCertifications").value.trim()
      };

      saveResumeProfileBtn.disabled = true;
      saveResumeProfileBtn.textContent = "Saving…";
      try {
        await Api.placement.saveResumeProfile(payload);
        resumeProfileSuccess.classList.add("show");
      } catch (err) {
        resumeProfileError.textContent = err.message;
        resumeProfileError.classList.add("show");
      } finally {
        saveResumeProfileBtn.disabled = false;
        saveResumeProfileBtn.textContent = "Save Resume Profile";
      }
    });
  }

  // ================================================================
  // COMPANIES APPLIED
  // ================================================================
  let currentCompanies = [];
  const companiesBody = document.querySelector("#placementCompaniesTable tbody");

  async function loadCompanies() {
    if (!companiesBody) return;
    try {
      const rows = await Api.placement.myCompanies();
      currentCompanies = rows || [];
      renderCompanies(currentCompanies);
    } catch (err) {
      companiesBody.innerHTML = `<tr class="empty-row"><td colspan="6">${escapeHtml(err.message)}</td></tr>`;
    }
  }

  function renderCompanies(rows) {
    if (!rows.length) {
      companiesBody.innerHTML = `<tr class="empty-row"><td colspan="6">No company applications recorded yet. Use "+ Add Company Application" to add one.</td></tr>`;
      return;
    }
    companiesBody.innerHTML = rows.map((c, i) => {
      const links = [];
      if (c.websiteLink) links.push(`<a class="btn btn-outline btn-sm" href="${escapeHtml(c.websiteLink)}" target="_blank" rel="noopener noreferrer">Visit Website</a>`);
      if (c.posterUrl) links.push(`<a class="btn btn-outline btn-sm" href="${escapeHtml(c.posterUrl)}" target="_blank" rel="noopener noreferrer">View Poster</a>`);
      return `
        <tr>
          <td data-label="S.No">${i + 1}</td>
          <td data-label="Company Name">${escapeHtml(c.companyName)}</td>
          <td data-label="Company Contact Number">${escapeHtml(c.contactNumber)}</td>
          <td data-label="Company Email">${escapeHtml(c.email)}</td>
          <td data-label="Website Link / Poster"><div class="placement-link-cell">${links.join("") || "-"}</div></td>
          <td data-label="Actions"><button class="table-btn danger" data-delete-company="${escapeHtml(c.id)}">Remove</button></td>
        </tr>
      `;
    }).join("");
  }

  // ---- Add Company modal ----
  const companyModalOverlay = document.getElementById("companyModalOverlay");
  const addCompanyBtn = document.getElementById("addCompanyBtn");
  const companyNameInput = document.getElementById("companyNameInput");
  const companyContactInput = document.getElementById("companyContactInput");
  const companyEmailInput = document.getElementById("companyEmailInput");
  const companyWebsiteInput = document.getElementById("companyWebsiteInput");
  const companyModalError = document.getElementById("companyModalError");
  const companyCancelBtn = document.getElementById("companyCancelBtn");
  const companyConfirmBtn = document.getElementById("companyConfirmBtn");

  function openCompanyModal() {
    if (!companyModalOverlay) return;
    companyNameInput.value = "";
    companyContactInput.value = "";
    companyEmailInput.value = "";
    companyWebsiteInput.value = "";
    companyModalError.classList.remove("show");
    companyModalOverlay.style.display = "flex";
  }
  function closeCompanyModal() {
    if (companyModalOverlay) companyModalOverlay.style.display = "none";
  }

  if (addCompanyBtn) addCompanyBtn.addEventListener("click", openCompanyModal);
  if (companyCancelBtn) companyCancelBtn.addEventListener("click", closeCompanyModal);

  if (companyConfirmBtn) {
    companyConfirmBtn.addEventListener("click", async function () {
      companyModalError.classList.remove("show");

      const companyName = companyNameInput.value.trim();
      const contactNumber = companyContactInput.value.trim();
      const email = companyEmailInput.value.trim();
      const website = companyWebsiteInput.value.trim();

      if (!companyName) {
        companyModalError.textContent = "Please enter the company name.";
        companyModalError.classList.add("show");
        return;
      }
      if (!isValidIndianMobile(contactNumber)) {
        companyModalError.textContent = "Please enter a valid 10-digit contact number.";
        companyModalError.classList.add("show");
        return;
      }
      if (!isValidEmail(email)) {
        companyModalError.textContent = "Please enter a valid company email address.";
        companyModalError.classList.add("show");
        return;
      }
      if (website && !isValidHttpUrl(website, false)) {
        companyModalError.textContent = "Please enter a valid website URL (starting with http:// or https://).";
        companyModalError.classList.add("show");
        return;
      }
      if (!website) {
        companyModalError.textContent = "Please provide the company website link.";
        companyModalError.classList.add("show");
        companyWebsiteInput.focus();
        return;
      }

      companyConfirmBtn.disabled = true;
      companyConfirmBtn.textContent = "Saving…";
      try {
        const payload = { companyName, contactNumber, email, websiteLink: website };
        await Api.placement.addCompany(payload);
        showToast("Company application saved", "success");
        closeCompanyModal();
        loadCompanies();
      } catch (err) {
        companyModalError.textContent = err.message;
        companyModalError.classList.add("show");
      } finally {
        companyConfirmBtn.disabled = false;
        companyConfirmBtn.textContent = "Save Application";
      }
    });
  }

  if (companiesBody) {
    companiesBody.addEventListener("click", async function (e) {
      const btn = e.target.closest("[data-delete-company]");
      if (!btn) return;
      if (!confirm("Remove this company application? This cannot be undone.")) return;
      btn.disabled = true;
      try {
        await Api.placement.deleteCompany(btn.dataset.deleteCompany);
        showToast("Application removed", "success");
        loadCompanies();
      } catch (err) {
        showToast(err.message, "error");
        btn.disabled = false;
      }
    });
  }

});
