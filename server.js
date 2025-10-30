'use strict';

const path = require('path');
const express = require('express');
const helmet = require('helmet');
const cors = require('cors');
const rateLimit = require('express-rate-limit');
const nodemailer = require('nodemailer');
require('dotenv').config();

const app = express();

// Security and parsing
app.use(helmet());
app.use(express.json());
app.use(express.urlencoded({ extended: false }));
app.use(cors({ origin: false })); // same-origin static serving, no cross-site

// Basic rate limiter
const limiter = rateLimit({ windowMs: 60 * 1000, max: 50 });
app.use('/api/', limiter);

// In-memory OTP store (for demo). In production, use DB/Redis.
const otpStore = new Map(); // key: voterId, value: { code, exp, email }

function generateOtp() {
  return Math.floor(100000 + Math.random() * 900000).toString();
}

function nowEpochSeconds() { return Math.floor(Date.now() / 1000); }

// Nodemailer transporter using Ethereal by default for safe testing
let transporterPromise = null;
async function getTransporter() {
  if (transporterPromise) return transporterPromise;
  transporterPromise = (async () => {
    if (process.env.SMTP_HOST) {
      return nodemailer.createTransport({
        host: process.env.SMTP_HOST,
        port: Number(process.env.SMTP_PORT || 587),
        secure: Boolean(process.env.SMTP_SECURE === 'true'),
        auth: process.env.SMTP_USER ? { user: process.env.SMTP_USER, pass: process.env.SMTP_PASS } : undefined
      });
    }
    const testAccount = await nodemailer.createTestAccount();
    return nodemailer.createTransport({
      host: 'smtp.ethereal.email',
      port: 587,
      secure: false,
      auth: { user: testAccount.user, pass: testAccount.pass }
    });
  })();
  return transporterPromise;
}

app.post('/api/otp/request', async (req, res) => {
  try {
    const { voterId, email } = req.body || {};
    if (!voterId) return res.status(400).json({ ok: false, error: 'voterId required' });
    if (!email) return res.status(400).json({ ok: false, error: 'email required' });

    const code = generateOtp();
    const exp = nowEpochSeconds() + 120; // 2 minutes
    otpStore.set(voterId, { code, exp, email });

    const transporter = await getTransporter();
    const info = await transporter.sendMail({
      from: process.env.MAIL_FROM || 'no-reply@secure-vote.local',
      to: email,
      subject: 'Your Secure Voting OTP',
      text: `Your OTP is: ${code}. It expires in 2 minutes.`,
      html: `<p>Your OTP is: <strong>${code}</strong>. It expires in 2 minutes.</p>`
    });

    const previewUrl = nodemailer.getTestMessageUrl(info) || null;
    return res.json({ ok: true, exp, previewUrl });
  } catch (err) {
    console.error('OTP request error:', err);
    return res.status(500).json({ ok: false, error: 'internal_error' });
  }
});

app.post('/api/otp/verify', (req, res) => {
  try {
    const { voterId, code } = req.body || {};
    if (!voterId || !code) return res.status(400).json({ ok: false, error: 'voterId and code required' });
    const entry = otpStore.get(voterId);
    if (!entry) return res.status(400).json({ ok: false, error: 'no_otp' });
    if (nowEpochSeconds() > entry.exp) { otpStore.delete(voterId); return res.status(400).json({ ok: false, error: 'expired' }); }
    if (entry.code !== code) return res.status(400).json({ ok: false, error: 'invalid' });
    otpStore.delete(voterId);
    return res.json({ ok: true });
  } catch (err) {
    console.error('OTP verify error:', err);
    return res.status(500).json({ ok: false, error: 'internal_error' });
  }
});

// Serve static frontend
const staticRoot = path.join(__dirname);
app.use(express.static(staticRoot, { index: 'index.html', redirect: false }));
app.get('*', (req, res) => res.sendFile(path.join(staticRoot, 'index.html')));

const PORT = Number(process.env.PORT || 3000);
app.listen(PORT, () => {
  console.log(`Secure Voting server running at http://localhost:${PORT}`);
});


