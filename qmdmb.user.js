// ==UserScript==
// @name         B站直播间亲密度面板
// @name:en      Bilibili Live Fan Medal Panel
// @namespace    https://github.com/bingwaa/qmdmb
// @version      1.4.8
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
  const LIVE_PANEL_ID = 'qmdmb-fanpanel-live';
  const STYLE_ID = 'qmdmb-fanpanel-style';
  const WATCH_ID = 'qmdmb-fanpanel-watch';
  const BAR_ID = 'qmdmb-fanpanel-bar';
  const BEAT_ID = 'qmdmb-fanpanel-beat';
  const RESYNC_TICKS = 30;
  const TOAST_ID = 'qmdmb-fanpanel-toast';
  const ENTRY_SEL = '.follow-ctnr[data-curbutton="joinFansClub"]';
  const FOLLOW_SEL = '.follow-ctnr[data-curbutton="unFollow"]';
  const OFFLINE_SEL = '.status-tag';

  const API_ROOMINIT = 'https://api.live.bilibili.com/room/v1/Room/room_init';
  const API_ROOM = 'https://api.live.bilibili.com/xlive/web-room/v1/index/getInfoByRoom';
  const API_MYMEDS = 'https://api.live.bilibili.com/xlive/app-ucenter/v1/user/GetMyMedals';
  const API_ROOMSTATUS = 'https://api.live.bilibili.com/room/v1/Room/get_status_info_by_uids';
  const API_ACTIVATED = 'https://api.live.bilibili.com/xlive/app-ucenter/v1/fansMedal/GetActivatedMedalInfo';
  const API_COINEXP = 'https://api.bilibili.com/x/web-interface/coin/today/exp';
  const API_GUARDACTIVE = 'https://api.live.bilibili.com/xlive/general-interface/v1/guard/GuardActive';
  const API_NAV = 'https://api.bilibili.com/x/web-interface/nav';
  const COIN_EXP_PER_COIN = 10;
  const GOLD_PER_BATTERY = 100;
  const DAY_MS = 24 * 3600 * 1000;
  const WS_SUB_RE = /\/sub(\?|$)/;
  const LIGHT_GIFT = '粉丝团灯牌';
  const JOURNEY_GIFT = '亲密之旅';
  const JOURNEY_EXTRA = 150;
  const GIFT_STORE = 'qmdmb-gifts-';
  const GIFT_REV = 'v2';

  const OP_HEARTBEAT = 2;
  const OP_AUTH = 7;
  const HEARTBEAT_MS = 30 * 1000;
  const BEAT_TIMEOUT_MS = 45 * 1000;
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

  /* 分页遍历最多 10 页（page_size 上限 10），取全部持有粉丝牌 */
  async function fetchAllMedals() {
    const out = [];
    for (let page = 1; page <= 10; page++) {
      const j = await fetchJson(API_MYMEDS + '?page=' + page + '&page_size=10');
      if (j.code !== 0) break;
      const d = j.data || {};
      const items = d.items || d.list || [];
      items.forEach((x) => out.push(x));
      const totalPage = (d.page_info && d.page_info.total_page) || 1;
      if (page >= totalPage || items.length === 0) break;
    }
    return out;
  }

  /* 批量查询主播直播状态，data 以 uid 为键 */
  async function fetchRoomStatus(uids) {
    const map = {};
    for (let i = 0; i < uids.length; i += 50) {
      const part = uids.slice(i, i + 50);
      const q = part.map((u) => 'uids[]=' + encodeURIComponent(u)).join('&');
      try {
        const j = await fetchJson(API_ROOMSTATUS + '?' + q);
        if (j.code === 0 && j.data) Object.assign(map, j.data);
      } catch (e) {}
    }
    return map;
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

  async function fetchGuardActive(uid) {
    if (!uid) return null;
    try {
      const j = await fetchJson(API_GUARDACTIVE + '?ruid=' + encodeURIComponent(uid) + '&platform=pc');
      if (j.code !== 0 || !j.data) return null;
      const sec = Number(j.data.watch_time);
      const bar = Number(j.data.send_bar);
      return {
        sec: Number.isFinite(sec) && sec > 0 ? sec : null,
        bar: Number.isFinite(bar) && bar > 0 ? bar : null
      };
    } catch (e) {
      return null;
    }
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

  /* total_coin 在连击时累加，不与 num 相乘；优先用单价 × 数量 */
  function giftCoin(d, num) {
    const price = Number(d.price) || 0;
    const coin = price > 0 ? price * num : Number(d.total_coin) || 0;
    return Math.floor(coin / GOLD_PER_BATTERY);
  }

  function giftOf(d) {
    if (d.pb) return pbGift(d.pb);
    if (d.giftName || d.uid) {
      const num = Number(d.num) || 1;
      const battery = String(d.coin_type) === 'gold' ? giftCoin(d, num) : 0;
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
          giftRows.push({
            name: String(g.name),
            num: Number(g.num) || 0,
            battery: Number(g.battery) || 0,
            extra: Number(g.extra) || 0
          });
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
      if (!feedLightSeen && !feedTaskDone()) {
        /* 首个灯牌记为点亮任务，批量投喂的其余个数仍按 +1 计入 */
        feedLightSeen = true;
        g.num -= 1;
        if (g.num <= 0) return;
      }
      g.battery = g.num;
    }
    /* 亲密之旅礼物在电池收益之外额外增加 150 亲密度 */
    const extra = g.name === JOURNEY_GIFT ? JOURNEY_EXTRA * g.num : 0;
    const found = giftRows.find((x) => x.name === g.name);
    if (found) {
      found.num += g.num;
      found.battery += g.battery;
      found.extra = (found.extra || 0) + extra;
    } else {
      giftRows.push({ name: g.name, num: g.num, battery: g.battery, extra: extra });
    }
    saveGifts();
    rerender();
  }

  /* ---------- WebSocket 抓包 ---------- */

  function onMessages(text) {
    let arr;
    try { arr = JSON.parse(typeof text === 'string' ? text : String(text)); } catch (e) { return; }
    if (!Array.isArray(arr)) arr = [arr];
    const me = myUid();
    for (let i = 0; i < arr.length; i++) {
      const m = arr[i];
      if (!m || typeof m.cmd !== 'string' || m.cmd.indexOf('SEND_GIFT') !== 0) continue;
      const g = giftOf(m.data || {});
      if (g && me && String(g.uid) === String(me)) pushGift(g);
    }
  }

  function isZlib(b) {
    return b.length > 2 && (b[0] & 0x0f) === 8 && ((b[0] << 8) + b[1]) % 31 === 0;
  }

  function looksFrames(b) {
    if (b.length < 16) return false;
    const dv = new DataView(b.buffer, b.byteOffset, b.byteLength);
    const len = dv.getUint32(0);
    const hl = dv.getUint16(4);
    const op = dv.getUint32(8);
    return len >= 16 && hl >= 16 && len <= b.length && op > 0 && op < 100;
  }

  async function inflate(bytes, fmt) {
    if (!window.DecompressionStream) return null;
    try {
      const s = new Blob([bytes]).stream().pipeThrough(new DecompressionStream(fmt));
      return new Uint8Array(await new Response(s).arrayBuffer());
    } catch (e) {
      return null;
    }
  }

  function decodeBody(out) {
    if (looksFrames(out)) readFrames(out);
    else onMessages(new TextDecoder().decode(out));
  }

  function onInflated(p, ver) {
    p.then((out) => {
      if (out && out.length) decodeBody(out);
      else if (++decodeFails === 1) {
        console.warn('[qmdmb] 数据包解压失败 ver=' + ver + '，礼物与弹幕统计可能不完整');
      }
    });
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
      if (op === 5 && hlen >= 16) {
        const body = new Uint8Array(buf, off + hlen, len - hlen);
        if (ver === 3) onInflated(inflate(body, 'brotli'), 3);
        else if (ver === 2 || isZlib(body)) onInflated(inflate(body, 'deflate'), 2);
        else if (ver === 0 || ver === 1) onMessages(new TextDecoder().decode(body));
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
    const u8 = viewOf(data);
    if (!u8) {
      if (typeof data === 'string' && data.indexOf('"protover"') >= 0) acceptAuth(url, data);
      return;
    }
    if (u8.length < 16) return;
    const op = packetOp(u8);
    if (op === OP_AUTH) acceptAuth(url, u8);
    else if (op === OP_HEARTBEAT) { if (!ownBeat) ownBeat = u8.slice(); notePageBeat(url); }
  }

  function acceptAuth(url, auth) {
    const text = typeof auth === 'string' ? auth : textOf(auth);
    const mu = /"uid"\s*:\s*(\d+)/.exec(text || '');
    if (mu) myUidCache = Number(mu[1]);
    if (ownWs && ownUrl === url && ownWs.readyState <= 1) return;
    ownUrl = url;
    if (typeof auth === 'string') {
      ownAuth = auth.replace(/"protover"\s*:\s*3/g, '"protover":2');
    } else {
      const copy = auth.slice();
      patchProtover(copy);
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
      ownRetryWait = RETRY_MS;
      try { ws.send(ownAuth); } catch (e) {}
      ownBeatTimer = setInterval(() => {
        if (ws.readyState !== 1) return;
        try { ws.send(ownBeat || makeBeat()); } catch (e) {}
      }, HEARTBEAT_MS);
    };
    ws.onmessage = (e) => { onFrame(e.data); };
    ws.onclose = () => {
      if (ownWs !== ws) return;
      ownWs = null;
      stopBeat();
      scheduleRetry();
    };
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
    /* IDS 用于面板容器本身，P(sel) 展开成两个面板的同名后代选择器 */
    const IDS = '#' + PANEL_ID + ',#' + LIVE_PANEL_ID;
    const P = (sel) => '#' + PANEL_ID + ' ' + sel + ',#' + LIVE_PANEL_ID + ' ' + sel;
    st.textContent = `
      ${IDS}{position:fixed;left:16px;bottom:64px;z-index:2147483000;width:300px;
        background:rgba(20,20,22,.95);border:1px solid #fb7299;border-radius:10px;
        color:#e6e6e6;font:13px/1.6 -apple-system,"Microsoft YaHei",sans-serif;
        padding:12px 14px;box-shadow:0 4px 20px rgba(0,0,0,.5);}
      #${LIVE_PANEL_ID}{display:flex;flex-direction:column;box-sizing:border-box;}
      #${LIVE_PANEL_ID} .list{flex:1 1 auto;overflow-y:auto;min-height:0;}
      #${LIVE_PANEL_ID} .lv-row{display:flex;align-items:center;gap:8px;margin:6px 0;}
      #${LIVE_PANEL_ID} .lv-n{flex:1 1 auto;min-width:0;color:#fff;
        overflow:hidden;text-overflow:ellipsis;white-space:nowrap;}
      #${LIVE_PANEL_ID} .lv-s{flex:0 0 auto;font-size:12px;}
      #${LIVE_PANEL_ID} .lv-go{flex:0 0 auto;font-size:12px;color:#fb7299;
        border:1px solid #fb7299;border-radius:4px;padding:1px 6px;
        text-decoration:none;white-space:nowrap;}
      #${LIVE_PANEL_ID} .lv-go:hover{background:#fb7299;color:#fff;}
      ${P('.hd')}{position:relative;padding-right:56px;font-size:15px;font-weight:600;color:#fff;margin-bottom:10px;}
      ${P('.x')}{position:absolute;right:0;top:1px;width:16px;height:16px;line-height:16px;text-align:center;
        color:#9a9a9a;cursor:pointer;font-size:15px;font-weight:400;border-radius:4px;}
      ${P('.x:hover')}{color:#fff;background:rgba(255,255,255,.14);}
      ${P('.lb')}{position:absolute;right:22px;top:1px;height:16px;line-height:16px;padding:0 4px;
        color:#9a9a9a;cursor:pointer;font-size:12px;font-weight:400;border-radius:4px;}
      ${P('.lb:hover')}{color:#fff;background:rgba(255,255,255,.14);}
      ${P('.lb.on')}{color:#fb7299;}
      ${P('.tag')}{font-size:12px;color:#fb7299;border:1px solid #fb7299;border-radius:4px;
        padding:1px 6px;margin-left:8px;vertical-align:middle;}
      ${P('.dim')}{color:#9a9a9a;font-size:12px;}
      ${P('.save')}{margin:8px 0 0;color:#e6c07b;font-size:13px;}
      ${P('.save b')}{color:#ffd97a;font-size:15px;}
      ${P('.save-off')}{color:#9a9a9a;font-size:12px;}
      ${P('.bar')}{height:8px;background:rgba(255,255,255,.12);border-radius:5px;overflow:hidden;margin:8px 0;}
      ${P('.bar i')}{display:block;height:100%;background:linear-gradient(90deg,#fb7299,#ffb0c6);border-radius:5px;}
      ${P('.row')}{margin:4px 0;}
      ${P('.tasks')}{margin-top:10px;border-top:1px dashed rgba(255,255,255,.16);padding-top:8px;}
      ${P('.tasks .tt')}{color:#fb7299;font-weight:600;margin-bottom:6px;}
      ${P('.tasks .task')}{margin:8px 0;}
      ${P('.t-row')}{display:flex;align-items:center;gap:8px;}
      ${P('.t-row .n')}{flex:1 1 auto;min-width:0;color:#fff;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;}
      ${P('.t-meta')}{margin-top:2px;color:#9a9a9a;font-size:12px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;}
      ${P('.p-pill')}{flex:0 0 auto;font-size:12px;border-radius:12px;padding:2px 10px;white-space:nowrap;}
      ${P('.p-done')}{color:#9adc9a;border:1px solid #9adc9a;}
      ${P('.p-action')}{color:#fff;background:#f0a13c;border:1px solid #f0a13c;}
      ${P('.journey')}{margin-top:10px;border-top:1px dashed rgba(255,255,255,.16);padding-top:8px;}
      ${P('.journey .tt')}{color:#fb7299;font-weight:600;margin-bottom:6px;}
      ${P('.journey .tt span')}{font-weight:400;margin-left:6px;}
      ${P('.jseg')}{display:flex;gap:4px;margin:8px 0 0;}
      ${P('.jseg i')}{flex:1 1 0;height:8px;border-radius:3px;background:rgba(255,255,255,.12);}
      ${P('.jseg i.on')}{background:linear-gradient(90deg,#fb7299,#ffb0c6);}
      ${P('.gain')}{margin-top:10px;border-top:1px dashed rgba(255,255,255,.16);padding-top:8px;}
      ${P('.gain .tt')}{color:#fb7299;font-weight:600;margin-bottom:6px;}
      ${P('.g-row')}{display:flex;align-items:center;gap:8px;margin:5px 0;}
      ${P('.gname')}{flex:1 1 auto;min-width:0;color:#fff;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;}
      ${P('.gcnt')}{flex:0 0 auto;font-size:12px;color:#9a9a9a;}
      ${P('.gplus')}{flex:0 0 auto;color:#7bd88f;font-weight:600;}
      ${P('.g-sum')}{margin-top:7px;font-size:12px;color:#9a9a9a;}
      ${P('.g-sum b')}{color:#ffd97a;font-size:14px;}
      ${P('.off')}{color:#ff9a3c;} ${P('.on')}{color:#7bd88f;} ${P('.unk')}{color:#8a8a8a;}
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

  /* ---------- WS 心跳观测：只记录观测值，不统计观看时长 ---------- */

  let beatUrl = '';
  let decodeFails = 0;
  let beatAt = 0;
  let beatPrev = 0;
  let beatGap = 0;
  let beatCount = 0;

  function notePageBeat(url) {
    const now = Date.now();
    if (beatUrl === url && beatPrev) beatGap = now - beatPrev;
    else { beatGap = 0; beatUrl = url; }
    beatPrev = now;
    beatAt = now;
    beatCount++;
  }

  function beatText() {
    const parts = [];
    if (!beatAt) {
      parts.push('WS心跳：等待页面心跳包');
    } else {
      const idle = Math.round((Date.now() - beatAt) / 1000);
      parts.push('WS心跳：' + (idle * 1000 <= BEAT_TIMEOUT_MS ? '正常' : '中断'), '最近 ' + idle + ' 秒前');
      if (beatGap > 0) parts.push('间隔 ' + Math.round(beatGap / 1000) + ' 秒');
      parts.push('累计 ' + beatCount + ' 次');
    }
    if (decodeFails) parts.push('解压失败 ' + decodeFails + ' 包');
    return parts.join(' · ');
  }

  let watchServerSec = null;
  let watchLiveMs = 0;
  let watchLastAt = 0;
  let barCount = null;
  let countUid = 0;
  let countTimer = null;
  let countTick = 0;

  function roomLive() {
    return !!(renderArgs && renderArgs.room && renderArgs.room.liveStatus === 1);
  }

  /* 本地递增只在直播中累计，未开播时停在服务端值 */
  function watchSec() {
    if (watchServerSec == null) return null;
    return watchServerSec + Math.floor(watchLiveMs / 1000);
  }

  function watchText(sec) {
    return '总观时：' + (sec / 3600).toFixed(2) + '小时(' + sec + '秒)';
  }

  function barText(n) {
    return '总发送弹幕数：' + n + '条';
  }

  function paintCounters() {
    const w = document.getElementById(WATCH_ID);
    const b = document.getElementById(BAR_ID);
    const t = document.getElementById(BEAT_ID);
    const sec = watchSec();
    if (w && sec != null) w.textContent = watchText(sec);
    if (b && barCount != null) b.textContent = barText(barCount);
    if (t) t.textContent = beatText();
  }

  function stopCounters() {
    clearInterval(countTimer);
    countTimer = null;
    watchServerSec = null;
    watchLiveMs = 0;
    watchLastAt = 0;
    barCount = null;
    countTick = 0;
  }

  function startCounters(info, uid) {
    stopCounters();
    if (info) {
      if (info.sec != null) {
        watchServerSec = info.sec;
        watchLastAt = Date.now();
      }
      barCount = info.bar;
    }
    countUid = uid;
    countTimer = setInterval(() => {
      const now = Date.now();
      if (watchLastAt && roomLive()) watchLiveMs += now - watchLastAt;
      watchLastAt = now;
      paintCounters();
      if (++countTick % RESYNC_TICKS === 0) resyncCounters();
    }, 1000);
  }

  async function resyncCounters() {
    if (!countUid || !document.getElementById(PANEL_ID)) return;
    const info = await fetchGuardActive(countUid);
    if (!info) return;
    if (info.sec != null) {
      watchServerSec = info.sec;
      watchLiveMs = 0;
    }
    if (info.bar != null) barCount = info.bar;
    paintCounters();
  }

  function watchHtml() {
    const sec = watchSec();
    if (sec == null) return '';
    return '<div class="row" id="' + WATCH_ID + '">' + watchText(sec) + '</div>';
  }

  function barHtml() {
    if (barCount == null) return '';
    return '<div class="row" id="' + BAR_ID + '">' + barText(barCount) + '</div>';
  }

  function beatHtml() {
    return '<div class="row dim" id="' + BEAT_ID + '">' + beatText() + '</div>';
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
    giftRows.forEach((g) => rows.push({
      name: g.name,
      mid: '×' + g.num + (g.extra ? ' · 额外 +' + g.extra : ''),
      gained: g.battery + (g.extra || 0)
    }));

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
        const t = e.target;
        if (!t || !t.classList) return;
        if (t.classList.contains('x')) {
          stopCounters();
          closeLivePanel();
          p.remove();
        } else if (t.classList.contains('lb')) {
          toggleLivePanel();
        }
      });
      document.documentElement.appendChild(p);
    }

    const room = s.room, medal = s.medal, tasks = s.tasks;
    const live = liveInfo(room.liveStatus);
    const uname = (medal && medal.target_name) || room.uname || '主播';

    if (!medal && !tasks) {
      p.innerHTML =
        '<div class="hd">' + esc(uname) + '<span class="dim"> 粉丝团</span>' +
        ' <span class="' + live.cls + '">' + live.text + '</span>' + liveBtnHtml() + '<span class="x" title="关闭">×</span></div>' +
        '<div class="dim">你尚未加入该主播的粉丝团。</div>' +
        (s.reason ? '<div class="row dim">' + esc(s.reason) + '</div>' : '');
      toggleLiveBtn();
      syncLiveBox();
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
        ' <span class="' + live.cls + '">' + live.text + '</span>' + liveBtnHtml() + '<span class="x" title="关闭">×</span></div>' +
      medalRows +
      storeRow +
      watchHtml() +
      barHtml() +
      beatHtml() +
      journeyHtml(s.journey) +
      gainHtml(tasks, medal, s.guard, s.coins) +
      tasksSection;
    toggleLiveBtn();
    syncLiveBox();
  }

  /* ---------- 粉丝牌直播间面板 ---------- */

  let liveRows = null;
  let liveLoading = false;

  function liveStatusInfo(st) {
    if (st === 1) return { cls: 'on', text: '直播中' };
    if (st === 2) return { cls: 'unk', text: '轮播中' };
    if (st === 0) return { cls: 'off', text: '未开播' };
    return { cls: 'unk', text: '未知' };
  }

  function liveListHtml() {
    if (liveLoading && !liveRows) return '<div class="dim">加载中…</div>';
    if (!liveRows) return '<div class="dim">暂无数据</div>';
    if (!liveRows.length) return '<div class="dim">未持有粉丝牌</div>';
    return liveRows.map((r) => {
      const s = liveStatusInfo(r.live);
      return '<div class="lv-row"><span class="lv-n">' + esc(r.uname) + '</span>' +
        '<span class="lv-s ' + s.cls + '">' + s.text + '</span>' +
        (r.roomid ? '<a class="lv-go" href="https://live.bilibili.com/' + r.roomid +
          '" target="_blank" rel="noopener">进入</a>' : '') +
        '</div>';
    }).join('');
  }

  function liveBtnHtml() {
    const on = document.getElementById(LIVE_PANEL_ID) ? ' on' : '';
    return '<span class="lb' + on + '" title="粉丝牌直播间">牌</span>';
  }

  function toggleLiveBtn() {
    const p = document.getElementById(PANEL_ID);
    const btn = p && p.querySelector('.lb');
    if (btn) btn.classList.toggle('on', !!document.getElementById(LIVE_PANEL_ID));
  }

  function renderLivePanel() {
    let q = document.getElementById(LIVE_PANEL_ID);
    if (!q) {
      q = document.createElement('div');
      q.id = LIVE_PANEL_ID;
      q.addEventListener('click', (e) => {
        if (e.target && e.target.classList && e.target.classList.contains('x')) closeLivePanel();
      });
      document.documentElement.appendChild(q);
    }
    q.innerHTML = '<div class="hd">粉丝牌直播间' +
      (liveRows ? '<span class="dim"> ' + liveRows.length + ' 个</span>' : '') +
      '<span class="x" title="关闭">×</span></div>' +
      '<div class="list">' + liveListHtml() + '</div>';
    syncLiveBox();
    toggleLiveBtn();
  }

  /* 副面板贴主面板右侧 10px，高度与主面板一致 */
  function syncLiveBox() {
    const q = document.getElementById(LIVE_PANEL_ID);
    const p = document.getElementById(PANEL_ID);
    if (!q || !p) return;
    const r = p.getBoundingClientRect();
    q.style.left = Math.round(r.right + 10) + 'px';
    q.style.height = Math.round(r.height) + 'px';
  }

  function closeLivePanel() {
    const q = document.getElementById(LIVE_PANEL_ID);
    if (q) q.remove();
    toggleLiveBtn();
  }

  async function toggleLivePanel() {
    if (document.getElementById(LIVE_PANEL_ID)) {
      closeLivePanel();
      return;
    }
    if (!document.getElementById(PANEL_ID)) return;
    liveLoading = true;
    liveRows = null;
    renderLivePanel();
    try {
      const medals = await fetchAllMedals();
      const uids = medals.map((m) => m.target_id).filter(Boolean);
      const st = await fetchRoomStatus(uids);
      liveRows = medals.map((m) => {
        const s = st[String(m.target_id)] || {};
        return {
          uname: m.target_name || s.uname || m.uname || '主播',
          live: s.live_status != null ? Number(s.live_status) : null,
          roomid: s.room_id || m.roomid || 0,
          level: Number(m.level) || 0
        };
      });
      liveRows.sort((a, b) => (b.live === 1 ? 1 : 0) - (a.live === 1 ? 1 : 0) || b.level - a.level);
    } catch (e) {
      liveRows = [];
      toast('粉丝牌列表加载失败：' + e.message, false);
    }
    liveLoading = false;
    if (document.getElementById(LIVE_PANEL_ID)) renderLivePanel();
  }

  async function open() {
    try {
      const room = await resolveRoom();
      const meta = await getRoomMeta(room.roomId);
      const medal = await getMyMedal(room.uid);
      const t = await fetchTasks(room.uid);
      const [coins, guardActive] = await Promise.all([fetchCoins(), fetchGuardActive(room.uid)]);
      startCounters(guardActive, room.uid);
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
    if (p) {
      stopCounters();
      closeLivePanel();
      p.remove();
    } else open();
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
    setInterval(() => {
      refreshBtnVisibility();
      syncLiveBox();
    }, 1000);
  }

  installWsHook();
  loadGifts();
  loadUid();

  if (document.body) start();
  else document.addEventListener('DOMContentLoaded', start, { once: true });
})();
