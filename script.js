// Simple secure(ish) remote voting demo with OTP gate and tamper-evident hash chain.
// Notes: This is a client-only demo. For production, add a backend and/or deploy a smart contract.

(function () {
    const $ = (id) => document.getElementById(id);

    const authSection = $('authSection');
    const authForm = $('authForm');
    const authMsg = $('authMsg');
    const requestOtpBtn = $('requestOtp');
    const otpHint = $('otpHint');
    const demoModeToggle = $('demoMode');
    const themeToggle = $('themeToggle');

    const ballotSection = $('ballotSection');
    const ballotForm = $('ballotForm');
    const voteMsg = $('voteMsg');

    const resultsSection = $('resultsSection');
    const tallyList = $('tally');
    const ledgerView = $('ledgerView');
    const exportBtn = $('exportLedger');
    const importInput = $('importLedger');
    const verifyBtn = $('verifyLedger');
    const verifyMsg = $('verifyMsg');

    // Storage keys
    const STORAGE = {
        OTP: 'sv_otp_codes',
        VERIFIED: 'sv_verified_voter',
        VOTE: 'sv_vote',
        LEDGER: 'sv_ledger'
    };

    // Simple candidates
    const CANDIDATES = ['Alice Johnson', 'Ben Carter', 'Chloe Singh'];

    // Utilities
    function nowEpochSeconds() { return Math.floor(Date.now() / 1000); }

    async function sha256Hex(input) {
        const encoder = new TextEncoder();
        const data = encoder.encode(input);
        const hash = await crypto.subtle.digest('SHA-256', data);
        return [...new Uint8Array(hash)].map(b => b.toString(16).padStart(2, '0')).join('');
    }

    function loadJSON(key, fallback) {
        try { return JSON.parse(localStorage.getItem(key)) ?? fallback; } catch { return fallback; }
    }
    function saveJSON(key, value) { localStorage.setItem(key, JSON.stringify(value)); }

    function setMsg(el, text, type) {
        el.textContent = text;
        el.classList.remove('error', 'success');
        if (type) el.classList.add(type);
    }

    // Demo OTP manager (client-side, not secure, for testing only)
    // Each voterId can request a short-lived 6-digit OTP stored locally for 2 minutes.
    function generateOtp() {
        return Math.floor(100000 + Math.random() * 900000).toString();
    }
    function requestOtp(voterId) {
        const all = loadJSON(STORAGE.OTP, {});
        const code = generateOtp();
        const exp = nowEpochSeconds() + 120; // 2 minutes
        all[voterId] = { code, exp };
        saveJSON(STORAGE.OTP, all);
        return { code, exp };
    }
    function validateOtp(voterId, input) {
        const all = loadJSON(STORAGE.OTP, {});
        const entry = all[voterId];
        if (!entry) return { ok: false, reason: 'No OTP requested' };
        if (nowEpochSeconds() > entry.exp) return { ok: false, reason: 'OTP expired' };
        if (input !== entry.code) return { ok: false, reason: 'Invalid OTP' };
        // One-time use
        delete all[voterId];
        saveJSON(STORAGE.OTP, all);
        return { ok: true };
    }

    // Hash-chain ledger: each record links to previous via prevHash
    function loadLedger() { return loadJSON(STORAGE.LEDGER, []); }
    function saveLedger(ledger) { saveJSON(STORAGE.LEDGER, ledger); }

    async function appendToLedger(record) {
        const ledger = loadLedger();
        const prevHash = ledger.length ? ledger[ledger.length - 1].hash : 'GENESIS';
        const body = JSON.stringify({ ...record, prevHash });
        const hash = await sha256Hex(body);
        const entry = { ...record, prevHash, hash };
        ledger.push(entry);
        saveLedger(ledger);
        return entry;
    }

    async function verifyLedgerIntegrity(ledger) {
        for (let i = 0; i < ledger.length; i++) {
            const { voterIdMasked, candidate, salt, timestamp, prevHash, hash } = ledger[i];
            const body = JSON.stringify({ voterIdMasked, candidate, salt, timestamp, prevHash });
            const calc = await sha256Hex(body);
            if (calc !== hash) return { ok: false, index: i };
            if (i === 0 && prevHash !== 'GENESIS') return { ok: false, index: i };
            if (i > 0 && prevHash !== ledger[i - 1].hash) return { ok: false, index: i };
        }
        return { ok: true };
    }

    function maskVoterId(voterId) {
        if (!voterId) return '';
        const clean = voterId.replace(/[^a-zA-Z0-9]/g, '');
        if (clean.length <= 4) return '****';
        return clean.slice(0, 2) + '***' + clean.slice(-2);
    }

    function updateUIAfterAuth(voterId) {
        authSection.classList.add('hidden');
        authSection.setAttribute('aria-hidden', 'true');
        ballotSection.classList.remove('hidden');
        ballotSection.setAttribute('aria-hidden', 'false');
        resultsSection.classList.remove('hidden');
        resultsSection.setAttribute('aria-hidden', 'false');
        setMsg(authMsg, '');
    }

    function renderLedger() {
        const ledger = loadLedger();
        ledgerView.innerHTML = '';
        ledger.forEach((e, idx) => {
            const li = document.createElement('li');
            li.innerHTML = (
                '<div><strong>Entry #' + (idx + 1) + '</strong></div>' +
                '<div class="mono">prev: ' + e.prevHash + '</div>' +
                '<div class="mono">hash: ' + e.hash + '</div>' +
                '<div class="mono">voter: ' + e.voterIdMasked + '</div>' +
                '<div>candidate: ' + e.candidate + '</div>' +
                '<div class="mono">time: ' + new Date(e.timestamp).toISOString() + '</div>'
            );
            ledgerView.appendChild(li);
        });
        renderTally();
    }

    function renderTally() {
        const ledger = loadLedger();
        const counts = new Map(CANDIDATES.map(c => [c, 0]));
        ledger.forEach(e => { if (counts.has(e.candidate)) counts.set(e.candidate, counts.get(e.candidate) + 1); });
        tallyList.innerHTML = '';
        counts.forEach((v, k) => {
            const li = document.createElement('li');
            li.innerHTML = '<span>' + k + '</span><strong>' + v + '</strong>';
            tallyList.appendChild(li);
        });
    }

    function setTheme(initialLoad) {
        const k = 'sv_theme';
        if (initialLoad) {
            const saved = localStorage.getItem(k);
            if (saved) document.documentElement.dataset.theme = saved;
            return;
        }
        const cur = document.documentElement.dataset.theme;
        const next = cur === 'light' ? 'dark' : cur === 'dark' ? '' : 'dark';
        if (next) document.documentElement.dataset.theme = next; else delete document.documentElement.dataset.theme;
        localStorage.setItem(k, document.documentElement.dataset.theme || '');
    }

    // Event handlers
    requestOtpBtn.addEventListener('click', async () => {
        const voterId = (document.getElementById('voterId').value || '').trim();
        const email = (document.getElementById('email').value || '').trim();
        if (!voterId) { setMsg(authMsg, 'Enter your Voter ID before requesting OTP', 'error'); return; }
        const isDemo = demoModeToggle.checked;
        if (isDemo) {
            const { code, exp } = requestOtp(voterId);
            setMsg(authMsg, 'OTP generated (demo). Expires in 2 minutes.', 'success');
            otpHint.classList.remove('hidden');
            otpHint.textContent = 'Demo OTP for ' + voterId + ': ' + code + ' (expires at ' + new Date(exp * 1000).toLocaleTimeString() + ')';
            return;
        }
        if (!email) { setMsg(authMsg, 'Email is required to receive OTP', 'error'); return; }
        try {
            const res = await fetch('/api/otp/request', {
                method: 'POST', headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ voterId, email })
            });
            const data = await res.json();
            if (!res.ok || !data.ok) throw new Error(data && data.error ? data.error : 'request_failed');
            setMsg(authMsg, 'OTP sent to your email. Expires in 2 minutes.', 'success');
            if (data.previewUrl) {
                otpHint.classList.remove('hidden');
                otpHint.textContent = 'Testing link (Ethereal): ' + data.previewUrl;
            } else {
                otpHint.classList.add('hidden');
                otpHint.textContent = '';
            }
        } catch (err) {
            setMsg(authMsg, 'Failed to request OTP: ' + (err && err.message ? err.message : 'unknown'), 'error');
        }
    });

    authForm.addEventListener('submit', async (e) => {
        e.preventDefault();
        const voterId = (document.getElementById('voterId').value || '').trim();
        const otp = (document.getElementById('otp').value || '').trim();
        if (!voterId || !otp) { setMsg(authMsg, 'Voter ID and OTP are required', 'error'); return; }
        const isDemo = demoModeToggle.checked;
        if (isDemo) {
            const result = validateOtp(voterId, otp);
            if (!result.ok) { setMsg(authMsg, 'Verification failed: ' + result.reason, 'error'); return; }
        } else {
            try {
                const res = await fetch('/api/otp/verify', {
                    method: 'POST', headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ voterId, code: otp })
                });
                const data = await res.json();
                if (!res.ok || !data.ok) throw new Error(data && data.error ? data.error : 'verify_failed');
            } catch (err) {
                setMsg(authMsg, 'Verification failed: ' + (err && err.message ? err.message : 'unknown'), 'error');
                return;
            }
        }
        localStorage.setItem(STORAGE.VERIFIED, voterId);
        setMsg(authMsg, 'Verified. You may submit your vote.', 'success');
        updateUIAfterAuth(voterId);
    });

    ballotForm.addEventListener('submit', async (e) => {
        e.preventDefault();
        const voterId = localStorage.getItem(STORAGE.VERIFIED);
        if (!voterId) { setMsg(voteMsg, 'Not verified.', 'error'); return; }
        // Enforce one vote per device (client-side). For real elections, enforce server-side or on-chain.
        if (localStorage.getItem(STORAGE.VOTE)) { setMsg(voteMsg, 'You have already voted on this device.', 'error'); return; }
        const fd = new FormData(ballotForm);
        const candidate = fd.get('candidate');
        if (!candidate) { setMsg(voteMsg, 'Select a candidate.', 'error'); return; }
        const salt = crypto.getRandomValues(new Uint32Array(4)).join('-');
        const timestamp = Date.now();
        const voterIdMasked = maskVoterId(voterId);
        const entry = await appendToLedger({ voterIdMasked, candidate, salt, timestamp });
        localStorage.setItem(STORAGE.VOTE, JSON.stringify({ candidate, receipt: entry.hash }));
        setMsg(voteMsg, 'Vote submitted. Receipt: ' + entry.hash.slice(0, 16) + '…', 'success');
        renderLedger();
    });

    exportBtn.addEventListener('click', () => {
        const data = loadLedger();
        const blob = new Blob([JSON.stringify({ ledger: data }, null, 2)], { type: 'application/json' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url; a.download = 'ledger.json';
        document.body.appendChild(a); a.click(); a.remove(); URL.revokeObjectURL(url);
    });

    importInput.addEventListener('change', async (e) => {
        const file = e.target.files && e.target.files[0];
        if (!file) return;
        try {
            const text = await file.text();
            const parsed = JSON.parse(text);
            if (!parsed || !Array.isArray(parsed.ledger)) throw new Error('Invalid format');
            const check = await verifyLedgerIntegrity(parsed.ledger);
            if (!check.ok) { setMsg(verifyMsg, 'Import failed integrity at entry #' + (check.index + 1), 'error'); return; }
            saveLedger(parsed.ledger);
            renderLedger();
            setMsg(verifyMsg, 'Ledger imported and verified.', 'success');
        } catch (err) {
            setMsg(verifyMsg, 'Import failed: ' + (err && err.message ? err.message : 'Unknown error'), 'error');
        } finally {
            importInput.value = '';
        }
    });

    verifyBtn.addEventListener('click', async () => {
        const data = loadLedger();
        const check = await verifyLedgerIntegrity(data);
        if (check.ok) setMsg(verifyMsg, 'Ledger OK ✓', 'success');
        else setMsg(verifyMsg, 'Ledger tampered at entry #' + (check.index + 1), 'error');
    });

    themeToggle.addEventListener('click', () => setTheme(false));

    // Optional MetaMask stub
    function detectMetaMask() {
        return typeof window.ethereum !== 'undefined';
    }
    function showMetaMaskHint() {
        if (detectMetaMask()) {
            const hint = document.createElement('div');
            hint.className = 'muted';
            hint.textContent = 'MetaMask detected. Smart contract integration can be enabled in a production setup.';
            resultsSection.querySelector('h2').after(hint);
        }
    }

    // Init
    (function init() {
        setTheme(true);
        renderLedger();
        showMetaMaskHint();
        const verified = localStorage.getItem(STORAGE.VERIFIED);
        if (verified) updateUIAfterAuth(verified);
        // Accessibility: set initial focus
        (verified ? ballotSection : authSection).querySelector('h2').setAttribute('tabindex', '-1');
        (verified ? ballotSection : authSection).querySelector('h2').focus({ preventScroll: true });
    })();
})();


