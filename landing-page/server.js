/**
 * HYBRID TRAINING — Backend Server
 * Maneja: Stripe PaymentIntents · MercadoPago Preferences · Formulario de contacto
 *
 * Requisitos: Node.js 18+
 * Instalación: npm install
 * Inicio: node server.js
 */

require('dotenv').config();
const express    = require('express');
const cors       = require('cors');
const stripe     = require('stripe')(process.env.STRIPE_SECRET_KEY || '');
const mercadopago = require('mercadopago');
const nodemailer = require('nodemailer');
const path       = require('path');

const app  = express();
const PORT = process.env.PORT || 3000;

/* ── Middleware ── */
app.use(cors({ origin: process.env.FRONTEND_URL || '*' }));
app.use(express.json());
app.use(express.static(path.join(__dirname)));

/* ── MercadoPago config ── */
if (process.env.MP_ACCESS_TOKEN) {
  mercadopago.configure({ access_token: process.env.MP_ACCESS_TOKEN });
}

/* ── Plans catalog ── */
const PLANS = {
  inscripcion: { title: 'Inscripción Hybrid Training',     amount: 400 },
  mensualidad: { title: 'Mensualidad Hybrid Training',     amount: 1100 },
  bimestre:    { title: 'Bimestre Hybrid Training (2 mes)', amount: 2100 },
  trimestre:   { title: 'Trimestre Hybrid Training (3 mes)', amount: 2900 },
};

/* ════════════════════════════════════════
   STRIPE — Create PaymentIntent
════════════════════════════════════════ */
app.post('/api/create-payment-intent', async (req, res) => {
  try {
    const { plan } = req.body;
    const planData = PLANS[plan];
    if (!planData) return res.status(400).json({ error: 'Plan inválido' });

    if (!process.env.STRIPE_SECRET_KEY) {
      return res.status(503).json({ error: 'Stripe no configurado. Agrega STRIPE_SECRET_KEY en .env' });
    }

    const paymentIntent = await stripe.paymentIntents.create({
      amount:   planData.amount * 100, // centavos MXN
      currency: 'mxn',
      description: planData.title,
      metadata:    { plan, gym: 'Hybrid Training Manzanillo' },
    });

    res.json({ clientSecret: paymentIntent.client_secret });
  } catch (err) {
    console.error('Stripe error:', err.message);
    res.status(500).json({ error: err.message });
  }
});

/* ════════════════════════════════════════
   MERCADOPAGO — Create Preference
════════════════════════════════════════ */
app.post('/api/create-mp-preference', async (req, res) => {
  try {
    const { plan } = req.body;
    const planData = PLANS[plan];
    if (!planData) return res.status(400).json({ error: 'Plan inválido' });

    if (!process.env.MP_ACCESS_TOKEN) {
      return res.status(503).json({ error: 'MercadoPago no configurado. Agrega MP_ACCESS_TOKEN en .env' });
    }

    const preference = {
      items: [{
        title:      planData.title,
        quantity:   1,
        unit_price: planData.amount,
        currency_id: 'MXN',
      }],
      back_urls: {
        success: `${process.env.FRONTEND_URL || 'http://localhost:3000'}/?pago=exitoso`,
        failure: `${process.env.FRONTEND_URL || 'http://localhost:3000'}/?pago=fallido`,
        pending: `${process.env.FRONTEND_URL || 'http://localhost:3000'}/?pago=pendiente`,
      },
      auto_return: 'approved',
      payment_methods: { excluded_payment_types: [] },
      statement_descriptor: 'HYBRID TRAINING MZO',
    };

    const response = await mercadopago.preferences.create(preference);
    res.json({ init_point: response.body.init_point });
  } catch (err) {
    console.error('MercadoPago error:', err.message);
    res.status(500).json({ error: err.message });
  }
});

/* ════════════════════════════════════════
   CONTACT FORM
════════════════════════════════════════ */
app.post('/api/contact', async (req, res) => {
  const { nombre, email, telefono, asunto, mensaje } = req.body;
  if (!nombre || !email || !mensaje) {
    return res.status(400).json({ error: 'Campos requeridos faltantes' });
  }

  // If email credentials configured, send notification
  if (process.env.SMTP_USER && process.env.SMTP_PASS) {
    const transporter = nodemailer.createTransport({
      host:   process.env.SMTP_HOST || 'smtp.gmail.com',
      port:   parseInt(process.env.SMTP_PORT || '587'),
      secure: false,
      auth: { user: process.env.SMTP_USER, pass: process.env.SMTP_PASS },
    });

    await transporter.sendMail({
      from:    `"Hybrid Training Web" <${process.env.SMTP_USER}>`,
      to:      process.env.CONTACT_EMAIL || process.env.SMTP_USER,
      subject: `Nuevo mensaje web: ${asunto || 'Consulta general'}`,
      html: `
        <h2>Nuevo mensaje desde hybridtraining.mx</h2>
        <p><b>Nombre:</b> ${nombre}</p>
        <p><b>Email:</b> ${email}</p>
        <p><b>Teléfono:</b> ${telefono || 'No proporcionado'}</p>
        <p><b>Asunto:</b> ${asunto || 'No especificado'}</p>
        <hr>
        <p><b>Mensaje:</b><br>${mensaje.replace(/\n/g, '<br>')}</p>
      `,
    });
  }

  res.json({ ok: true, message: 'Mensaje recibido' });
});

/* ── Stripe Webhook (opcional, para confirmar pagos) ── */
app.post('/webhook/stripe', express.raw({ type: 'application/json' }), (req, res) => {
  const sig  = req.headers['stripe-signature'];
  const secret = process.env.STRIPE_WEBHOOK_SECRET;
  if (!secret) return res.sendStatus(200);

  let event;
  try {
    event = stripe.webhooks.constructEvent(req.body, sig, secret);
  } catch (err) {
    return res.status(400).send(`Webhook Error: ${err.message}`);
  }

  if (event.type === 'payment_intent.succeeded') {
    const pi = event.data.object;
    console.log(`✅ Pago exitoso: ${pi.description} — $${pi.amount / 100} MXN`);
    // Aquí puedes registrar en base de datos, enviar email de confirmación, etc.
  }
  res.sendStatus(200);
});

/* ── Start server ── */
app.listen(PORT, () => {
  console.log(`🏋️  Hybrid Training server corriendo en http://localhost:${PORT}`);
  console.log(`   Stripe:      ${process.env.STRIPE_SECRET_KEY ? '✅ Configurado' : '⚠️  No configurado'}`);
  console.log(`   MercadoPago: ${process.env.MP_ACCESS_TOKEN   ? '✅ Configurado' : '⚠️  No configurado'}`);
  console.log(`   Email SMTP:  ${process.env.SMTP_USER         ? '✅ Configurado' : '⚠️  No configurado'}`);
});
