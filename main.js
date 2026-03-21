const { app, BrowserWindow, ipcMain, powerSaveBlocker } = require('electron');
const path = require('path');

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

  // Handle fullscreen toggle from renderer
  ipcMain.on('toggle-fullscreen', () => {
    const isFullScreen = mainWindow.isFullScreen();
    mainWindow.setFullScreen(!isFullScreen);
  });
}

app.whenReady().then(() => {
  // Prevent the display from sleeping while the app is open
  const id = powerSaveBlocker.start('prevent-display-sleep');
  console.log(`Power save blocker started with ID: ${id}`);

  createWindow();

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow();
  });
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit();
});
