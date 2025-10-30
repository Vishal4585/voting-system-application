# Secure Remote Voting (Demo)

A responsive HTML/CSS/JS voting app with:
- OTP verification (Demo mode or real delivery via Node/Express + Nodemailer/Ethereal)
- Tamper-evident hash-chain ledger with export/import/verify
- Optional MetaMask detection stub

## Quick Start

1. Install dependencies:
```bash
npm install
```

2. Start server (serves frontend and OTP API):
```bash
npm start
```

3. Open the app:
- http://localhost:3000

## OTP Modes

- Demo mode (toggle in header): OTP is generated client-side and shown on screen.
- Real delivery: Turn off Demo mode, enter your email, click Request OTP. The server sends an email via Ethereal (test inbox). The server response includes a preview URL for the email.

To use a real SMTP provider, set environment variables in a `.env` file:
```
SMTP_HOST=smtp.yourprovider.com
SMTP_PORT=587
SMTP_SECURE=false
SMTP_USER=your_username
SMTP_PASS=your_password
MAIL_FROM=no-reply@your-domain.com
PORT=3000
```

## Notes
- This project is for demonstration. For production: secure storage (DB/Redis), unique voter roll validation, server-side one-vote enforcement, audit logging, and consider on-chain vote receipts.
- The ledger is tamper-evident (hash-chain) and can be verified via the Verify Integrity button.

## Scripts
- `npm start` – run Express server
- `npm run dev` – run with nodemon
