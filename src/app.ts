// Everything that makes the simulator behave like an installed app:
// offline service worker + update prompt, install button, iOS hint, first-run disclaimer, about panel.
import MODELS from './view3d/models/models.json';
import { registerSW } from 'virtual:pwa-register';

const $ = (id: string) => document.getElementById(id)!;
const store = {
  get(k: string) { try { return localStorage.getItem(k); } catch { return null; } },
  set(k: string, v: string) { try { localStorage.setItem(k, v); } catch { /* private mode */ } },
};

let toastTimer = 0;
export function toast(text: string, action?: { label: string; run: () => void }, ms = 6000) {
  $('toast-text').textContent = text;
  const act = $('toast-act') as HTMLButtonElement;
  act.hidden = !action;
  if (action) { act.textContent = action.label; act.onclick = () => { $('toast').hidden = true; action.run(); }; }
  $('toast').hidden = false;
  clearTimeout(toastTimer);
  if (ms > 0) toastTimer = window.setTimeout(() => ($('toast').hidden = true), ms);
}
$('toast-x').onclick = () => ($('toast').hidden = true);

const isIOS = /iphone|ipad|ipod/i.test(navigator.userAgent) || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);
const standalone = matchMedia('(display-mode: standalone)').matches || (navigator as unknown as { standalone?: boolean }).standalone === true;

export function initApp(onGateClosed: () => void) {
  // first run: training-only disclaimer
  if (store.get('azb-gate') !== '1') {
    $('gate').hidden = false;
    $('gate-ok').onclick = () => { store.set('azb-gate', '1'); $('gate').hidden = true; onGateClosed(); afterGate(); };
  } else afterGate();

  if (__PWA__ && 'serviceWorker' in navigator && location.protocol !== 'file:') {
    const update = registerSW({
      onNeedRefresh() { toast('A new version is ready.', { label: 'RELOAD', run: () => update(true) }, 0); },
      onOfflineReady() { toast('Saved for offline use. It now works without internet.'); },
    });
  }

  // Chrome / Edge / Android: real install button
  let deferred: (Event & { prompt(): Promise<void>; userChoice: Promise<{ outcome: string }> }) | null = null;
  addEventListener('beforeinstallprompt', e => { e.preventDefault(); deferred = e as typeof deferred; $('b-install').hidden = false; });
  $('b-install').onclick = async () => {
    if (!deferred) return;
    await deferred.prompt();
    await deferred.userChoice;
    deferred = null; $('b-install').hidden = true;
  };
  addEventListener('appinstalled', () => { $('b-install').hidden = true; toast('Installed. Open Azipod Bridge from your home screen or app list.'); });
  renderAbout();
}

function afterGate() {
  // iPhone / iPad have no install prompt: tell people how, once
  if (__PWA__ && isIOS && !standalone && store.get('azb-ios-hint') !== '1') {
    setTimeout(() => toast('Install: tap Share, then “Add to Home Screen”.', { label: 'OK', run: () => store.set('azb-ios-hint', '1') }, 0), 1500);
  }
}

function renderAbout() {
  const repo = __REPO_URL__;
  const how = isIOS
    ? 'On iPhone or iPad: open this page in Safari, tap Share, then “Add to Home Screen”.'
    : 'In Chrome or Edge (Android, Windows, macOS, Linux, ChromeOS): tap INSTALL in the button row, or use the install icon in the address bar.';
  $('about').innerHTML = `
    <p><b>Install.</b> ${how} Once installed it opens in its own window and keeps working with no connection.${standalone ? ' <b>This copy is installed.</b>' : ''}</p>
    <p><b>No install at all.</b> <a href="azipod-bridge-offline.html" download>Download the offline copy</a>: one HTML file, about 5 MB, that opens in any browser with no internet. Handy for laptops on board.</p>
    <p><b>Feedback.</b> Report a problem or suggest a scenario on <a href="${repo}/issues" target="_blank" rel="noopener">GitHub</a>.</p>
    <p><b>Data</b> Chart: NOAA ENC (public domain). Buildings and roads © <a href="https://www.openstreetmap.org/copyright" target="_blank" rel="noopener">OpenStreetMap contributors</a>, ODbL. Ship models: 1:300 Carnival Spirit hobby model (3D Warehouse / iconic3dmodels); the other ships from Sketchfab under CC BY 4.0: ${Object.values(MODELS).filter(m => m.credit.license !== 'supplied').map(m => `“<a href="${m.credit.url}" target="_blank" rel="noopener">${m.credit.title}</a>” by ${m.credit.author}`).join(', ')}; ${Object.values(MODELS).filter(m => m.credit.license === 'supplied').map(m => `“${m.credit.title}” supplied by ${m.credit.author}`).join(', ')}.</p>
    <p><b>Version</b> ${__APP_VERSION__} · build ${__BUILD__}${__PWA__ ? '' : ' · offline single-file copy'}.</p>
    <p class="note">Training simulator, not for navigation. Ship data are fictional; the validation hull follows a published model-test programme.</p>`;
}

/** Remember display and predictor choices between sessions. */
export function persist<T extends object>(key: string, snapshot: () => T, apply: (v: Partial<T>) => void) {
  const raw = store.get(key);
  if (raw) { try { apply(JSON.parse(raw)); } catch { /* ignore */ } }
  let last = '';
  setInterval(() => { const s = JSON.stringify(snapshot()); if (s !== last) { last = s; store.set(key, s); } }, 2000);
}
