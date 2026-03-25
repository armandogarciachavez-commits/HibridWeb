/* ═══════════════════════════════════════════
   HYBRID TRAINING — main.js
   Navbar · Mobile menu · Reveal · Stats counter
   Smooth scroll · Scroll-top · Contact form
═══════════════════════════════════════════ */

'use strict';

/* ── Navbar scroll effect ── */
const navbar = document.getElementById('navbar');
window.addEventListener('scroll', () => {
  navbar.classList.toggle('scrolled', window.scrollY > 60);
  updateActiveLink();
  toggleScrollTopBtn();
}, { passive: true });

/* ── Active nav link on scroll ── */
const sections = document.querySelectorAll('section[id], div[id]');
const navLinks  = document.querySelectorAll('.nav-links .nav-link');
function updateActiveLink() {
  let current = '';
  sections.forEach(sec => {
    if (window.scrollY >= sec.offsetTop - 120) current = sec.id;
  });
  navLinks.forEach(link => {
    link.classList.toggle('active', link.getAttribute('href') === '#' + current);
  });
}

/* ── Mobile menu ── */
const navToggle    = document.getElementById('navToggle');
const mobileMenu   = document.getElementById('mobileMenu');
const mobileClose  = document.getElementById('mobileClose');
const menuOverlay  = document.getElementById('menuOverlay');
const mobileLinks  = document.querySelectorAll('.mobile-link');

function openMenu()  {
  mobileMenu.classList.add('open');
  menuOverlay.classList.add('active');
  navToggle.classList.add('open');
  document.body.style.overflow = 'hidden';
}
function closeMenu() {
  mobileMenu.classList.remove('open');
  menuOverlay.classList.remove('active');
  navToggle.classList.remove('open');
  document.body.style.overflow = '';
}
navToggle.addEventListener('click', openMenu);
mobileClose.addEventListener('click', closeMenu);
menuOverlay.addEventListener('click', closeMenu);
mobileLinks.forEach(link => link.addEventListener('click', closeMenu));

/* ── Smooth scroll for all anchor links ── */
document.querySelectorAll('a[href^="#"]').forEach(anchor => {
  anchor.addEventListener('click', e => {
    const target = document.querySelector(anchor.getAttribute('href'));
    if (!target) return;
    e.preventDefault();
    const offset = navbar.offsetHeight + 8;
    window.scrollTo({ top: target.offsetTop - offset, behavior: 'smooth' });
  });
});

/* ── Reveal on scroll (IntersectionObserver) ── */
const revealObserver = new IntersectionObserver((entries) => {
  entries.forEach((entry, i) => {
    if (entry.isIntersecting) {
      // stagger siblings slightly
      const siblings = entry.target.parentElement.querySelectorAll('.reveal');
      let delay = 0;
      siblings.forEach((sib, idx) => {
        if (sib === entry.target) delay = idx * 80;
      });
      setTimeout(() => entry.target.classList.add('visible'), delay);
      revealObserver.unobserve(entry.target);
    }
  });
}, { threshold: 0.12, rootMargin: '0px 0px -40px 0px' });

document.querySelectorAll('.reveal').forEach(el => revealObserver.observe(el));

/* ── Animated stats counter ── */
function animateCounter(el) {
  const target = parseInt(el.dataset.target, 10);
  if (!target || el.dataset.animated) return;
  el.dataset.animated = '1';
  const duration = 1400;
  const step = target / (duration / 16);
  let current = 0;
  const timer = setInterval(() => {
    current += step;
    if (current >= target) { current = target; clearInterval(timer); }
    el.textContent = Math.floor(current);
  }, 16);
}

// Observer for hero/section .stat-number elements
const statsObserver = new IntersectionObserver((entries) => {
  entries.forEach(entry => {
    if (entry.isIntersecting) {
      entry.target.querySelectorAll('.stat-number').forEach(animateCounter);
      statsObserver.unobserve(entry.target);
    }
  });
}, { threshold: 0.3 });
const statsBar = document.querySelector('.stats-bar');
if (statsBar) statsObserver.observe(statsBar);

// Observer for About section .astat-num elements
const aboutStatsObserver = new IntersectionObserver((entries) => {
  entries.forEach(entry => {
    if (entry.isIntersecting) {
      entry.target.querySelectorAll('.astat-num').forEach(animateCounter);
      aboutStatsObserver.unobserve(entry.target);
    }
  });
}, { threshold: 0.3 });
const aboutStatsGrid = document.querySelector('.about-stats-grid');
if (aboutStatsGrid) aboutStatsObserver.observe(aboutStatsGrid);

/* ── Scroll to top button ── */
const scrollTopBtn = document.getElementById('scrollTopBtn');
function toggleScrollTopBtn() {
  if (!scrollTopBtn) return;
  scrollTopBtn.style.display = window.scrollY > 400 ? 'flex' : 'none';
}
if (scrollTopBtn) {
  scrollTopBtn.addEventListener('click', () => window.scrollTo({ top: 0, behavior: 'smooth' }));
}

/* ── Contact form submission ── */
const contactForm   = document.getElementById('contactForm');
const formSuccess   = document.getElementById('formSuccess');
const formError     = document.getElementById('formError');
const formSubmitBtn = document.getElementById('formSubmitBtn');

if (contactForm) {
  contactForm.addEventListener('submit', async (e) => {
    e.preventDefault();
    formSuccess.style.display = 'none';
    formError.style.display   = 'none';

    // Basic validation
    const nombre  = document.getElementById('nombre').value.trim();
    const email   = document.getElementById('email').value.trim();
    const mensaje = document.getElementById('mensaje').value.trim();
    if (!nombre || !email || !mensaje) {
      formError.style.display = 'flex';
      return;
    }

    // Check reCAPTCHA (if loaded)
    if (typeof grecaptcha !== 'undefined') {
      const recaptchaResponse = grecaptcha.getResponse();
      if (!recaptchaResponse) {
        formError.textContent = '';
        formError.innerHTML = '<i class="fas fa-exclamation-circle"></i> Por favor completa el reCAPTCHA.';
        formError.style.display = 'flex';
        return;
      }
    }

    // Simulate sending (replace with real fetch to your backend)
    formSubmitBtn.disabled = true;
    formSubmitBtn.querySelector('span').textContent = 'Enviando...';

    try {
      // Replace this block with a real API call, e.g.:
      // await fetch('/api/contact', { method:'POST', body: new FormData(contactForm) })
      await new Promise(r => setTimeout(r, 1200)); // simulated delay

      formSuccess.style.display = 'flex';
      contactForm.reset();
      if (typeof grecaptcha !== 'undefined') grecaptcha.reset();
    } catch {
      formError.innerHTML = '<i class="fas fa-exclamation-circle"></i> Error al enviar. Intenta de nuevo.';
      formError.style.display = 'flex';
    } finally {
      formSubmitBtn.disabled = false;
      formSubmitBtn.querySelector('span').textContent = 'Enviar Mensaje';
    }
  });
}

/* ── Init on DOMContentLoaded ── */
document.addEventListener('DOMContentLoaded', () => {
  updateActiveLink();
  toggleScrollTopBtn();
});

/* ══════════════════════════════════════
   DYNAMIC CALENDAR — Horarios del mes
══════════════════════════════════════ */
(function () {
  const API_BASE   = 'https://api.alfahybridtraning.com/api/classes/month';
  // Week starts on Monday (grid header: LUN MAR MIÉ JUE VIE SÁB DOM)
  const DAYS_ES    = ['Lun','Mar','Mié','Jue','Vie','Sáb','Dom'];
  const MONTHS_ES  = ['Enero','Febrero','Marzo','Abril','Mayo','Junio',
                      'Julio','Agosto','Septiembre','Octubre','Noviembre','Diciembre'];

  const elGrid       = document.getElementById('calGrid');
  const elLoading    = document.getElementById('calLoading');
  const elTitle      = document.getElementById('calTitle');
  const elMonthTag   = document.getElementById('calMonthTag');
  const elDetail     = document.getElementById('calDetail');
  const elDetailTitle= document.getElementById('calDetailTitle');
  const elDetailList = document.getElementById('calDetailList');
  const elDetailClose= document.getElementById('calDetailClose');
  const elPrev       = document.getElementById('calPrev');
  const elNext       = document.getElementById('calNext');

  if (!elGrid) return; // section not present

  const today = new Date();
  let curYear  = today.getFullYear();
  let curMonth = today.getMonth() + 1; // 1-based

  /* ── helpers ── */
  function daysInMonth(y, m) { return new Date(y, m, 0).getDate(); }
  // Returns Mon-based offset (0=Mon … 6=Sun)
  function firstWeekdayMon(y, m) {
    const dow = new Date(y, m - 1, 1).getDay(); // 0=Sun
    return (dow + 6) % 7; // shift so Mon=0
  }
  function pad2(n) { return String(n).padStart(2, '0'); }
  function fmtDate(y, m, d) { return `${y}-${pad2(m)}-${pad2(d)}`; }

  /* ── fetch sessions from API ── */
  async function fetchMonth(year, month) {
    const res = await fetch(`${API_BASE}?year=${year}&month=${month}`);
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    return res.json();
  }

  /* ── build a map: dateStr → [sessions] ── */
  function buildDayMap(sessions) {
    const map = {};
    sessions.forEach(s => {
      if (!map[s.date]) map[s.date] = [];
      map[s.date].push(s);
    });
    return map;
  }

  /* ── render the calendar grid ── */
  function renderGrid(year, month, dayMap) {
    // Remove previous day cells, keep the 7 day-name headers
    elGrid.querySelectorAll('.cal-cell').forEach(c => c.remove());

    // Empty cells before first day (Mon-based offset)
    const offset = firstWeekdayMon(year, month);
    for (let i = 0; i < offset; i++) {
      const blank = document.createElement('div');
      blank.className = 'cal-cell empty';
      elGrid.appendChild(blank);
    }

    // Day cells
    const total = daysInMonth(year, month);
    for (let d = 1; d <= total; d++) {
      const dateStr  = fmtDate(year, month, d);
      const sessions = dayMap[dateStr] || [];
      const isToday  = (year === today.getFullYear() &&
                        month === today.getMonth() + 1 &&
                        d === today.getDate());

      const cell = document.createElement('div');
      cell.className = 'cal-cell' + (isToday ? ' today' : '');
      cell.dataset.date = dateStr;

      const num = document.createElement('span');
      num.className = 'cal-day-num';
      num.textContent = d;
      cell.appendChild(num);

      if (sessions.length) {
        const dots = document.createElement('div');
        dots.className = 'cal-dots';
        sessions.slice(0, 3).forEach(s => {
          const dot = document.createElement('span');
          dot.className = 'cal-dot';
          dot.style.background = s.color || '#00ff88';
          dots.appendChild(dot);
        });
        if (sessions.length > 3) {
          const more = document.createElement('span');
          more.className = 'cal-dot';
          more.style.cssText = 'background:transparent;color:var(--gray-3);font-size:.6rem;width:auto;height:auto;border-radius:0';
          more.textContent = `+${sessions.length - 3}`;
          dots.appendChild(more);
        }
        cell.appendChild(dots);
        cell.addEventListener('click', () => selectDay(dateStr, sessions));
      } else {
        cell.style.cursor = 'default';
      }

      elGrid.appendChild(cell);
    }
  }

  /* ── show detail panel for a selected day ── */
  function selectDay(dateStr, sessions) {
    elGrid.querySelectorAll('.cal-cell.selected').forEach(c => c.classList.remove('selected'));
    const activeCell = elGrid.querySelector(`[data-date="${dateStr}"]`);
    if (activeCell) activeCell.classList.add('selected');

    const [y, m, d] = dateStr.split('-').map(Number);
    const dayIndex = (new Date(y, m - 1, d).getDay() + 6) % 7; // Mon=0
    const label    = `${DAYS_ES[dayIndex]} ${d} de ${MONTHS_ES[m - 1]}`;

    if (elDetailTitle) elDetailTitle.textContent = label;

    if (elDetailList) {
      elDetailList.innerHTML = sessions.map(s => {
        const color  = s.color || '#00ff88';
        const instr  = s.instructor || 'Por asignar';
        const spots  = (s.capacity || 0) - (s.current_bookings || 0);
        const spotsColor = spots > 0 ? '#4ade80' : '#f87171';
        const spotsText  = spots > 0
          ? `${spots} lugar${spots !== 1 ? 'es' : ''} libre${spots !== 1 ? 's' : ''}`
          : 'Cupo lleno';
        return `
          <div class="cal-class-card" style="border-left-color:${color}">
            <div class="cal-class-time">
              <strong>${s.start_time}${s.end_time ? ' – ' + s.end_time : ''}</strong>
            </div>
            <div class="cal-class-info">
              <strong>${s.name}</strong>
              <span>${instr}</span>
            </div>
            <div class="cal-class-spots">
              <strong style="color:${spotsColor}">${spotsText}</strong>
            </div>
          </div>`;
      }).join('');
    }

    elDetail.style.display = 'block';
    setTimeout(() => elDetail.scrollIntoView({ behavior: 'smooth', block: 'nearest' }), 60);
  }

  /* ── close detail panel ── */
  if (elDetailClose) {
    elDetailClose.addEventListener('click', () => {
      elDetail.style.display = 'none';
      elGrid.querySelectorAll('.cal-cell.selected').forEach(c => c.classList.remove('selected'));
    });
  }

  /* ── load & render a month ── */
  async function loadMonth(year, month) {
    if (elLoading) elLoading.classList.add('active');
    if (elDetail)  elDetail.style.display  = 'none';
    elGrid.style.opacity = '0.4';
    if (elTitle)    elTitle.textContent    = `${MONTHS_ES[month - 1]} ${year}`;
    if (elMonthTag) elMonthTag.textContent = `${MONTHS_ES[month - 1].toUpperCase()} ${year}`;

    try {
      const sessions = await fetchMonth(year, month);
      renderGrid(year, month, buildDayMap(sessions));
    } catch (err) {
      // Remove old cells to show error
      elGrid.querySelectorAll('.cal-cell').forEach(c => c.remove());
      const errEl = document.createElement('p');
      errEl.style.cssText = 'grid-column:1/-1;text-align:center;color:#f87171;padding:2rem;font-size:.9rem;';
      errEl.textContent = 'No se pudo cargar el calendario. Intenta más tarde.';
      elGrid.appendChild(errEl);
      console.warn('[Calendar]', err);
    } finally {
      if (elLoading) elLoading.classList.remove('active');
      elGrid.style.opacity = '1';
    }
  }

  /* ── navigation ── */
  function changeMonth(delta) {
    curMonth += delta;
    if (curMonth > 12) { curMonth = 1;  curYear++; }
    if (curMonth < 1)  { curMonth = 12; curYear--; }
    loadMonth(curYear, curMonth);
  }

  if (elPrev) elPrev.addEventListener('click', () => changeMonth(-1));
  if (elNext) elNext.addEventListener('click', () => changeMonth(+1));

  /* ── boot ── */
  loadMonth(curYear, curMonth);
})();
