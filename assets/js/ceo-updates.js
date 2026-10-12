/* Meeting Updates (student page) - VIEW ONLY.
   The student page never creates/edits/deletes updates. Everything shown here is
   created by the Admin in Admin > Meeting Updates, stored in the database, and
   fetched read-only from GET /api/student/meeting-updates via Api.meetingUpdates.myList().

   Shape of each record returned by the API:
   {
     id: number,
     title: string,
     instructions: string,
     date: string,           // ISO "2026-10-05"  (shown as "05 October 2026")
     time: string,           // 24h "10:30"       (shown as "10:30 AM")
     sharedLink: string,     // Google Meet / Zoom / Teams / any official URL
     importantNotes: string, // optional
     status: "NEW" | "RECENT"
   }
*/
(function () {
  'use strict';

  var MONTH_NAMES = ['January','February','March','April','May','June','July','August','September','October','November','December'];

  // ---- Data source: the real backend (no preview/mock data) ----
  function loadCeoUpdates() {
    if (typeof Api === 'undefined' || !Api.meetingUpdates || typeof Api.meetingUpdates.myList !== 'function') {
      return Promise.reject(new Error('Meeting updates are unavailable right now.'));
    }
    return Api.meetingUpdates.myList();
  }

  // "2026-10-05" -> "05 October 2026" (strings already in display form are left alone)
  function displayDate(v) {
    var m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(v || '');
    if (!m) return v || '';
    var name = MONTH_NAMES[parseInt(m[2], 10) - 1];
    return name ? (m[3] + ' ' + name + ' ' + m[1]) : v;
  }

  // "14:05" -> "02:05 PM"
  function displayTime(v) {
    var m = /^(\d{1,2}):(\d{2})(?::\d{2})?$/.exec(v || '');
    if (!m) return v || '';
    var h = parseInt(m[1], 10);
    var suffix = h >= 12 ? 'PM' : 'AM';
    h = h % 12;
    if (h === 0) h = 12;
    return (h < 10 ? '0' + h : '' + h) + ':' + m[2] + ' ' + suffix;
  }

  // Normalises one record so missing/null API fields never break the card.
  function normalizeUpdate(u) {
    u = u || {};
    return {
      id: u.id,
      title: u.title || '',
      instructions: u.instructions || '',
      date: displayDate(u.date),
      time: displayTime(u.time),
      sharedLink: u.sharedLink || '',
      importantNotes: u.importantNotes || '',
      status: (u.status || '').toUpperCase()
    };
  }

  var MONTHS = ['january','february','march','april','may','june','july','august','september','october','november','december'];

  function toTimestamp(u) {
    var d = /^(\d{1,2})\s+([A-Za-z]+)\s+(\d{4})$/.exec(u.date || '');
    if (!d) return 0;
    var m = MONTHS.indexOf(d[2].toLowerCase());
    if (m < 0) return 0;
    var h = 0, min = 0;
    var t = /^(\d{1,2}):(\d{2})\s*(AM|PM)$/i.exec(u.time || '');
    if (t) {
      h = parseInt(t[1], 10) % 12;
      if (t[3].toUpperCase() === 'PM') h += 12;
      min = parseInt(t[2], 10);
    }
    return new Date(parseInt(d[3], 10), m, parseInt(d[1], 10), h, min).getTime();
  }

  function isSafeUrl(url) {
    return /^https?:\/\//i.test(url || '');
  }

  function el(tag, cls, text) {
    var n = document.createElement(tag);
    if (cls) n.className = cls;
    if (text !== undefined) n.textContent = text;
    return n;
  }

  function copyText(text) {
    if (navigator.clipboard && window.isSecureContext) {
      return navigator.clipboard.writeText(text);
    }
    // Fallback for non-secure contexts / older browsers
    return new Promise(function (resolve, reject) {
      var ta = document.createElement('textarea');
      ta.value = text;
      ta.setAttribute('readonly', '');
      ta.style.position = 'fixed';
      ta.style.opacity = '0';
      document.body.appendChild(ta);
      ta.select();
      var ok = false;
      try { ok = document.execCommand('copy'); } catch (e) {}
      document.body.removeChild(ta);
      ok ? resolve() : reject(new Error('copy failed'));
    });
  }

  function buildCard(u) {
    var card = el('article', 'panel-card ceo-update-card');

    var top = el('div', 'ceo-card-top');
    var status = (u.status || '').toUpperCase();
    if (status === 'NEW') top.appendChild(el('span', 'ceo-badge new', '🆕 NEW'));
    else if (status === 'RECENT') top.appendChild(el('span', 'ceo-badge recent', '● RECENT'));
    top.appendChild(el('span', 'ceo-card-tag', '📢 CEO UPDATE'));
    card.appendChild(top);

    card.appendChild(el('h3', 'ceo-title', u.title || ''));

    var meta = el('div', 'ceo-meta');
    meta.appendChild(el('span', '', '📅 Date: ' + (u.date || '-')));
    meta.appendChild(el('span', '', '🕐 Time: ' + (u.time || '-')));
    card.appendChild(meta);

    card.appendChild(el('p', 'ceo-block-label', '📋 Instructions'));
    card.appendChild(el('p', 'ceo-text', u.instructions || ''));

    if (u.importantNotes) {
      var notes = el('div', 'ceo-notes');
      notes.appendChild(el('p', 'ceo-block-label', '⭐ Important Notes'));
      notes.appendChild(el('p', 'ceo-text', u.importantNotes));
      card.appendChild(notes);
    }

    if (u.sharedLink) {
      card.appendChild(el('p', 'ceo-block-label', '🔗 Meeting / Shared Link'));

      var row = el('div', 'ceo-link-row');
      var box = el('div', 'ceo-link-box', u.sharedLink);
      var copyBtn = el('button', 'btn btn-outline btn-sm ceo-copy-btn', '📋 Copy');
      copyBtn.type = 'button';
      row.appendChild(box);
      row.appendChild(copyBtn);
      card.appendChild(row);

      var msg = el('p', 'ceo-copy-msg');
      msg.setAttribute('aria-live', 'polite');
      card.appendChild(msg);

      var timer = null;
      copyBtn.addEventListener('click', function () {
        copyText(u.sharedLink).then(function () {
          msg.style.color = '#1f7a47';
          msg.textContent = 'Link copied!';
        }, function () {
          msg.style.color = 'var(--crimson, #b3122d)';
          msg.textContent = 'Could not copy. Please select the link and copy it manually.';
        }).then(function () {
          clearTimeout(timer);
          timer = setTimeout(function () { msg.textContent = ''; }, 2000);
        });
      });

      if (isSafeUrl(u.sharedLink)) {
        var wrap = el('div', 'ceo-open-wrap');
        var a = el('a', 'btn btn-primary ceo-open-btn', '🔗 Open Meeting Link');
        a.href = u.sharedLink; // exact same URL as the visible text and the copy action
        a.target = '_blank';
        a.rel = 'noopener noreferrer';
        wrap.appendChild(a);
        card.appendChild(wrap);
      }
    }
    return card;
  }

  function renderCeoUpdates(list) {
    var host = document.getElementById('ceoUpdatesList');
    if (!host) return;
    host.textContent = '';

    var items = (list || []).map(normalizeUpdate).sort(function (a, b) { return toTimestamp(b) - toTimestamp(a); });

    if (!items.length) {
      var empty = el('div', 'panel-card ceo-empty');
      empty.appendChild(el('div', 'ceo-empty-icon', '📢'));
      empty.appendChild(el('h3', '', 'No CEO Updates Yet'));
      empty.appendChild(el('p', '', 'There are currently no new announcements or instructions from the CEO.'));
      host.appendChild(empty);
      return;
    }
    items.forEach(function (u) { host.appendChild(buildCard(u)); });
  }

  function showMessage(icon, heading, text) {
    var host = document.getElementById('ceoUpdatesList');
    if (!host) return;
    host.textContent = '';
    var box = el('div', 'panel-card ceo-empty');
    box.appendChild(el('div', 'ceo-empty-icon', icon));
    box.appendChild(el('h3', '', heading));
    box.appendChild(el('p', '', text));
    host.appendChild(box);
  }

  var loadRun = 0;
  function reloadMeetingUpdates() {
    var run = ++loadRun; // a slow earlier response can never overwrite a newer one
    showMessage('\u23F3', 'Loading\u2026', 'Fetching the latest announcements.');
    loadCeoUpdates().then(function (list) {
      if (run !== loadRun) return;
      renderCeoUpdates(Array.isArray(list) ? list : []);
    }, function (err) {
      if (run !== loadRun) return;
      showMessage('\u26A0\uFE0F', "Couldn't load updates",
        (err && err.message) ? err.message : 'Please check your connection and try again.');
    });
  }

  window.renderCeoUpdates = renderCeoUpdates;
  window.reloadMeetingUpdates = reloadMeetingUpdates;

  // Load (fresh) every time the student opens this page from the sidebar.
  document.addEventListener('DOMContentLoaded', function () {
    var navBtn = document.querySelector('.side-nav-item[data-section="sec-ceo-updates"]');
    if (navBtn) navBtn.addEventListener('click', reloadMeetingUpdates);
  });
})();
