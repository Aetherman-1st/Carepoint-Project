(function () {
  if (window.CarePointErrors) return;

  var STYLE_ID = 'cp-error-client-style';
  if (!document.getElementById(STYLE_ID)) {
    var style = document.createElement('style');
    style.id = STYLE_ID;
    style.textContent = [
      '.cp-toast{position:fixed;left:50%;bottom:24px;z-index:9999;max-width:min(92vw,420px);transform:translateX(-50%);padding:12px 16px;border-radius:12px;background:#0b1f33;color:#fff;font:600 14px/1.45 "Manrope",system-ui,sans-serif;box-shadow:0 16px 40px rgba(11,31,51,.24);opacity:0;animation:cpToastIn .18s ease forwards}',
      '.cp-toast.ok{background:#0f766e}.cp-toast.err{background:#b91c1c}.cp-toast.warn{background:#b45309}',
      '@keyframes cpToastIn{to{opacity:1}}',
      '.cp-session-overlay{position:fixed;inset:0;z-index:10000;display:flex;align-items:center;justify-content:center;padding:24px;background:rgba(11,31,51,.46);backdrop-filter:blur(3px)}',
      '.cp-session-card{width:min(100%,430px);padding:26px;border-radius:18px;background:#fff;color:#0b1f33;box-shadow:0 24px 60px rgba(11,31,51,.28);font-family:"Manrope",system-ui,sans-serif;text-align:left}',
      '.cp-session-card h2{margin:0 0 8px;font-size:20px;line-height:1.3}',
      '.cp-session-card p{margin:0;color:#5b7280;font-size:14px;line-height:1.55}',
      '.cp-session-card .cp-session-actions{display:flex;gap:10px;margin-top:18px;flex-wrap:wrap}',
      '.cp-session-card a,.cp-session-card button{display:inline-flex;align-items:center;justify-content:center;min-height:40px;padding:0 16px;border-radius:10px;border:1px solid #0f766e;background:#0f766e;color:#fff;font:700 13px "Manrope",system-ui,sans-serif;text-decoration:none;cursor:pointer}',
      '.cp-session-card button.cp-secondary{background:#fff;color:#0f766e}'
    ].join('');
    document.head.appendChild(style);
  }

  var toastTimer = null;
  function toast(message, type) {
    if (!message) return;
    var existing = document.querySelector('.cp-toast');
    if (existing) existing.remove();
    var node = document.createElement('div');
    node.className = 'cp-toast' + (type ? ' ' + type : '');
    node.setAttribute('role', type === 'err' ? 'alert' : 'status');
    node.textContent = message;
    document.body.appendChild(node);
    clearTimeout(toastTimer);
    toastTimer = setTimeout(function () {
      node.remove();
    }, 4200);
  }

  function messageFor(status, data, fallback) {
    if (data && typeof data.message === 'string' && data.message.trim()) {
      return data.message;
    }
    if (status === 401) return 'Your session has expired, please log in again.';
    if (status === 403) return 'You do not have permission to do that.';
    if (status === 404) return 'We could not find what you asked for.';
    if (status >= 500) return 'Something went wrong on our end. Please try again.';
    return fallback || 'Something went wrong. Please try again.';
  }

  var sessionShown = false;
  function sessionExpired() {
    if (sessionShown) return;
    sessionShown = true;

    var overlay = document.createElement('div');
    overlay.className = 'cp-session-overlay';
    overlay.setAttribute('role', 'alertdialog');
    overlay.setAttribute('aria-modal', 'true');

    var card = document.createElement('div');
    card.className = 'cp-session-card';

    var title = document.createElement('h2');
    title.textContent = 'Your session has expired';

    var copy = document.createElement('p');
    copy.textContent = 'Your session has expired, please log in again. Redirecting you to the login page in 3 seconds.';

    var actions = document.createElement('div');
    actions.className = 'cp-session-actions';

    var next = encodeURIComponent(window.location.pathname + window.location.search);
    var login = document.createElement('a');
    login.href = '/login?account=session_expired&next=' + next;
    login.textContent = 'Log in now';

    var stay = document.createElement('button');
    stay.type = 'button';
    stay.className = 'cp-secondary';
    stay.textContent = 'Stay on this page';
    stay.addEventListener('click', function () {
      clearTimeout(redirectTimer);
      overlay.remove();
    });

    actions.appendChild(login);
    actions.appendChild(stay);
    card.appendChild(title);
    card.appendChild(copy);
    card.appendChild(actions);
    overlay.appendChild(card);
    document.body.appendChild(overlay);

    var redirectTimer = setTimeout(function () {
      window.location.href = '/login?account=session_expired&next=' + next;
    }, 3000);
  }

  var nativeFetch = window.fetch ? window.fetch.bind(window) : null;
  if (nativeFetch) {
    window.fetch = function (input, init) {
      return nativeFetch(input, init).then(function (response) {
        try {
          var url = typeof input === 'string' ? input : input && input.url ? input.url : '';
          var isApi = /\/api\//.test(url);
          var isSessionCheck = /\/api\/session(?:\?|$)/.test(url);
          if (response.status === 401 && isApi && !isSessionCheck) {
            sessionExpired();
          }
        } catch (err) {}
        return response;
      });
    };
  }

  window.CarePointErrors = {
    toast: toast,
    messageFor: messageFor,
    sessionExpired: sessionExpired
  };

  document.addEventListener('DOMContentLoaded', function () {
    var messageNode = document.getElementById('errorMessage');
    var params = new URLSearchParams(window.location.search);
    var forRole = params.get('for');

    if (messageNode && forRole === 'patient') {
      messageNode.textContent = 'This page is for patients only. Log in with a patient account to continue.';
    } else if (messageNode && forRole === 'clinic') {
      messageNode.textContent = 'This page is for clinics only. Log in with a clinic account to continue.';
    } else if (messageNode && forRole === 'admin') {
      messageNode.textContent = 'This page is for administrators only.';
    }

    var home = document.getElementById('errorHomeAction');
    if (!home || !nativeFetch) return;

    nativeFetch('/api/session', { headers: { Accept: 'application/json' } })
      .then(function (response) {
        return response.ok ? response.json() : null;
      })
      .then(function (data) {
        var user = data && data.user;
        if (!user) return;
        if (user.role === 'clinic') {
          home.href = '/clinic';
          home.textContent = 'Go to clinic dashboard';
        } else if (user.role === 'admin') {
          home.href = '/';
          home.textContent = 'Back to home';
        } else {
          home.href = '/patient';
          home.textContent = 'Go to my portal';
        }
      })
      .catch(function () {});
  });
})();
