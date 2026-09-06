let youtubeApiPromise;

function loadYouTubeApi() {
  if (window.YT?.Player) return Promise.resolve(window.YT);
  if (youtubeApiPromise) return youtubeApiPromise;

  youtubeApiPromise = new Promise((resolve, reject) => {
    const previousCallback = window.onYouTubeIframeAPIReady;
    window.onYouTubeIframeAPIReady = () => {
      if (typeof previousCallback === 'function') previousCallback();
      resolve(window.YT);
    };

    const script = document.createElement('script');
    script.src = 'https://www.youtube.com/iframe_api';
    script.async = true;
    script.onerror = () => reject(new Error('โหลด YouTube Player API ไม่สำเร็จ'));
    document.head.append(script);
  });

  return youtubeApiPromise;
}

export async function createLessonPlayer({ elementId, videoId, onReady, onStarted, onEnded }) {
  const YT = await loadYouTubeApi();
  let started = false;
  const playerVars = {
    controls: 1,
    playsinline: 1,
    rel: 0,
    modestbranding: 1,
    iv_load_policy: 3,
    enablejsapi: 1
  };
  if (/^https?:$/.test(window.location.protocol)) playerVars.origin = window.location.origin;

  const player = new YT.Player(elementId, {
    host: 'https://www.youtube-nocookie.com',
    videoId,
    playerVars,
    events: {
      onReady() {
        if (typeof onReady === 'function') onReady(player);
      },
      onStateChange(event) {
        if (event.data === YT.PlayerState.PLAYING && !started) {
          started = true;
          if (typeof onStarted === 'function') onStarted();
        }
        if (event.data === YT.PlayerState.ENDED && typeof onEnded === 'function') onEnded();
      },
      onError() {
        if (typeof onReady === 'function') onReady(null);
      }
    }
  });

  return player;
}
