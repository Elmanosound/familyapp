import { app, BrowserWindow, Tray, Menu, nativeImage, shell, dialog } from 'electron';
import path from 'path';
import http from 'http';

// ── Constants ────────────────────────────────────────────────────────────────

const PORT     = parseInt(process.env.PORT || '5000', 10);
const APP_URL  = `http://localhost:${PORT}`;
const ICONS    = path.join(__dirname, '..', 'icons');
const ICON_PNG = path.join(ICONS, 'icon.png');

// ── State ────────────────────────────────────────────────────────────────────

let mainWindow:    BrowserWindow | null = null;
let loadingWindow: BrowserWindow | null = null;
let tray:          Tray          | null = null;

// Prevent 'window-all-closed' from quitting the app when closing to tray.
let isQuitting = false;

// ── Health check ─────────────────────────────────────────────────────────────

function checkHealth(): Promise<boolean> {
  return new Promise((resolve) => {
    http.get(`${APP_URL}/health`, (res) => {
      resolve(res.statusCode === 200);
    }).on('error', () => resolve(false));
  });
}

/**
 * Poll /health until the backend is up or we time out.
 * @returns true if ready, false if timed out
 */
async function waitForServer(maxRetries = 60, delayMs = 1000): Promise<boolean> {
  for (let i = 0; i < maxRetries; i++) {
    if (await checkHealth()) return true;
    await new Promise<void>((r) => setTimeout(r, delayMs));
  }
  return false;
}

// ── Windows ───────────────────────────────────────────────────────────────────

function createLoadingWindow(): BrowserWindow {
  const win = new BrowserWindow({
    width:           460,
    height:          280,
    resizable:       false,
    frame:           false,
    center:          true,
    icon:            ICON_PNG,
    backgroundColor: '#f9fafb',
    webPreferences: { nodeIntegration: false, contextIsolation: true },
  });

  win.loadFile(path.join(__dirname, '..', 'loading.html'));
  return win;
}

function createMainWindow(): BrowserWindow {
  const win = new BrowserWindow({
    width:          1280,
    height:         820,
    minWidth:       900,
    minHeight:      600,
    title:          'FamilyApp',
    icon:           ICON_PNG,
    autoHideMenuBar: true,
    webPreferences: {
      nodeIntegration:  false,
      contextIsolation: true,
      preload:          path.join(__dirname, 'preload.js'),
    },
  });

  win.loadURL(APP_URL);

  // External links open in the default browser, not inside Electron.
  win.webContents.setWindowOpenHandler(({ url }) => {
    shell.openExternal(url);
    return { action: 'deny' };
  });

  // "Close" hides to tray instead of destroying the window.
  win.on('close', (e) => {
    if (!isQuitting) {
      e.preventDefault();
      win.hide();
    }
  });

  return win;
}

// ── System tray ───────────────────────────────────────────────────────────────

function createTray(): void {
  // Use a small 22×22 tray icon if available, otherwise fall back to the
  // full-size icon (Electron will resize automatically).
  const trayIconPath = path.join(ICONS, 'tray.png');
  const icon = nativeImage.createFromPath(trayIconPath);

  tray = new Tray(icon.isEmpty() ? nativeImage.createFromPath(ICON_PNG) : icon);
  tray.setToolTip('FamilyApp');

  const menu = Menu.buildFromTemplate([
    {
      label: 'Ouvrir FamilyApp',
      click: () => { mainWindow?.show(); mainWindow?.focus(); },
    },
    {
      label: 'Ouvrir dans le navigateur',
      click: () => shell.openExternal(APP_URL),
    },
    { type: 'separator' },
    {
      label: 'Quitter',
      click: () => { isQuitting = true; app.quit(); },
    },
  ]);

  tray.setContextMenu(menu);

  tray.on('click', () => {
    if (mainWindow?.isVisible()) {
      mainWindow.focus();
    } else {
      mainWindow?.show();
    }
  });
}

// ── App lifecycle ─────────────────────────────────────────────────────────────

// Single-instance lock: prevent multiple windows if the user double-clicks.
const gotLock = app.requestSingleInstanceLock();
if (!gotLock) {
  app.quit();
} else {
  app.on('second-instance', () => {
    mainWindow?.show();
    mainWindow?.focus();
  });
}

app.whenReady().then(async () => {
  loadingWindow = createLoadingWindow();

  const ready = await waitForServer();

  loadingWindow.close();
  loadingWindow = null;

  if (!ready) {
    dialog.showErrorBox(
      'FamilyApp — Service introuvable',
      `Le service FamilyApp ne répond pas sur le port ${PORT}.\n\n` +
      'Assurez-vous qu\'il est démarré :\n' +
      '  sudo systemctl start familyapp\n\n' +
      'Consultez les logs avec :\n' +
      '  sudo journalctl -u familyapp -n 50',
    );
    app.quit();
    return;
  }

  mainWindow = createMainWindow();
  createTray();
});

// Keep the app running in the tray even when all windows are closed.
app.on('window-all-closed', () => {
  if (process.platform === 'darwin') app.quit();
});

app.on('activate', () => {
  // macOS: re-create window when clicking the dock icon.
  if (mainWindow) {
    mainWindow.show();
  }
});

app.on('before-quit', () => {
  isQuitting = true;
});
