# CamLink Player 🎮

A low-latency video player designed for game capture devices (Elgato Cam Link, USB Video Capture Cards, etc.). Play your PS5, Nintendo Switch, or Xbox directly on your PC screen with minimal lag and synced audio.

## Features

- **Low Latency**: Optimized for real-time gaming.
- **Audio Sync**: Manual audio delay adjustment to match video processing time.
- **Auto-Detect**: Automatically finds your capture card.
- **Fullscreen**: Immersive gaming experience.
- **Auto-Hide UI**: Controls disappear during gameplay.

## How to use

1. Connect your capture card to your PC.
2. Launch **CamLink Player**.
3. Select your Video and Audio sources.
4. Adjust the **Audio Delay** if the sound is slightly ahead of the video (usually 50-100ms).
5. Click **Démarrer** and go Fullscreen (`F` or double-click).

## Development

To run from source:

```bash
npm install
npm start
```

To build the installer:

```bash
npm run build
```

## Built With

- [Electron](https://www.electronjs.org/)
- WebRTC / MediaDevices API
- Web Audio API (for zero-latency processing)
