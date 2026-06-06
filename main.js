const { app, BrowserWindow, ipcMain, powerSaveBlocker } = require('electron');
const path = require('path');
const { autoUpdater } = require('electron-updater');

// Configure autoUpdater
autoUpdater.autoDownload = false;
autoUpdater.autoInstallOnAppQuit = true;

let mainWindow;

function createWindow() {
  mainWindow = new BrowserWindow({
    width: 1280,
    height: 720,
    backgroundColor: '#000000',
    autoHideMenuBar: true,
    webPreferences: {
      nodeIntegration: true,
      contextIsolation: false
    }
  });

  mainWindow.setMenuBarVisibility(false);
  mainWindow.loadFile('index.html');

  // Auto-updater events
  autoUpdater.on('checking-for-update', () => {
    mainWindow.webContents.send('update-status', 'checking');
  });

  autoUpdater.on('update-available', (info) => {
    mainWindow.webContents.send('update-status', 'available', info);
  });

  autoUpdater.on('update-not-available', () => {
    mainWindow.webContents.send('update-status', 'not-available');
  });

  autoUpdater.on('error', (err) => {
    mainWindow.webContents.send('update-status', 'error', err.message);
  });

  autoUpdater.on('download-progress', (progressObj) => {
    mainWindow.webContents.send('update-status', 'downloading', progressObj.percent);
  });

  autoUpdater.on('update-downloaded', () => {
    mainWindow.webContents.send('update-status', 'downloaded');
  });

  // Handle fullscreen toggle from renderer
  ipcMain.on('toggle-fullscreen', () => {
    const isFullScreen = mainWindow.isFullScreen();
    mainWindow.setFullScreen(!isFullScreen);
  });

  ipcMain.on('exit-fullscreen', () => {
    mainWindow.setFullScreen(false);
  });

  // Handle manual update check
  ipcMain.on('check-for-update', () => {
    autoUpdater.checkForUpdatesAndNotify();
  });

  // Handle download and install
  ipcMain.on('download-update', () => {
    autoUpdater.downloadUpdate();
  });

  ipcMain.on('install-update', () => {
    autoUpdater.quitAndInstall();
  });
}

app.whenReady().then(() => {
  // Prevent the display from sleeping while the app is open
  const id = powerSaveBlocker.start('prevent-display-sleep');
  console.log(`Power save blocker started with ID: ${id}`);

  createWindow();

  // Check for updates on startup
  setTimeout(() => {
    autoUpdater.checkForUpdatesAndNotify();
  }, 3000);

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow();
  });
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit();
});
