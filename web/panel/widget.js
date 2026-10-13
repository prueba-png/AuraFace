// Widget de soporte en vivo para TU página.
//
// Cómo usarlo: añade esto al final de tu página (antes de </body>):
//
//   <script>
//     window.PANEL = {
//       site: "mi-sitio",                 // un nombre único para tu web
//       firebase: { /* tu config */ },    // opcional: sin esto va en modo demo local
//       title: "¿Necesitas ayuda?",       // opcional
//       welcome: "Hola 👋 ¿En qué podemos ayudarte?"  // opcional
//     };
//   </script>
//   <script type="module" src="https://TU-USUARIO.github.io/TU-REPO/panel/widget.js"></script>
//
// Muestra un botón de chat. El visitante escribe, y tú lo ves y le respondes
// desde el panel de control. Las "reglas de ayuda" muestran una tarjeta con un
// enlace cuando el visitante menciona una palabra clave (la pulsa él, no se le
// redirige a la fuerza).

import { createTransport } from './core.js';

const cfg = (typeof window !== 'undefined' && window.PANEL) || {};
const TITLE = cfg.title || 'Soporte';
const WELCOME = cfg.welcome || 'Hola 👋 ¿En qué podemos ayudarte?';
const t = createTransport(cfg);

const CSS = `
.pnl-btn,.pnl-win{position:fixed;right:18px;z-index:2147483000;font-family:system-ui,-apple-system,Segoe UI,Roboto,sans-serif}
.pnl-btn{bottom:18px;width:60px;height:60px;border-radius:50%;border:none;cursor:pointer;background:#4f46e5;color:#fff;font-size:26px;box-shadow:0 8px 24px rgba(0,0,0,.25);transition:transform .15s}
.pnl-btn:hover{transform:scale(1.06)}
.pnl-dot{position:absolute;top:2px;right:2px;min-width:18px;height:18px;padding:0 4px;border-radius:9px;background:#ef4444;color:#fff;font-size:11px;line-height:18px;text-align:center;display:none}
.pnl-win{bottom:88px;width:340px;max-width:calc(100vw - 32px);height:460px;max-height:calc(100vh - 120px);background:#fff;color:#18181b;border-radius:16px;box-shadow:0 16px 48px rgba(0,0,0,.3);display:none;flex-direction:column;overflow:hidden}
.pnl-win.open{display:flex}
.pnl-hd{background:#4f46e5;color:#fff;padding:14px 16px;font-weight:600}
.pnl-hd small{display:block;font-weight:400;opacity:.85;font-size:12px}
.pnl-body{flex:1;overflow-y:auto;padding:14px;display:flex;flex-direction:column;gap:8px;background:#f4f4f5}
.pnl-m{max-width:80%;padding:8px 12px;border-radius:14px;font-size:14px;line-height:1.35;word-wrap:break-word}
.pnl-m.me{align-self:flex-end;background:#4f46e5;color:#fff;border-bottom-right-radius:4px}
.pnl-m.them{align-self:flex-start;background:#fff;border:1px solid #e4e4e7;border-bottom-left-radius:4px}
.pnl-help{align-self:flex-start;background:#fff;border:1px solid #e4e4e7;border-radius:14px;padding:10px 12px;font-size:14px;max-width:85%}
.pnl-help a{display:inline-block;margin-top:8px;background:#4f46e5;color:#fff;text-decoration:none;padding:7px 12px;border-radius:9px;font-size:13px}
.pnl-foot{display:flex;gap:6px;padding:10px;border-top:1px solid #e4e4e7;background:#fff}
.pnl-foot input{flex:1;border:1px solid #d4d4d8;border-radius:10px;padding:9px 11px;font-size:14px;outline:none}
.pnl-foot input:focus{border-color:#4f46e5}
.pnl-foot button{border:none;background:#4f46e5;color:#fff;border-radius:10px;padding:0 14px;font-size:14px;cursor:pointer}
@media(prefers-color-scheme:dark){.pnl-win{background:#18181b;color:#fafafa}.pnl-body{background:#111113}.pnl-m.them,.pnl-help{background:#27272a;border-color:#3f3f46;color:#fafafa}.pnl-foot{background:#18181b;border-color:#27272a}.pnl-foot input{background:#27272a;border-color:#3f3f46;color:#fafafa}}
`;

function el(tag, cls, html) { const e = document.createElement(tag); if (cls) e.className = cls; if (html != null) e.innerHTML = html; return e; }

let visitorId = null;
let rules = [];
let seenRule = new Set();
const shownIds = new Set();

function boot() {
  const style = el('style'); style.textContent = CSS; document.head.appendChild(style);

  const btn = el('button', 'pnl-btn', '💬<span class="pnl-dot" id="pnlDot"></span>');
  btn.setAttribute('aria-label', 'Abrir chat de soporte');
  const win = el('div', 'pnl-win');
  win.innerHTML = `
    <div class="pnl-hd">${esc(TITLE)}<small>Normalmente respondemos enseguida</small></div>
    <div class="pnl-body" id="pnlBody"></div>
    <form class="pnl-foot" id="pnlForm">
      <input id="pnlInput" placeholder="Escribe tu mensaje…" autocomplete="off" />
      <button type="submit">➤</button>
    </form>`;
  document.body.append(btn, win);

  const body = win.querySelector('#pnlBody');
  const input = win.querySelector('#pnlInput');
  const dot = btn.querySelector('#pnlDot');
  let open = false, unread = 0;

  addThem(WELCOME);

  btn.onclick = () => {
    open = !open; win.classList.toggle('open', open);
    if (open) { unread = 0; dot.style.display = 'none'; input.focus(); body.scrollTop = body.scrollHeight; }
  };

  win.querySelector('#pnlForm').onsubmit = (e) => {
    e.preventDefault();
    const text = input.value.trim(); if (!text) return;
    input.value = '';
    addMe(text);
    if (visitorId) t.send(visitorId, 'visitor', { text });
    maybeHelp(text);
  };

  function addMe(text) { body.appendChild(el('div', 'pnl-m me', esc(text))); scroll(); }
  function addThem(text) { body.appendChild(el('div', 'pnl-m them', esc(text))); scroll(); if (!open) bump(); }
  function addHelp(text, label, url) {
    const c = el('div', 'pnl-help', esc(text || '¿Te sirve esto?'));
    const a = el('a'); a.href = url; a.target = '_blank'; a.rel = 'noopener'; a.textContent = label || 'Abrir';
    c.appendChild(a); body.appendChild(c); scroll(); if (!open) bump();
  }
  function bump() { unread++; dot.textContent = unread; dot.style.display = 'block'; }
  function scroll() { requestAnimationFrame(() => { body.scrollTop = body.scrollHeight; }); }

  // Reglas de ayuda automática: por palabra clave que escribe el visitante.
  function maybeHelp(text) {
    const low = text.toLowerCase();
    for (const r of rules) {
      if (!r.keyword || !r.url) continue;
      if (seenRule.has(r.id)) continue;
      if (low.includes(r.keyword.toLowerCase())) {
        seenRule.add(r.id);
        addHelp(r.label ? `Sobre «${r.keyword}»: ${r.label}` : '¿Quizá esto te ayude?', r.label || 'Ver más', r.url);
      }
    }
  }

  // Conexión en tiempo real.
  t.ready().then(() => {
    visitorId = tJoin();
    Promise.resolve(visitorId).then((id) => {
      visitorId = id;
      t.onMessages(id, (msgs) => {
        for (const m of msgs) {
          if (m.from !== 'owner' || shownIds.has(m.id)) continue;
          shownIds.add(m.id);
          if (m.type === 'help' && m.url) addHelp(m.text, m.label, m.url);
          else addThem(m.text);
        }
      });
      const beat = () => t.heartbeat(id, { page: location.pathname });
      beat();
      setInterval(beat, 8000);
      window.addEventListener('pagehide', () => t.leave(id));
      window.addEventListener('beforeunload', () => t.leave(id));
    });
    t.onRules((r) => { rules = r; });
  });

  function tJoin() {
    return t.joinAsVisitor({ page: location.pathname + location.search, ua: navigator.userAgent.slice(0, 120) });
  }
}

function esc(s) { return String(s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c])); }

if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', boot);
else boot();
