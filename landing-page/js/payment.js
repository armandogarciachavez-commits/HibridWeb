/* ═══════════════════════════════════════════
   HYBRID TRAINING — payment.js
   Payment modal · Stripe · MercadoPago · Transfer
═══════════════════════════════════════════ */

'use strict';

/* ── CONFIG — Replace with your real keys ── */
const STRIPE_PUBLIC_KEY = 'pk_test_REEMPLAZA_CON_TU_CLAVE_STRIPE';
const API_BASE = '/api'; // Your backend URL (e.g. http://localhost:3000/api)

/* ─────────────────────────────────────────
   MODAL OPEN / CLOSE
───────────────────────────────────────── */
const modal      = document.getElementById('paymentModal');
const closeModal = document.getElementById('closeModal');
const modalSummary = document.getElementById('modalSummary');

let currentPlan = {};

// Open modal from any .btn-pay button
document.querySelectorAll('.btn-pay').forEach(btn => {
  btn.addEventListener('click', () => {
    currentPlan = {
      plan:   btn.dataset.plan,
      amount: parseInt(btn.dataset.amount, 10),
      label:  btn.dataset.label,
    };
    openPaymentModal(currentPlan);
  });
});

function openPaymentModal(plan) {
  // Update summary
  modalSummary.innerHTML = `
    <span class="plan-name">${plan.label}</span>
    <span class="plan-price">$${plan.amount.toLocaleString('es-MX')}</span>
  `;
  // Update pay button text
  document.getElementById('payCardBtnText').textContent =
    `Pagar $${plan.amount.toLocaleString('es-MX')} MXN`;

  modal.style.display = 'flex';
  document.body.style.overflow = 'hidden';

  // Activate first tab
  activateTab('transfer');
}

function closePaymentModal() {
  modal.style.display = 'none';
  document.body.style.overflow = '';
}

closeModal.addEventListener('click', closePaymentModal);
modal.addEventListener('click', e => { if (e.target === modal) closePaymentModal(); });
document.addEventListener('keydown', e => { if (e.key === 'Escape') closePaymentModal(); });

/* ─────────────────────────────────────────
   PAYMENT TABS
───────────────────────────────────────── */
document.querySelectorAll('.ptab').forEach(tab => {
  tab.addEventListener('click', () => activateTab(tab.dataset.tab));
});

function activateTab(tabId) {
  document.querySelectorAll('.ptab').forEach(t => t.classList.toggle('active', t.dataset.tab === tabId));
  document.querySelectorAll('.ptab-content').forEach(c => c.classList.toggle('active', c.id === 'tab-' + tabId));

  // Mount Stripe on card tab first visit
  if (tabId === 'card' && !stripeCardMounted && stripeLoaded) {
    mountStripeCard();
  }
}

/* ─────────────────────────────────────────
   STRIPE INTEGRATION
───────────────────────────────────────── */
let stripe = null;
let stripeCard = null;
let stripeCardMounted = false;
let stripeLoaded = false;

// Try to initialize Stripe (only if key is real)
function initStripe() {
  if (typeof Stripe === 'undefined') return;
  if (STRIPE_PUBLIC_KEY.includes('REEMPLAZA')) {
    console.info('[Hybrid Training] Stripe: Configura tu STRIPE_PUBLIC_KEY en payment.js');
    return;
  }
  try {
    stripe = Stripe(STRIPE_PUBLIC_KEY);
    stripeLoaded = true;
  } catch (e) {
    console.warn('[Hybrid Training] Stripe no pudo inicializarse:', e.message);
  }
}

function mountStripeCard() {
  if (!stripe || stripeCardMounted) return;
  const elements = stripe.elements({
    appearance: {
      theme: 'night',
      variables: {
        colorPrimary: '#00d4ff',
        colorBackground: '#141414',
        colorText: '#e8e8e8',
        colorDanger: '#f87171',
        borderRadius: '8px',
      }
    }
  });
  stripeCard = elements.create('card');
  const container = document.getElementById('stripeCardElement');
  container.innerHTML = ''; // remove placeholder
  stripeCard.mount(container);
  stripeCardMounted = true;

  stripeCard.on('change', ({ error }) => {
    const errDiv = document.getElementById('stripeErrors');
    if (error) {
      errDiv.textContent = error.message;
      errDiv.style.display = 'block';
    } else {
      errDiv.style.display = 'none';
    }
  });
}

// Card form submit
const cardPayForm = document.getElementById('cardPayForm');
if (cardPayForm) {
  cardPayForm.addEventListener('submit', async (e) => {
    e.preventDefault();
    if (!stripe || !stripeCard) {
      alert('Stripe no está configurado. Por favor usa Transferencia o MercadoPago.');
      return;
    }

    const btn = document.getElementById('payCardBtn');
    const btnText = document.getElementById('payCardBtnText');
    btn.disabled = true;
    btnText.textContent = 'Procesando...';

    try {
      // 1. Create Payment Intent on your backend
      const res = await fetch(`${API_BASE}/create-payment-intent`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ plan: currentPlan.plan, amount: currentPlan.amount * 100 }), // cents
      });

      if (!res.ok) throw new Error('Error al crear el pago');
      const { clientSecret } = await res.json();

      // 2. Confirm card payment
      const { error, paymentIntent } = await stripe.confirmCardPayment(clientSecret, {
        payment_method: {
          card: stripeCard,
          billing_details: { name: document.getElementById('cardHolder').value },
        },
      });

      if (error) throw new Error(error.message);

      // 3. Success
      if (paymentIntent.status === 'succeeded') {
        showPaymentSuccess(currentPlan);
      }
    } catch (err) {
      const errDiv = document.getElementById('stripeErrors');
      errDiv.textContent = err.message;
      errDiv.style.display = 'block';
    } finally {
      btn.disabled = false;
      btnText.textContent = `Pagar $${currentPlan.amount.toLocaleString('es-MX')} MXN`;
    }
  });
}

/* ─────────────────────────────────────────
   MERCADOPAGO INTEGRATION
───────────────────────────────────────── */
const mpPayBtn = document.getElementById('mpPayBtn');
if (mpPayBtn) {
  mpPayBtn.addEventListener('click', async () => {
    mpPayBtn.disabled = true;
    mpPayBtn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Redirigiendo...';

    try {
      // Call your backend to create a MP preference
      const res = await fetch(`${API_BASE}/create-mp-preference`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ plan: currentPlan.plan, amount: currentPlan.amount }),
      });

      if (!res.ok) throw new Error('Error al crear la preferencia de MercadoPago');
      const { init_point } = await res.json();

      // Redirect to MP checkout
      window.location.href = init_point;
    } catch (err) {
      alert('No se pudo conectar con MercadoPago. Verifica que el servidor esté corriendo y configurado.');
      mpPayBtn.disabled = false;
      mpPayBtn.innerHTML = '<i class="fas fa-lock"></i> Pagar con MercadoPago';
    }
  });
}

/* ─────────────────────────────────────────
   PAYMENT SUCCESS STATE
───────────────────────────────────────── */
function showPaymentSuccess(plan) {
  const modalBody = document.querySelector('.modal-body');
  modalBody.innerHTML = `
    <div style="text-align:center; padding: 2rem 1rem;">
      <div style="width:72px;height:72px;border-radius:50%;background:rgba(34,197,94,.15);
           display:flex;align-items:center;justify-content:center;margin:0 auto 1.2rem;
           font-size:2rem;color:#4ade80;">
        <i class="fas fa-check"></i>
      </div>
      <h3 style="font-family:var(--font-head);font-size:1.6rem;color:var(--white);margin-bottom:.5rem;letter-spacing:.04em;">
        ¡Pago Exitoso!
      </h3>
      <p style="color:var(--gray-2);margin-bottom:1.5rem;font-size:.95rem;">
        Tu <strong style="color:var(--white)">${plan.label}</strong> ha sido activado.<br>
        ¡Bienvenido a Hybrid Training!
      </p>
      <a href="https://wa.me/523141709880?text=Hola!%20Acabo%20de%20pagar%20mi%20${encodeURIComponent(plan.label)}%20en%20Hybrid%20Training."
         target="_blank" class="btn-whatsapp" style="display:inline-flex;width:auto;padding:.75rem 1.5rem;">
        <i class="fab fa-whatsapp"></i> Confirmar por WhatsApp
      </a>
      <button onclick="closePaymentModal()" class="btn-outline" style="margin-top:.75rem;width:100%;justify-content:center;">
        Cerrar
      </button>
    </div>
  `;
}

/* ── Init ── */
document.addEventListener('DOMContentLoaded', initStripe);

// Also expose closePaymentModal globally for inline onclick
window.closePaymentModal = closePaymentModal;
