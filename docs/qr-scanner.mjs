import { locale, t } from './i18n.mjs';

const cameraHint = 'Наведите камеру на QR-код на экране Попова.';
const photoHint = 'Сфотографируйте QR-код на экране Попова или выберите его фото.';
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
  const capture = $('.qr-capture');
  const captureInput = $('.qr-capture-input');
  const photoInput = $('.qr-photo-input');
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
    camera.hidden = !canUseCamera;
    capture.hidden = canUseCamera;
  }

  function decode(readQr, image, width, height, maxSide, inversionAttempts) {
    const scale = Math.min(1, maxSide / Math.max(width, height));
    const w = Math.max(1, Math.round(width * scale));
    const h = Math.max(1, Math.round(height * scale));
    if (canvas.width !== w) canvas.width = w;
    if (canvas.height !== h) canvas.height = h;
    context.drawImage(image, 0, 0, w, h);
    return readQr(context.getImageData(0, 0, w, h).data, w, h, {inversionAttempts})?.data;
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
      resetActions();
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
    resetActions();
    capture.hidden = false;
    setStatus('Камера недоступна. Сфотографируйте QR-код или выберите его фото.');
  }

  async function startCamera() {
    stopWork();
    resetActions();
    const current = generation;
    cameraActive = true;
    camera.hidden = true;
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
            const code = decode(readQr, video, video.videoWidth, video.videoHeight, 640, 'dontInvert');
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

  function selectFile(input) {
    stopWork();
    resetActions();
    setStatus(photoHint);
    input.click();
  }

  async function scanFile(event) {
    const input = event.currentTarget;
    const photo = input.files?.[0];
    input.value = '';
    if (!photo || !dialog.open) return;
    stopWork();
    resetActions();
    const current = generation;
    setStatus('Ищем QR-код на фото…');
    const photoUrl = URL.createObjectURL(photo);
    try {
      const image = new Image();
      image.src = photoUrl;
      const [{default: readQr}] = await Promise.all([import('./vendor/jsqr-1.4.0.mjs'), image.decode()]);
      if (!dialog.open || current !== generation) return;
      const code = decode(readQr, image, image.naturalWidth, image.naturalHeight, 1600, 'attemptBoth');
      if (code) acceptCode(code);
      else setStatus('На фото не найден QR-код. Попробуйте приблизить код и сделать снимок ещё раз.');
    } catch {
      if (dialog.open && current === generation) setStatus('Не удалось прочитать фото. Попробуйте другой снимок.');
    } finally {
      URL.revokeObjectURL(photoUrl);
    }
  }

  camera.addEventListener('click', startCamera);
  capture.addEventListener('click', () => selectFile(captureInput));
  $('.qr-photo').addEventListener('click', () => selectFile(photoInput));
  captureInput.addEventListener('change', scanFile);
  photoInput.addEventListener('change', scanFile);
  dialog.addEventListener('close', stopWork);
  window.addEventListener('pagehide', stopWork);
  window.addEventListener('hashchange', () => { if (dialog.open) dialog.close(); });
  document.addEventListener('visibilitychange', () => {
    if (!document.hidden || !cameraActive) return;
    stopWork();
    resetActions();
    setStatus(photoHint);
  });

  return () => {
    if (dialog.open) return;
    stopWork();
    resetActions();
    setStatus(canUseCamera ? cameraHint : photoHint);
    dialog.showModal();
    if (canUseCamera) void startCamera();
  };
}
