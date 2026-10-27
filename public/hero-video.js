(function () {
  const video = document.getElementById('heroVideo');
  if (!video) return;

  video.muted = true;
  video.loop = true;
  video.playsInline = true;
  video.disablePictureInPicture = true;
  video.disableRemotePlayback = true;
  video.controls = false;

  function playVideo() {
    const result = video.play();
    if (result && typeof result.catch === 'function') {
      result.catch(function () {});
    }
  }

  function restartVideo() {
    try {
      video.currentTime = 0;
    } catch (err) {}
    playVideo();
  }

  function blockContextMenu(event) {
    event.preventDefault();
  }

  video.addEventListener('contextmenu', blockContextMenu);
  const frame = video.closest('.hero-video-frame');
  if (frame) frame.addEventListener('contextmenu', blockContextMenu);

  video.addEventListener('loadeddata', playVideo);
  video.addEventListener('canplay', playVideo);
  video.addEventListener('stalled', playVideo);
  video.addEventListener('pause', function () {
    if (!document.hidden) playVideo();
  });
  video.addEventListener('ended', restartVideo);
  video.addEventListener('error', function () {
    video.load();
    playVideo();
  });

  document.addEventListener('visibilitychange', function () {
    if (!document.hidden) playVideo();
  });

  function unlockVideo() {
    playVideo();
    document.removeEventListener('pointerdown', unlockVideo);
    document.removeEventListener('touchstart', unlockVideo);
    document.removeEventListener('keydown', unlockVideo);
  }

  document.addEventListener('pointerdown', unlockVideo, { passive: true });
  document.addEventListener('touchstart', unlockVideo, { passive: true });
  document.addEventListener('keydown', unlockVideo);

  window.addEventListener('load', playVideo, { once: true });
  playVideo();

  window.setInterval(function () {
    if (!document.hidden && video.paused) playVideo();
  }, 1200);
})();
