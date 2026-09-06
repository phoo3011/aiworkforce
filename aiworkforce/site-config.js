(function configureAiWorkforce() {
  const localHosts = new Set(['localhost', '127.0.0.1']);
  const defaultApiBaseUrl = localHosts.has(window.location.hostname)
    ? 'http://localhost:5000'
    : 'https://api.aiworkforcedev.online';

  window.AI_WORKFORCE_CONFIG = Object.freeze({
    apiBaseUrl: window.AI_WORKFORCE_CONFIG?.apiBaseUrl || defaultApiBaseUrl
  });
})();
