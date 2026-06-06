const { ipcRenderer } = require('electron');
const translations = require('./translations');

const videoElement = document.getElementById('stream-video');
const videoSelect = document.getElementById('video-source');
const audioSelect = document.getElementById('audio-source');
const delaySlider = document.getElementById('audio-delay');
const delayValText = document.getElementById('delay-val');
const startBtn = document.getElementById('start-btn');
const fullscreenBtn = document.getElementById('fullscreen-btn');
const uiOverlay = document.getElementById('ui-overlay');
const mainPanel = document.getElementById('main-panel');
const toggleUiBtn = document.getElementById('toggle-ui-btn');
const languageSelect = document.getElementById('language-select');
const volumeSlider = document.getElementById('volume-control');
const volumeValText = document.getElementById('volume-val');
const muteCheckbox = document.getElementById('mute-control');
const updateBtn = document.getElementById('update-btn');
const updateNotification = document.getElementById('update-notification');
const updateMessage = document.getElementById('update-message');
const updateActionBtn = document.getElementById('update-action-btn');

// State
let currentLang = 'fr';
let currentVideoStream = null;
let currentAudioStream = null;
let idleTimer = null;
let isPlaying = false;
let audioCtx = null;
let audioSourceNode = null;
let audioDelayNode = null;
let gainNode = null;
let isMuted = false;

// Initialize
async function init() {
    try {
        // 1. Load i18n state first so translations are correct during device enumeration
        const savedLang = localStorage.getItem('camlinkLanguage');
        if (savedLang && (savedLang === 'en' || savedLang === 'fr')) {
            currentLang = savedLang;
        } else {
            // Auto-detect system language
            const systemLang = navigator.language.split('-')[0];
            if (systemLang === 'en' || systemLang === 'fr') {
                currentLang = systemLang;
            }
        }
        languageSelect.value = currentLang;

        // 2. Load saved delay settings
        const savedDelay = localStorage.getItem('camlinkAudioDelay');
        if (savedDelay !== null) {
            delaySlider.value = savedDelay;
            delayValText.textContent = `${savedDelay} ms`;
        }

        // 3. Load volume settings
        const savedVolume = localStorage.getItem('camlinkVolume');
        if (savedVolume !== null) {
            volumeSlider.value = savedVolume;
            volumeValText.textContent = `${savedVolume}%`;
        }

        const savedMute = localStorage.getItem('camlinkMuted') === 'true';
        isMuted = savedMute;
        muteCheckbox.checked = isMuted;

        // 4. Load UI state (minimized or not)
        const isMinimized = localStorage.getItem('camlinkUiMinimized') === 'true';
        if (isMinimized) {
            mainPanel.classList.add('minimized');
        }

        // 5. Request initial permissions to enumerate devices properly
        await navigator.mediaDevices.getUserMedia({ video: true, audio: true }).then(stream => {
            stream.getTracks().forEach(track => track.stop());
        }).catch(err => console.warn('Permission request failed or no devices:', err));

        // 6. Get available video/audio devices (loads saved devices or auto-selects capture card)
        await getDevices();

        // 7. Update UI elements with translation (skipping redundant device enumeration)
        updateUI(false);

        // 8. Auto-start stream if a video device is selected
        if (videoSelect.value) {
            startStream();
        }
    } catch (err) {
        console.error('Error initializing devices:', err);
    }
}

// Get available video and audio devices
async function getDevices() {
    try {
        const deviceInfos = await navigator.mediaDevices.enumerateDevices();
        
        videoSelect.innerHTML = '';
        audioSelect.innerHTML = '';
        
        // Add default options
        const t = translations[currentLang];
        videoSelect.appendChild(new Option(t.selectVideo, ''));
        audioSelect.appendChild(new Option(t.selectAudio, 'none'));

        let videoCount = 1;
        let audioCount = 1;

        deviceInfos.forEach(deviceInfo => {
            const option = document.createElement('option');
            option.value = deviceInfo.deviceId;
            
            if (deviceInfo.kind === 'videoinput') {
                option.text = deviceInfo.label || `Camera ${videoCount++}`;
                videoSelect.appendChild(option);
            } else if (deviceInfo.kind === 'audioinput') {
                option.text = deviceInfo.label || `Microphone ${audioCount++}`;
                audioSelect.appendChild(option);
            }
        });
        
        // Try to auto-select likely capture cards
        autoSelectCaptureCard();
        
        // Override with saved preferences if they exist and are still connected
        const savedVideoId = localStorage.getItem('camlinkVideoId');
        const savedAudioId = localStorage.getItem('camlinkAudioId');
        
        if (savedVideoId && Array.from(videoSelect.options).some(opt => opt.value === savedVideoId)) {
            videoSelect.value = savedVideoId;
        }
        
        if (savedAudioId && Array.from(audioSelect.options).some(opt => opt.value === savedAudioId)) {
            audioSelect.value = savedAudioId;
        }
        
    } catch (err) {
        console.error('Error getting devices:', err);
    }
}

function autoSelectCaptureCard() {
    const captureKeywords = ['cam link', 'usb video', 'capture', 'ms2109', 'fhd'];
    
    // Auto-select video
    for (const option of videoSelect.options) {
        if (captureKeywords.some(kw => option.text.toLowerCase().includes(kw))) {
            videoSelect.value = option.value;
            break;
        }
    }
    
    // Auto-select audio
    for (const option of audioSelect.options) {
        if (captureKeywords.some(kw => option.text.toLowerCase().includes(kw))) {
            audioSelect.value = option.value;
            break;
        }
    }
}

// Start Stream
async function startStream() {
    const videoSource = videoSelect.value;
    const audioSource = audioSelect.value;

    if (!videoSource) {
        const t = translations[currentLang];
        alert(t.errorVideo);
        return;
    }

    // Save preferences
    localStorage.setItem('camlinkVideoId', videoSource);
    localStorage.setItem('camlinkAudioId', audioSource);

    // Stop current stream if playing
    if (currentVideoStream) {
        currentVideoStream.getTracks().forEach(track => track.stop());
    }
    if (currentAudioStream) {
        currentAudioStream.getTracks().forEach(track => track.stop());
    }

    const videoConstraints = {
        video: { 
            deviceId: videoSource ? { exact: videoSource } : undefined,
            width: { ideal: 1920 },
            height: { ideal: 1080 },
            frameRate: { ideal: 60, max: 60 }
        }
    };

    let audioConstraints = false;
    if (audioSource !== 'none') {
        audioConstraints = {
            audio: {
                deviceId: audioSource ? { exact: audioSource } : undefined,
                echoCancellation: false,
                noiseSuppression: false,
                autoGainControl: false,
                latency: 0,
                channelCount: 2,
                sampleRate: 48000
            }
        };
    }

    try {
        currentVideoStream = await navigator.mediaDevices.getUserMedia(videoConstraints);
        videoElement.srcObject = currentVideoStream;
        
        // Handle audio via Web Audio API for zero latency
        videoElement.muted = true; // Video element strictly plays video to avoid A/V sync buffer delays
        
        if (audioConstraints) {
            // Request audio separately to prevent Chromium from forcing A/V sync that often breaks with capture cards
            currentAudioStream = await navigator.mediaDevices.getUserMedia(audioConstraints);

            if (!audioCtx) {
                audioCtx = new (window.AudioContext || window.webkitAudioContext)({ latencyHint: 0 });
            }
            if (audioCtx.state === 'suspended') {
                await audioCtx.resume();
            }
            if (audioSourceNode) {
                audioSourceNode.disconnect();
            }
            if (audioDelayNode) {
                audioDelayNode.disconnect();
            }
            
            // Re-route audio
            audioSourceNode = audioCtx.createMediaStreamSource(currentAudioStream);
            
            // Add a slight delay to the audio to match the video processing time of the capture card
            // Capture cards typically have 50-100ms of video processing latency
            audioDelayNode = audioCtx.createDelay(1.0);
            audioDelayNode.delayTime.value = parseInt(delaySlider.value) / 1000.0;

            gainNode = audioCtx.createGain();
            gainNode.gain.value = isMuted ? 0 : parseInt(volumeSlider.value) / 100.0;

            audioSourceNode.connect(audioDelayNode);
            audioDelayNode.connect(gainNode);
            gainNode.connect(audioCtx.destination);
        }
        
        const t = translations[currentLang];
        startBtn.textContent = t.playing;
        startBtn.classList.add('playing');
        isPlaying = true;
        
        // Start idle hide logic
        resetIdleTimer();

    } catch (err) {
        const t = translations[currentLang];
        console.error('Error starting stream:', err);
        
        if (err.name === 'NotAllowedError' || err.message.toLowerCase().includes('permission denied')) {
            alert(t.errorPermission);
        } else {
            alert(t.errorStream + err.message);
        }
    }
}

// Fullscreen toggle via IPC
fullscreenBtn.addEventListener('click', () => {
    ipcRenderer.send('toggle-fullscreen');
});

// Double click to toggle fullscreen
document.addEventListener('dblclick', () => {
    ipcRenderer.send('toggle-fullscreen');
});

startBtn.addEventListener('click', startStream);

// Handle UI toggle (collapse/expand)
toggleUiBtn.addEventListener('click', (e) => {
    e.stopPropagation(); // Prevent dblclick or other events from firing
    const isMinimized = mainPanel.classList.toggle('minimized');
    localStorage.setItem('camlinkUiMinimized', isMinimized);
});

// Handle clicking on the minimized panel to expand it
mainPanel.addEventListener('click', () => {
    if (mainPanel.classList.contains('minimized')) {
        mainPanel.classList.remove('minimized');
        localStorage.setItem('camlinkUiMinimized', false);
    }
});

// Handle language change
languageSelect.addEventListener('change', (e) => {
    currentLang = e.target.value;
    localStorage.setItem('camlinkLanguage', currentLang);
    updateUI();
});

// Update logic listeners
updateBtn.addEventListener('click', () => {
    ipcRenderer.send('check-for-update');
});

ipcRenderer.on('update-status', (event, status, info) => {
    const t = translations[currentLang];
    
    switch (status) {
        case 'checking':
            updateBtn.disabled = true;
            updateBtn.textContent = t.loading;
            break;
            
        case 'available':
            updateBtn.classList.add('hidden');
            updateNotification.classList.remove('hidden');
            updateMessage.textContent = t.updateAvailable;
            updateActionBtn.textContent = t.download;
            updateActionBtn.onclick = () => {
                ipcRenderer.send('download-update');
                updateActionBtn.disabled = true;
            };
            break;
            
        case 'not-available':
            updateBtn.disabled = false;
            updateBtn.textContent = t.noUpdate;
            setTimeout(() => {
                updateBtn.textContent = t.updateCheck;
            }, 3000);
            break;
            
        case 'downloading':
            updateMessage.textContent = `${t.updateDownloading}${Math.round(info)}%`;
            updateActionBtn.classList.add('hidden');
            break;
            
        case 'downloaded':
            updateMessage.textContent = t.updateDownloaded;
            updateActionBtn.classList.remove('hidden');
            updateActionBtn.disabled = false;
            updateActionBtn.textContent = t.install;
            updateActionBtn.onclick = () => {
                ipcRenderer.send('install-update');
            };
            break;
            
        case 'error':
            updateBtn.classList.remove('hidden');
            updateBtn.disabled = false;
            updateBtn.textContent = t.updateError;
            console.error('Update error:', info);
            setTimeout(() => {
                updateBtn.textContent = t.updateCheck;
            }, 5000);
            break;
    }
});

function updateUI(refreshDevices = true) {
    const t = translations[currentLang];
    
    // Update elements with data-i18n
    document.querySelectorAll('[data-i18n]').forEach(el => {
        const key = el.getAttribute('data-i18n');
        if (t[key]) {
            el.textContent = t[key];
        }
    });

    // Update elements with data-i18n-title
    document.querySelectorAll('[data-i18n-title]').forEach(el => {
        const key = el.getAttribute('data-i18n-title');
        if (t[key]) {
            el.title = t[key];
        }
    });

    // Update dynamic button text
    if (isPlaying) {
        startBtn.textContent = t.playing;
    } else {
        startBtn.textContent = t.start;
    }

    // Refresh device lists to update "Select..." labels
    if (refreshDevices) {
        getDevices();
    }
}

// Handle delay slider
delaySlider.addEventListener('input', (event) => {
    const ms = event.target.value;
    delayValText.textContent = `${ms} ms`;
    localStorage.setItem('camlinkAudioDelay', ms);
    
    // Update live if running
    if (audioDelayNode && audioCtx) {
        audioDelayNode.delayTime.value = parseInt(ms) / 1000.0;
    }
});

// Handle volume slider
volumeSlider.addEventListener('input', (event) => {
    const val = event.target.value;
    volumeValText.textContent = `${val}%`;
    localStorage.setItem('camlinkVolume', val);
    
    if (gainNode && !isMuted) {
        gainNode.gain.value = parseInt(val) / 100.0;
    }
});

// Handle mute checkbox
muteCheckbox.addEventListener('change', (event) => {
    toggleMute(event.target.checked);
});

// Listen for device changes
navigator.mediaDevices.addEventListener('devicechange', getDevices);

// Idle logic to hide UI and cursor
function hideUI() {
    if (isPlaying) {
        uiOverlay.classList.remove('visible');
        uiOverlay.classList.add('hidden');
        document.body.classList.add('hide-cursor');
    }
}

function showUI() {
    uiOverlay.classList.remove('hidden');
    uiOverlay.classList.add('visible');
    document.body.classList.remove('hide-cursor');
}

function resetIdleTimer() {
    showUI();
    clearTimeout(idleTimer);
    if (isPlaying) {
        idleTimer = setTimeout(hideUI, 3000); // Hide after 3 seconds of inactivity
    }
}

function handleKeyDown(e) {
    // Ignore shortcuts if focusing on something (though we don't have text inputs currently)
    if (e.target.tagName === 'INPUT' && e.target.type !== 'range') return;

    switch (e.key.toLowerCase()) {
        case 'f':
            ipcRenderer.send('toggle-fullscreen');
            break;
        case 'escape':
            ipcRenderer.send('exit-fullscreen');
            break;
        case 'm':
            toggleMute();
            break;
        case 's':
            takeScreenshot();
            break;
        case '+':
        case '=':
            adjustVolume(5);
            break;
        case '-':
        case '_':
            adjustVolume(-5);
            break;
    }
}

function adjustVolume(delta) {
    let newVal = parseInt(volumeSlider.value) + delta;
    newVal = Math.max(0, Math.min(100, newVal));
    volumeSlider.value = newVal;
    volumeValText.textContent = `${newVal}%`;
    localStorage.setItem('camlinkVolume', newVal);
    
    if (gainNode && !isMuted) {
        gainNode.gain.value = newVal / 100.0;
    }
    
    resetIdleTimer();
}

function toggleMute(forceState = null) {
    isMuted = forceState !== null ? forceState : !isMuted;
    muteCheckbox.checked = isMuted;
    localStorage.setItem('camlinkMuted', isMuted);
    
    if (audioCtx && gainNode) {
        if (isMuted) {
            gainNode.gain.value = 0;
        } else {
            gainNode.gain.value = parseInt(volumeSlider.value) / 100.0;
        }
    }
    
    resetIdleTimer();
}

function takeScreenshot() {
    if (!isPlaying) return;

    try {
        const canvas = document.createElement('canvas');
        canvas.width = videoElement.videoWidth;
        canvas.height = videoElement.videoHeight;
        const ctx = canvas.getContext('2d');
        ctx.drawImage(videoElement, 0, 0, canvas.width, canvas.height);
        
        const timestamp = new Date().toISOString().replace(/[:.]/g, '-').split('T')[0];
        const time = new Date().toLocaleTimeString('fr-FR').replace(/[:]/g, '-');
        const filename = `CamLink-Capture-${timestamp}-${time}.png`;
        
        const link = document.createElement('a');
        link.download = filename;
        link.href = canvas.toDataURL('image/png');
        link.click();
        
        console.log('Screenshot taken:', filename);
    } catch (err) {
        console.error('Failed to take screenshot:', err);
    }
}

// Mouse movement resets the timer
document.addEventListener('mousemove', resetIdleTimer);
document.addEventListener('mousedown', resetIdleTimer);
document.addEventListener('keydown', (e) => {
    resetIdleTimer();
    handleKeyDown(e);
});

// Boot
init();
