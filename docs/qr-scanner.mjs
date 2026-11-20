import { locale, t } from './i18n.mjs';

const cameraHint = 'Наведите камеру на QR-код на экране Попова.';
const systemCameraHint = 'Откройте приложение «Камера» на телефоне и наведите его на QR-код на экране Попова.';
const wrongCode = 'Этот QR-код не ведёт к чату Попова. Попробуйте код с проектора.';

export function projectorQr(value) {
  let url;
  try { url = new URL(value.trim()); }
  catch { return null; }
  if (!['https:', 'http:'].includes(url.protocol) || url.username || url.password || url.search
      || url.pathname !== '/popov.html' || !/^#join=\d{1,12}\.[a-f0-9]{64}$/.test(url.hash)) return null;
  return url;
}

let showScanner;
export function openQrScanner() {
  showScanner ??= bindScanner(document.getElementById('qr-scanner'));
  showScanner();
}

function bindScanner(dialog) {
  const $ = selector => dialog.querySelector(selector);
  const status = $('.qr-status');
  const preview = $('.qr-preview');
  const video = $('video');
  const camera = $('.qr-camera');
  const link = $('.qr-open');
  const canvas = document.createElement('canvas');
  const context = canvas.getContext('2d', {willReadFrequently: true});
  const canUseCamera = Boolean(window.isSecureContext && navigator.mediaDevices?.getUserMedia);
  let cameraActive = false;
  let generation = 0;
  let timer;

  function setStatus(text) {
    const translated = t(text);
    if (status.textContent !== translated) status.textContent = translated;
  }

  function stopWork() {
    generation++;
    cameraActive = false;
    clearTimeout(timer);
    video.srcObject?.getTracks().forEach(track => track.stop());
    video.srcObject = null;
    preview.hidden = true;
  }

  function resetActions() {
    link.hidden = true;
    link.removeAttribute('href');
    camera.hidden = true;
  }

  function decodeFrame(readQr) {
    const scale = Math.min(1, 640 / Math.max(video.videoWidth, video.videoHeight));
    const w = Math.max(1, Math.round(video.videoWidth * scale));
    const h = Math.max(1, Math.round(video.videoHeight * scale));
    if (canvas.width !== w) canvas.width = w;
    if (canvas.height !== h) canvas.height = h;
    context.drawImage(video, 0, 0, w, h);
    return readQr(context.getImageData(0, 0, w, h).data, w, h, {inversionAttempts: 'dontInvert'})?.data;
  }

  function acceptCode(text) {
    const url = projectorQr(text);
    if (!url) {
      setStatus(wrongCode);
      return false;
    }
    stopWork();
    if (url.origin === location.origin) {
      location.assign(url.href);
    } else {
      setStatus(t('QR-код распознан. Адрес проектора — {host}', {host:url.host}));
      const fragment = new URLSearchParams(url.hash.slice(1));
      fragment.set('lang', locale());
      url.hash = fragment.toString();
      link.href = url.href;
      link.hidden = false;
      link.focus();
    }
    return true;
  }

  function cameraFailed() {
    stopWork();
    camera.hidden = false;
    setStatus('Не удалось открыть камеру. Проверьте доступ в настройках браузера или отсканируйте QR-код приложением «Камера».');
  }

  async function startCamera() {
    stopWork();
    resetActions();
    const current = generation;
    cameraActive = true;
    setStatus('Подключаем камеру…');
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        video: {facingMode: {ideal: 'environment'}, width: {ideal: 960}},
        audio: false,
      });
      if (!dialog.open || current !== generation || document.hidden) {
        stream.getTracks().forEach(track => track.stop());
        return;
      }
      video.srcObject = stream;
      preview.hidden = false;
      const {default: readQr} = await import('./vendor/jsqr-1.4.0.mjs');
      if (!dialog.open || current !== generation) return;
      await video.play();
      if (!dialog.open || current !== generation) return;
      setStatus(cameraHint);
      function scanFrame() {
        if (!dialog.open || current !== generation || document.hidden) return;
        try {
          if (video.videoWidth && video.readyState >= HTMLMediaElement.HAVE_CURRENT_DATA) {
            const code = decodeFrame(readQr);
            if (code && acceptCode(code)) return;
          }
        } catch {
          cameraFailed();
          return;
        }
        timer = setTimeout(scanFrame, 160);
      }
      scanFrame();
    } catch {
      if (dialog.open && current === generation) cameraFailed();
    }
  }

  camera.addEventListener('click', startCamera);
  dialog.addEventListener('close', () => {
    if (!dialog.open) stopWork();
  });
  window.addEventListener('pagehide', () => {
    stopWork();
    if (dialog.open) dialog.close();
  });
  window.addEventListener('hashchange', () => { if (dialog.open) dialog.close(); });
  document.addEventListener('visibilitychange', () => {
    if (!document.hidden || !cameraActive) return;
    stopWork();
    camera.hidden = false;
    setStatus('Камера приостановлена. Включите её, чтобы продолжить сканирование.');
  });

  return () => {
    if (dialog.open) return;
    dialog.showModal();
    if (canUseCamera) void startCamera();
    else setStatus(systemCameraHint);
  };
}
