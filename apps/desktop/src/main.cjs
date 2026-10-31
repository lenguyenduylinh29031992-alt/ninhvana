'use strict';

const { app, BrowserWindow, ipcMain, Menu, shell, dialog } = require('electron');
const fs = require('node:fs');
const path = require('node:path');

const DEFAULT_URL = process.env.NINHVANA_URL || 'https://ninhvana-server.tail1116d8.ts.net/login';
const LEGACY_WORKER_URL = 'https://ninhvana.lenguyenduylinh29031992.workers.dev/login';
const LEGACY_HOSTS = new Set(['ninhvana.lenguyenduylinh29031992.workers.dev']);
const configPath = () => path.join(app.getPath('userData'), 'server.json');

function readServer() {
  try {
    const saved = JSON.parse(fs.readFileSync(configPath(), 'utf8'));
    if (saved && typeof saved.url === 'string' && /^https?:\/\//.test(saved.url)) {
      try {
        const host = new URL(saved.url).hostname;
        // Migrate the old personal workers.dev host before the login screen.
        if (LEGACY_HOSTS.has(host)) return DEFAULT_URL;
      } catch { /* keep saved URL for the setup screen to validate */ }
      return saved.url;
    }
  } catch {
    // first launch
  }
  return DEFAULT_URL;
}

async function probeServer(url) {
  try {
    const health = new URL('/api/v1/health', url).toString();
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 2500);
    const response = await fetch(health, { signal: controller.signal, redirect: 'follow' });
    clearTimeout(timer);
    return response.ok;
  } catch {
    return false;
  }
}

async function resolveServer() {
  const saved = readServer();
  const candidates = [...new Set([saved, DEFAULT_URL, LEGACY_WORKER_URL])];
  for (const candidate of candidates) {
    if (await probeServer(candidate)) {
      if (candidate !== saved) writeServer(candidate);
      return candidate;
    }
  }
  return saved;
}

function writeServer(url) {
  fs.mkdirSync(path.dirname(configPath()), { recursive: true });
  fs.writeFileSync(configPath(), JSON.stringify({ url }, null, 2));
}

let mainWindow;

function loadApp(url) {
  mainWindow.loadURL(url).catch(() => loadSetup('Không kết nối được máy chủ NinhVaNa.'));
}

function loadSetup(message) {
  mainWindow.loadFile(path.join(__dirname, 'setup.html'), { query: { message: message || '', url: readServer() } });
}

function createWindow() {
  mainWindow = new BrowserWindow({
    width: 1440,
    height: 920,
    minWidth: 1024,
    minHeight: 700,
    title: 'NinhVaNa',
    backgroundColor: '#faf7f2',
    icon: path.join(__dirname, '..', 'build', 'icon.png'),
    webPreferences: {
      preload: path.join(__dirname, 'preload.cjs'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
    },
  });

  mainWindow.webContents.setWindowOpenHandler(({ url }) => {
    if (/^https?:/.test(url)) shell.openExternal(url);
    return { action: 'deny' };
  });

  mainWindow.webContents.on('did-fail-load', (_event, code, description, url) => {
    if (url && url.startsWith('file:')) return;
    loadSetup(`Không kết nối được ${readServer()} (${description}).`);
  });

  void resolveServer().then((url) => loadApp(url));
  buildMenu();
}

function buildMenu() {
  const template = [
    {
      label: 'NinhVaNa',
      submenu: [
        { label: 'Tải lại', accelerator: 'CmdOrCtrl+R', click: () => mainWindow.webContents.reload() },
        { label: 'Đổi máy chủ…', click: () => loadSetup('') },
        { type: 'separator' },
        { role: 'quit', label: 'Thoát' },
      ],
    },
    { label: 'Sửa', submenu: [{ role: 'undo' }, { role: 'redo' }, { type: 'separator' }, { role: 'cut' }, { role: 'copy' }, { role: 'paste' }, { role: 'selectAll' }] },
    {
      label: 'Hiển thị',
      submenu: [
        { role: 'reload', label: 'Tải lại' },
        { role: 'toggleDevTools', label: 'Công cụ phát triển' },
        { type: 'separator' },
        { role: 'resetZoom' }, { role: 'zoomIn' }, { role: 'zoomOut' },
        { type: 'separator' },
        { role: 'togglefullscreen', label: 'Toàn màn hình' },
      ],
    },
    {
      label: 'Trợ giúp',
      submenu: [
        { label: 'Mở trong trình duyệt', click: () => shell.openExternal(readServer()) },
        { label: 'Thông tin NinhVaNa', click: () => dialog.showMessageBox({ type: 'info', title: 'NinhVaNa', message: 'NinhVaNa Hospitality', detail: 'Ứng dụng quản trị khách sạn & nhà hàng 5 sao.\nPhiên bản 0.1.0' }) },
      ],
    },
  ];
  Menu.setApplicationMenu(Menu.buildFromTemplate(template));
}

ipcMain.handle('server:get', () => readServer());
ipcMain.handle('server:set', (_event, raw) => {
  const url = String(raw || '').trim().replace(/\/$/, '');
  if (!/^https?:\/\/[^\s]+$/.test(url)) return { ok: false, error: 'Địa chỉ phải bắt đầu bằng http:// hoặc https://' };
  writeServer(url);
  loadApp(url);
  return { ok: true };
});
ipcMain.handle('server:default', () => DEFAULT_URL);

app.whenReady().then(() => {
  createWindow();
  app.on('activate', () => { if (BrowserWindow.getAllWindows().length === 0) createWindow(); });
});
app.on('window-all-closed', () => { if (process.platform !== 'darwin') app.quit(); });
