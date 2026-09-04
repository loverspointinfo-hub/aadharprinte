/**
 * pdf-generator.js
 * Generates High-Resolution Image PDF using html2canvas 
 * to preserve exact Devanagari ligatures and fonts,
 * optimized for 2-5MB file sizes via JPEG compression.
 */

function generateAadhaarPDF() {
    return new Promise((resolve, reject) => {
        const { jsPDF } = window.jspdf;

        const now = new Date();
        const timeStamp = `${String(now.getHours()).padStart(2, '0')}${String(now.getMinutes()).padStart(2, '0')}${String(now.getSeconds()).padStart(2, '0')}`;
        
        const nameInput = document.getElementById('in-name-en');
        const nameVal = nameInput && nameInput.value ? nameInput.value.trim().replace(/\s+/g, '_') : 'Applicant';
        const fileName = `${nameVal}_Aadhaar_${timeStamp}.pdf`;

        const ws = document.getElementById('workspace');
        const previewArea = document.querySelector('.preview-area');
        
        // Show preview area off-screen so html2canvas can capture it
        const originalPreviewDisplay = previewArea ? previewArea.style.display : '';
        const originalPreviewPosition = previewArea ? previewArea.style.position : '';
        const originalPreviewLeft = previewArea ? previewArea.style.left : '';
        if (previewArea) {
            previewArea.style.setProperty('display', 'flex', 'important');
            previewArea.style.position = 'fixed';
            previewArea.style.left = '-9999px';
            previewArea.style.top = '0';
        }

        // Temporarily remove scale transforms so html2canvas captures full A4 layout
        const originalTransform = ws.style.transform;
        const originalShadow = ws.style.boxShadow;
        ws.style.transform = 'none';
        ws.style.boxShadow = 'none';

        // FIX: html2canvas blurs "background-size: cover" CSS images and misaligns them
        // Calculate precise mathematical dimensions mirroring 'cover' logic in mm natively
        const bgImgNative = new Image();

        bgImgNative.onload = () => {
        const pageRatio = 210 / 297;
        const imgRatio = bgImgNative.naturalWidth / bgImgNative.naturalHeight;
        let drawW, drawH, drawX, drawY;

        if (imgRatio > pageRatio) {
            drawH = 297;
            drawW = (297 / bgImgNative.naturalHeight) * bgImgNative.naturalWidth;
            drawX = (210 - drawW) / 2;
            drawY = 0;
        } else {
            drawW = 210;
            drawH = (210 / bgImgNative.naturalWidth) * bgImgNative.naturalHeight;
            drawX = 0;
            drawY = (297 - drawH) / 2;
        }

        bgImgNative.style.position = 'absolute';
        bgImgNative.style.width = drawW + 'mm';
        bgImgNative.style.height = drawH + 'mm';
        bgImgNative.style.left = drawX + 'mm';
        bgImgNative.style.top = drawY + 'mm';
        bgImgNative.style.objectFit = 'fill';
        bgImgNative.style.zIndex = '0';
        bgImgNative.id = 'temp-bg-native';

        const originalBgLayer = document.querySelector('.bg-layer');
        const oldDisplay = originalBgLayer ? originalBgLayer.style.display : '';
        if (originalBgLayer) originalBgLayer.style.display = 'none';
        ws.prepend(bgImgNative);

        // Timeout ensures DOM repaints before capture
        setTimeout(() => {
            html2canvas(ws, {
                scale: 4, // 7x scale increases Sharpness dramatically and lands around ~5-8MB resulting JPEG size
                useCORS: true,
                allowTaint: true,
                backgroundColor: '#ffffff',
                logging: false,
                onclone: (clonedDoc) => {
                    const clonedWs = clonedDoc.getElementById('workspace');
                    if (clonedWs) {
                        clonedWs.style.transform = 'none';
                        clonedWs.style.boxShadow = 'none';
                    }

                    // Force exact 6.3pt (8.4px) on requested text elements inside the cloned capturing DOM!
                    const exactEls = clonedDoc.querySelectorAll('.inroltext, .hindi-name, .english-name, .dob-text, .gender-text, .address-hi-text, .address-en-text, .address-hi-label, .address-en-label');
                    exactEls.forEach(el => {
                        el.style.fontSize = '8.4px';
                    });
                }
            }).then(canvas => {
                // Restore UI immediately
                ws.style.transform = originalTransform;
                ws.style.boxShadow = originalShadow;
                if (originalBgLayer) originalBgLayer.style.display = oldDisplay;
                const tempBg = document.getElementById('temp-bg-native');
                if (tempBg) tempBg.remove();

                // Restore preview area state
                if (previewArea) {
                    previewArea.style.removeProperty('display');
                    previewArea.style.position = originalPreviewPosition;
                    previewArea.style.left = originalPreviewLeft;
                    previewArea.style.top = '';
                }

                // JPEG encoding at 1.0 provides the absolute maximum fidelity
                const imgData = canvas.toDataURL('image/jpeg', 1.0);
                const doc = new jsPDF('portrait', 'mm', 'a4');
                doc.addImage(imgData, 'JPEG', 0, 0, 210, 297);
                doc.save(fileName);
                resolve(fileName);

            }).catch(err => {
                console.error("PDF Generation Error:", err);
                ws.style.transform = originalTransform;
                ws.style.boxShadow = originalShadow;
                if (originalBgLayer) originalBgLayer.style.display = oldDisplay;
                const tempBg = document.getElementById('temp-bg-native');
                if (tempBg) tempBg.remove();

                if (previewArea) {
                    previewArea.style.removeProperty('display');
                    previewArea.style.position = originalPreviewPosition;
                    previewArea.style.left = originalPreviewLeft;
                    previewArea.style.top = '';
                }
                reject(err);
            });
        }, 150);
    };
    bgImgNative.src = EMBEDDED_BG;
    });
}