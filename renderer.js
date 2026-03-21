const { ipcRenderer } = require('electron');

const videoElement = document.getElementById('stream-video');
const videoSelect = document.getElementById('video-source');
const audioSelect = document.getElementById('audio-source');
const delaySlider = document.getElementById('audio-delay');
const delayValText = document.getElementById('delay-val');
const startBtn = document.getElementById('start-btn');
const fullscreenBtn = document.getElementById('fullscreen-btn');
const uiOverlay = document.getElementById('ui-overlay');

// State
let currentVideoStream = null;
let currentAudioStream = null;
let idleTimer = null;
let isPlaying = false;
let audioCtx = null;
let audioSourceNode = null;
let audioDelayNode = null;

// Initialize
async function init() {
    try {
        // Load saved delay settings
        const savedDelay = localStorage.getItem('camlinkAudioDelay');
        if (savedDelay !== null) {
            delaySlider.value = savedDelay;
            delayValText.textContent = `${savedDelay} ms`;
        }

        // Request initial permissions to enumerate devices properly
        await navigator.mediaDevices.getUserMedia({ video: true, audio: true }).then(stream => {
            stream.getTracks().forEach(track => track.stop());
        }).catch(err => console.warn('Permission request failed or no devices:', err));

        await getDevices();
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
        videoSelect.appendChild(new Option('Sélectionner une source vidéo...', ''));
        audioSelect.appendChild(new Option('Sans audio', 'none'));

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
        alert("Veuillez sélectionner une source vidéo.");
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

            audioSourceNode.connect(audioDelayNode);
            audioDelayNode.connect(audioCtx.destination);
        }
        
        startBtn.textContent = 'En cours...';
        startBtn.classList.add('playing');
        isPlaying = true;
        
        // Start idle hide logic
        resetIdleTimer();

    } catch (err) {
        console.error('Error starting stream:', err);
        alert("Erreur lors du démarrage du flux: " + err.message);
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

// Mouse movement resets the timer
document.addEventListener('mousemove', resetIdleTimer);
document.addEventListener('mousedown', resetIdleTimer);
document.addEventListener('keydown', resetIdleTimer);

// Boot
init();
