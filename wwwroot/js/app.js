/* =========================================================================
   app.js — Hệ khách: tải sự kiện, điều hướng giữa các section,
   validate form, gửi JSON bằng fetch và cập nhật DOM theo kết quả.

   Luồng giống prototype Figma:
     #/                → Home (danh sách sự kiện)
     #/su-kien/{id}    → Detail
     #/dang-ky/{id}    → Form (kèm trạng thái lỗi / đang gửi)
     #/thanh-cong      → Success (chỉ hiện khi server trả 201)
   ========================================================================= */
'use strict';

(function () {
  // Chạy cùng domain với server (ASP.NET phục vụ wwwroot) → API_BASE = ''.
  // Nếu mở bằng Live Server (cổng 5500) thì gọi sang server dev ở cổng 5000 (cần CORS).
  const API_BASE = location.port === '5500' ? 'http://localhost:5000' : '';
  const REQUEST_TIMEOUT_MS = 30000; // gói free có thể "ngủ", lần đầu khởi động chậm

  // Cùng luật với server (Program.cs → Validation)
  const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
  const MSSV_RE = /^\d{8}$/;

  const RULES = {
    fullName: (v) => (!v ? 'Vui lòng nhập họ và tên'
      : v.length > 100 ? 'Họ và tên tối đa 100 ký tự' : ''),
    email: (v) => (!v ? 'Vui lòng nhập email'
      : !EMAIL_RE.test(v) ? 'Email không đúng định dạng' : ''),
    mssv: (v) => (!v ? 'Vui lòng nhập MSSV'
      : !MSSV_RE.test(v) ? 'MSSV phải gồm đúng 8 chữ số' : ''),
  };

  const SUBMIT_LABEL = 'Xác nhận đăng ký';
  const SUBMITTING_LABEL = 'Đang gửi…';

  const state = {
    events: [],
    loaded: false,
    currentView: null,
    currentEventId: null,
    lastRegistration: null,
    submitting: false,
  };

  // ---------- DOM ----------
  const $ = (id) => document.getElementById(id);
  const views = document.querySelectorAll('.view');
  const grid = $('event-grid');
  const eventsStatus = $('events-status');
  const eventsError = $('events-error');
  const cardTemplate = $('tpl-card-event');

  const form = $('form-register');
  const submitBtn = $('submit-btn');
  const formAlert = $('form-alert');

  // =======================================================================
  // Tiện ích
  // =======================================================================

  /** "2026-10-24T09:00:00" → các phần ngày giờ, không đổi múi giờ. */
  function parseLocal(iso) {
    const m = /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})/.exec(iso || '');
    return m ? { y: m[1], mo: m[2], d: m[3], h: m[4], mi: m[5] } : null;
  }

  /** Định dạng như Figma: "24/10/2026 · 09:00–11:30" */
  function formatTime(ev) {
    const s = parseLocal(ev.time);
    const e = parseLocal(ev.endTime);
    if (!s) return '';
    return `${s.d}/${s.mo}/${s.y} · ${s.h}:${s.mi}` + (e ? `–${e.h}:${e.mi}` : '');
  }

  const isFull = (ev) => ev.remaining <= 0;
  const capacityText = (ev) => (isFull(ev) ? 'Hết chỗ' : `Còn ${ev.remaining} chỗ`);
  const findEvent = (id) => state.events.find((e) => e.id === id);

  /** fetch có giới hạn thời gian chờ. */
  async function request(path, options = {}) {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);
    try {
      return await fetch(API_BASE + path, { ...options, signal: controller.signal });
    } finally {
      clearTimeout(timer);
    }
  }

  async function readJson(res) {
    try { return await res.json(); } catch { return null; }
  }

  function setCapacityBadge(el, ev) {
    el.textContent = capacityText(ev);
    el.classList.toggle('badge-capacity--full', isFull(ev));
  }

  // =======================================================================
  // Danh sách sự kiện (GET /api/events)
  // =======================================================================

  async function loadEvents() {
    eventsError.hidden = true;
    if (!state.loaded) {
      eventsStatus.hidden = false;
      eventsStatus.textContent = 'Đang tải danh sách sự kiện…';
    }
    try {
      const res = await request('/api/events');
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      state.events = await res.json();
      state.loaded = true;
      renderEvents();
      return true;
    } catch (err) {
      // Đã có dữ liệu cũ thì giữ nguyên, chỉ báo lỗi khi chưa có gì để hiện
      if (!state.loaded) eventsError.hidden = false;
      return false;
    } finally {
      eventsStatus.hidden = true;
    }
  }

  function createCard(ev) {
    const node = cardTemplate.content.firstElementChild.cloneNode(true);
    const href = `#/su-kien/${ev.id}`;

    node.querySelector('.card-event__category').textContent = ev.category;
    const link = node.querySelector('.card-event__link');
    link.textContent = ev.title;
    link.href = href;
    node.querySelector('.card-event__date').textContent = formatTime(ev);
    node.querySelector('.card-event__place').textContent = ev.location;
    setCapacityBadge(node.querySelector('.badge-capacity'), ev);

    const cta = node.querySelector('.card-event__cta');
    if (isFull(ev)) {
      // Figma Card/Event · Status=Hết chỗ: nút Primary · Disabled
      node.classList.add('card-event--full');
      const disabled = document.createElement('button');
      disabled.type = 'button';
      disabled.className = 'btn btn--primary card-event__cta';
      disabled.disabled = true;
      disabled.textContent = 'Hết chỗ';
      cta.replaceWith(disabled);
    } else {
      cta.href = href;
      cta.setAttribute('aria-label', `Xem chi tiết: ${ev.title}`);
    }
    return node;
  }

  function renderEvents() {
    grid.replaceChildren(...state.events.map(createCard));
    if (!state.events.length) {
      eventsStatus.hidden = false;
      eventsStatus.textContent = 'Chưa có sự kiện nào.';
    }
  }

  // =======================================================================
  // Detail
  // =======================================================================

  function renderDetail(ev) {
    $('detail-category').textContent = ev.category;
    $('detail-title').textContent = ev.title;
    $('detail-desc').textContent = ev.description;
    $('detail-highlights').replaceChildren(...(ev.highlights || []).map((text) => {
      const li = document.createElement('li');
      li.textContent = text;
      return li;
    }));
    $('detail-time').textContent = formatTime(ev);
    $('detail-place').textContent = ev.location;
    setCapacityBadge($('detail-capacity'), ev);

    const cta = $('detail-register');
    if (isFull(ev)) {
      cta.removeAttribute('href');
      cta.setAttribute('aria-disabled', 'true');
      cta.textContent = 'Đã hết chỗ';
    } else {
      cta.href = `#/dang-ky/${ev.id}`;
      cta.removeAttribute('aria-disabled');
      cta.textContent = 'Đăng ký tham gia ngay';
    }
  }

  // =======================================================================
  // Form: validate + trạng thái
  // =======================================================================

  function getFormData() {
    return {
      fullName: form.elements.fullName.value.trim().replace(/\s+/g, ' '),
      email: form.elements.email.value.trim().toLowerCase(),
      mssv: form.elements.mssv.value.trim(),
    };
  }

  /** Bật/tắt State=Error của component Input (class .input--error). */
  function setFieldError(name, message) {
    const box = form.querySelector(`.input[data-field="${name}"]`);
    if (!box) return;
    const input = box.querySelector('.input__field');
    const helper = box.querySelector('.input__helper');
    box.classList.toggle('input--error', Boolean(message));
    if (message) input.setAttribute('aria-invalid', 'true');
    else input.removeAttribute('aria-invalid');
    helper.textContent = message || helper.dataset.helper;
  }

  function validate(data) {
    const errors = {};
    for (const [name, rule] of Object.entries(RULES)) {
      const message = rule(data[name]);
      if (message) errors[name] = message;
      setFieldError(name, message);
    }
    return errors;
  }

  function applyServerErrors(errors) {
    if (!errors) return;
    for (const [name, message] of Object.entries(errors)) setFieldError(name, message);
  }

  function setInputsDisabled(disabled) {
    form.querySelectorAll('.input__field').forEach((el) => { el.disabled = disabled; });
  }

  /** Figma screen-form-submitting: khóa nút + ô nhập, hiện "Đang gửi…". */
  function setSubmitting(on) {
    state.submitting = on;
    submitBtn.disabled = on;
    submitBtn.textContent = on ? SUBMITTING_LABEL : SUBMIT_LABEL;
    setInputsDisabled(on);
    form.setAttribute('aria-busy', String(on));
  }

  /** Figma screen-error-full: ẩn ô nhập, nút Disabled "Đã hết chỗ". */
  function setFullState() {
    form.querySelectorAll('.input').forEach((el) => { el.hidden = true; });
    submitBtn.disabled = true;
    submitBtn.textContent = 'Đã hết chỗ';
  }

  function showAlert(title, desc, { showOtherEvents = false } = {}) {
    $('form-alert-title').textContent = title;
    $('form-alert-desc').textContent = desc;
    $('form-alert-action').hidden = !showOtherEvents;
    formAlert.hidden = false;
    formAlert.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
  }

  function hideAlert() {
    formAlert.hidden = true;
  }

  function showFullAlert(message) {
    showAlert('Sự kiện đã hết chỗ',
      message || 'Rất tiếc, toàn bộ chỗ của sự kiện này đã được đăng ký. Bạn có thể xem các sự kiện khác của UIT Web Day.',
      { showOtherEvents: true });
    setFullState();
  }

  function renderRegister(ev) {
    $('register-event-title').textContent = ev.title;
    $('register-event-meta').textContent = `${formatTime(ev)} · ${ev.location}`;
    $('register-back').href = `#/su-kien/${ev.id}`;

    form.reset();
    form.querySelectorAll('.input').forEach((el) => { el.hidden = false; });
    Object.keys(RULES).forEach((name) => setFieldError(name, ''));
    hideAlert();
    setSubmitting(false);

    if (isFull(ev)) showFullAlert();
  }

  // Bỏ lỗi ngay khi người dùng sửa lại cho đúng
  form.addEventListener('input', (e) => {
    const name = e.target.name;
    if (!RULES[name]) return;
    const box = e.target.closest('.input');
    if (box && box.classList.contains('input--error')) {
      setFieldError(name, RULES[name](getFormData()[name]));
    }
  });

  // =======================================================================
  // Submit (POST /api/registrations)
  // =======================================================================

  form.addEventListener('submit', async (e) => {
    e.preventDefault();                       // 1. Chặn submit mặc định
    if (state.submitting) return;
    hideAlert();

    const data = getFormData();
    const errors = validate(data);            // 2. Validate phía client
    const firstInvalid = Object.keys(errors)[0];
    if (firstInvalid) {
      form.elements[firstInvalid].focus();
      return;
    }

    const ev = findEvent(state.currentEventId);
    const payload = { eventId: state.currentEventId, ...data };
    let succeeded = false;
    let full = false;

    setSubmitting(true);                      // 3. Khóa nút, "Đang gửi…"
    try {
      const res = await request('/api/registrations', {   // 4. fetch POST JSON
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });
      const body = await readJson(res);

      // 5. Xử lý kết quả
      if (res.status === 201) {
        succeeded = true;
        state.lastRegistration = body;
        if (ev && body && body.event) Object.assign(ev, body.event);
        location.hash = '#/thanh-cong';
      } else if (res.status === 400) {
        applyServerErrors(body && body.errors);
        showAlert('Thông tin chưa hợp lệ',
          (body && body.message) || 'Vui lòng kiểm tra lại các trường được đánh dấu.');
      } else if (res.status === 409 && body && body.code === 'EVENT_FULL') {
        full = true;
        if (ev) ev.remaining = 0;
      } else if (res.status === 409) {
        applyServerErrors((body && body.errors) || { email: 'Email này đã được dùng để đăng ký sự kiện' });
        showAlert('Email đã đăng ký sự kiện này',
          (body && body.message) || 'Mỗi email chỉ đăng ký được một lần cho mỗi sự kiện. Hãy kiểm tra hộp thư hoặc dùng email khác.');
      } else {
        showAlert('Máy chủ đang gặp sự cố',
          `Không xử lý được yêu cầu (mã ${res.status}). Vui lòng thử lại sau ít phút.`);
      }
      if (full) {
        setSubmitting(false);
        showFullAlert(body.message);
        return;
      }
    } catch (err) {
      // Lỗi mạng hoặc quá thời gian chờ
      showAlert('Không kết nối được, thử lại',
        'Không gửi được thông tin tới máy chủ. Kiểm tra kết nối mạng rồi bấm “Xác nhận đăng ký” lần nữa.');
    }
    if (!succeeded) setSubmitting(false);
  });

  // =======================================================================
  // Success
  // =======================================================================

  function renderSuccess(reg) {
    const ev = reg.event || findEvent(reg.eventId) || {};
    $('success-email').textContent = reg.email;
    $('ticket-title').textContent = ev.title || '';
    $('ticket-time').textContent = ev.time ? formatTime(ev) : '';
    $('ticket-place').textContent = ev.location || '';
    $('ticket-code').textContent = reg.ticketCode;
    $('success-back').href = ev.id ? `#/su-kien/${ev.id}` : '#/';
  }

  // =======================================================================
  // Điều hướng giữa các section (hash router)
  // =======================================================================

  const TITLES = {
    home: 'UIT Web Day 2026 · Đăng ký sự kiện',
    detail: 'Chi tiết sự kiện · UIT Web Day',
    register: 'Đăng ký tham gia · UIT Web Day',
    success: 'Đăng ký thành công · UIT Web Day',
  };

  function showView(name, { focusId, scrollTo } = {}) {
    const changed = state.currentView !== name;
    views.forEach((v) => { v.hidden = v.dataset.view !== name; });
    state.currentView = name;
    document.title = TITLES[name];

    if (scrollTo) {
      document.getElementById(scrollTo)?.scrollIntoView({ behavior: 'smooth' });
    } else {
      window.scrollTo(0, 0);
    }
    if (changed && focusId) document.getElementById(focusId)?.focus({ preventScroll: true });
  }

  function parseRoute(hash) {
    const parts = hash.slice(2).split('/');
    const id = Number(parts[1]);
    switch (parts[0]) {
      case 'su-kien': return { name: 'detail', id };
      case 'dang-ky': return { name: 'register', id };
      case 'thanh-cong': return { name: 'success' };
      case 'lich-trinh': return { name: 'home', scrollTo: 'su-kien' };
      default: return { name: 'home' };
    }
  }

  async function ensureEvents() {
    if (!state.loaded) await loadEvents();
  }

  async function router() {
    const hash = location.hash;

    // Anchor thường (#lien-he, #main) → để trình duyệt tự cuộn
    if (hash && !hash.startsWith('#/')) {
      if (!state.currentView) { showView('home'); loadEvents(); }
      return;
    }

    const route = parseRoute(hash || '#/');

    if (route.name === 'home') {
      showView('home', { focusId: 'home-title', scrollTo: route.scrollTo });
      await loadEvents(); // tải lại để cập nhật số chỗ còn
      if (route.scrollTo) document.getElementById(route.scrollTo)?.scrollIntoView();
      return;
    }

    if (route.name === 'success') {
      if (!state.lastRegistration) { location.replace('#/'); return; }
      renderSuccess(state.lastRegistration);
      showView('success', { focusId: 'success-title' });
      return;
    }

    await ensureEvents();
    const ev = findEvent(route.id);
    if (!ev) {
      location.replace('#/');
      return;
    }
    state.currentEventId = ev.id;

    if (route.name === 'detail') {
      renderDetail(ev);
      showView('detail', { focusId: 'detail-title' });
    } else {
      renderRegister(ev);
      showView('register', { focusId: 'register-title' });
    }
  }

  // =======================================================================
  // Light / Dark (data-theme ↔ Figma Variables mode)
  // =======================================================================

  const themeBtn = $('theme-toggle');

  function applyTheme(theme) {
    document.documentElement.setAttribute('data-theme', theme);
    const dark = theme === 'dark';
    themeBtn.setAttribute('aria-pressed', String(dark));
    $('theme-toggle-label').textContent = dark ? 'Tắt giao diện tối' : 'Bật giao diện tối';
    const icon = themeBtn.querySelector('.icon');
    icon.classList.toggle('icon--moon', !dark);
    icon.classList.toggle('icon--sun', dark);
  }

  themeBtn.addEventListener('click', () => {
    const next = document.documentElement.getAttribute('data-theme') === 'dark' ? 'light' : 'dark';
    applyTheme(next);
    try { localStorage.setItem('theme', next); } catch { /* chế độ riêng tư: bỏ qua */ }
  });

  // =======================================================================
  // Khởi động
  // =======================================================================

  $('events-retry').addEventListener('click', loadEvents);
  window.addEventListener('hashchange', router);
  applyTheme(document.documentElement.getAttribute('data-theme') || 'light');
  router();
})();
