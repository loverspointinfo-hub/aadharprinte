/**
 * Aadhaar Download Logic
 * Handles interaction with UIDAI via local proxy
 */

const API_BASE = '/api/proxy';
let currentCaptchaTxnId = '';
const sessionId = generateUUID();

document.addEventListener('DOMContentLoaded', () => {
    initUI();
    fetchCaptcha();
});

function generateUUID() {
    return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, function(c) {
        var r = Math.random() * 16 | 0, v = c == 'x' ? r : (r & 0x3 | 0x8);
        return v.toString(16);
    });
}

function initUI() {
    const aadhaarInput = document.getElementById('aadhaar-number');
    const captchaForm = document.getElementById('captcha-form');
    const otpForm = document.getElementById('otp-form');
    const refreshBtn = document.getElementById('refresh-captcha');
    const backBtn = document.getElementById('back-to-step-1');

    // Aadhaar formatting (XXXX XXXX XXXX)
    aadhaarInput.addEventListener('input', (e) => {
        let value = e.target.value.replace(/\D/g, '');
        let formatted = '';
        for (let i = 0; i < value.length; i++) {
            if (i > 0 && i % 4 === 0) formatted += ' ';
            formatted += value[i];
        }
        e.target.value = formatted;
    });

    // Refresh Captcha
    refreshBtn.addEventListener('click', fetchCaptcha);

    // Step 1: Send OTP
    captchaForm.addEventListener('submit', async (e) => {
        e.preventDefault();
        hideError('captcha-error-container');
        const aadhaar = aadhaarInput.value.replace(/\s/g, '');
        const captcha = document.getElementById('captcha-input').value;
        const captchaInput = document.getElementById('captcha-input');
        
        if (aadhaar.length !== 12) {
            showError('captcha-error-container', 'Please enter a valid 12-digit Aadhaar number.');
            return;
        }

        setLoading('send-otp-btn', true);
        
        try {
            const response = await fetch(`${API_BASE}/otp`, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'appid': 'MYAADHAAR',
                    'x-request-id': sessionId
                },
                body: JSON.stringify({
                    uidNumber: aadhaar,
                    captchaTxnId: currentCaptchaTxnId,
                    captchaValue: captcha,
                    transactionId: sessionId
                })
            });

            const data = await response.json();

            if (response.ok && data.status === 'Success') {
                window.otpTxnId = data.txnId; // Store for next step
                showStep(2);
            } else {
                const friendlyMsg = "You have entered an invalid Aadhaar No or captcha.. Please enter the correct 12 digit Aadhaar no. and captcha to proceed.";
                showError('captcha-error-container', friendlyMsg);
                
                // Clear and focus captcha if it was incorrect
                captchaInput.value = '';
                captchaInput.focus();
                
                fetchCaptcha(); // Refresh captcha on failure
            }
        } catch (error) {
            console.error('OTP Error:', error);
            showError('captcha-error-container', 'Connection error. Please ensure the backend server is running.');
        } finally {
            setLoading('send-otp-btn', false);
        }
    });

    // Step 2: Verify & Download
    otpForm.addEventListener('submit', async (e) => {
        e.preventDefault();
        hideError('otp-error-container');
        const otp = document.getElementById('otp-input').value;
        const otpInput = document.getElementById('otp-input');
        const isMasked = document.getElementById('mask-aadhaar').checked;
        const aadhaar = aadhaarInput.value.replace(/\s/g, '');

        if (otp.length !== 6) {
            showError('otp-error-container', 'Please enter a valid 6-digit OTP.');
            return;
        }

        setLoading('download-btn', true);

        try {
            const response = await fetch(`${API_BASE}/download`, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'appid': 'MYAADHAAR',
                    'x-request-id': sessionId
                },
                body: JSON.stringify({
                    uid: aadhaar,
                    mask: isMasked,
                    otp: otp,
                    otpTxnId: window.otpTxnId
                })
            });

            if (response.ok) {
                const result = await response.json();
                
                if (result.status === 'Success' && result.data && result.data.aadhaarPdf) {
                    const pdfBase64 = result.data.aadhaarPdf;
                    const saveToHistoryChecked = document.getElementById('save-to-history').checked;

                    if (saveToHistoryChecked) {
                        try {
                            await dbService.save({
                                id: Date.now().toString(),
                                timestamp: new Date().toLocaleString(),
                                type: 'real',
                                uid: aadhaar,
                                eid: result.data.eid || '',
                                pdfData: pdfBase64,
                                'in-name-en': 'UIDAI Downloaded Aadhaar'
                            });
                        } catch (saveError) {
                            console.error('Failed to save to history:', saveError);
                        }
                    }

                    // Success! Decode base64 PDF
                    const blob = base64ToBlob(pdfBase64);
                    const url = window.URL.createObjectURL(blob);
                    const a = document.createElement('a');
                    a.href = url;
                    // Use actual EID if available, else fallback to masked aadhaar
                    const fileName = `Aadhaar_${result.data.eid || aadhaar.substring(8)}.pdf`;
                    a.download = fileName;
                    document.body.appendChild(a);
                    a.click();
                    window.URL.revokeObjectURL(url);
                    document.body.removeChild(a);
                    showStep('success');
                } else {
                    const errMsg = result.statusMessage || 'OTP verification failed. Please try again.';
                    showError('otp-error-container', errMsg);
                    otpInput.value = '';
                    otpInput.focus();
                }
            } else {
                const data = await response.json();
                showError('otp-error-container', data.message || 'Server error during verification. Please try again.');
            }
        } catch (error) {
            console.error('Download Error:', error);
            showError('otp-error-container', 'Failed to download Aadhaar. Please ensure the backend server is running and try again.');
        } finally {
            setLoading('download-btn', false);
        }
    });

    backBtn.addEventListener('click', () => showStep(1));

    // Mobile Menu Toggle Logic
    const mobileMenuToggle = document.getElementById('mobile-menu-toggle');
    const mainNav = document.getElementById('main-nav');

    if (mobileMenuToggle && mainNav) {
        mobileMenuToggle.addEventListener('click', () => {
            mobileMenuToggle.classList.toggle('active');
            mainNav.classList.toggle('active');
        });

        // Close menu when clicking on a link
        mainNav.querySelectorAll('.nav-btn').forEach(btn => {
            btn.addEventListener('click', () => {
                mobileMenuToggle.classList.remove('active');
                mainNav.classList.remove('active');
            });
        });
        
        // Close menu when clicking outside
        document.addEventListener('click', (e) => {
            if (!mainNav.contains(e.target) && !mobileMenuToggle.contains(e.target) && mainNav.classList.contains('active')) {
                mobileMenuToggle.classList.remove('active');
                mainNav.classList.remove('active');
            }
        });
    }

    // History Toggle Logic
    const btnShowHistory = document.getElementById('btn-show-history');
    const historyModal = document.getElementById('history-modal');
    const closeHistoryBtn = document.getElementById('close-history-btn');

    if (btnShowHistory) {
        btnShowHistory.addEventListener('click', renderHistory);
    }

    if (closeHistoryBtn) {
        closeHistoryBtn.addEventListener('click', () => {
            historyModal.style.display = 'none';
            historyModal.classList.remove('active');
        });
    }
}

// Helper to show in-page error
function showError(containerId, message) {
    const container = document.getElementById(containerId);
    if (container) {
        container.textContent = message;
        container.style.display = 'flex';
        // Auto-scroll to error
        container.scrollIntoView({ behavior: 'smooth', block: 'center' });
    }
}

// Helper to hide in-page error
function hideError(containerId) {
    const container = document.getElementById(containerId);
    if (container) {
        container.style.display = 'none';
    }
}

async function renderHistory() {
    const historyList = document.getElementById('history-list');
    const historyModal = document.getElementById('history-modal');
    
    try {
        let history = await dbService.getAll();
        historyList.innerHTML = '';

        if (history.length === 0) {
            historyList.innerHTML = '<p style="text-align:center; color:var(--text-muted); padding: 20px;">No history found.</p>';
        } else {
            history.forEach(item => {
                const isReal = item.type === 'real';
                const div = document.createElement('div');
                div.className = 'history-item';
                
                div.innerHTML = `
                    <div class="history-details">
                        <h4 style="margin: 0; color: var(--text-color);">${item['in-name-en'] || 'Real Aadhaar'}</h4>
                        <p style="margin: 4px 0 0; font-size: 12px; color: var(--text-muted);">
                            ${isReal ? '🛡️ Real Download' : '✨ Generated Card'}<br>
                            Aadhaar: ${item['in-aadhaar'] || item.uid || '****'}<br>
                            Saved on: ${item.timestamp}
                        </p>
                    </div>
                    <div class="history-actions">
                        ${isReal 
                            ? `<button class="btn-history btn-download-real" data-id="${item.id}" style="background: var(--primary-gradient);">Download</button>`
                            : `<button class="btn-history btn-print-hist" data-id="${item.id}">Print</button>`
                        }
                        <button class="btn-history btn-delete" data-id="${item.id}">Delete</button>
                    </div>
                `;
                historyList.appendChild(div);
            });

            // Action: Print/Open Generated Card
            document.querySelectorAll('.btn-print-hist').forEach(btn => {
                btn.addEventListener('click', function() {
                    const id = this.getAttribute('data-id');
                    // For generated cards on download.html, redirect to index.html with load parameter
                    window.location.href = `index.html?load=${id}`;
                });
            });

            // Action: Download Real Aadhaar
            document.querySelectorAll('.btn-download-real').forEach(btn => {
                btn.addEventListener('click', async function() {
                    const id = this.getAttribute('data-id');
                    const history = await dbService.getAll();
                    const item = history.find(i => i.id === id);
                    if (item && item.pdfData) {
                        const blob = base64ToBlob(item.pdfData);
                        const url = window.URL.createObjectURL(blob);
                        const a = document.createElement('a');
                        a.href = url;
                        a.download = `Aadhaar_Saved_${item.uid || 'Download'}.pdf`;
                        a.click();
                        window.URL.revokeObjectURL(url);
                    }
                });
            });

            // Action: Delete
            document.querySelectorAll('.btn-delete').forEach(btn => {
                btn.addEventListener('click', async function() {
                    const id = this.getAttribute('data-id');
                    await dbService.delete(id);
                    renderHistory(); // Refresh
                });
            });
        }
        
        historyModal.style.display = 'flex';
        historyModal.classList.add('active');
    } catch (e) {
        console.error('Failed to render history:', e);
    }
}

function base64ToBlob(base64, type = 'application/pdf') {
    const binStr = atob(base64);
    const len = binStr.length;
    const arr = new Uint8Array(len);
    for (let i = 0; i < len; i++) {
        arr[i] = binStr.charCodeAt(i);
    }
    return new Blob([arr], { type: type });
}

async function fetchCaptcha() {
    const container = document.getElementById('captcha-container');
    container.innerHTML = '<div class="loader-small"></div>';
    
    try {
        const response = await fetch(`${API_BASE}/captcha`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'appid': 'MYAADHAAR',
                'x-request-id': sessionId
            },
            body: JSON.stringify({
                captchaLength: "6",
                captchaType: "2",
                audioCaptchaRequired: true
            })
        });

        const data = await response.json();
        
        if (data.imageBase64) {
            currentCaptchaTxnId = data.transactionId;
            container.innerHTML = `<img src="data:image/png;base64,${data.imageBase64}" alt="Captcha">`;
            document.getElementById('captcha-input').value = '';
        } else {
            container.innerHTML = '<p style="font-size:12px;color:red">Error loading captcha</p>';
        }
    } catch (error) {
        console.error('Captcha Error:', error);
        container.innerHTML = '<p style="font-size:12px;color:red">Connection failed</p>';
    }
}

function showStep(step) {
    document.querySelectorAll('.glass-card').forEach(card => card.style.display = 'none');
    if (step === 'success') {
        document.getElementById('step-success').style.display = 'block';
    } else {
        document.getElementById(`step-${step}`).style.display = 'block';
    }
}

function setLoading(btnId, isLoading) {
    const btn = document.getElementById(btnId);
    if (!btn) return;
    const span = btn.querySelector('span');
    const loader = btn.querySelector('.btn-loader');
    
    if (isLoading) {
        if (span) span.style.display = 'none';
        if (loader) loader.style.display = 'inline-block';
        btn.disabled = true;
    } else {
        if (span) span.style.display = '';
        if (loader) loader.style.display = 'none';
        btn.disabled = false;
    }
}

// Intercept original download success to add persistence logic
const originalOtpFormSubmit = document.getElementById('otp-form').onsubmit;
document.getElementById('otp-form').addEventListener('submit', async function(e) {
    // This is already handled in initUI, but I'll replace the click handler in initUI instead for cleaner code
});

// Refactored initUI Step 2 logic inside download.js instead of re-adding
// I will just modify the existing otpForm submit listener in a second pass if needed, 
// but it's easier to just do one big replace of download.js
