document.addEventListener("DOMContentLoaded", function () {
  const steps = ["step-email", "step-verify", "step-reset"];
  let currentStep = 0;
  let userEmail = "";

  const dots = document.querySelectorAll(".step-dot");
  const errorBox = document.getElementById("formError");

  function goToStep(index) {
    steps.forEach((id, i) => {
      document.getElementById(id).style.display = i === index ? "block" : "none";
    });
    dots.forEach((dot, i) => {
      dot.classList.remove("active", "done");
      if (i < index) dot.classList.add("done");
      else if (i === index) dot.classList.add("active");
    });
    currentStep = index;
    errorBox.classList.remove("show");
  }

  function showError(msg) {
    errorBox.textContent = msg;
    errorBox.classList.add("show");
  }

  // ---- Step 1: request OTP ----
  document.getElementById("emailForm").addEventListener("submit", async function (e) {
    e.preventDefault();
    const btn = document.getElementById("sendOtpBtn");
    userEmail = document.getElementById("resetEmail").value.trim();

    btn.disabled = true;
    btn.textContent = "Sending code…";
    try {
      await apiRequest("/api/auth/forgot-password", { method: "POST", body: { email: userEmail } });
      document.getElementById("otpEmailLabel").textContent = userEmail;
      goToStep(1);
    } catch (err) {
      showError(err.message);
    } finally {
      btn.disabled = false;
      btn.textContent = "Send Verification Code";
    }
  });

  // ---- OTP boxes: auto-advance between the 6 digit inputs ----
  const otpBoxes = Array.from(document.querySelectorAll(".otp-box"));
  otpBoxes.forEach((box, idx) => {
    box.addEventListener("input", function () {
      this.value = this.value.replace(/[^0-9]/g, "").slice(0, 1);
      if (this.value && idx < otpBoxes.length - 1) otpBoxes[idx + 1].focus();
    });
    box.addEventListener("keydown", function (e) {
      if (e.key === "Backspace" && !this.value && idx > 0) otpBoxes[idx - 1].focus();
    });
  });

  function collectOtp() {
    return otpBoxes.map(b => b.value).join("");
  }

  // ---- Step 2: verify OTP ----
  document.getElementById("verifyForm").addEventListener("submit", async function (e) {
    e.preventDefault();
    const btn = document.getElementById("verifyOtpBtn");
    const otp = collectOtp();

    if (otp.length !== 6) {
      showError("Enter all 6 digits of the code");
      return;
    }

    btn.disabled = true;
    btn.textContent = "Verifying…";
    try {
      await apiRequest("/api/auth/verify-otp", { method: "POST", body: { email: userEmail, otp } });
      goToStep(2);
    } catch (err) {
      showError(err.message);
    } finally {
      btn.disabled = false;
      btn.textContent = "Verify Code";
    }
  });

  document.getElementById("resendOtpLink").addEventListener("click", async function (e) {
    e.preventDefault();
    try {
      await apiRequest("/api/auth/forgot-password", { method: "POST", body: { email: userEmail } });
      showToast("A new code has been sent");
    } catch (err) {
      showError(err.message);
    }
  });

  // ---- Step 3: set new password ----
  document.getElementById("resetForm").addEventListener("submit", async function (e) {
    e.preventDefault();
    const btn = document.getElementById("resetPasswordBtn");
    const newPassword = document.getElementById("newPassword").value;
    const confirmPassword = document.getElementById("confirmNewPassword").value;
    const otp = collectOtp();

    if (newPassword !== confirmPassword) {
      showError("Passwords do not match");
      return;
    }

    btn.disabled = true;
    btn.textContent = "Resetting…";
    try {
      await apiRequest("/api/auth/reset-password", {
        method: "POST",
        body: { email: userEmail, otp, newPassword }
      });
      window.location.href = "student-login.html?reset=success";
    } catch (err) {
      showError(err.message);
    } finally {
      btn.disabled = false;
      btn.textContent = "Reset Password";
    }
  });

  goToStep(0);
});
