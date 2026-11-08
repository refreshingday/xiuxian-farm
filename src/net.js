// 联机传输层（照《一箭双修》src/net.js 的做法）：PeerJS 只用来按 4 位房间号牵线，
// 牵上以后所有数据都在浏览器之间直接走 WebRTC。这里扩成星形：房主最多连 3 个道友，
// 道友发的消息由房主转发给其他道友（消息里带 from = 发送者的 peer id）。
// PeerJS 由 index.html 从 CDN 以全局 Peer 载入。测试时可用 ?peer=localhost:9000 指向自建的 peer 服务器。

const ALPHA = 'ABCDEFGHJKMNPQRSTUVWXYZ23456789'; // 去掉 0/O、1/I/L
const PREFIX = 'lthd-';
export const MAX_PLAYERS = 4;

export function makeCode() {
  let s = '';
  for (let i = 0; i < 4; i++) s += ALPHA[Math.floor(Math.random() * ALPHA.length)];
  return s;
}
export function normalizeCode(s) { return (s || '').toUpperCase().replace(/[^A-Z0-9]/g, '').slice(0, 4); }

// ?peer=host:port[/path] → 自建 PeerJS 服务器（无 https）；默认用 PeerJS 免费公共服务器
function peerOpts() {
  const m = /[?&]peer=([^&]+)/.exec(location.search);
  if (!m) return { debug: 1 };
  const [hp, ...path] = decodeURIComponent(m[1]).split('/'), [host, port] = hp.split(':');
  return { debug: 1, host, port: +port || 9000, path: '/' + path.join('/'), secure: false };
}

export class Net {
  constructor() {
    this.peer = null; this.role = null; this.code = ''; this.id = '';
    this.conns = new Map(); // peer id → DataConnection（房主：所有道友；道友：只有房主）
    this.handlers = {};
  }
  on(type, fn) { (this.handlers[type] ||= []).push(fn); return this; }
  emit(type, ...a) { for (const f of this.handlers[type] || []) f(...a); }
  get connected() { for (const c of this.conns.values()) if (c.open) return true; return false; }
  get isHost() { return this.role === 'host'; }
  get hostId() { return this.isHost ? this.id : PREFIX + this.code; }

  host(tries = 0) {
    if (typeof Peer === 'undefined') return this.emit('error', '联机组件加载失败，请检查网络');
    this.role = 'host'; this.code = makeCode();
    const peer = this.peer = new Peer(PREFIX + this.code, peerOpts());
    peer.on('open', (id) => { this.id = id; this.emit('hosting', this.code); });
    peer.on('connection', (conn) => {
      if (this.conns.size >= MAX_PLAYERS - 1) { conn.on('open', () => { conn.send({ t: 'full' }); setTimeout(() => conn.close(), 300); }); return; }
      this.attach(conn);
    });
    peer.on('error', (e) => {
      if (e.type === 'unavailable-id' && tries < 5) { peer.destroy(); this.host(tries + 1); return; }
      this.emit('error', describe(e));
    });
    peer.on('disconnected', () => { if (!peer.destroyed) peer.reconnect(); });
  }

  join(code) {
    if (typeof Peer === 'undefined') return this.emit('error', '联机组件加载失败，请检查网络');
    this.role = 'guest'; this.code = code;
    const peer = this.peer = new Peer(peerOpts());
    peer.on('open', (id) => { this.id = id; this.attach(peer.connect(PREFIX + code, { reliable: true, serialization: 'json' })); });
    peer.on('error', (e) => this.emit('error', describe(e)));
  }

  attach(conn) {
    this.conns.set(conn.peer, conn);
    conn.on('open', () => this.emit('open', conn.peer));
    conn.on('data', (d) => {
      if (!d || !d.t) return;
      if (this.isHost) { d.from = conn.peer; this.relay(d, conn.peer); if (d.to && d.to !== this.id) return; } // 房主：盖上发送者，转给其他道友
      this.emit('msg', d);
    });
    conn.on('close', () => { if (this.conns.get(conn.peer) === conn) { this.conns.delete(conn.peer); this.emit('left', conn.peer); } });
    conn.on('error', () => {});
  }

  relay(d, except) {
    if (d.to) { if (d.to !== this.id) { const c = this.conns.get(d.to); if (c?.open) c.send(d); } return; } // 点对点（赠送）
    for (const [id, c] of this.conns) if (id !== except && c.open) c.send(d);
  }

  // 发给所有人（道友发给房主，由房主转发）；带 to 的只给那一个人
  send(obj) {
    if (this.isHost) { obj.from = this.id; this.relay(obj, null); }
    else for (const c of this.conns.values()) if (c.open) c.send(obj);
  }

  close() {
    const peer = this.peer;
    this.conns.clear(); this.peer = null; this.handlers = {};
    if (peer) try { peer.destroy(); } catch (e) {}
  }
}

function describe(e) {
  switch (e.type) {
    case 'peer-unavailable': return '找不到这个房间，请检查房间号';
    case 'network': case 'server-error': case 'socket-error': case 'socket-closed': return '连不上联机服务器，请检查网络';
    case 'browser-incompatible': return '这个浏览器不支持联机';
    default: return `联机出错（${e.type || e}）`;
  }
}
