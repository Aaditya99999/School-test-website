/* ------------------------------------------------------------
   Trident Public School — chat assistant
   ------------------------------------------------------------
   The browser never holds the API key. It posts to chat-proxy.php
   on this same domain, and that file talks to the AI provider.
   ------------------------------------------------------------ */

(function () {
  'use strict';

  // Same-origin proxy that holds the API key.
  //   Vercel (default) ....... /api/chat        → api/chat.js
  //   PHP shared hosting ..... chat-proxy.php   → chat-proxy.php
  var ENDPOINT   = '/api/chat';
  var MAX_TURNS  = 12;                // turns kept and sent for context
  var STORE_KEY  = 'tps-chat-history';

  var GREETING =
    'Namaste! I can help with admissions, branches, facilities and school ' +
    'timings. What would you like to know?';

  var fab   = document.getElementById('chatFab');
  var panel = document.getElementById('chatPanel');
  var close = document.getElementById('chatClose');
  var log   = document.getElementById('chatLog');
  var form  = document.getElementById('chatForm');
  var input = document.getElementById('chatInput');
  var send  = document.getElementById('chatSend');
  var chips = document.getElementById('chatChips');

  if (!fab || !panel || !log || !form || !input) return;

  var history = [];   // [{role, content}] — user and assistant only
  var busy    = false;

  /* ---------- storage (best effort) ---------- */
  function load() {
    try {
      var saved = JSON.parse(sessionStorage.getItem(STORE_KEY) || '[]');
      if (Array.isArray(saved)) history = saved.slice(-MAX_TURNS * 2);
    } catch (e) { history = []; }
  }

  function save() {
    try {
      sessionStorage.setItem(STORE_KEY, JSON.stringify(history.slice(-MAX_TURNS * 2)));
    } catch (e) { /* private mode, quota — not worth failing over */ }
  }

  /* ---------- rendering ---------- */
  function scrollDown() { log.scrollTop = log.scrollHeight; }

  // Text is inserted with textContent, never innerHTML, so anything the
  // model returns is displayed as text and can never become markup.
  function bubble(role, text) {
    var el = document.createElement('div');
    el.className = 'msg msg-' + role;
    el.textContent = text;
    log.appendChild(el);
    scrollDown();
    return el;
  }

  function typing() {
    var el = document.createElement('div');
    el.className = 'msg msg-bot msg-typing';
    el.innerHTML = '<i></i><i></i><i></i>';
    el.setAttribute('aria-label', 'Assistant is typing');
    log.appendChild(el);
    scrollDown();
    return el;
  }

  function render() {
    log.textContent = '';
    bubble('bot', GREETING);
    history.forEach(function (m) {
      bubble(m.role === 'user' ? 'user' : 'bot', m.content);
    });
    scrollDown();
  }

  /* ---------- panel open / close ---------- */
  function open() {
    panel.hidden = false;
    fab.setAttribute('aria-expanded', 'true');
    scrollDown();
    // Don't steal focus into a fixed panel on phones — it opens the
    // keyboard over the page before the visitor has read anything.
    if (window.innerWidth > 560) input.focus();
  }

  function shut() {
    panel.hidden = true;
    fab.setAttribute('aria-expanded', 'false');
    fab.focus();
  }

  fab.addEventListener('click', function () {
    panel.hidden ? open() : shut();
  });

  if (close) close.addEventListener('click', shut);

  document.addEventListener('keydown', function (e) {
    if (e.key === 'Escape' && !panel.hidden) shut();
  });

  /* ---------- composer behaviour ---------- */
  // Grow the textarea with its content, up to the CSS max-height.
  function resize() {
    input.style.height = 'auto';
    input.style.height = Math.min(input.scrollHeight, 110) + 'px';
  }
  input.addEventListener('input', resize);

  // Enter sends; Shift+Enter makes a new line.
  input.addEventListener('keydown', function (e) {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      form.requestSubmit ? form.requestSubmit() : ask(input.value);
    }
  });

  if (chips) {
    chips.addEventListener('click', function (e) {
      var btn = e.target.closest('button[data-ask]');
      if (btn) ask(btn.dataset.ask);
    });
  }

  form.addEventListener('submit', function (e) {
    e.preventDefault();
    ask(input.value);
  });

  /* ---------- the request ---------- */
  function ask(text) {
    text = (text || '').trim();
    if (!text || busy) return;

    busy = true;
    send.disabled = true;
    if (chips) chips.hidden = true;

    input.value = '';
    resize();

    bubble('user', text);
    history.push({ role: 'user', content: text });
    save();

    var dots = typing();

    // Give up rather than leave the visitor watching dots forever.
    var controller = typeof AbortController !== 'undefined' ? new AbortController() : null;
    var timeout = setTimeout(function () { if (controller) controller.abort(); }, 45000);

    fetch(ENDPOINT, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ messages: history.slice(-MAX_TURNS * 2) }),
      signal: controller ? controller.signal : undefined
    })
      .then(function (res) {
        return res.json()
          .catch(function () { throw new Error('bad-json'); })
          .then(function (data) {
            if (!res.ok) {
              // Mark it, so we know downstream this text came from our own
              // proxy and is safe to show — unlike a raw browser exception.
              var err = new Error(data && data.error ? data.error : 'request-failed');
              err.fromProxy = !!(data && data.error);
              throw err;
            }
            return data;
          });
      })
      .then(function (data) {
        var reply = (data && data.reply ? String(data.reply) : '').trim();
        if (!reply) throw new Error('empty');

        dots.remove();
        bubble('bot', reply);
        history.push({ role: 'assistant', content: reply });
        save();
      })
      .catch(function (err) {
        dots.remove();

        var msg;
        if (err && err.name === 'AbortError') {
          msg = 'That took too long. Please try again, or call +91 7544000044.';
        } else if (err && err.fromProxy && err.message.length < 200) {
          msg = err.message;          // written by our proxy, safe to show
        } else {
          msg = 'Sorry — I could not reach the assistant. Please try again, ' +
                'or call the office on +91 7544000044.';
        }

        bubble('error', msg);
        if (window.console) console.error('[tps-chat]', err);
      })
      .then(function () {
        clearTimeout(timeout);
        busy = false;
        send.disabled = false;
        if (window.innerWidth > 560) input.focus();
      });
  }

  /* ---------- start ---------- */
  load();
  render();
})();
