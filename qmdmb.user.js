// ==UserScript==
// @name         B站直播间亲密度面板
// @name:en      Bilibili Live Fan Medal Panel
// @namespace    https://github.com/bingwaa/qmdmb
// @version      1.3.1
// @author       bingwaa
// @description     在B站直播间顶栏嵌入按钮，展示该主播粉丝团亲密度、今日获取亲密度、逐项每日任务与亲密之旅进度
// @description:en  Enhancing the experience of watching Bilibili live streaming
// @description:zh-CN  在B站直播间顶栏嵌入按钮，展示该主播粉丝团亲密度、今日获取亲密度、逐项每日任务与亲密之旅进度
// @license      MIT
// @copyright    2026, bingwaa (https://github.com/bingwaa/qmdmb)
// @homepageURL  https://github.com/bingwaa/qmdmb
// @supportURL   https://github.com/bingwaa/qmdmb/issues
// @updateURL    https://raw.githubusercontent.com/bingwaa/qmdmb/main/qmdmb.user.js
// @downloadURL  https://raw.githubusercontent.com/bingwaa/qmdmb/main/qmdmb.user.js
// @match        https://live.bilibili.com/*
// @grant        none
// @run-at       document-start
// ==/UserScript==

(function () {
  'use strict';

  const BTN_ID = 'qmdmb-fanpanel-btn';
  const PANEL_ID = 'qmdmb-fanpanel';
  const STYLE_ID = 'qmdmb-fanpanel-style';
  const TOAST_ID = 'qmdmb-fanpanel-toast';
  const ENTRY_SEL = '.follow-ctnr[data-curbutton="joinFansClub"]';
  const FOLLOW_SEL = '.follow-ctnr[data-curbutton="unFollow"]';
  const OFFLINE_SEL = '.status-tag';

  const API_ROOMINIT = 'https://api.live.bilibili.com/room/v1/Room/room_init';
  const API_ROOM = 'https://api.live.bilibili.com/xlive/web-room/v1/index/getInfoByRoom';
  const API_MYMEDS = 'https://api.live.bilibili.com/xlive/app-ucenter/v1/user/GetMyMedals';
  const API_ACTIVATED = 'https://api.live.bilibili.com/xlive/app-ucenter/v1/fansMedal/GetActivatedMedalInfo';
  const API_COINEXP = 'https://api.bilibili.com/x/web-interface/coin/today/exp';
  const API_NAV = 'https://api.bilibili.com/x/web-interface/nav';
  const COIN_EXP_PER_COIN = 10;
  const GOLD_PER_BATTERY = 100;
  const DAY_MS = 24 * 3600 * 1000;
  const WS_SUB_RE = /\/sub(\?|$)/;
  const LIGHT_GIFT = '粉丝团灯牌';
  const GIFT_STORE = 'qmdmb-gifts-';
  const GIFT_REV = 'v2';

  const OP_HEARTBEAT = 2;
  const OP_AUTH = 7;
  const HEARTBEAT_MS = 30 * 1000;
  const RETRY_MS = 3 * 1000;
  const RETRY_MAX_MS = 60 * 1000;

  const TASKMETA = {
    feedLight: '投喂粉丝灯牌',
    watchLive: '观看直播满15分钟',
    sendGift: '投喂礼物',
    sendDanmu: '发弹幕',
    like: '点赞30次'
  };
  const TASKREWARD = {
    feedLight: '+6亲密度',
    watchLive: '+1亲密度',
    sendGift: '+1亲密度/电池',
    sendDanmu: '+1亲密度',
    like: '+1亲密度'
  };
  const TASKACT = {
    watchLive: '去观看',
    feedLight: '去投喂',
    sendGift: '去投喂',
    sendDanmu: '去发弹幕',
    like: '去点赞'
  };
  const TASKS_FALLBACK = [
    '观看直播 5 分钟 / 时长（每日有限额）',
    '首条投喂粉丝团灯牌',
    '点赞 / 弹幕互动',
    '直播间外：给主播投币（每日上限）',
    '直播间外：给主播充电（1 B 币）'
  ];
  const GUARDNAME = { 1: '总督', 2: '提督', 3: '舰长' };

  function esc(s) {
    return String(s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  }

  function fmt(n) {
    return Number(n).toLocaleString();
  }

  function initialState() {
    try { return window.__INITIAL_STATE__ || {}; } catch (e) { return {}; }
  }

  function getRoomId() {
    const m = /(\d+)/.exec(location.pathname);
    return m ? m[1] : '';
  }

  function dayStamp() {
    const d = new Date();
    return d.getFullYear() + '-' + (d.getMonth() + 1) + '-' + d.getDate();
  }

  function cookie(name) {
    return (document.cookie.match(new RegExp('(?:^|; )' + name + '=([^;]*)')) || [])[1] || '';
  }

  async function fetchJson(url) {
    const r = await fetch(url, { credentials: 'include' });
    if (!r.ok) throw new Error('HTTP ' + r.status);
    return r.json();
  }

  /* ---------- 房间与亲密度数据 ---------- */

  async function resolveRoom() {
    const ini = initialState();
    const ri = ini.roomInfo || ini.roomInitRes || {};
    if (ri.room_id || ri.uid) return { roomId: ri.room_id, uid: ri.uid };
    const urlId = getRoomId();
    if (!urlId) throw new Error('未识别到房间号');
    const j = await fetchJson(API_ROOMINIT + '?id=' + urlId);
    if (j.code !== 0) throw new Error('解析房间失败(' + j.code + ')：' + (j.message || ''));
    const d = j.data || {};
    return { roomId: d.room_id || urlId, uid: d.uid };
  }

  async function getRoomMeta(roomId) {
    const ri = initialState().roomInfo || initialState().roomInitRes || {};
    let liveStatus = ri.live_status != null ? ri.live_status : null;
    let uname = ((ri.anchor_info || {}).base_info || {}).uname || '';
    if (liveStatus == null) {
      const t = (document.body && document.body.innerText) || '';
      if (/暂未开播|未开播|主播还没来|主播偷偷溜走/.test(t)) liveStatus = 0;
      else if (/正在直播|直播中/.test(t)) liveStatus = 1;
    }
    try {
      const j = await fetchJson(API_ROOM + '?room_id=' + roomId);
      const d = j.code === 0 ? j.data : null;
      if (d && d.room_info && d.room_info.live_status != null) liveStatus = d.room_info.live_status;
      if (d && d.anchor_info && d.anchor_info.base_info && d.anchor_info.base_info.uname) uname = d.anchor_info.base_info.uname;
    } catch (e) {}
    return { liveStatus, uname };
  }

  async function getMyMedal(uid) {
    for (let page = 1; page <= 10; page++) {
      const j = await fetchJson(API_MYMEDS + '?page=' + page + '&page_size=10');
      if (j.code !== 0) return null;
      const items = (j.data && (j.data.items || j.data.list)) || [];
      const m = items.find((x) => String(x.target_id) === String(uid));
      if (m) return m;
      const totalPage = (j.data && j.data.page_info && j.data.page_info.total_page) || 1;
      if (page >= totalPage || items.length === 0) break;
    }
    return null;
  }

  async function fetchTasks(uid) {
    const csrf = cookie('bili_jct');
    const base = 'target_id=' + encodeURIComponent(uid) + '&web_location=444.260';
    const tail = csrf ? '&csrf=' + csrf : '';
    const urls = [
      API_ACTIVATED + '?' + base + '&platform=pc&scene=club' + tail,
      API_ACTIVATED + '?' + base + tail
    ];
    let reason = '网络错误';
    for (let i = 0; i < urls.length; i++) {
      let j;
      try { j = await fetchJson(urls[i]); } catch (e) { continue; }
      if (j.code === 0 && j.data) {
        return {
          ok: true,
          tasks: j.data.task_info || [],
          free: j.data.free_intimacy,
          reach: j.data.reach_free_intimacy_limit,
          journey: j.data.intimacy_journey_info || null,
          guard: Number(j.data.guard_level) || 0
        };
      }
      reason = (j.message || '') + (j.code != null ? '(' + j.code + ')' : '') ||
        ('任务进度接口 code ' + (j.code != null ? j.code : '?'));
    }
    return { ok: false, reason };
  }

  async function fetchCoins() {
    let j;
    try { j = await fetchJson(API_COINEXP); } catch (e) { return null; }
    if (!j || j.code !== 0) return null;
    return Math.floor((Number(j.data) || 0) / COIN_EXP_PER_COIN);
  }

  /* ---------- 当前用户 uid ---------- */

  let myUidCache = 0;

  function myUid() {
    if (myUidCache) return myUidCache;
    const m = cookie('DedeUserID').match(/^(\d+)$/);
    if (m) myUidCache = Number(m[1]);
    else if (initialState().uid) myUidCache = Number(initialState().uid);
    return myUidCache;
  }

  async function loadUid() {
    if (myUid()) return;
    try {
      const j = await fetchJson(API_NAV);
      const mid = j && j.data && j.data.mid;
      if (mid) myUidCache = Number(mid);
    } catch (e) {}
  }

  /* ---------- 二进制工具 ---------- */

  function viewOf(d) {
    if (ArrayBuffer.isView(d)) return new Uint8Array(d.buffer, d.byteOffset, d.byteLength);
    if (Object.prototype.toString.call(d) === '[object ArrayBuffer]') return new Uint8Array(d);
    return null;
  }

  function textOf(d) {
    const u8 = viewOf(d);
    return u8 ? new TextDecoder().decode(u8) : (typeof d === 'string' ? d : null);
  }

  async function toU8(d) {
    if (d == null || typeof d === 'string') return null;
    const u8 = viewOf(d);
    if (u8) return u8;
    if (typeof d.arrayBuffer === 'function') {
      try { return new Uint8Array(await d.arrayBuffer()); } catch (e) { return null; }
    }
    return null;
  }

  function b64ToU8(s) {
    const bin = atob(s);
    const u8 = new Uint8Array(bin.length);
    for (let i = 0; i < bin.length; i++) u8[i] = bin.charCodeAt(i);
    return u8;
  }

  /* ---------- protobuf 扫描 ---------- */

  function pbScan(b, start, end) {
    const out = {};
    let i = start;
    while (i < end) {
      let key = 0, sh = 0, x;
      do { x = b[i++]; key += (x & 0x7f) * 2 ** sh; sh += 7; } while (x & 0x80);
      const f = Math.floor(key / 8), w = key % 8;
      if (w === 0) {
        let v = 0; sh = 0;
        do { x = b[i++]; v += (x & 0x7f) * 2 ** sh; sh += 7; } while (x & 0x80);
        out[f] = { n: v };
      } else if (w === 2) {
        let n = 0; sh = 0;
        do { x = b[i++]; n += (x & 0x7f) * 2 ** sh; sh += 7; } while (x & 0x80);
        out[f] = { s: i, e: i + n };
        i += n;
      } else if (w === 5) i += 4;
      else if (w === 1) i += 8;
      else break;
    }
    return out;
  }

  function pbText(b, f) {
    return new TextDecoder().decode(b.subarray(f.s, f.e));
  }

  function pbGift(b64) {
    let buf;
    try { buf = b64ToU8(b64); } catch (e) { return null; }
    const top = pbScan(buf, 0, buf.length);
    if (!top[1] || !top[1].n) return null;
    const g = top[10] ? pbScan(buf, top[10].s, top[10].e) : {};
    const name = g[2] ? pbText(buf, g[2]) : '礼物';
    const num = g[3] && g[3].n ? g[3].n : 1;
    const price = g[5] && g[5].n ? g[5].n : 0;
    const coin = g[8] ? pbText(buf, g[8]) : '';
    return {
      uid: top[1].n,
      name: name,
      num: num,
      battery: coin === 'gold' ? Math.floor((price * num) / GOLD_PER_BATTERY) : 0
    };
  }

  function giftOf(d) {
    if (d.pb) return pbGift(d.pb);
    if (d.giftName || d.uid) {
      const num = Number(d.num) || 1;
      const battery = String(d.coin_type) === 'gold'
        ? Math.floor(((Number(d.total_coin) || 0) / GOLD_PER_BATTERY) * num)
        : 0;
      return { uid: d.uid, name: String(d.giftName || '礼物'), num: num, battery: battery };
    }
    return null;
  }

  /* ---------- 礼物累计与存储 ---------- */

  const giftRows = [];
  let feedLightSeen = false;

  function giftKey() {
    return GIFT_STORE + GIFT_REV + '-' + getRoomId() + '-' + dayStamp();
  }

  function loadGifts() {
    const room = getRoomId();
    const key = giftKey();
    try {
      if (room) {
        const prefix = GIFT_STORE + GIFT_REV + '-' + room + '-';
        for (let i = localStorage.length - 1; i >= 0; i--) {
          const k = localStorage.key(i);
          if (k && k.indexOf(prefix) === 0 && k !== key) localStorage.removeItem(k);
        }
      }
      const arr = JSON.parse(localStorage.getItem(key) || 'null');
      if (!Array.isArray(arr)) return;
      giftRows.length = 0;
      arr.forEach((g) => {
        if (g && g.name) {
          giftRows.push({ name: String(g.name), num: Number(g.num) || 0, battery: Number(g.battery) || 0 });
        }
      });
    } catch (e) {}
  }

  function saveGifts() {
    try { localStorage.setItem(giftKey(), JSON.stringify(giftRows)); } catch (e) {}
  }

  function feedTaskDone() {
    const t = renderArgs && renderArgs.tasks
      ? renderArgs.tasks.find((x) => x.jump_type === 'feedLight')
      : null;
    return !!(t && (t.is_done === 1 || t.is_done === true));
  }

  function pushGift(g) {
    if (g.name === LIGHT_GIFT) {
      if (!feedLightSeen && !feedTaskDone()) { feedLightSeen = true; return; }
      g.battery = g.num;
    }
    const found = giftRows.find((x) => x.name === g.name);
    if (found) {
      found.num += g.num;
      found.battery += g.battery;
    } else {
      giftRows.push({ name: g.name, num: g.num, battery: g.battery });
    }
    saveGifts();
    rerender();
  }

  /* ---------- WebSocket 抓包 ---------- */

  function onMessages(text) {
    let arr;
    try { arr = JSON.parse(typeof text === 'string' ? text : String(text)); } catch (e) { DBG.jsonFail++; return; }
    if (!Array.isArray(arr)) arr = [arr];
    DBG.sms++;
    const me = myUid();
    for (let i = 0; i < arr.length; i++) {
      const m = arr[i];
      if (!m || typeof m.cmd !== 'string' || m.cmd.indexOf('SEND_GIFT') !== 0) continue;
      DBG.gift++;
      const g = giftOf(m.data || {});
      if (g && me && String(g.uid) === String(me)) { DBG.mine++; pushGift(g); }
    }
  }

  function looksFrames(b) {
    if (b.length < 16) return false;
    const dv = new DataView(b.buffer, b.byteOffset, b.byteLength);
    const len = dv.getUint32(0);
    const hl = dv.getUint16(4);
    const op = dv.getUint32(8);
    return len >= 16 && hl >= 16 && len <= b.length && op > 0 && op < 100;
  }

  async function inflate(bytes) {
    if (!window.DecompressionStream) return null;
    try {
      const s = new Blob([bytes]).stream().pipeThrough(new DecompressionStream('deflate'));
      return new Uint8Array(await new Response(s).arrayBuffer());
    } catch (e) {
      return null;
    }
  }

  function readFrames(u8) {
    const buf = u8.buffer.slice(u8.byteOffset, u8.byteOffset + u8.byteLength);
    const dv = new DataView(buf);
    let off = 0;
    while (off + 16 <= buf.byteLength) {
      const len = dv.getUint32(off);
      const hlen = dv.getUint16(off + 4);
      const ver = dv.getUint16(off + 6);
      const op = dv.getUint32(off + 8);
      if (len < 16 || off + len > buf.byteLength) break;
      DBG.frame++;
      DBG.ops[op] = (DBG.ops[op] || 0) + 1;
      DBG.vers[ver] = (DBG.vers[ver] || 0) + 1;
      if (op === 8 && hlen >= 16 && !DBG.authReply) {
        DBG.authReply = new TextDecoder().decode(new Uint8Array(buf, off + hlen, Math.min(len - hlen, 300)));
      }
      if (op === 5 && hlen >= 16) {
        const body = new Uint8Array(buf, off + hlen, len - hlen);
        if (ver === 0) onMessages(new TextDecoder().decode(body));
        else if (ver === 2) {
          inflate(body).then((out) => {
            if (!out || !out.length) return;
            if (looksFrames(out)) readFrames(out);
            else onMessages(new TextDecoder().decode(out));
          });
        }
      }
      off += len;
    }
  }

  const PROTOVER = new TextEncoder().encode('"protover"');
  const SPACE = 0x20, COLON = 0x3a, TWO = 0x32, THREE = 0x33;

  function findProtover(u8) {
    const n = u8.length - PROTOVER.length;
    for (let i = 0; i <= n; i++) {
      if (u8[i] !== PROTOVER[0]) continue;
      let j = 1;
      while (j < PROTOVER.length && u8[i + j] === PROTOVER[j]) j++;
      if (j === PROTOVER.length) return i;
    }
    return -1;
  }

  function patchProtover(u8) {
    let from = 0;
    for (;;) {
      const at = findProtover(u8.subarray(from));
      if (at < 0) return false;
      let k = from + at + PROTOVER.length;
      while (k < u8.length && (u8[k] === SPACE || u8[k] === COLON)) k++;
      if (u8[k] === THREE) { u8[k] = TWO; return true; }
      from += at + PROTOVER.length;
    }
  }

  async function onFrame(data) {
    if (typeof data === 'string') { onMessages(data); return; }
    let u8 = null;
    try { u8 = await toU8(data); } catch (e) {}
    if (!u8 || u8.length < 16) return;
    try { readFrames(u8); } catch (e) {}
  }

  function packetOp(u8) {
    return new DataView(u8.buffer, u8.byteOffset, u8.byteLength).getUint32(8);
  }

  function makeBeat() {
    const body = new TextEncoder().encode('[object Object]');
    const buf = new Uint8Array(16 + body.length);
    const dv = new DataView(buf.buffer);
    dv.setUint32(0, buf.length);
    dv.setUint16(4, 16);
    dv.setUint16(6, 1);
    dv.setUint32(8, OP_HEARTBEAT);
    dv.setUint32(12, 1);
    buf.set(body, 16);
    return buf;
  }

  const DBG = {
    pageSend: 0, auth: 0, authOp: -1, authPatched: 0, authText: '', authReply: '',
    beat: 0, url: '', open: 0, close: 0, closeCode: 0, closeReason: '', err: 0,
    msg: 0, frame: 0, ops: {}, vers: {}, sms: 0, jsonFail: 0, gift: 0, mine: 0
  };
  window.__qmdmb = DBG;
  if (document.documentElement) document.documentElement.__qmdmb = DBG;

  let ownWs = null;
  let ownUrl = '';
  let ownAuth = null;
  let ownBeat = null;
  let ownBeatTimer = null;
  let ownRetryTimer = null;
  let ownRetryWait = RETRY_MS;

  /* 只读观察页面自己的 /sub 连接：抓走鉴权包与心跳包，页面数据原样发出 */
  function onPageSend(url, data) {
    if (!url || !WS_SUB_RE.test(url)) return;
    DBG.pageSend++;
    const u8 = viewOf(data);
    if (!u8) {
      if (typeof data === 'string' && data.indexOf('"protover"') >= 0) acceptAuth(url, data);
      return;
    }
    if (u8.length < 16) return;
    const op = packetOp(u8);
    if (op === OP_AUTH) acceptAuth(url, u8);
    else if (op === OP_HEARTBEAT) { DBG.beat++; if (!ownBeat) ownBeat = u8.slice(); }
  }

  function acceptAuth(url, auth) {
    const text = typeof auth === 'string' ? auth : textOf(auth);
    const mu = /"uid"\s*:\s*(\d+)/.exec(text || '');
    if (mu) myUidCache = Number(mu[1]);
    if (ownWs && ownUrl === url && ownWs.readyState <= 1) return;
    DBG.auth++;
    DBG.authText = String(text || '').slice(0, 300);
    DBG.url = url;
    ownUrl = url;
    if (typeof auth === 'string') {
      ownAuth = auth.replace(/"protover"\s*:\s*3/g, '"protover":2');
      DBG.authPatched = ownAuth === auth ? 0 : 1;
    } else {
      const copy = auth.slice();
      DBG.authPatched = patchProtover(copy) ? 1 : 0;
      ownAuth = copy;
    }
    connectOwn();
  }

  function connectOwn() {
    closeOwn();
    if (!ownAuth) return;
    let ws;
    try { ws = new WebSocket(ownUrl); } catch (e) { scheduleRetry(); return; }
    ws.binaryType = 'arraybuffer';
    ownWs = ws;
    ws.onopen = () => {
      DBG.open++;
      ownRetryWait = RETRY_MS;
      try { ws.send(ownAuth); } catch (e) {}
      ownBeatTimer = setInterval(() => {
        if (ws.readyState !== 1) return;
        try { ws.send(ownBeat || makeBeat()); } catch (e) {}
      }, HEARTBEAT_MS);
    };
    ws.onmessage = (e) => { DBG.msg++; onFrame(e.data); };
    ws.onclose = (e) => {
      DBG.close++;
      DBG.closeCode = e && e.code;
      DBG.closeReason = String((e && e.reason) || '').slice(0, 80);
      if (ownWs !== ws) return;
      ownWs = null;
      stopBeat();
      scheduleRetry();
    };
    ws.onerror = () => { DBG.err++; };
  }

  function stopBeat() {
    clearInterval(ownBeatTimer);
    ownBeatTimer = null;
  }

  function closeOwn() {
    stopBeat();
    clearTimeout(ownRetryTimer);
    ownRetryTimer = null;
    const ws = ownWs;
    ownWs = null;
    if (!ws) return;
    ws.onopen = ws.onmessage = ws.onclose = ws.onerror = null;
    try { ws.close(); } catch (e) {}
  }

  function scheduleRetry() {
    if (!ownAuth || ownRetryTimer) return;
    const wait = ownRetryWait;
    ownRetryWait = Math.min(wait * 2, RETRY_MAX_MS);
    ownRetryTimer = setTimeout(() => {
      ownRetryTimer = null;
      connectOwn();
    }, wait);
  }

  function installWsHook() {
    const proto = window.WebSocket && window.WebSocket.prototype;
    if (!proto || proto.__qmdmb) return;
    const origSend = proto.send;
    proto.send = function (data) {
      try {
        if (this !== ownWs) onPageSend(this.url, data);
      } catch (e) {}
      return origSend.call(this, data);
    };
    proto.__qmdmb = true;
  }

  /* ---------- 面板渲染 ---------- */

  let renderArgs = null;
  let rerenderTimer = null;

  function rerender() {
    if (!renderArgs) return;
    clearTimeout(rerenderTimer);
    rerenderTimer = setTimeout(() => {
      if (document.getElementById(PANEL_ID)) renderPanel(renderArgs);
    }, 300);
  }

  function liveInfo(status) {
    if (status === 1) return { cls: 'on', text: '直播中' };
    if (status === 0 || status === 2) return { cls: 'off', text: '未开播' };
    return { cls: 'unk', text: '状态未知' };
  }

  function toast(msg, ok) {
    let t = document.getElementById(TOAST_ID);
    if (!t) {
      t = document.createElement('div');
      t.id = TOAST_ID;
      document.documentElement.appendChild(t);
    }
    t.textContent = msg;
    t.style.cssText =
      'position:fixed;left:16px;bottom:64px;z-index:2147483000;padding:8px 14px;' +
      'background:rgba(0,0,0,.85);color:#fff;font-size:13px;border-radius:6px;' +
      'max-width:320px;transition:opacity .4s;border:1px solid ' + (ok ? '#fb7299' : '#ff4d4f') + ';';
    t.style.opacity = '1';
    clearTimeout(t._t);
    t._t = setTimeout(() => (t.style.opacity = '0'), 2800);
  }

  function ensureStyle() {
    if (document.getElementById(STYLE_ID)) return;
    const st = document.createElement('style');
    st.id = STYLE_ID;
    st.textContent = `
      #${PANEL_ID}{position:fixed;left:16px;bottom:64px;z-index:2147483000;width:300px;
        background:rgba(20,20,22,.95);border:1px solid #fb7299;border-radius:10px;
        color:#e6e6e6;font:13px/1.6 -apple-system,"Microsoft YaHei",sans-serif;
        padding:12px 14px;box-shadow:0 4px 20px rgba(0,0,0,.5);}
      #${PANEL_ID} .hd{position:relative;padding-right:20px;font-size:15px;font-weight:600;color:#fff;margin-bottom:10px;}
      #${PANEL_ID} .x{position:absolute;right:0;top:1px;width:16px;height:16px;line-height:16px;text-align:center;
        color:#9a9a9a;cursor:pointer;font-size:15px;font-weight:400;border-radius:4px;}
      #${PANEL_ID} .x:hover{color:#fff;background:rgba(255,255,255,.14);}
      #${PANEL_ID} .tag{font-size:12px;color:#fb7299;border:1px solid #fb7299;border-radius:4px;
        padding:1px 6px;margin-left:8px;vertical-align:middle;}
      #${PANEL_ID} .dim{color:#9a9a9a;font-size:12px;}
      #${PANEL_ID} .save{margin:8px 0 0;color:#e6c07b;font-size:13px;}
      #${PANEL_ID} .save b{color:#ffd97a;font-size:15px;}
      #${PANEL_ID} .save-off{color:#9a9a9a;font-size:12px;}
      #${PANEL_ID} .bar{height:8px;background:rgba(255,255,255,.12);border-radius:5px;overflow:hidden;margin:8px 0;}
      #${PANEL_ID} .bar i{display:block;height:100%;background:linear-gradient(90deg,#fb7299,#ffb0c6);border-radius:5px;}
      #${PANEL_ID} .row{margin:4px 0;}
      #${PANEL_ID} .tasks{margin-top:10px;border-top:1px dashed rgba(255,255,255,.16);padding-top:8px;}
      #${PANEL_ID} .tasks .tt{color:#fb7299;font-weight:600;margin-bottom:6px;}
      #${PANEL_ID} .tasks .task{margin:8px 0;}
      #${PANEL_ID} .t-row{display:flex;align-items:center;gap:8px;}
      #${PANEL_ID} .t-row .n{flex:1 1 auto;min-width:0;color:#fff;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;}
      #${PANEL_ID} .t-meta{margin-top:2px;color:#9a9a9a;font-size:12px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;}
      #${PANEL_ID} .p-pill{flex:0 0 auto;font-size:12px;border-radius:12px;padding:2px 10px;white-space:nowrap;}
      #${PANEL_ID} .p-done{color:#9adc9a;border:1px solid #9adc9a;}
      #${PANEL_ID} .p-action{color:#fff;background:#f0a13c;border:1px solid #f0a13c;}
      #${PANEL_ID} .journey{margin-top:10px;border-top:1px dashed rgba(255,255,255,.16);padding-top:8px;}
      #${PANEL_ID} .journey .tt{color:#fb7299;font-weight:600;margin-bottom:6px;}
      #${PANEL_ID} .journey .tt span{font-weight:400;margin-left:6px;}
      #${PANEL_ID} .jseg{display:flex;gap:4px;margin:8px 0 0;}
      #${PANEL_ID} .jseg i{flex:1 1 0;height:8px;border-radius:3px;background:rgba(255,255,255,.12);}
      #${PANEL_ID} .jseg i.on{background:linear-gradient(90deg,#fb7299,#ffb0c6);}
      #${PANEL_ID} .gain{margin-top:10px;border-top:1px dashed rgba(255,255,255,.16);padding-top:8px;}
      #${PANEL_ID} .gain .tt{color:#fb7299;font-weight:600;margin-bottom:6px;}
      #${PANEL_ID} .g-row{display:flex;align-items:center;gap:8px;margin:5px 0;}
      #${PANEL_ID} .gname{flex:1 1 auto;min-width:0;color:#fff;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;}
      #${PANEL_ID} .gcnt{flex:0 0 auto;font-size:12px;color:#9a9a9a;}
      #${PANEL_ID} .gplus{flex:0 0 auto;color:#7bd88f;font-weight:600;}
      #${PANEL_ID} .g-sum{margin-top:7px;font-size:12px;color:#9a9a9a;}
      #${PANEL_ID} .g-sum b{color:#ffd97a;font-size:14px;}
      #${PANEL_ID} .off{color:#ff9a3c;} #${PANEL_ID} .on{color:#7bd88f;} #${PANEL_ID} .unk{color:#8a8a8a;}
    `;
    document.head.appendChild(st);
  }

  function tasksHtml(tasks) {
    const rows = tasks.map((t) => {
      const type = t.jump_type;
      const name = TASKMETA[type] || t.title || '任务';
      const mm = /(\d+)\s*\/\s*(\d+)/.exec(String(t.sub_title || ''));
      const done = t.is_done === 1 || t.is_done === true;
      const pill = done
        ? '<span class="p-pill p-done">已完成</span>'
        : '<span class="p-pill p-action">' + (TASKACT[type] || '去完成') + '</span>';
      const meta = [TASKREWARD[type] || '', mm ? '每日上限 ' + mm[1] + '/' + mm[2] : ''].filter(Boolean).join(' · ');
      return '<div class="task"><div class="t-row"><span class="n">' + esc(name) + '</span>' + pill + '</div>' +
        (meta ? '<div class="t-meta">' + esc(meta) + '</div>' : '') + '</div>';
    }).join('');
    return rows || '<div class="dim">今日暂无可用任务</div>';
  }

  function journeyHtml(info) {
    if (!info || !info.enable) return '';
    const total = Number(info.total_days) || 0;
    if (total <= 0) return '';
    const done = Math.min(Number(info.completed_days) || 0, total);

    let seg = '';
    for (let i = 0; i < total; i++) seg += '<i class="' + (i < done ? 'on' : '') + '"></i>';

    let stateRow = '';
    const left = (Number(info.task_intimacy_journey_gift_expire_ts) || 0) * 1000 - Date.now();
    if (info.has_task_intimacy_journey_gift && left > 0) {
      const days = Math.floor(left / DAY_MS);
      const hh = String(Math.floor((left % DAY_MS) / 3600000)).padStart(2, '0');
      const mm = String(Math.floor((left % 3600000) / 60000)).padStart(2, '0');
      stateRow = '<div class="save">旅程礼物已解锁 · 剩余 ' + (days >= 1 ? days + ' 天' : hh + ':' + mm) + ' 领取时限</div>';
    }

    return '<div class="journey"><div class="tt">亲密之旅<span class="dim">已完成 ' + done + ' / ' + total + ' 天</span></div>' +
      '<div class="jseg">' + seg + '</div>' + stateRow + '</div>';
  }

  function gainRowHtml(r) {
    return '<div class="g-row"><span class="gname">' + esc(r.name) + '</span>' +
      '<span class="gcnt">' + esc(r.mid) + '</span>' +
      (r.gained == null ? '' : '<span class="gplus">+' + r.gained + '</span>') + '</div>';
  }

  function gainHtml(tasks, medal, guard, coins) {
    if (!tasks || !tasks.length) return '';
    const rows = [];
    tasks.forEach((t) => {
      const mm = /(\d+)\s*\/\s*(\d+)/.exec(String(t.sub_title || ''));
      if (!mm || !Number(mm[1])) return;
      const unit = (/亲密度\s*\+\s*(\d+)/.exec(String(t.add_text || '')) || [0, 0])[1];
      rows.push({
        name: TASKMETA[t.jump_type] || t.title || '任务',
        mid: mm[1] + '/' + mm[2],
        gained: Number(mm[1]) * Number(unit)
      });
    });
    giftRows.forEach((g) => rows.push({ name: g.name, mid: '×' + g.num, gained: g.battery }));

    const sum = rows.reduce((a, r) => a + r.gained, 0);
    let body = rows.length ? rows.map(gainRowHtml).join('') : '<div class="dim">今日暂无亲密度增长</div>';
    if (coins > 0) body += gainRowHtml({ name: '投币', mid: '全站 ' + coins + ' 币', gained: null });

    let total = sum;
    let foot = '<div class="g-sum">明细合计 <b>+' + sum + '</b>';
    if (guard > 0) {
      const boosted = Math.round(sum * 15) / 10;
      total = Math.round(boosted);
      foot += ' ×1.5 = ' + boosted + (Number.isInteger(boosted) ? '' : '（<b>' + total + '</b>）');
    }
    foot += '</div>';
    const tFeed = medal && medal.today_feed != null ? Number(medal.today_feed) : null;
    if (tFeed != null && tFeed - total > 0) {
      foot += '<div class="g-sum dim">其他（充电/投币/分享）+' + (tFeed - total) + '</div>';
    }
    return '<div class="gain"><div class="tt">今日亲密度增长明细</div>' + body + foot + '</div>';
  }

  function renderPanel(s) {
    renderArgs = s;
    ensureStyle();
    let p = document.getElementById(PANEL_ID);
    if (!p) {
      p = document.createElement('div');
      p.id = PANEL_ID;
      p.addEventListener('click', (e) => {
        if (e.target && e.target.classList && e.target.classList.contains('x')) p.remove();
      });
      document.documentElement.appendChild(p);
    }

    const room = s.room, medal = s.medal, tasks = s.tasks;
    const live = liveInfo(room.liveStatus);
    const uname = (medal && medal.target_name) || room.uname || '主播';

    if (!medal && !tasks) {
      p.innerHTML =
        '<div class="hd">' + esc(uname) + '<span class="dim"> 粉丝团</span>' +
        ' <span class="' + live.cls + '">' + live.text + '</span><span class="x" title="关闭">×</span></div>' +
        '<div class="dim">你尚未加入该主播的粉丝团。</div>' +
        (s.reason ? '<div class="row dim">' + esc(s.reason) + '</div>' : '');
      return;
    }

    const name = medal ? (medal.medal_name || uname) : uname;
    const tasksSection = '<div class="tasks"><div class="tt">每日任务</div>' +
      (tasks ? tasksHtml(tasks) : TASKS_FALLBACK.map((t) => '<div class="task"><div class="t-meta">' + t + '</div></div>').join('')) +
      '</div>';

    let medalRows = '';
    if (medal) {
      const intimacy = medal.intimacy != null ? medal.intimacy : 0;
      const next = medal.next_intimacy != null ? medal.next_intimacy : 0;
      const pct = next > 0 ? Math.min(100, Math.round((intimacy / next) * 100)) : 0;
      medalRows = '<div class="row dim">目标主播：' + esc(uname) + '</div>' +
        '<div class="bar"><i style="width:' + pct + '%"></i></div>' +
        '<div class="row">亲密度 <b>' + fmt(intimacy) + '</b> / ' + fmt(next) + '</div>' +
        '<div class="row">今日亲密度 <b>' + fmt(medal.today_feed != null ? medal.today_feed : 0) + '</b> / ' +
          fmt(medal.day_limit != null ? medal.day_limit : 0) + '</div>';
    }

    let storeRow = '';
    if (s.store && s.store.free != null) {
      const n = Number(s.store.free);
      storeRow = n > 0
        ? '<div class="save">已储蓄 <b>' + fmt(n) + '</b> 亲密度' + (s.store.reach ? ' · 已达上限' : '') + ' · 投喂领取</div>'
        : '<div class="save save-off">暂无储蓄亲密度</div>';
    }

    const guard = GUARDNAME[s.guard];
    p.innerHTML =
      '<div class="hd">' + esc(name) +
        ' <span class="tag">Lv.' + (medal && medal.level != null ? medal.level : '?') + '</span>' +
        (guard ? '<span class="tag">' + guard + '</span>' : '') +
        ' <span class="' + live.cls + '">' + live.text + '</span><span class="x" title="关闭">×</span></div>' +
      medalRows +
      storeRow +
      journeyHtml(s.journey) +
      gainHtml(tasks, medal, s.guard, s.coins) +
      tasksSection;
  }

  async function open() {
    try {
      const room = await resolveRoom();
      const meta = await getRoomMeta(room.roomId);
      const medal = await getMyMedal(room.uid);
      const t = await fetchTasks(room.uid);
      const coins = await fetchCoins();
      renderPanel({
        room: { liveStatus: meta.liveStatus, uname: meta.uname },
        medal: medal,
        tasks: t.ok ? t.tasks : null,
        reason: t.ok ? null : t.reason,
        store: t.ok ? { free: t.free, reach: t.reach } : null,
        journey: t.ok ? t.journey : null,
        guard: t.ok ? t.guard : 0,
        coins: coins
      });
    } catch (e) {
      toast('打开失败：' + e.message, false);
    }
  }

  /* ---------- 按钮注入 ---------- */

  function togglePanel() {
    const p = document.getElementById(PANEL_ID);
    if (p) p.remove();
    else open();
  }

  function pick(sel) {
    const list = document.querySelectorAll(sel);
    for (let i = 0; i < list.length; i++) {
      if (list[i].id !== BTN_ID) return list[i];
    }
    return null;
  }

  function findTarget() {
    const cap = pick(ENTRY_SEL);
    if (cap) return { el: cap, after: false };
    const tags = document.querySelectorAll(OFFLINE_SEL);
    for (let i = 0; i < tags.length; i++) {
      if (tags[i].id !== BTN_ID && tags[i].textContent.indexOf('未开播') >= 0) {
        return { el: tags[i], after: true };
      }
    }
    const follow = pick(FOLLOW_SEL);
    return follow ? { el: follow, after: true } : null;
  }

  function makeEntry(src) {
    const btn = src.cloneNode(true);
    btn.id = BTN_ID;
    btn.title = '粉丝团任务';
    btn.removeAttribute('data-curbutton');
    btn.removeAttribute('data-curbuttonstrategy');
    const hint = btn.querySelector('.follow-key-prompt');
    if (hint) hint.remove();
    const text = btn.querySelector('.follow-info-prompt');
    if (text) {
      text.textContent = '任务';
    } else {
      const right = btn.querySelector('.right-part');
      if (right) right.remove();
      const left = btn.querySelector('.left-part');
      if (left) {
        left.innerHTML = '';
        left.appendChild(document.createTextNode('任务'));
      } else {
        btn.textContent = '任务';
      }
    }
    btn.style.setProperty('width', 'auto', 'important');
    btn.style.setProperty('min-width', '0', 'important');
    btn.style.setProperty('flex', '0 0 auto', 'important');
    btn.style.setProperty('cursor', 'pointer', 'important');
    btn.style.setProperty('user-select', 'none', 'important');
    btn.querySelectorAll('.followed, .left-part').forEach((el) => {
      el.style.setProperty('width', 'auto', 'important');
      el.style.setProperty('min-width', '0', 'important');
      el.style.setProperty('flex', '0 0 auto', 'important');
    });
    return btn;
  }

  function tighten(entry, cap) {
    requestAnimationFrame(() => {
      if (!entry.isConnected || !cap.isConnected) return;
      const gap = cap.getBoundingClientRect().left - entry.getBoundingClientRect().right;
      if (gap < -1 || Math.abs(gap) < 0.5) return;
      const cur = parseFloat(getComputedStyle(entry).marginRight) || 0;
      entry.style.setProperty('margin-right', cur - gap + 'px', 'important');
    });
  }

  function injectButton() {
    const target = findTarget();
    const old = document.getElementById(BTN_ID);
    if (old) {
      if (!target) return;
      if (old._cap === target.el) {
        tighten(old, target.el);
        return;
      }
      old.remove();
    }
    if (!target) return;
    const btn = makeEntry(pick(FOLLOW_SEL) || target.el);
    btn._cap = target.el;
    btn.addEventListener('click', (e) => {
      e.stopPropagation();
      e.preventDefault();
      togglePanel();
    });
    if (target.after) target.el.after(btn);
    else target.el.before(btn);
    tighten(btn, target.el);
  }

  /* ---------- 可见性 ---------- */

  let restingH = null;
  let missCount = 0;

  function refreshBtnVisibility() {
    const btn = document.getElementById(BTN_ID);
    if (!btn) return;
    const sv = document.getElementById('sections-vm');
    const lc = sv && sv.querySelector('.left-container');
    let open = false;
    if (lc) {
      const h = lc.getBoundingClientRect().height;
      restingH = restingH === null ? h : Math.min(restingH, h);
      open = restingH < 250 && h > restingH + 100;
    }
    if (open) {
      missCount = 0;
      btn.style.display = 'none';
    } else if (++missCount >= 2) {
      btn.style.display = '';
    }
  }

  function init() {
    if (!document.body) return;
    injectButton();
    refreshBtnVisibility();
  }

  function start() {
    init();
    setTimeout(init, 500);
    if (window.MutationObserver) {
      let t = null;
      new MutationObserver(() => {
        clearTimeout(t);
        t = setTimeout(init, 200);
      }).observe(document.body, { childList: true, subtree: true, attributes: true });
    }
    setInterval(refreshBtnVisibility, 1000);
  }

  installWsHook();
  loadGifts();
  loadUid();

  if (document.body) start();
  else document.addEventListener('DOMContentLoaded', start, { once: true });
})();
