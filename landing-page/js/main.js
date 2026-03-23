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
   SCHEDULE BOOKING MODAL
══════════════════════════════════════ */
const bookingModal    = document.getElementById('bookingModal');
const closeBookingBtn = document.getElementById('closeBookingModal');
const bookingForm     = document.getElementById('bookingForm');

const CLASS_ICONS = {
  strength: 'fa-dumbbell',
  upper:    'fa-fire-flame-curved',
  test:     'fa-bolt',
  athlete:  'fa-trophy',
  yoga:     'fa-spa',
};
const CLASS_COLORS = {
  strength: '#00d4ff',
  upper:    '#a78bfa',
  test:     '#fb923c',
  athlete:  '#f87171',
  yoga:     '#4ade80',
};

function openBookingModal({ className, instructor, day, time, colorClass }) {
  document.getElementById('bookClass').value      = className;
  document.getElementById('bookDay').value        = day;
  document.getElementById('bookTime').value       = time;
  document.getElementById('bookInstructor').value = instructor !== '—' ? instructor : 'Por asignar';
  document.getElementById('bookName').value       = '';
  document.getElementById('bookPhone').value      = '';
  document.getElementById('bookingFormError').style.display = 'none';

  const color = CLASS_COLORS[colorClass] || 'var(--cyan)';
  const icon  = CLASS_ICONS[colorClass]  || 'fa-calendar-check';
  const instrText = instructor !== '—' ? `Instructor: ${instructor}` : 'Instructor por asignar';

  document.getElementById('bookingClassInfo').innerHTML = `
    <div class="booking-class-icon" style="background:${color}22;border:2px solid ${color}55">
      <i class="fas ${icon}" style="color:${color}"></i>
    </div>
    <div class="booking-class-details">
      <strong>${className}</strong>
      <span>${day} &middot; ${time} &middot; ${instrText}</span>
    </div>
  `;

  bookingModal.style.display = 'flex';
  document.body.style.overflow = 'hidden';
  setTimeout(() => document.getElementById('bookName').focus(), 100);
}

function closeBookingModalFn() {
  bookingModal.style.display = 'none';
  document.body.style.overflow = '';
}

if (closeBookingBtn) closeBookingBtn.addEventListener('click', closeBookingModalFn);
if (bookingModal)    bookingModal.addEventListener('click', e => {
  if (e.target === bookingModal) closeBookingModalFn();
});

if (bookingForm) {
  bookingForm.addEventListener('submit', e => {
    e.preventDefault();
    const name  = document.getElementById('bookName').value.trim();
    const phone = document.getElementById('bookPhone').value.trim();
    if (!name || !phone) {
      document.getElementById('bookingFormError').style.display = 'flex';
      return;
    }
    const cls    = document.getElementById('bookClass').value;
    const day    = document.getElementById('bookDay').value;
    const time   = document.getElementById('bookTime').value;
    const instr  = document.getElementById('bookInstructor').value;

    const msg = encodeURIComponent(
      `¡Hola! Quiero reservar mi lugar en Hybrid Training.\n\n` +
      `*Nombre:* ${name}\n` +
      `*Teléfono:* ${phone}\n` +
      `*Clase:* ${cls}\n` +
      `*Día:* ${day}\n` +
      `*Hora:* ${time}\n` +
      `*Instructor:* ${instr}`
    );
    window.open(`https://wa.me/523141709880?text=${msg}`, '_blank');
    closeBookingModalFn();
  });
}

/* Make each schedule slot clickable */
document.querySelectorAll('.slot').forEach(slot => {
  slot.addEventListener('click', () => {
    const row       = slot.closest('tr');
    const cell      = slot.closest('td');
    const timeCell  = row.querySelector('.td-time');
    const table     = slot.closest('table');
    const cellIndex = Array.from(row.cells).indexOf(cell);
    const headers   = table.querySelectorAll('thead th');
    const day       = headers[cellIndex] ? headers[cellIndex].textContent.trim() : '';
    const time      = timeCell ? timeCell.textContent.trim() : '';
    const className  = slot.querySelector('b').textContent.trim();
    const instructor = slot.querySelector('span').textContent.trim();
    const colorClass = ['strength','upper','test','athlete','yoga']
                         .find(c => slot.classList.contains(c)) || 'strength';
    openBookingModal({ className, instructor, day, time, colorClass });
  });
});
