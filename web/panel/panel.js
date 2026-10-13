// Panel de control del soporte en vivo.
import { createTransport, isOnline, ONLINE_MS } from './core.js';

const $ = (s) => document.querySelector(s);
const LS = {
  site: 'panel-cfg-site',
  fb: 'panel-cfg-fb',
  read: (site) => 'panel-read:' + site,
};

// ── configuración ──
const site = (localStorage.getItem(LS.site) || 'demo').trim() || 'demo';
let firebase = null;
try { firebase = JSON.parse(localStorage.getItem(LS.fb) || 'null'); } catch { firebase = null; }
const cfg = { site, firebase: firebase || undefined };
const t = createTransport(cfg);

$('#siteLabel').textContent = site;
const modeEl = $('#modeLabel');
if (t.mode === 'firebase') { modeEl.textContent = 'remoto'; modeEl.classList.add('remote'); }
else modeEl.textContent = 'demo local';

// ── pestañas ──
const tabs = [
  ['#tabVisitors', '#secVisitors'], ['#tabRules', '#secRules'],
  ['#tabPage', '#secPage'], ['#tabSettings', '#secSettings'],
];
tabs.forEach(([btn, sec]) => $(btn).addEventListener('click', () => {
  tabs.forEach(([b, s]) => { $(b).setAttribute('aria-selected', b === btn); $(s).hidden = s !== sec; });
}));

// ── estado de visitantes y mensajes ──
let visitors = {};           // id -> datos
let selected = null;         // id seleccionado
const msgSubs = new Map();   // id -> { off, msgs }
let read = {};
try { read = JSON.parse(localStorage.getItem(LS.read(site)) || '{}'); } catch { read = {}; }
const saveRead = () => localStorage.setItem(LS.read(site), JSON.stringify(read));

const vmsgCount = (id) => (msgSubs.get(id)?.msgs || []).filter((m) => m.from === 'visitor').length;
const unread = (id) => Math.max(0, vmsgCount(id) - (read[id] || 0));

t.onVisitors((v) => {
  visitors = v || {};
  // Suscribir a los mensajes de cada visitante nuevo (para contar y chatear).
  for (const id of Object.keys(visitors)) {
    if (msgSubs.has(id)) continue;
    const entry = { off: null, msgs: [] };
    entry.off = t.onMessages(id, (msgs) => {
      entry.msgs = msgs;
      if (id === selected) renderChat();
      renderList();
    });
    msgSubs.set(id, entry);
  }
  // Soltar los que ya no están.
  for (const id of [...msgSubs.keys()]) {
    if (!visitors[id]) { try { msgSubs.get(id).off(); } catch {} msgSubs.delete(id); }
  }
  renderList();
});

// Refrescar el estado online cada pocos segundos (se calcula por lastSeen).
setInterval(renderList, 5000);

function renderList() {
  const box = $('#vlist');
  const ids = Object.keys(visitors).sort((a, b) => (visitors[b].lastSeen || 0) - (visitors[a].lastSeen || 0));
  if (!ids.length) { box.innerHTML = '<div class="empty">Esperando visitantes…</div>'; return; }
  box.innerHTML = '';
  for (const id of ids) {
    const v = visitors[id];
    const on = isOnline(v);
    const u = unread(id);
    const item = document.createElement('div');
    item.className = 'vitem' + (on ? ' online' : '') + (id === selected ? ' active' : '');
    item.innerHTML = `
      <span class="dot"></span>
      <span class="meta">
        <span class="nm">${esc(v.name || 'Visitante ' + id.slice(0, 4))}</span>
        <span class="pg">${esc(v.page || '—')}${on ? '' : ' · desconectado'}</span>
      </span>
      ${u ? `<span class="unread">${u}</span>` : ''}`;
    item.onclick = () => select(id);
    box.appendChild(item);
  }
}

function select(id) {
  selected = id;
  read[id] = vmsgCount(id); saveRead();
  ['#msgInput', '#msgSend', '#helpLabel', '#helpUrl', '#helpSend'].forEach((s) => { $(s).disabled = false; });
  renderList();
  renderChat();
}

function renderChat() {
  const v = visitors[selected];
  if (!v) return;
  $('#chatHead').innerHTML = `${esc(v.name || 'Visitante ' + selected.slice(0, 4))} <small>${esc(v.page || '')} · ${isOnline(v) ? 'conectado' : 'desconectado'}</small>`;
  const body = $('#cbody');
  const msgs = msgSubs.get(selected)?.msgs || [];
  if (!msgs.length) { body.innerHTML = '<div class="empty">Sin mensajes todavía. Escríbele tú primero si quieres.</div>'; return; }
  body.innerHTML = '';
  for (const m of msgs) {
    const d = document.createElement('div');
    const cls = m.from === 'owner' ? (m.type === 'help' ? 'help' : 'owner') : 'visitor';
    d.className = 'm ' + cls;
    d.innerHTML = esc(m.text || (m.type === 'help' ? 'Enlace de ayuda' : '')) +
      (m.type === 'help' && m.url ? `<a class="lnk" href="${esc(m.url)}" target="_blank" rel="noopener">${esc(m.label || 'Abrir')} ↗</a>` : '') +
      `<time>${fmt(m.ts)}</time>`;
    body.appendChild(d);
  }
  read[selected] = vmsgCount(selected); saveRead();
  requestAnimationFrame(() => { body.scrollTop = body.scrollHeight; });
}

$('#msgSend').onclick = sendText;
$('#msgInput').addEventListener('keydown', (e) => { if (e.key === 'Enter') sendText(); });
function sendText() {
  const text = $('#msgInput').value.trim();
  if (!text || !selected) return;
  t.send(selected, 'owner', { text });
  $('#msgInput').value = '';
}
$('#helpSend').onclick = () => {
  const url = $('#helpUrl').value.trim();
  const label = $('#helpLabel').value.trim();
  if (!url || !selected) return;
  t.send(selected, 'owner', { type: 'help', url, label: label || 'Abrir', text: label ? '' : '¿Te sirve esto?' });
  $('#helpUrl').value = ''; $('#helpLabel').value = '';
};

// ── reglas de ayuda ──
let rules = [];
t.onRules((r) => { rules = r.length ? r : rules; renderRules(); });
function renderRules() {
  const box = $('#rulesBox');
  box.innerHTML = '';
  if (!rules.length) rules = [{ keyword: '', label: '', url: '' }];
  rules.forEach((r, i) => {
    const row = document.createElement('div');
    row.className = 'rule';
    row.innerHTML = `
      <input placeholder="palabra clave (ej. precio)" value="${esc(r.keyword || '')}" data-k="keyword" data-i="${i}" />
      <input placeholder="texto del botón" value="${esc(r.label || '')}" data-k="label" data-i="${i}" />
      <input placeholder="https://…" value="${esc(r.url || '')}" data-k="url" data-i="${i}" />
      <button data-del="${i}">Quitar</button>`;
    box.appendChild(row);
  });
  box.querySelectorAll('input').forEach((inp) => inp.addEventListener('input', () => {
    rules[+inp.dataset.i][inp.dataset.k] = inp.value;
  }));
  box.querySelectorAll('button[data-del]').forEach((b) => b.onclick = () => { rules.splice(+b.dataset.del, 1); renderRules(); });
}
$('#addRule').onclick = () => { rules.push({ keyword: '', label: '', url: '' }); renderRules(); };
$('#saveRules').onclick = () => {
  const clean = rules.filter((r) => (r.keyword || '').trim() && (r.url || '').trim());
  t.setRules(clean);
  rules = clean.length ? clean : [{ keyword: '', label: '', url: '' }];
  renderRules();
  flash('#rulesSaved');
};

// ── mi página (vista previa + fragmento) ──
const SAMPLE = `<!doctype html>
<html lang="es"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<style>body{font-family:system-ui;margin:0;background:#f8fafc;color:#0f172a}
.hero{padding:60px 24px;text-align:center}h1{font-size:30px;margin:0 0 10px}
.btn{display:inline-block;margin-top:16px;background:#4f46e5;color:#fff;text-decoration:none;padding:12px 22px;border-radius:10px}</style></head>
<body><div class="hero"><h1>Mi tienda online</h1><p>Zapatillas y ropa deportiva al mejor precio.</p>
<a class="btn" href="#">Ver catálogo</a></div></body></html>`;

function buildSrcdoc(html) {
  const inject = `
<script>window.PANEL=${JSON.stringify({ site, firebase: firebase || undefined, title: 'Soporte', welcome: 'Hola 👋 ¿En qué podemos ayudarte?' })};<\/script>
<script type="module" src="${new URL('widget.js', location.href).href}"><\/script>`;
  return html.includes('</body>') ? html.replace('</body>', inject + '\n</body>') : html + inject;
}
$('#renderBtn').onclick = () => {
  const html = $('#htmlInput').value.trim() || SAMPLE;
  $('#preview').srcdoc = buildSrcdoc(html);
};
$('#sampleBtn').onclick = () => { $('#htmlInput').value = SAMPLE; $('#preview').srcdoc = buildSrcdoc(SAMPLE); };

function renderSnippet() {
  const fbPart = firebase ? `,\n    firebase: ${JSON.stringify(firebase, null, 6).replace(/\n/g, '\n  ')}` : '';
  $('#snippet').textContent =
`<script>
  window.PANEL = {
    site: "${site}"${fbPart}
  };
<\/script>
<script type="module" src="${new URL('widget.js', location.href).href}"><\/script>`;
}
$('#copySnippet').onclick = async () => {
  try { await navigator.clipboard.writeText($('#snippet').textContent); flash('#copied'); } catch {}
};

// ── ajustes ──
$('#siteInput').value = site === 'demo' ? '' : site;
$('#fbInput').value = firebase ? JSON.stringify(firebase, null, 2) : '';
$('#saveSettings').onclick = () => {
  const s = $('#siteInput').value.trim();
  localStorage.setItem(LS.site, s || 'demo');
  const raw = $('#fbInput').value.trim();
  if (raw) {
    const parsed = parseFirebase(raw);
    if (!parsed) { alert('No pude leer la configuración de Firebase. Pega el objeto { … } tal cual sale en la consola.'); return; }
    localStorage.setItem(LS.fb, JSON.stringify(parsed));
  } else {
    localStorage.removeItem(LS.fb);
  }
  flash('#settingsSaved');
  setTimeout(() => location.reload(), 700);
};

function parseFirebase(raw) {
  const m = raw.match(/\{[\s\S]*\}/);
  if (!m) return null;
  let s = m[0];
  try { return JSON.parse(s); } catch {}
  // Tolerar el formato JS de la consola: claves sin comillas y comillas simples.
  try {
    s = s.replace(/'/g, '"').replace(/([{,]\s*)([A-Za-z_$][\w$]*)\s*:/g, '$1"$2":').replace(/,(\s*})/g, '$1');
    return JSON.parse(s);
  } catch { return null; }
}

// ── utilidades ──
function esc(s) { return String(s == null ? '' : s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c])); }
function fmt(ts) { if (!ts) return ''; const d = new Date(ts); return d.toLocaleTimeString('es', { hour: '2-digit', minute: '2-digit' }); }
function flash(sel) { const e = $(sel); e.hidden = false; setTimeout(() => { e.hidden = true; }, 1800); }

renderRules();
renderSnippet();
