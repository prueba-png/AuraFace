// Núcleo de tiempo real para el soporte en vivo.
//
// Expone un "transporte" con la misma interfaz para dos modos:
//   · FirebaseTransport → remoto de verdad (visitantes en cualquier parte),
//     usando Firebase Realtime Database (capa gratuita, sin servidor propio).
//   · LocalTransport    → demo en el mismo navegador (localStorage +
//     BroadcastChannel). Sirve para probarlo al instante, sin configurar nada.
//
// Modelo de datos (igual en los dos modos):
//   sites/{site}/visitors/{id}  = { name, page, ua, firstSeen, lastSeen }
//   sites/{site}/messages/{id}/{msgId} = { from:'owner'|'visitor', type:'text'|'help',
//                                           text, url, label, ts }
//   sites/{site}/rules/{ruleId} = { keyword, label, url }
//
// "online" no se guarda: se calcula a partir de lastSeen (fresco < 20 s).

export const ONLINE_MS = 20000;
const now = () => Date.now();
const rid = () => Math.random().toString(36).slice(2, 10) + now().toString(36).slice(-4);

export function createTransport(cfg = {}) {
  const site = (cfg.site || 'demo').trim() || 'demo';
  if (cfg.firebase && cfg.firebase.databaseURL) return new FirebaseTransport(site, cfg.firebase);
  return new LocalTransport(site);
}

// ───────────────────────────── Modo demo (local) ─────────────────────────────
class LocalTransport {
  constructor(site) {
    this.site = site;
    this.mode = 'local';
    this.key = 'panel:' + site;
    try { this.bc = new BroadcastChannel('panel:' + site); } catch { this.bc = null; }
    this._subs = new Set();
    const fire = () => { const d = this._read(); this._subs.forEach((cb) => cb(d)); };
    if (this.bc) this.bc.onmessage = fire;
    window.addEventListener('storage', (e) => { if (e.key === this.key) fire(); });
  }
  ready() { return Promise.resolve(); }
  _read() {
    try { return JSON.parse(localStorage.getItem(this.key)) || {}; } catch { return {}; }
    }
  _write(d) {
    localStorage.setItem(this.key, JSON.stringify(d));
    if (this.bc) this.bc.postMessage(1);
    this._subs.forEach((cb) => cb(d));
  }
  _mutate(fn) { const d = this._read(); d.visitors ||= {}; d.messages ||= {}; d.rules ||= {}; fn(d); this._write(d); }
  _watch(cb) { this._subs.add(cb); cb(this._read()); return () => this._subs.delete(cb); }

  // — visitante —
  joinAsVisitor(info) {
    const id = rid();
    this._mutate((d) => {
      d.visitors[id] = { name: info.name || '', page: info.page || '', ua: info.ua || '', firstSeen: now(), lastSeen: now() };
    });
    return id;
  }
  heartbeat(id, patch = {}) {
    this._mutate((d) => { if (d.visitors[id]) Object.assign(d.visitors[id], patch, { lastSeen: now() }); });
  }
  leave(id) { this._mutate((d) => { if (d.visitors[id]) d.visitors[id].lastSeen = 0; }); }
  send(id, from, payload) {
    const msg = { from, type: payload.type || 'text', text: payload.text || '', url: payload.url || '', label: payload.label || '', ts: now() };
    this._mutate((d) => { (d.messages[id] ||= {})[rid()] = msg; });
  }
  onMessages(id, cb) {
    return this._watch((d) => cb(sortMsgs((d.messages || {})[id] || {})));
  }
  // — propietario —
  onVisitors(cb) { return this._watch((d) => cb(d.visitors || {})); }
  onRules(cb) { return this._watch((d) => cb(sortRules(d.rules || {}))); }
  setRules(list) {
    this._mutate((d) => { d.rules = {}; list.forEach((r) => { d.rules[r.id || rid()] = { keyword: r.keyword, label: r.label, url: r.url }; }); });
  }
}

// ──────────────────────────── Modo remoto (Firebase) ────────────────────────────
class FirebaseTransport {
  constructor(site, config) {
    this.site = site;
    this.mode = 'firebase';
    this._ready = this._init(config);
  }
  async _init(config) {
    const V = 'https://www.gstatic.com/firebasejs/10.12.2';
    const app = await import(`${V}/firebase-app.js`);
    const db = await import(`${V}/firebase-database.js`);
    this.fb = db;
    this.db = db.getDatabase(app.initializeApp(config));
    this.base = `sites/${this.site}`;
  }
  ready() { return this._ready; }
  _ref(path) { return this.fb.ref(this.db, `${this.base}/${path}`); }

  async joinAsVisitor(info) {
    await this._ready;
    const r = this.fb.push(this._ref('visitors'));
    const id = r.key;
    await this.fb.set(r, { name: info.name || '', page: info.page || '', ua: info.ua || '', firstSeen: this.fb.serverTimestamp(), lastSeen: this.fb.serverTimestamp() });
    // Al cerrar o perder conexión, marcar como desconectado.
    this.fb.onDisconnect(this.fb.child(r, 'lastSeen')).set(0);
    return id;
  }
  async heartbeat(id, patch = {}) {
    await this._ready;
    await this.fb.update(this._ref('visitors/' + id), { ...patch, lastSeen: this.fb.serverTimestamp() });
  }
  async leave(id) { await this._ready; await this.fb.update(this._ref('visitors/' + id), { lastSeen: 0 }); }
  async send(id, from, payload) {
    await this._ready;
    await this.fb.push(this._ref('messages/' + id), {
      from, type: payload.type || 'text', text: payload.text || '', url: payload.url || '', label: payload.label || '', ts: this.fb.serverTimestamp(),
    });
  }
  onMessages(id, cb) {
    let off = () => {};
    this._ready.then(() => { off = this.fb.onValue(this._ref('messages/' + id), (s) => cb(sortMsgs(s.val() || {}))); });
    return () => off();
  }
  onVisitors(cb) {
    let off = () => {};
    this._ready.then(() => { off = this.fb.onValue(this._ref('visitors'), (s) => cb(s.val() || {})); });
    return () => off();
  }
  onRules(cb) {
    let off = () => {};
    this._ready.then(() => { off = this.fb.onValue(this._ref('rules'), (s) => cb(sortRules(s.val() || {}))); });
    return () => off();
  }
  async setRules(list) {
    await this._ready;
    const obj = {};
    list.forEach((r) => { obj[r.id || rid()] = { keyword: r.keyword, label: r.label, url: r.url }; });
    await this.fb.set(this._ref('rules'), obj);
  }
}

// ───────────────────────────── utilidades ─────────────────────────────
function sortMsgs(obj) {
  return Object.entries(obj).map(([id, m]) => ({ id, ...m })).sort((a, b) => (a.ts || 0) - (b.ts || 0));
}
function sortRules(obj) {
  return Object.entries(obj).map(([id, r]) => ({ id, ...r }));
}
export function isOnline(v) { return v && v.lastSeen && now() - v.lastSeen < ONLINE_MS; }
