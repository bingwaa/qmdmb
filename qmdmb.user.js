// ==UserScript==
// @name         B站直播间亲密度面板
// @name:en      Bilibili Live Fan Medal Panel
// @namespace    https://github.com/bingwaa/qmdmb
// @version      1.8.4
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
  /* 未加入粉丝团为 unJoinFansClub，已加入为 joinFansClub */
  const ENTRY_SEL = '.follow-ctnr[data-curbutton="joinFansClub"], .follow-ctnr[data-curbutton="unJoinFansClub"]';
  const FOLLOW_SEL = '.follow-ctnr[data-curbutton="unFollow"]';
  const OFFLINE_SEL = '.status-tag';

  const API_ROOMINIT = 'https://api.live.bilibili.com/room/v1/Room/room_init';
  const API_ROOM = 'https://api.live.bilibili.com/xlive/web-room/v1/index/getInfoByRoom';
  const API_MYMEDS = 'https://api.live.bilibili.com/xlive/app-ucenter/v1/user/GetMyMedals';
  const API_ROOMSTATUS = 'https://api.live.bilibili.com/room/v1/Room/get_status_info_by_uids';
  const API_ONLINERANK = 'https://api.live.bilibili.com/xlive/general-interface/v1/rank/getOnlineGoldRank';
  const API_ACTIVATED = 'https://api.live.bilibili.com/xlive/app-ucenter/v1/fansMedal/GetActivatedMedalInfo';
  const API_COINEXP = 'https://api.bilibili.com/x/web-interface/coin/today/exp';
  const API_RPDRAW = 'https://api.live.bilibili.com/xlive/lottery-interface/v1/popularityRedPocket/RedPocketDraw';
  const API_RPLOTTERY = 'https://api.live.bilibili.com/xlive/lottery-interface/v1/lottery/getLotteryInfoWeb';
  const API_RPWIN = 'https://api.live.bilibili.com/xlive/lottery-interface/v1/popularityRedPocket/RedPocketGetWinners';
  const API_RELATION = 'https://api.bilibili.com/x/relation';
  const API_GUARDACTIVE = 'https://api.live.bilibili.com/xlive/general-interface/v1/guard/GuardActive';
  const API_NAV = 'https://api.bilibili.com/x/web-interface/nav';
  const COIN_EXP_PER_COIN = 10;
  const GOLD_PER_BATTERY = 100;
  const GOLD_PER_YUAN = 1000;
  const DAY_MS = 24 * 3600 * 1000;
  const WS_SUB_RE = /\/sub(\?|$)/;
  const LIGHT_GIFT = '粉丝团灯牌';
  const JOURNEY_GIFT = '亲密之旅';
  const SC_GIFT = '超级留言';
  const JOURNEY_EXTRA = 150;
  const GIFT_STORE = 'qmdmb-gifts-';
  const GIFT_REV = 'v2';
  const RP_STORE = 'qmdmb-rp-';
  const RP_SPM = '444.8.red_envelope.extract';
  const RP_POLL_MS = 5000;
  const RP_KEEP_MS = 10 * 60 * 1000;
  const RP_REL_MS = 60 * 1000;
  const RPWIN_ID = 'qmdmb-fanpanel-rpwin';
  const RP_WIN_TRIES = 6;
  const RP_WIN_MAX = 30;
  const LIVE_MAX = 20;

  const RADAR_ID = 'qmdmb-fanpanel-radar';
  const API_AREALIST = 'https://api.live.bilibili.com/room/v1/Area/getList';
  /* 主端点实测无需签名可用（page_size 实测 50、80 均生效），备用端点分页 20 条但可能要求签名 */
  const API_AREAROOMS = 'https://api.live.bilibili.com/room/v1/Area/getRoomList';
  const API_AREAROOMS_ALT = 'https://api.live.bilibili.com/xlive/web-interface/v1/second/getList';
  const RADAR_STORE = 'qmdmb-radar';
  const RADAR_NUMS = [100, 200, 300, 400, 500];
  /* 命中红包的房间按 5s 快轮询，冷房间按档位放慢 */
  const RADAR_COLD = { 100: 45000, 200: 90000, 300: 120000, 400: 150000, 500: 180000 };
  const RADAR_CONC = 2;
  const RADAR_PAGE_SIZE = 80;
  const RADAR_LIST_MS = 5 * 60 * 1000;
  const RADAR_COOL_MS = 60 * 1000;
  /* 单房间连续失败转冷间隔的阈值；全局连续失败达到 RADAR_PAUSE_FAILS 才暂停扫描 */
  const RADAR_FAILS = 3;
  const RADAR_PAUSE_FAILS = 10;
  /* 所有房间共用一个令牌桶，抑制同一时刻集中到期造成的请求尖峰：平均 1 个令牌 / 300ms，最多积压 4 个 */
  const RADAR_BUCKET_MS = 300;
  const RADAR_BUCKET_MAX = 4;
  /* -352 为实测风控码；-412 是 B 站风控拦截的常用返回码，雷达里未实测到 */
  const RADAR_RISK_CODES = [-352, -412];
  /* 归属分组：成员 uid 取自 vup-json 的 group_name，房间与开播状态由批量接口补齐 */
  const RADAR_GROUPS = [
    { key: 'vr', name: 'VR', group: 'VirtuaReal' },
    { key: 'psp', name: 'PSP', group: 'P-SP' }
  ];
  const API_VUP = 'https://api.ukamnads.icu/api/v2/vup-list';
  const API_VUP_ALT = 'https://vup-json.laplace.live/vup-slim.json';
  const API_UIDSTATUS = 'https://api.live.bilibili.com/room/v1/Room/get_status_info_by_uids';
  const VUP_STORE = 'qmdmb-vup';
  const VUP_MS = 12 * 60 * 60 * 1000;
  const VUP_CHUNK = 100;
  /* 分区列表接口失败时的兜底父分区 */
  const RADAR_AREAS_FALLBACK = [
    { id: 1, name: '娱乐' }, { id: 2, name: '网游' }, { id: 3, name: '手游' },
    { id: 4, name: '绘画' }, { id: 5, name: '电台' }, { id: 6, name: '单机游戏' },
    { id: 7, name: '生活' }, { id: 8, name: '影视' }, { id: 9, name: '虚拟主播' },
    { id: 10, name: '赛事' }, { id: 11, name: '知识' }
  ];

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
  const GUARDLEVEL = { 总督: 1, 提督: 2, 舰长: 3 };

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

  /* 手动刷新期间置真：绕开浏览器缓存，避免拿回上一次的响应 */
  let noCache = false;

  async function fetchJson(url) {
    const init = { credentials: 'include' };
    if (noCache) {
      init.cache = 'no-store';
      url += (url.indexOf('?') >= 0 ? '&' : '?') + '_t=' + Date.now();
    }
    const r = await fetch(url, init);
    if (!r.ok) throw new Error('HTTP ' + r.status);
    return r.json();
  }

  /* 站外接口允许任意来源但不允许带凭据，带 cookie 会被 CORS 拒绝 */
  async function fetchJsonOmit(url) {
    const r = await fetch(url, { credentials: 'omit' });
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

  /* 单房间真实在线人数（在线榜 onlineNum），未开播为 0，失败返回 null */
  async function fetchOnlineNum(roomid, uid) {
    if (!roomid || !uid) return null;
    try {
      const j = await fetchJson(API_ONLINERANK + '?ruid=' + encodeURIComponent(uid) +
        '&roomId=' + encodeURIComponent(roomid) + '&page=1&pageSize=1');
      if (j.code === 0 && j.data && typeof j.data.onlineNum === 'number') return j.data.onlineNum;
    } catch (e) {}
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

  /* 按出现顺序返回全部字段，同一字段号可重复（gift_list） */
  function pbScan(b, start, end) {
    const out = [];
    let i = start;
    while (i < end) {
      let key = 0, sh = 0, x;
      do { x = b[i++]; key += (x & 0x7f) * 2 ** sh; sh += 7; } while (x & 0x80);
      const f = Math.floor(key / 8), w = key % 8;
      if (w === 0) {
        let v = 0; sh = 0;
        do { x = b[i++]; v += (x & 0x7f) * 2 ** sh; sh += 7; } while (x & 0x80);
        out.push({ f: f, n: v });
      } else if (w === 2) {
        let n = 0; sh = 0;
        do { x = b[i++]; n += (x & 0x7f) * 2 ** sh; sh += 7; } while (x & 0x80);
        out.push({ f: f, s: i, e: i + n });
        i += n;
      } else if (w === 5) i += 4;
      else if (w === 1) i += 8;
      else break;
    }
    return out;
  }

  function pbAll(list, f) {
    return list.filter((x) => x.f === f);
  }

  function pbOne(list, f) {
    return pbAll(list, f)[0] || null;
  }

  function pbText(b, f) {
    return new TextDecoder().decode(b.subarray(f.s, f.e));
  }

  /* SendGiftBroadcast：gift_list 为重复字段，盲盒批量开出时每项各自计价 */
  function pbGifts(b64) {
    let buf;
    try { buf = b64ToU8(b64); } catch (e) { return []; }
    const top = pbScan(buf, 0, buf.length);
    const uid = pbOne(top, 1);
    if (!uid || !uid.n) return [];
    const blindF = pbOne(top, 9);
    const boxF = blindF ? pbOne(pbScan(buf, blindF.s, blindF.e), 3) : null;
    const box = boxF ? pbText(buf, boxF) : '';
    return pbAll(top, 10).map((item) => {
      const g = pbScan(buf, item.s, item.e);
      const nameF = pbOne(g, 2);
      const numF = pbOne(g, 3);
      const priceF = pbOne(g, 5);
      const coinF = pbOne(g, 8);
      const num = numF && numF.n ? numF.n : 1;
      const price = priceF && priceF.n ? priceF.n : 0;
      const coin = coinF ? pbText(buf, coinF) : '';
      const name = nameF ? pbText(buf, nameF) : '礼物';
      return {
        uid: uid.n,
        name: box ? box + '(' + name + ')' : name,
        num: num,
        battery: coin === 'gold' ? Math.floor((price * num) / GOLD_PER_BATTERY) : 0
      };
    });
  }

  /* total_coin 在连击时累加，不与 num 相乘；优先用单价 × 数量 */
  function giftCoin(d, num) {
    const price = Number(d.price) || 0;
    const coin = price > 0 ? price * num : Number(d.total_coin) || 0;
    return Math.floor(coin / GOLD_PER_BATTERY);
  }

  function giftsOf(d) {
    if (d.pb) return pbGifts(d.pb);
    if (d.giftName || d.uid) {
      const num = Number(d.num) || 1;
      const battery = String(d.coin_type) === 'gold' ? giftCoin(d, num) : 0;
      const gift = String(d.giftName || '礼物');
      const box = d.blind_gift ? String(d.blind_gift.original_gift_name || '') : '';
      return [{ uid: d.uid, name: box ? box + '(' + gift + ')' : gift, num: num, battery: battery }];
    }
    return [];
  }

  /* ---------- 礼物累计与存储 ---------- */

  /* SUPER_CHAT_MESSAGE 与 _JPN 同时下发同一 id，去重后只计一次 */
  const SC_SEEN_MAX = 50;
  const scSeen = [];

  function scOf(d) {
    const id = Number(d.id) || 0;
    if (!id || scSeen.indexOf(id) >= 0) return null;
    scSeen.push(id);
    if (scSeen.length > SC_SEEN_MAX) scSeen.shift();
    const price = Number(d.price) || 0;
    const rate = Number(d.rate) || 1000;
    return {
      uid: d.uid,
      name: price > 0 ? SC_GIFT + ' ' + price + '元' : SC_GIFT,
      num: 1,
      battery: Math.floor((price * rate) / GOLD_PER_BATTERY)
    };
  }

  /* 同一笔大航海会下发 GUARD_BUY、USER_TOAST_MSG 与 SEND_GIFT，按 用户+等级+金额 指纹去重 */
  const GUARD_DEDUP_MS = 15000;
  const guardSeen = [];

  function guardDup(key) {
    const now = Date.now();
    for (let i = guardSeen.length - 1; i >= 0; i--) {
      if (now - guardSeen[i].t > GUARD_DEDUP_MS) guardSeen.splice(i, 1);
    }
    if (guardSeen.some((x) => x.k === key)) return true;
    guardSeen.push({ k: key, t: now });
    return false;
  }

  /* price 为金瓜子时不低于 13.8 万，为元时为 138 / 1998 / 19998 */
  function guardGold(d) {
    const price = Number(d.price) || 0;
    if (!price) return 0;
    return price >= 1000 ? price : price * (Number(d.rate) || 1000);
  }

  function guardRow(uid, level, gold) {
    const unit = gold / GOLD_PER_BATTERY;
    return {
      uid: uid,
      name: GUARDNAME[level] + ' ' + Math.round(gold / GOLD_PER_YUAN) + '元',
      num: 1,
      battery: Math.floor(unit)
    };
  }

  function guardOf(d) {
    const level = Number(d.guard_level) || 0;
    if (!GUARDNAME[level]) return null;
    const gold = guardGold(d) * (Number(d.num) || 1);
    if (!gold) return null;
    if (guardDup([d.uid, level, gold].join('|'))) return null;
    return guardRow(d.uid, level, gold);
  }

  /* pb 通道若已给出大航海电池数，则直接换算，避免与 GUARD_BUY 重复计入 */
  function guardGiftOf(g) {
    const level = GUARDLEVEL[g.name];
    if (!level) return g;
    if (!g.battery) return null;
    const gold = g.battery * GOLD_PER_BATTERY;
    if (guardDup([g.uid, level, gold].join('|'))) return null;
    return guardRow(g.uid, level, gold);
  }

  function giftsByCmd(cmd, data) {
    if (cmd.indexOf('SEND_GIFT') === 0) return giftsOf(data).map(guardGiftOf).filter(Boolean);
    if (cmd.indexOf('SUPER_CHAT_MESSAGE') === 0) {
      const sc = scOf(data);
      return sc ? [sc] : [];
    }
    if (cmd.indexOf('GUARD_BUY') === 0 || cmd.indexOf('USER_TOAST_MSG') === 0) {
      const guard = guardOf(data);
      return guard ? [guard] : [];
    }
    return [];
  }

  const giftRows = [];
  let feedLightSeen = false;

  function giftKey() {
    return GIFT_STORE + GIFT_REV + '-' + getRoomId() + '-' + dayStamp();
  }

  /* 每一行带记录当天的日期。进程跨天后内存与当天存储键里都可能混着昨天的行，
     载入与合并都按日期过滤，旧行直接丢弃，不带日期的历史行同样不采纳 */
  function loadGifts() {
    const room = getRoomId();
    const key = giftKey();
    const today = dayStamp();
    feedLightSeen = false;
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
        if (g && g.name && g.day === today) {
          giftRows.push({
            name: String(g.name),
            num: Number(g.num) || 0,
            battery: Number(g.battery) || 0,
            extra: Number(g.extra) || 0,
            day: today
          });
        }
      });
    } catch (e) {}
  }

  /* 丢弃内存里不属于今天的行，跨天后第一次合并礼物前调用 */
  function dropStaleGifts() {
    const today = dayStamp();
    for (let i = giftRows.length - 1; i >= 0; i--) {
      if (giftRows[i].day !== today) {
        giftRows.splice(i, 1);
        feedLightSeen = false;
      }
    }
  }

  function saveGifts() {
    try { localStorage.setItem(giftKey(), JSON.stringify(giftRows)); } catch (e) {}
  }

  /* 手动刷新时回落到当天数据：明细按当天过滤重载，红包参与记录同样按天重载 */
  function resetDaily() {
    loadGifts();
    rpDone = new Set();
    loadRp();
  }

  function feedTaskDone() {
    const t = renderArgs && renderArgs.tasks
      ? renderArgs.tasks.find((x) => x.jump_type === 'feedLight')
      : null;
    return !!(t && (t.is_done === 1 || t.is_done === true));
  }

  function mergeGift(g) {
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
      giftRows.push({ name: g.name, num: g.num, battery: g.battery, extra: extra, day: dayStamp() });
    }
  }

  /* 一条广播可含多个礼物（盲盒批量开出），合并后统一落盘与重绘 */
  function pushGifts(list) {
    /* 跨天后先丢掉昨天的行，否则会被一并写进当天的键，刷新也清不掉 */
    dropStaleGifts();
    list.forEach(mergeGift);
    saveGifts();
    rerender();
  }

  /* ---------- 直播间红包 ---------- */

  /* 红包开始的弹幕命令，新旧版本并存 */
  const RP_CMDS = {
    POPULARITY_RED_POCKET_V2_START: 1,
    POPULARITY_RED_POCKET_START: 1,
    POPULARITY_RED_POCKET_V2_NEW: 1,
    POPULARITY_RED_POCKET_NEW: 1,
    RED_POCKET_START: 1
  };
  const RPTYPE = { 1: '人气红包', 3: '电池红包', 4: '亲密红包', 5: '电池红包' };
  /* 奖品非礼物的红包类型：3/5 电池红包、4 亲密红包；大航海红包由 rp_guard_info 标记 */
  const RP_NO_TOTAL = { 3: 1, 4: 1, 5: 1 };

  const rpMap = new Map();
  let rpDone = new Set();
  let rpRoom = null;
  let rpPollTimer = null;
  let rpPolling = false;
  let rpFollow = null;
  let rpFollowAt = 0;
  let rpFollowLoad = null;
  let rpWinLot = 0;

  function nowSec() {
    return Math.floor(Date.now() / 1000);
  }

  function rpNum(v) {
    const n = Number(v);
    return Number.isFinite(n) ? n : 0;
  }

  function rpTypeName(row) {
    if (row.guard) return '大航海红包';
    return RPTYPE[rpNum(row.rpType)] || '红包';
  }

  function rpStoreKey() {
    return RP_STORE + dayStamp();
  }

  function loadRp() {
    try {
      const arr = JSON.parse(localStorage.getItem(rpStoreKey()) || 'null');
      if (Array.isArray(arr)) rpDone = new Set(arr.map(Number).filter(Boolean));
    } catch (e) {}
  }

  function saveRp() {
    try { localStorage.setItem(rpStoreKey(), JSON.stringify(Array.from(rpDone))); } catch (e) {}
  }

  function rpAward(a) {
    if (!a || typeof a !== 'object') return null;
    const name = String(a.gift_name || a.award_name || '');
    if (!name) return null;
    return { name: name, num: rpNum(a.num || a.gift_num) || 1 };
  }

  /* 字段跨版本新旧并存（lot_id/id、sender_name/sender_uinfo.base.name、end_time/endTime），两种形态都取 */
  function rpParse(d) {
    if (!d || typeof d !== 'object') return null;
    const lotId = rpNum(d.lot_id || d.id);
    if (!lotId) return null;
    const base = (d.sender_uinfo || {}).base || {};
    const awards = (Array.isArray(d.awards) ? d.awards : []).map(rpAward).filter(Boolean);
    return {
      lotId: lotId,
      rpType: rpNum(d.rp_type || d.rpType),
      sender: String(d.sender_name || base.name || ''),
      awards: awards,
      endTime: rpNum(d.end_time || d.endTime),
      /* 红包池总额，单位为金瓜子；电池红包用它换算池内电池总数 */
      total: rpNum(d.total_price || d.totalPrice),
      guard: !!d.rp_guard_info,
      /* 参与条件：1需关注 2需粉丝团 3需大航海，receive_type 1 需分享 */
      need: rpNum(d.join_requirement || d.joinRequirement),
      needFollow: !!(d.need_follow || d.needFollow),
      shared: rpNum(d.receive_type || d.receiveType) === 1,
      disabled: String(d.disabled_text || d.status_text || '')
    };
  }

  /* 返回值：0 无变化、1 新增、2 已有红包的奖品信息更新 */
  function rpAdd(info) {
    if (!info) return 0;
    const old = rpMap.get(info.lotId);
    if (old) {
      const upd = (info.awards.length && rpAwardKey(info.awards) !== rpAwardKey(old.awards)) ||
        (info.total && info.total !== old.total);
      if (info.endTime) old.endTime = info.endTime;
      if (info.awards.length) old.awards = info.awards;
      if (info.total) old.total = info.total;
      if (info.sender) old.sender = info.sender;
      if (info.rpType) old.rpType = info.rpType;
      if (info.guard) old.guard = true;
      if (info.need) old.need = info.need;
      if (info.needFollow) old.needFollow = true;
      if (info.shared) old.shared = true;
      if (info.disabled) old.disabled = info.disabled;
      return upd ? 2 : 0;
    }
    const done = rpDone.has(info.lotId);
    rpMap.set(info.lotId, {
      lotId: info.lotId,
      rpType: info.rpType,
      guard: !!info.guard,
      sender: info.sender,
      awards: info.awards,
      endTime: info.endTime,
      total: info.total,
      need: info.need,
      needFollow: !!info.needFollow,
      shared: !!info.shared,
      disabled: info.disabled,
      ended: false,
      status: done ? 'done' : 'idle',
      result: '',
      win: null,
      winLoading: false
    });
    return 1;
  }

  /* ---------- 红包参与条件 ---------- */

  /* 关注状态以 relation 接口为准，带缓存与在途去重 */
  async function rpLoadFollow(force) {
    const uid = rpRoom && rpRoom.uid;
    if (!uid) return false;
    if (!force && rpFollow !== null && Date.now() - rpFollowAt < RP_REL_MS) return false;
    if (rpFollowLoad) return rpFollowLoad;
    rpFollowLoad = rpFetchFollow(uid);
    const changed = await rpFollowLoad;
    rpFollowLoad = null;
    return changed;
  }

  async function rpFetchFollow(uid) {
    let attr = null;
    try {
      const j = await fetchJson(API_RELATION + '?fid=' + encodeURIComponent(uid));
      if (j && rpNum(j.code) === 0 && j.data) attr = rpNum(j.data.attribute);
    } catch (e) {}
    if (!Number.isFinite(attr)) return false;
    rpFollowAt = Date.now();
    /* attribute: 2 已关注，6 互关 */
    const follow = attr === 2 || attr === 6;
    if (follow === rpFollow) return false;
    rpFollow = follow;
    return true;
  }

  function rpFollowed() {
    if (rpFollow !== null) return rpFollow;
    if (rpRoom && rpRoom.uid) rpLoadFollow(false).then((c) => { if (c) rerender(); });
    return null;
  }

  /* tip 为条件未满足时给用户的提示 */
  function rpCond(row) {
    const args = renderArgs || {};
    if (row.need === 2) {
      return { text: '需先加入粉丝团', met: !!args.medal, tip: '需先加入粉丝团，请手动加入后再抢' };
    }
    if (row.need === 3) {
      return { text: '需先开通大航海', met: (args.guard || 0) > 0, tip: '需先开通大航海，无法参与' };
    }
    if (row.need === 1 || row.needFollow) {
      return { text: '需先关注主播', met: rpFollowed(), tip: '需先关注主播，请手动关注后再抢' };
    }
    if (row.shared) return { text: '需分享后参与', met: null };
    return null;
  }

  /* 条件明确未满足时不发请求，避免服务端替用户完成关注等操作 */
  function rpCondBlock(row) {
    const c = rpCond(row);
    return c && c.met === false ? c.tip : null;
  }

  function rpCondTag(c) {
    if (!c) return '';
    return '<span class="rp-cond' + (c.met === false ? ' rp-cond-warn' : '') + '">' + esc(c.text) + '</span>';
  }

  function rpLeftText(row) {
    if (!row.endTime) return '';
    const left = row.endTime - nowSec();
    if (left <= 0) return '已结束';
    return Math.floor(left / 60) + ':' + String(left % 60).padStart(2, '0');
  }

  function rpAwardKey(list) {
    return list.map((a) => a.name + '×' + a.num).join('、');
  }

  /* 电池类奖品的名字是「电池红包」、num 是份数，池内电池总数由 total（金瓜子）换算 */
  function rpAwardText(list, total) {
    const battery = total ? Math.round(total / GOLD_PER_BATTERY) : 0;
    return list.map((a) => {
      if (a.name.indexOf('电池') < 0) return a.name + '×' + a.num;
      return '电池' + (battery ? ' ×' + battery : '') + '  共' + a.num + '份';
    }).join('、');
  }

  /* ---------- 中奖名单侧栏 ---------- */

  function rpWinRowHtml(w) {
    const me = myUid();
    const self = me && String(w.uid) === String(me);
    return '<span class="wn' + (self ? ' self' : '') + '">' + esc(w.name || ('uid ' + w.uid)) + '</span>' +
      '<span class="wp">' + esc(w.award || '') + '</span>' +
      '<span class="wc">' + (w.num > 1 || (w.num > 0 && String(w.award || '').indexOf('电池') >= 0) ? '×' + w.num : '') + '</span>';
  }

  function rpWinBody(row) {
    if (!row) return '<div class="dim">红包不存在</div>';
    if (row.winLoading) return '<div class="dim">名单生成中…</div>';
    if (!row.win) return '<div class="dim">点击「名单」查询</div>';
    if (row.win.err) return '<div class="dim">名单查询失败：' + esc(row.win.err) + '</div>';
    const list = row.win.list;
    if (!list.length) return '<div class="dim">名单尚未生成</div>';
    return '<div class="dim">中奖 ' + list.length + ' 人</div>' + list.map(rpWinRowHtml).join('');
  }

  function capRows(list, n) {
    if (!list) return;
    list.style.maxHeight = '';
    const kids = Array.prototype.filter.call(list.children, (el) => !el.classList.contains('dim'));
    const tops = [];
    for (let i = 0; i < kids.length; i++) {
      const t = kids[i].offsetTop;
      if (!tops.length || t > tops[tops.length - 1] + 1) tops.push(t);
    }
    if (tops.length <= n) return;
    list.style.maxHeight = (tops[n] - tops[0]) + 'px';
  }

  function closeWinPanel() {
    rpWinLot = 0;
    const q = document.getElementById(RPWIN_ID);
    if (q) q.remove();
    syncRadarBox();
    if (document.getElementById(LIVE_PANEL_ID)) syncLiveBox();
  }

  function syncWinBox() {
    const q = document.getElementById(RPWIN_ID);
    const p = document.getElementById(PANEL_ID);
    if (!q || !p) return;
    const r = p.getBoundingClientRect();
    q.style.left = Math.round(r.right + 10) + 'px';
    q.style.top = 'auto';
    q.style.bottom = '10px';
    const lim = Math.max(160, window.innerHeight - 20);
    if (panelSizes[RPWIN_ID]) q.style.width = panelSizes[RPWIN_ID].w + 'px';
    q.style.maxHeight = sizeMaxH(RPWIN_ID, lim) + 'px';
  }

  /* 名单条目可能来自主面板，也可能来自雷达，两处共用同一个侧栏 */
  function rpRowAny(lotId) {
    return rpMap.get(lotId) || null;
  }

  function paintWinPanel() {
    const q = document.getElementById(RPWIN_ID);
    if (!q) return;
    const row = rpRowAny(rpWinLot);
    q.innerHTML = '<div class="hd">中奖名单' +
      (row ? '<span class="dim"> ' + esc(rpTypeName(row)) + '</span>' : '') +
      '<span class="x" title="关闭">×</span></div>' +
      '<div class="wl">' + rpWinBody(row) + '</div>' + RESIZE_HTML;
    capRows(q.querySelector('.wl'), RP_WIN_MAX);
    syncWinBox();
    syncRadarBox();
    if (document.getElementById(LIVE_PANEL_ID)) syncLiveBox();
  }

  function openWinPanel(lotId) {
    rpWinLot = lotId;
    let q = document.getElementById(RPWIN_ID);
    if (!q) {
      q = document.createElement('div');
      q.id = RPWIN_ID;
      q.addEventListener('click', (e) => {
        if (e.target && e.target.classList && e.target.classList.contains('x')) closeWinPanel();
      });
      document.documentElement.appendChild(q);
    }
    paintWinPanel();
  }

  function rpRowHtml(row) {
    const title = rpTypeName(row) + (row.sender ? ' · ' + row.sender : '');
    const awards = rpAwardText(row.awards, row.total);
    /* 电池/亲密/大航海红包的奖品不是礼物，不单列总价值 */
    const total = !row.guard && !RP_NO_TOTAL[row.rpType] && row.total
      ? Math.round(row.total / GOLD_PER_BATTERY) : 0;
    const ended = !!row.endTime && row.endTime <= nowSec();
    let tail;
    if (ended) {
      tail = '<span class="rp-win" data-lot="' + row.lotId + '">' +
        (row.winLoading ? '查询中' : '名单') + '</span>';
      if (row.status === 'fail') {
        tail += '<span class="rp-tag bad" title="' + esc(row.result) + '">失败</span>';
      }
    } else if (row.status === 'done') {
      tail = '<span class="rp-tag ok">已参与</span>';
    } else if (row.status === 'joining') {
      tail = '<span class="rp-tag wait">请求中</span>';
    } else if (row.status === 'fail') {
      tail = '<span class="rp-tag bad" title="' + esc(row.result) + '">失败</span>' +
        '<span class="rp-go" data-lot="' + row.lotId + '">重试</span>';
    } else {
      tail = '<span class="rp-go" data-lot="' + row.lotId + '">抢</span>';
    }
    const c = row.status === 'done' || ended ? null : rpCond(row);
    /* 服务端的禁用文案只在条件确实未满足或已失败时展示，避免已满足时误报 */
    const note = !ended && row.disabled && (!c || c.met === false || row.status === 'fail') ? row.disabled : '';
    return '<div class="rp-item"><div class="rp-row"><div class="rp-meta">' +
      '<span class="rp-title">' + esc(title) + '</span>' +
      (total > 0 ? '<span class="rp-total">总价值：' + total + '电池</span>' : '') +
      (awards ? '<span class="rp-award">' + esc(awards) + '</span>' : '') +
      (note ? '<span class="rp-err">' + esc(note) + '</span>' : '') +
      (row.status === 'fail' && row.result ? '<span class="rp-err">' + esc(row.result) + '</span>' : '') +
      '</div>' + rpCondTag(c) +
      '<span class="rp-left" data-lot="' + row.lotId + '">' + rpLeftText(row) + '</span>' + tail +
      '</div></div>';
  }

  function rpHtml() {
    const rows = Array.from(rpMap.values()).sort((a, b) => a.endTime - b.endTime);
    const body = rows.length ? rows.map(rpRowHtml).join('') : '<div class="dim">未检测到红包</div>';
    return '<div class="rp"><div class="tt">红包' + radarBtnHtml() + '</div>' + body + '</div>';
  }

  function paintRedPackets() {
    const p = document.getElementById(PANEL_ID);
    if (!p) return;
    const list = p.querySelectorAll('.rp-left');
    for (let i = 0; i < list.length; i++) {
      const row = rpMap.get(Number(list[i].getAttribute('data-lot')));
      if (!row) continue;
      const t = rpLeftText(row);
      if (list[i].textContent !== t) list[i].textContent = t;
    }
    /* 结束时刻要整块重绘：出现名单入口 */
    let flip = false;
    rpMap.forEach((row) => {
      const e = !!row.endTime && row.endTime <= nowSec();
      if (e !== row.ended) {
        row.ended = e;
        flip = true;
      }
    });
    if (flip) rerender();
  }

  /* 已结束且未参与的红包保留一段时间后清理，避免面板无限增长 */
  function pruneRp() {
    const now = Date.now();
    rpMap.forEach((row, lotId) => {
      if (row.status === 'done' || !row.endTime) return;
      if (now - row.endTime * 1000 > RP_KEEP_MS) rpMap.delete(lotId);
    });
  }

  async function rpPoll() {
    if (rpPolling || !rpRoom || !rpRoom.roomId) return;
    rpPolling = true;
    let changed = false;
    try {
      const j = await fetchJson(API_RPLOTTERY + '?roomid=' + encodeURIComponent(rpRoom.roomId));
      const arr = j && j.code === 0 && j.data ? j.data.popularity_red_pocket : null;
      if (Array.isArray(arr)) {
        arr.forEach((it) => {
          const info = rpParse(it);
          if (!info) return;
          if (rpAdd(info)) changed = true;
          const row = rpMap.get(info.lotId);
          if (row && rpNum(it.user_status) === 1 && row.status !== 'done') {
            row.status = 'done';
            rpDone.add(info.lotId);
            saveRp();
            changed = true;
          }
        });
      }
    } catch (e) {}
    pruneRp();
    rpPolling = false;
    if (changed) rerender();
  }

  function startRpPoll() {
    stopRpPoll();
    rpPoll();
    rpPollTimer = setInterval(rpPoll, RP_POLL_MS);
  }

  function stopRpPoll() {
    clearInterval(rpPollTimer);
    rpPollTimer = null;
  }

  async function rpPost(data) {
    const body = Object.keys(data)
      .map((k) => encodeURIComponent(k) + '=' + encodeURIComponent(data[k]))
      .join('&');
    try {
      const r = await fetch(API_RPDRAW, {
        method: 'POST',
        credentials: 'include',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        body: body
      });
      if (!r.ok) return { code: -r.status, message: 'HTTP ' + r.status };
      return r.json();
    } catch (e) {
      return { code: -1, message: e.message || '网络错误' };
    }
  }

  /* 先按 H5 形态请求，失败后按 PC 形态（不含 uid 与 statistics）重试一次 */
  function rpBody(roomid, uid, lotId, full) {
    const b = {
      room_id: roomid,
      ruid: uid,
      lot_id: lotId,
      spm_id: RP_SPM,
      jump_from: '',
      session_id: '',
      csrf: cookie('bili_jct')
    };
    if (full) {
      b.uid = myUid() || '';
      b.statistics = JSON.stringify({ appId: 100, platform: 3, version: '', abtest: '' });
    }
    return b;
  }

  /* 主面板与雷达共用：先 H5 形态，未成功且拿到响应时再按 PC 形态重试一次 */
  async function rpDraw(roomid, uid, lotId) {
    let j = await rpPost(rpBody(roomid, uid, lotId, true));
    if (!j || rpNum(j.code) !== 0) {
      const j2 = await rpPost(rpBody(roomid, uid, lotId, false));
      if (j2 && (rpNum(j2.code) === 0 || !j.message)) j = j2;
    }
    return j;
  }

  async function rpWinFetch(lotId) {
    try {
      return await fetchJson(API_RPWIN + '?lot_id=' + encodeURIComponent(lotId) + '&write_off_only=false');
    } catch (e) {
      return { code: -1, message: e.message || '网络错误' };
    }
  }

  /* 依次取第一个大于 0 的数值，H5 端对电池数量用的就是这种取值方式 */
  function rpFirstPos(...vals) {
    for (const v of vals) {
      if (v === undefined || v === null || v === '') continue;
      const n = rpNum(v);
      if (n > 0) return n;
    }
    return 0;
  }

  /* 电池类奖品不是真实礼物，金额字段实测单位是金瓜子，100 金瓜子 = 1 电池；小于 100 的值按电池数处理 */
  function rpWinAward(w) {
    const name = String(w.award_name || w.awardName || '');
    if (name.indexOf('电池') >= 0) {
      const n = rpFirstPos(w.battery_amount, w.batteryAmount, w.gift_num, w.giftNum, w.award_price, w.awardPrice);
      return { award: name, num: n >= GOLD_PER_BATTERY ? Math.round(n / GOLD_PER_BATTERY) : n };
    }
    return { award: name, num: rpNum(w.gift_num || w.giftNum) || 1 };
  }

  function rpWinParse(j) {
    const d = j.data;
    const raw = Array.isArray(d.winner_info) ? d.winner_info : Array.isArray(d.list) ? d.list : [];
    return raw.map((w) => {
      const a = rpWinAward(w);
      return {
        uid: w.uid,
        name: String(w.name || w.uname || w.nickname || ''),
        award: a.award,
        num: a.num
      };
    }).filter((w) => w.uid);
  }

  /* 名单侧栏由面板里的 × 关闭；切换红包则改为显示该红包的名单，空名单短轮询等待结算 */
  async function rpWinners(lotId) {
    const row = rpRowAny(lotId);
    if (!row) return;
    if (row.winLoading || (row.win && row.win.list && row.win.list.length)) {
      openWinPanel(lotId);
      rerender();
      return;
    }
    row.win = null;
    row.winLoading = true;
    openWinPanel(lotId);
    rerender();
    for (let i = 0; i < RP_WIN_TRIES; i++) {
      const j = await rpWinFetch(lotId);
      if (rpNum(j && j.code) === 0 && j.data) {
        row.win = { list: rpWinParse(j) };
        if (row.win.list.length) break;
      } else {
        row.win = { err: (j && (j.code + (j.message ? '：' + j.message : ''))) || '未知错误' };
        break;
      }
      await new Promise((r) => setTimeout(r, 2000));
      if (rpWinLot !== lotId) {
        row.winLoading = false;
        return;
      }
    }
    row.winLoading = false;
    paintWinPanel();
    rerender();
  }

  async function rpJoin(lotId) {
    const row = rpMap.get(lotId);
    if (!row || row.status === 'joining' || row.status === 'done') return;
    if (!rpRoom || !rpRoom.roomId || !rpRoom.uid) {
      toast('缺少房间或主播信息，无法参与', false);
      return;
    }
    if (row.need === 1 || row.needFollow) await rpLoadFollow(true);
    const block = rpCondBlock(row);
    if (block) {
      toast(block, false);
      rerender();
      return;
    }
    row.status = 'joining';
    rerender();
    const j = await rpDraw(rpRoom.roomId, rpRoom.uid, lotId);
    const code = j ? rpNum(j.code) : -1;
    if (code === 0) {
      row.status = 'done';
      row.result = '';
      rpDone.add(lotId);
      saveRp();
    } else {
      row.status = 'fail';
      const cond = rpCond(row);
      row.result = (cond && cond.met === false ? cond.text + '；' : '') +
        code + (j && j.message ? '：' + j.message : '');
      toast('红包参与失败：' + row.result, false);
    }
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
      if (!m || typeof m.cmd !== 'string') continue;
      const mine = giftsByCmd(m.cmd, m.data || {}).filter((g) => me && String(g.uid) === String(me));
      if (mine.length) pushGifts(mine);
      if (RP_CMDS[m.cmd]) {
        const rp = rpParse(m.data || {});
        const st = rpAdd(rp);
        if (st) {
          if (st === 1) toast('检测到' + rpTypeName(rp) + '，可在面板参与', true);
          rerender();
        }
      }
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
      paintWinPanel();
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
    /* IDS 用于面板容器本身，P(sel) 展开成多个面板的同名后代选择器 */
    const IDS = '#' + PANEL_ID + ',#' + LIVE_PANEL_ID + ',#' + RADAR_ID;
    const P = (sel) =>
      '#' + PANEL_ID + ' ' + sel + ',#' + LIVE_PANEL_ID + ' ' + sel + ',#' + RADAR_ID + ' ' + sel;
    st.textContent = `
      ${IDS}{position:fixed;left:10px;bottom:10px;z-index:2147483000;width:300px;
        background:rgba(20,20,22,.95);border:1px solid #fb7299;border-radius:10px;
        color:#e6e6e6;font:13px/1.6 -apple-system,"Microsoft YaHei",sans-serif;
        padding:12px 14px;box-shadow:0 4px 20px rgba(0,0,0,.5);}
      /* 每个面板右上角固定一个拖拽把手，落在内边距里，滚动交给内层容器，把手不随内容滚动 */
      #${PANEL_ID} .rs,#${LIVE_PANEL_ID} .rs,#${RADAR_ID} .rs,#${RPWIN_ID} .rs{
        position:absolute;right:0;top:0;width:12px;height:12px;cursor:nesw-resize;z-index:6;}
      /* 弧的圆心与面板右上圆角同心，半径取面板圆角减 2，正好落在圆角内侧 */
      #${PANEL_ID} .rs::after,#${LIVE_PANEL_ID} .rs::after,#${RADAR_ID} .rs::after,#${RPWIN_ID} .rs::after{
        content:'';position:absolute;right:2px;top:2px;width:8px;height:8px;
        border-top:2px solid #fb7299;border-right:2px solid #fb7299;border-top-right-radius:8px;}
      #${PANEL_ID} .rs:hover::after,#${LIVE_PANEL_ID} .rs:hover::after,
      #${RADAR_ID} .rs:hover::after,#${RPWIN_ID} .rs:hover::after{border-color:#ffb0c6;}
      /* 主面板宽度由内容撑开；高度由脚本按有无粉丝团决定，视口不足时由 max-height 收缩 */
      #${PANEL_ID}{display:flex;flex-direction:column;box-sizing:border-box;
        width:max-content;min-width:330px;max-width:calc(100vw - 20px);
        max-height:calc(100vh - 20px);overflow:hidden;}
      #${PANEL_ID} .body{flex:1 1 auto;overflow-y:auto;min-height:0;}
      #${LIVE_PANEL_ID}{display:flex;flex-direction:column;box-sizing:border-box;
        width:max-content;min-width:220px;}
      #${LIVE_PANEL_ID} .list{flex:1 1 auto;overflow:auto;min-height:0;display:grid;
        grid-template-columns:max-content max-content max-content max-content max-content;
        column-gap:10px;row-gap:6px;align-items:center;align-content:start;justify-content:start;white-space:nowrap;}
      #${LIVE_PANEL_ID} .list .dim{grid-column:1 / -1;}
      #${LIVE_PANEL_ID} .lv-n{color:#fff;overflow:hidden;text-overflow:ellipsis;}
      #${LIVE_PANEL_ID} .lv-medal{display:inline-flex;align-items:center;gap:3px;
        height:18px;padding:0 7px;border:1px solid;border-radius:9px;
        color:#fff;font-size:12px;line-height:16px;justify-self:end;}
      #${LIVE_PANEL_ID} .lv-medal b{font-weight:400;}
      #${LIVE_PANEL_ID} .lv-medal.has-icon{padding:0 7px 0 3px;}
      #${LIVE_PANEL_ID} .lv-medal.icon-only{padding:0 2px;}
      #${LIVE_PANEL_ID} .lv-guard{display:inline-flex;align-items:center;justify-content:center;
        width:14px;height:14px;border-radius:50%;color:#fff;font-style:normal;}
      #${LIVE_PANEL_ID} .lv-on{font-size:12px;color:#9a9a9a;}
      #${LIVE_PANEL_ID} .lv-s{font-size:12px;}
      #${LIVE_PANEL_ID} .lv-go{font-size:12px;color:#fb7299;border:1px solid #fb7299;
        border-radius:4px;padding:1px 6px;text-decoration:none;justify-self:end;}
      #${LIVE_PANEL_ID} .lv-go:hover{background:#fb7299;color:#fff;}
      ${P('.hd')}{position:relative;padding-right:56px;font-size:15px;font-weight:600;color:#fff;margin-bottom:10px;}
      ${P('.x')}{position:absolute;right:0;top:1px;width:16px;height:16px;line-height:16px;text-align:center;
        color:#9a9a9a;cursor:pointer;font-size:15px;font-weight:400;border-radius:4px;}
      ${P('.x:hover')}{color:#fff;background:rgba(255,255,255,.14);}
      /* 标题行按钮统一为粉色描边，与红包行的按钮一致 */
      ${P('.lb')}{position:absolute;right:48px;top:1px;box-sizing:border-box;height:16px;line-height:14px;
        padding:0 5px;color:#fb7299;border:1px solid #fb7299;border-radius:4px;
        cursor:pointer;font-size:12px;font-weight:400;}
      ${P('.lb.on')}{background:rgba(251,114,153,.18);}
      ${P('.lb:hover')}{background:#fb7299;color:#fff;}
      /* 手动刷新：占据 牌 与 × 之间，固定宽度保证与 .lb 的间距稳定 */
      ${P('.rf')}{position:absolute;right:24px;top:1px;box-sizing:border-box;width:20px;height:16px;
        line-height:14px;text-align:center;color:#fb7299;border:1px solid #fb7299;border-radius:4px;
        cursor:pointer;font-size:12px;font-weight:400;}
      ${P('.rf:hover')}{background:#fb7299;color:#fff;}
      ${P('.rf.on')}{opacity:.45;cursor:default;}
      #${PANEL_ID} .hd{padding-right:80px;}
      ${P('.tag')}{font-size:12px;color:#fb7299;border:1px solid #fb7299;border-radius:4px;
        padding:1px 6px;margin-left:8px;vertical-align:middle;}
      ${P('.dim')}{color:#9a9a9a;font-size:12px;}
      #${BEAT_ID}{white-space:nowrap;overflow:hidden;text-overflow:ellipsis;}
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
      ${P('.rp')}{margin-top:10px;border-top:1px dashed rgba(255,255,255,.16);padding-top:8px;}
      ${P('.rp .tt')}{position:relative;padding-right:44px;color:#fb7299;font-weight:600;margin-bottom:6px;}
      ${P('.rp-item')}{margin:5px 0;}
      /* 雷达每个条目（含第一个）上方都用与主面板各栏一致的分隔线 */
      #${RADAR_ID} .rd-list .rp-item{border-top:1px dashed rgba(255,255,255,.16);
        padding-top:8px;margin-top:8px;}
      ${P('.rp-row')}{display:flex;align-items:center;gap:8px;}
      ${P('.rp-meta')}{flex:1 1 auto;min-width:0;display:flex;flex-direction:column;}
      ${P('.rp-title')}{color:#fff;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;}
      /* 雷达行首的主播名与同接 */
      ${P('.rp-top')}{display:flex;align-items:center;gap:6px;min-width:0;}
      ${P('.rp-anchor')}{flex:0 1 auto;min-width:0;color:#fb7299;font-weight:600;
        overflow:hidden;text-overflow:ellipsis;white-space:nowrap;}
      /* 同接与奖品行同字号同色 */
      ${P('.rp-on')}{flex:0 0 auto;color:#9a9a9a;font-size:12px;
        overflow:hidden;text-overflow:ellipsis;white-space:nowrap;}
      /* 奖品名过长时换行显示，不截断 */
      ${P('.rp-award')}{color:#9a9a9a;font-size:12px;white-space:normal;word-break:break-word;}
      ${P('.rp-total')}{color:#ffd97a;font-size:12px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;}
      ${P('.rp-err')}{color:#ff4d4f;font-size:12px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;}
      ${P('.rp-left')}{flex:0 0 auto;font-size:12px;color:#9a9a9a;min-width:34px;text-align:right;}
      ${P('.rp-go')},${P('.rp-win')}{flex:0 0 auto;font-size:12px;color:#fb7299;border:1px solid #fb7299;
        border-radius:4px;padding:1px 8px;cursor:pointer;white-space:nowrap;text-decoration:none;}
      ${P('.rp-go:hover')},${P('.rp-win:hover')}{background:#fb7299;color:#fff;}
      /* 雷达中已结束的红包用 × 移除 */
      ${P('.rp-x')}{flex:0 0 auto;font-size:12px;color:#fb7299;border:1px solid #fb7299;
        border-radius:4px;padding:1px 8px;cursor:pointer;white-space:nowrap;}
      ${P('.rp-x:hover')}{background:#fb7299;color:#fff;}
      ${P('.rp-tag')}{flex:0 0 auto;font-size:12px;border-radius:4px;padding:1px 6px;}
      ${P('.rp-tag.ok')}{color:#fb7299;border:1px solid #fb7299;}
      ${P('.rp-tag.wait')}{color:#f0a13c;border:1px solid #f0a13c;}
      ${P('.rp-tag.bad')}{color:#ff4d4f;border:1px solid #ff4d4f;}
      ${P('.rp-cond')}{flex:0 0 auto;font-size:12px;color:#9a9a9a;border:1px dashed rgba(255,255,255,.28);
        border-radius:4px;padding:0 5px;}
      ${P('.rp-cond-warn')}{color:#f0a13c;border-color:#f0a13c;}
      #${RPWIN_ID}{position:fixed;bottom:10px;z-index:2147483000;width:300px;box-sizing:border-box;
        background:rgba(20,20,22,.95);border:1px solid #fb7299;border-radius:10px;
        color:#e6e6e6;font:13px/1.6 -apple-system,"Microsoft YaHei",sans-serif;
        padding:12px 14px;box-shadow:0 4px 20px rgba(0,0,0,.5);display:flex;flex-direction:column;}
      #${RPWIN_ID} .hd{position:relative;padding-right:56px;font-size:15px;font-weight:600;color:#fff;margin-bottom:10px;}
      #${RPWIN_ID} .x{position:absolute;right:0;top:1px;width:16px;height:16px;line-height:16px;text-align:center;
        color:#9a9a9a;cursor:pointer;font-size:15px;font-weight:400;border-radius:4px;}
      #${RPWIN_ID} .x:hover{color:#fff;background:rgba(255,255,255,.14);}
      #${RPWIN_ID} .wl{flex:1 1 auto;overflow-y:auto;min-height:0;display:grid;
        grid-template-columns:max-content max-content max-content;column-gap:10px;row-gap:6px;
        align-items:center;align-content:start;justify-content:start;}
      #${RPWIN_ID} .wl .dim{grid-column:1 / -1;}
      #${RPWIN_ID} .wn{color:#e6e6e6;overflow:hidden;text-overflow:ellipsis;max-width:150px;}
      #${RPWIN_ID} .wn.self{color:#ffd97a;font-weight:600;}
      #${RPWIN_ID} .wp{color:#9a9a9a;}
      #${RPWIN_ID} .wc{color:#9a9a9a;justify-self:end;}
      ${P('.off')}{color:#ff9a3c;} ${P('.on')}{color:#7bd88f;} ${P('.unk')}{color:#8a8a8a;}
      ${P('.rp-radar')}{position:absolute;right:0;top:0;box-sizing:border-box;height:16px;line-height:14px;
        padding:0 5px;color:#fb7299;border:1px solid #fb7299;border-radius:4px;
        cursor:pointer;font-size:12px;font-weight:400;}
      ${P('.rp-radar.on')}{background:rgba(251,114,153,.18);}
      ${P('.rp-radar:hover')}{background:#fb7299;color:#fff;}
      #${RADAR_ID}{display:flex;flex-direction:column;box-sizing:border-box;width:330px;}
      #${RADAR_ID} .rd-areas{display:flex;flex-wrap:wrap;gap:4px 6px;margin-bottom:6px;}
      #${RADAR_ID} .rd-nums{display:flex;flex-wrap:wrap;gap:6px;margin-bottom:6px;}
      #${RADAR_ID} .rd-btn{font-size:12px;color:#9a9a9a;border:1px solid rgba(255,255,255,.28);
        border-radius:4px;padding:0 6px;cursor:pointer;user-select:none;}
      #${RADAR_ID} .rd-btn:hover{color:#fff;border-color:rgba(255,255,255,.6);}
      #${RADAR_ID} .rd-btn.on{color:#fb7299;border-color:#fb7299;}
      #${RADAR_ID} .rd-run{margin-left:auto;color:#fb7299;border-color:#fb7299;}
      #${RADAR_ID} .rd-run.on{color:#9a9a9a;border-color:rgba(255,255,255,.28);}
      #${RADAR_ID} .rd-stat{font-size:12px;color:#9a9a9a;margin-bottom:6px;
        overflow:hidden;text-overflow:ellipsis;white-space:nowrap;}
      #${RADAR_ID} .rd-list{flex:1 1 auto;overflow-y:auto;min-height:0;}
      /* 滚动条贴到面板内边缘，内容缩进仍由左右内边距维持 */
      #${PANEL_ID} .body,#${LIVE_PANEL_ID} .list,#${RADAR_ID} .rd-list,#${RPWIN_ID} .wl{
        margin:0 -14px;padding:0 14px;}
    `;
    document.head.appendChild(st);
  }

  /* ---------- 面板拖拽调整大小 ---------- */

  const SIZE_STORE = 'qmdmb-panel-size';
  const RESIZE_HTML = '<span class="rs" title="拖动调整面板大小"></span>';
  const PANEL_MIN_W = 220;
  const PANEL_MIN_H = 140;
  /* 主面板在有粉丝团时的固定高度 */
  const PANEL_H = 750;
  let panelSizes = {};

  function sizeLoad() {
    try {
      const o = JSON.parse(localStorage.getItem(SIZE_STORE) || 'null');
      if (!o || typeof o !== 'object') return;
      Object.keys(o).forEach((k) => {
        const v = o[k] || {};
        const w = rpNum(v.w);
        const h = rpNum(v.h);
        if (w >= PANEL_MIN_W && h >= PANEL_MIN_H) panelSizes[k] = { w: w, h: h };
      });
    } catch (e) {}
  }

  function sizeSave() {
    try {
      localStorage.setItem(SIZE_STORE, JSON.stringify(panelSizes));
    } catch (e) {}
  }

  /* 自定义高度不能超过可用视口高度 */
  function sizeMaxH(id, lim) {
    const s = panelSizes[id];
    return Math.max(PANEL_MIN_H, s ? Math.min(s.h, lim) : lim);
  }

  /* 把手用事件委托，面板重绘不需要重新绑定 */
  function onResizeDown(e) {
    const t = e.target;
    if (!t || !t.classList || !t.classList.contains('rs')) return;
    const el = t.parentElement;
    if (!el || !el.id) return;
    e.preventDefault();
    const r = el.getBoundingClientRect();
    const x0 = e.clientX;
    const y0 = e.clientY;
    const w0 = r.width;
    const h0 = r.height;
    const move = (ev) => {
      /* 底边固定、左边固定：向右拖变宽，向上拖变高；宽度不能拖出视口，高度不能超过视口 */
      const avail = Math.max(PANEL_MIN_W, Math.round(window.innerWidth - r.left - 10));
      const w = Math.max(PANEL_MIN_W, Math.min(Math.round(w0 + ev.clientX - x0), avail));
      const h = Math.max(PANEL_MIN_H, Math.min(Math.round(h0 - (ev.clientY - y0)), window.innerHeight - 20));
      panelSizes[el.id] = { w: w, h: h };
      el.style.width = w + 'px';
      /* 主面板高度定死，副面板高度上限跟随内容 */
      if (el.id === PANEL_ID) el.style.height = h + 'px';
      else el.style.maxHeight = h + 'px';
      /* 宽度变化会改变副面板的定位基准 */
      if (document.getElementById(RADAR_ID)) syncRadarBox();
      if (document.getElementById(RPWIN_ID)) syncWinBox();
      if (document.getElementById(LIVE_PANEL_ID)) syncLiveBox();
    };
    const up = () => {
      document.removeEventListener('mousemove', move, true);
      document.removeEventListener('mouseup', up, true);
      sizeSave();
    };
    document.addEventListener('mousemove', move, true);
    document.addEventListener('mouseup', up, true);
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
      parts.push('WS心跳：' + (idle * 1000 <= BEAT_TIMEOUT_MS ? '正常' : '中断'), '最近 ' + idle + 's');
      if (beatGap > 0) parts.push('间隔 ' + Math.round(beatGap / 1000) + 's');
      parts.push('累计 ' + beatCount);
    }
    if (decodeFails) parts.push('解压失败 ' + decodeFails);
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
    paintRedPackets();
  }

  function stopCounters() {
    stopRpPoll();
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
      const boosted = sum * 15 / 10;
      total = Math.floor(boosted);
      const kept = Math.round((boosted - total) * 10) / 10;
      foot += ' ×1.5 = ' + (kept > 0
        ? boosted + '（<b>' + total + '</b>，余 ' + kept + ' 保留）'
        : '<b>' + total + '</b>');
    }
    foot += '</div>';
    const tFeed = medal && medal.today_feed != null ? Number(medal.today_feed) : null;
    if (tFeed != null && tFeed - total > 0) {
      const otherCredited = tFeed - total;
      let other = '<div class="g-sum dim">其他（充电/投币/分享）+';
      if (guard > 0) {
        const otherBase = Math.round(otherCredited / 1.5 * 10) / 10;
        const otherShown = Math.floor(otherBase * 1.5);
        other += '<b>' + otherBase + '</b> ×1.5 = ' +
          (otherShown === otherCredited ? '<b>' + otherCredited + '</b>'
            : otherShown + '（<b>' + otherCredited + '</b>）');
      } else {
        other += '<b>' + otherCredited + '</b>';
      }
      foot += other + '</div>';
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
          closeWinPanel();
          closeRadarPanel();
          p.remove();
        } else if (t.classList.contains('lb')) {
          toggleLivePanel();
        } else if (t.classList.contains('rf')) {
          refreshPanel();
        } else if (t.classList.contains('rp-radar')) {
          toggleRadarPanel();
        } else if (t.classList.contains('rp-go')) {
          rpJoin(Number(t.getAttribute('data-lot')));
        } else if (t.classList.contains('rp-win')) {
          rpWinners(Number(t.getAttribute('data-lot')));
        }
      });
      document.documentElement.appendChild(p);
    }

    const room = s.room, medal = s.medal, tasks = s.tasks;
    const live = liveInfo(room.liveStatus);
    const uname = (medal && medal.target_name) || room.uname || '主播';

    const sz = panelSizes[PANEL_ID];
    if (sz) p.style.width = sz.w + 'px';
    /* 有粉丝团时高度固定，无粉丝团时随内容；视口不足由 CSS 的 max-height 收缩 */
    p.style.height = medal ? sizeMaxH(PANEL_ID, PANEL_H) + 'px' : 'auto';

    if (!medal && !tasks) {
      p.innerHTML = '<div class="body">' +
        '<div class="hd">' + esc(uname) + '<span class="dim"> 粉丝团</span>' +
        ' <span class="' + live.cls + '">' + live.text + '</span>' + liveBtnHtml() + refreshBtnHtml() + '<span class="x" title="关闭">×</span></div>' +
        '<div class="dim">你尚未加入该主播的粉丝团。</div>' +
        (s.reason ? '<div class="row dim">' + esc(s.reason) + '</div>' : '') +
        rpHtml() + '</div>' + RESIZE_HTML;
      toggleLiveBtn();
      syncRadarBox();
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
    p.innerHTML = '<div class="body">' +
      '<div class="hd">' + esc(name) +
        ' <span class="tag">Lv.' + (medal && medal.level != null ? medal.level : '?') + '</span>' +
        (guard ? '<span class="tag">' + guard + '</span>' : '') +
        ' <span class="' + live.cls + '">' + live.text + '</span>' + liveBtnHtml() + refreshBtnHtml() + '<span class="x" title="关闭">×</span></div>' +
      medalRows +
      storeRow +
      watchHtml() +
      barHtml() +
      beatHtml() +
      journeyHtml(s.journey) +
      gainHtml(tasks, medal, s.guard, s.coins) +
      rpHtml() +
      tasksSection + '</div>' + RESIZE_HTML;
    toggleLiveBtn();
    syncRadarBox();
    syncLiveBox();
  }

  /* ---------- 所有直播间面板 ---------- */

  let liveRows = null;
  let liveLoading = false;
  let liveTimer = null;
  let liveOnlineTimer = null;
  let liveRefreshing = false;
  let liveOnlineRefreshing = false;
  const LIVE_REFRESH_MS = 3000;    /* 直播状态：批量接口 */
  const LIVE_ONLINE_MS = 15000;    /* 在线人数：逐房间接口 */

  function liveStatusInfo(st) {
    if (st === 1) return { cls: 'on', text: '直播中' };
    if (st === 2) return { cls: 'unk', text: '轮播中' };
    if (st === 0) return { cls: 'off', text: '未开播' };
    return { cls: 'unk', text: '未知' };
  }

  function fmtOnline(n) {
    return String(Number(n) || 0);
  }

  /* 十进制颜色值转 #rrggbb，必须补足 6 位 */
  function medalColor(n) {
    const v = Number(n) || 0;
    return v > 0 ? '#' + v.toString(16).padStart(6, '0').slice(-6) : '#c9c9c9';
  }

  const GUARDCOLOR = { 1: '#e0523f', 2: '#9660e5', 3: '#22a0f5' };
  const ANCHOR_SVG =
    '<svg viewBox="0 0 16 16" width="11" height="11" fill="none" stroke="currentColor" stroke-width="1.6">' +
    '<circle cx="8" cy="3.2" r="1.9"/><path d="M8 5.1V14"/><path d="M4.4 6.6h7.2"/>' +
    '<path d="M2.2 10.2c0 2.9 2.6 4.6 5.8 4.6s5.8-1.7 5.8-4.6"/></svg>';

  function medalBadgeHtml(r) {
    const text = [r.medal ? esc(r.medal) : '', r.level ? String(r.level) : ''].filter(Boolean).join('');
    const gc = GUARDCOLOR[r.guard];
    if (!text && !gc) return '<span></span>';
    const ic = gc
      ? '<i class="lv-guard" style="background:' + gc + '" title="' + esc(GUARDNAME[r.guard] || '') + '">' +
        ANCHOR_SVG + '</i>'
      : '';
    const cls = ic ? (text ? ' has-icon' : ' icon-only') : '';
    return '<span class="lv-medal' + cls + '" style="background:linear-gradient(90deg,' +
      r.c1 + ',' + r.c2 + ');border-color:' + r.c3 + '">' + ic +
      (text ? '<b>' + text + '</b>' : '') + '</span>';
  }

  function liveListHtml() {
    if (liveLoading && !liveRows) return '<div class="dim">加载中…</div>';
    if (!liveRows) return '<div class="dim">暂无数据</div>';
    if (!liveRows.length) return '<div class="dim">未持有粉丝牌</div>';
    return liveRows.map((r, i) => {
      const s = liveStatusInfo(r.live);
      const go = r.roomid
        ? '<a class="lv-go" href="https://live.bilibili.com/' + r.roomid +
          '" target="_blank" rel="noopener">进入</a>'
        : '<span></span>';
      return '<span class="lv-n">' + esc(r.uname) + '</span>' +
        medalBadgeHtml(r) +
        '<span class="lv-on" data-i="' + i + '">同接 ' + fmtOnline(r.online) + '</span>' +
        '<span class="lv-s ' + s.cls + '" data-i="' + i + '">' + s.text + '</span>' + go;
    }).join('');
  }

  function liveBtnHtml() {
    const on = document.getElementById(LIVE_PANEL_ID) ? ' on' : '';
    return '<span class="lb' + on + '" title="所有直播间">牌</span>';
  }

  function refreshBtnHtml() {
    return '<span class="rf" title="重新拉取数据">↻</span>';
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
    q.innerHTML = '<div class="hd">所有直播间' +
      (liveRows ? '<span class="dim"> ' + liveRows.length + ' 个</span>' : '') +
      '<span class="x" title="关闭">×</span></div>' +
      '<div class="list">' + liveListHtml() + '</div>' + RESIZE_HTML;
    syncLiveBox();
    toggleLiveBtn();
  }

  /* 副面板贴主面板右侧 10px（名单面板已开时贴其右侧），与主面板顶对齐，高度随内容 */
  function syncLiveBox() {
    const q = document.getElementById(LIVE_PANEL_ID);
    const p = document.getElementById(PANEL_ID);
    if (!q || !p) return;
    const r = p.getBoundingClientRect();
    let right = r.right;
    const w = document.getElementById(RPWIN_ID);
    if (w) right = Math.max(right, w.getBoundingClientRect().right);
    const d = document.getElementById(RADAR_ID);
    if (d) right = Math.max(right, d.getBoundingClientRect().right);
    const left = Math.round(right + 10);
    q.style.left = left + 'px';
    q.style.top = 'auto';
    q.style.bottom = '10px';
    q.style.height = 'auto';
    const lim = Math.max(160, window.innerHeight - 20);
    if (panelSizes[LIVE_PANEL_ID]) q.style.width = panelSizes[LIVE_PANEL_ID].w + 'px';
    q.style.maxHeight = sizeMaxH(LIVE_PANEL_ID, lim) + 'px';
    q.style.maxWidth = Math.max(300, window.innerWidth - left - 16) + 'px';
    capRows(q.querySelector('.list'), LIVE_MAX);
  }

  function closeLivePanel() {
    stopLiveTimer();
    const q = document.getElementById(LIVE_PANEL_ID);
    if (q) q.remove();
    toggleLiveBtn();
  }

  function stopLiveTimer() {
    clearInterval(liveTimer);
    liveTimer = null;
    clearInterval(liveOnlineTimer);
    liveOnlineTimer = null;
  }

  function startLiveTimer() {
    if (liveTimer) return;
    liveTimer = setInterval(refreshLive, LIVE_REFRESH_MS);
    liveOnlineTimer = setInterval(refreshOnline, LIVE_ONLINE_MS);
  }

  /* 只改同接与状态文本，不重建列表，避免闪烁与滚动跳动 */
  function paintLiveRows() {
    const q = document.getElementById(LIVE_PANEL_ID);
    if (!q || !liveRows) return;
    q.querySelectorAll('.lv-on,.lv-s').forEach((el) => {
      const r = liveRows[Number(el.getAttribute('data-i'))];
      if (!r) return;
      if (el.classList.contains('lv-on')) {
        el.textContent = '同接 ' + fmtOnline(r.online);
        return;
      }
      const s = liveStatusInfo(r.live);
      el.textContent = s.text;
      el.className = 'lv-s ' + s.cls;
    });
  }

  async function refreshLive() {
    if (liveRefreshing || !liveRows || !liveRows.length) return;
    if (!document.getElementById(LIVE_PANEL_ID)) {
      stopLiveTimer();
      return;
    }
    liveRefreshing = true;
    try {
      const uids = liveRows.map((r) => r.uid).filter(Boolean);
      const st = await fetchRoomStatus(uids);
      let wentLive = false;
      liveRows.forEach((r) => {
        const s = st[String(r.uid)];
        if (!s) return;
        const wasLive = r.live === 1 || r.live === 2;
        if (s.live_status != null) r.live = Number(s.live_status);
        if (r.live === 1 || r.live === 2) {
          if (!wasLive) wentLive = true;
        } else {
          r.online = 0;
        }
      });
      paintLiveRows();
      if (wentLive) refreshOnline();
    } catch (e) {
    } finally {
      liveRefreshing = false;
    }
  }

  function paintLiveOnline(i) {
    const q = document.getElementById(LIVE_PANEL_ID);
    const el = q && q.querySelector('.lv-on[data-i="' + i + '"]');
    if (el && liveRows[i]) el.textContent = '同接 ' + fmtOnline(liveRows[i].online);
  }

  /* 逐房间取真实在线人数，仅查直播中/轮播中；串行请求以限制速率 */
  async function refreshOnline() {
    if (liveOnlineRefreshing || !liveRows || !liveRows.length) return;
    if (!document.getElementById(LIVE_PANEL_ID)) {
      stopLiveTimer();
      return;
    }
    liveOnlineRefreshing = true;
    try {
      for (let i = 0; i < liveRows.length; i++) {
        const r = liveRows[i];
        if (r.live !== 1 && r.live !== 2) continue;
        const n = await fetchOnlineNum(r.roomid, r.uid);
        if (n == null) continue;
        r.online = n;
        paintLiveOnline(i);
      }
    } catch (e) {
    } finally {
      liveOnlineRefreshing = false;
    }
  }

  /* 页面切到后台时暂停轮询，回到前台立即刷新一次 */
  function onVisibilityChange() {
    if (document.hidden) {
      stopLiveTimer();
      stopRadarTimer();
      return;
    }
    if (document.getElementById(LIVE_PANEL_ID)) {
      refreshLive();
      refreshOnline();
      startLiveTimer();
    }
    if (document.getElementById(RADAR_ID) && document.getElementById(PANEL_ID)) startRadarTimer();
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
          uid: m.target_id,
          uname: m.target_name || s.uname || m.uname || '主播',
          medal: m.medal_name || '',
          level: Number(m.level) || 0,
          guard: Number(m.guard_level) || 0,
          c1: medalColor(m.medal_color_start),
          c2: medalColor(m.medal_color_end),
          c3: medalColor(m.medal_color_border),
          light: Number(m.is_lighted) || 0,
          live: s.live_status != null ? Number(s.live_status) : null,
          online: 0,
          roomid: s.room_id || m.roomid || 0
        };
      });
      /* 点亮优先 → 直播中优先 → 等级降序 */
      liveRows.sort((a, b) =>
        (b.light ? 1 : 0) - (a.light ? 1 : 0) ||
        (b.live === 1 ? 1 : 0) - (a.live === 1 ? 1 : 0) ||
        b.level - a.level);
    } catch (e) {
      liveRows = [];
      toast('粉丝牌列表加载失败：' + e.message, false);
    }
    liveLoading = false;
    if (document.getElementById(LIVE_PANEL_ID)) {
      renderLivePanel();
      startLiveTimer();
      refreshOnline();
    }
  }

  /* ---------- 红包雷达 ---------- */

  let radarAreas = null;
  /* 选中的分区 id 与分组 key，可多选 */
  let radarSels = [];
  let radarNum = 100;
  let radarRooms = [];
  const radarMap = new Map();
  let radarTimer = null;
  /* 面板打开即按下计时器，但只有启动后才发请求；计时器负责倒计时与状态行的刷新 */
  let radarOn = false;
  let radarLoading = false;
  let radarFetchAt = 0;
  /* 最近一次房间池抓取尝试的时间，失败时也推进，避免每秒重试 */
  let radarPoolAt = 0;
  let radarEpoch = 0;
  /* 连续失败只提示，不中断扫描；下一次成功即清除 */
  let radarFailMsg = '';
  let radarDiag = '';
  let radarFails = 0;
  /* 非风控类失败单独计数，避免网络抖动也弹出「请刷新网页过验证」 */
  let radarErrFails = 0;
  let radarTokenAt = 0;
  let radarTokens = RADAR_BUCKET_MAX;
  let radarStatCache = null;
  let radarNewCount = 0;
  let radarNewTimer = null;
  /* 已结束条目数，变化时重绘一次，把「进入」换成 × */
  let radarEndedMark = -1;
  /* 命中的直播间同接：逐房间查询，与所有直播间面板同一接口 */
  let radarOnlineBusy = false;
  let radarOnlineAt = 0;

  function radarPrefLoad() {
    try {
      const o = JSON.parse(localStorage.getItem(RADAR_STORE) || 'null');
      if (!o || typeof o !== 'object') return;
      /* 选中项既可能是分区 id（数字）也可能是分组 key（字符串），旧版只存单个值 */
      const arr = Array.isArray(o.area) ? o.area : [o.area];
      radarSels = arr
        .map((x) => (typeof x === 'string' && radarGroupOf(x) ? x : rpNum(x)))
        .filter((x) => !!x);
      const n = rpNum(o.num);
      if (RADAR_NUMS.indexOf(n) >= 0) radarNum = n;
    } catch (e) {}
  }

  function radarPrefSave() {
    try {
      localStorage.setItem(RADAR_STORE, JSON.stringify({ area: radarSels, num: radarNum }));
    } catch (e) {}
  }

  /* 多选后房间池规模由来源数量决定，冷间隔按池子实际大小分档 */
  function radarCold() {
    const n = radarRooms.length;
    for (let i = 0; i < RADAR_NUMS.length; i++) {
      if (n <= RADAR_NUMS[i]) return RADAR_COLD[RADAR_NUMS[i]];
    }
    return RADAR_COLD[RADAR_NUMS[RADAR_NUMS.length - 1]];
  }

  /* 固定节拍会让整批房间同时到期，间隔统一加 ±15% 抖动 */
  function radarJitter(ms) {
    return Math.round(ms * (0.85 + Math.random() * 0.3));
  }

  /* 冷间隔与全局暂停用更宽的 ±30% 抖动，避免恢复后仍按固定秒级节拍成批复发 */
  function radarCoolJitter(ms) {
    return Math.round(ms * (0.7 + Math.random() * 0.6));
  }

  /* 所有房间共用的令牌桶，取出一个令牌才允许发一次扫描请求 */
  function radarTokenTake() {
    const now = Date.now();
    if (!radarTokenAt) radarTokenAt = now;
    radarTokens = Math.min(RADAR_BUCKET_MAX, radarTokens + (now - radarTokenAt) / RADAR_BUCKET_MS);
    radarTokenAt = now;
    if (radarTokens < 1) return false;
    radarTokens -= 1;
    return true;
  }

  function radarTime(ts) {
    const d = new Date(ts);
    return String(d.getHours()).padStart(2, '0') + ':' + String(d.getMinutes()).padStart(2, '0');
  }

  async function fetchAreaList() {
    try {
      const j = await fetchJson(API_AREALIST);
      const arr = j && rpNum(j.code) === 0 && Array.isArray(j.data) ? j.data : null;
      if (!arr) return null;
      const out = arr
        .map((a) => ({ id: rpNum(a.id), name: String(a.name || '') }))
        .filter((a) => a.id && a.name);
      return out.length ? out : null;
    } catch (e) {
      return null;
    }
  }

  /* 房间对象字段名跨版本不一致，逐个字段取别名 */
  function radarRoom(it) {
    const roomid = rpNum(it.roomid || it.room_id);
    if (!roomid) return null;
    return {
      roomid: roomid,
      uid: rpNum(it.uid || it.mid),
      uname: String(it.uname || it.name || ''),
      title: String(it.title || ''),
      online: rpNum(it.online || it.online_num),
      /* 未开播与轮播的房间不扫；字段缺失时不过滤 */
      live: it.live_status != null ? rpNum(it.live_status) : null
    };
  }

  function radarKeep(r) {
    if (!r) return false;
    if (rpRoom && r.roomid === rpRoom.roomId) return false;
    return r.live !== 0 && r.live !== 2;
  }

  async function fetchAreaRoomsPage(url, areaId, page) {
    const q = url === API_AREAROOMS_ALT
      ? '?platform=web&parent_area_id=' + areaId + '&area_id=0&sort_type=online&page=' + page
      : '?platform=web&parent_area_id=' + areaId + '&cate_id=0&area_id=0&sort_type=online&page=' +
        page + '&page_size=' + RADAR_PAGE_SIZE;
    try {
      const j = await fetchJson(url + q);
      if (!j || rpNum(j.code) !== 0) return null;
      const d = j.data;
      if (Array.isArray(d)) return d;
      return d && Array.isArray(d.list) ? d.list : null;
    } catch (e) {
      return null;
    }
  }

  /* 翻页收满档位数；排序参数可能失效，收满后统一按人气本地重排 */
  async function fetchAreaRooms(areaId, num) {
    const pages = Math.ceil(num / RADAR_PAGE_SIZE) + 1;
    let url = API_AREAROOMS;
    let fallback = false;
    let got = false;
    let list = [];
    for (let p = 1; p <= pages; p++) {
      const page = await fetchAreaRoomsPage(url, areaId, p);
      /* 主端点首页无数据时换备用端点重来一次 */
      if (url === API_AREAROOMS && !fallback && (!page || !page.length) && p === 1) {
        url = API_AREAROOMS_ALT;
        fallback = true;
        p = 0;
        continue;
      }
      if (!page || !page.length) break;
      got = true;
      list = list.concat(page);
      if (list.length >= num) break;
      await new Promise((r) => setTimeout(r, 120));
    }
    if (!got) return null;
    const seen = new Set();
    const out = [];
    list.forEach((it) => {
      const r = radarRoom(it);
      if (!r || seen.has(r.roomid)) return;
      seen.add(r.roomid);
      out.push(r);
    });
    out.sort((a, b) => b.online - a.online);
    /* 多来源时不能清空别的来源写下的提示 */
    if (fallback) radarDiag = '已回退备用分区接口';
    return out.filter(radarKeep).slice(0, num);
  }

  function radarGroupOf(sel) {
    return RADAR_GROUPS.filter((g) => g.key === sel)[0] || null;
  }

  function vupCache() {
    try {
      const o = JSON.parse(localStorage.getItem(VUP_STORE) || 'null');
      if (!o || !o.at || Date.now() - o.at > VUP_MS) return null;
      return o.groups || null;
    } catch (e) {
      return null;
    }
  }

  /* vup 表的两种返回体：带 data 包装与直接以 uid 为键 */
  function vupGrouped(j) {
    const d = j && j.data && typeof j.data === 'object' ? j.data : j;
    const groups = {};
    RADAR_GROUPS.forEach((g) => { groups[g.key] = []; });
    Object.keys(d || {}).forEach((uid) => {
      const it = d[uid];
      if (!it || !rpNum(uid)) return;
      const g = RADAR_GROUPS.filter((x) => x.group === it.group_name)[0];
      if (g) groups[g.key].push(rpNum(uid));
    });
    return groups;
  }

  async function fetchGroupUids() {
    const hit = vupCache();
    if (hit) return hit;
    const urls = [API_VUP, API_VUP_ALT];
    for (let i = 0; i < urls.length; i++) {
      try {
        const groups = vupGrouped(await fetchJsonOmit(urls[i]));
        const sum = RADAR_GROUPS.reduce((n, g) => n + groups[g.key].length, 0);
        if (!sum) continue;
        try {
          localStorage.setItem(VUP_STORE, JSON.stringify({ at: Date.now(), groups: groups }));
        } catch (e) {}
        return groups;
      } catch (e) {}
    }
    return null;
  }

  /* 归属分组的房间不能按分区枚举，改用按 uid 批量取房间与开播状态 */
  async function fetchGroupRooms(key) {
    const groups = await fetchGroupUids();
    if (!groups) return null;
    const uids = groups[key] || [];
    let out = [];
    for (let i = 0; i < uids.length; i += VUP_CHUNK) {
      const q = uids.slice(i, i + VUP_CHUNK).map((u) => 'uids%5B%5D=' + u).join('&');
      const j = await fetchJson(API_UIDSTATUS + '?' + q);
      if (!j || rpNum(j.code) !== 0) return null;
      Object.keys(j.data || {}).forEach((k) => {
        const r = radarRoom(j.data[k]);
        /* 该接口以 uid 为键，项内可能不含 uid，缺省用键补齐 */
        if (r && !r.uid) r.uid = rpNum(k);
        if (r) out.push(r);
      });
      if (i + VUP_CHUNK < uids.length) await new Promise((r) => setTimeout(r, 120));
    }
    out.sort((a, b) => b.online - a.online);
    return out.filter(radarKeep);
  }

  /* 重建房间池时保留仍存在的房间对象，避免在途请求被重复派发 */
  function radarApplyRooms(list) {
    const now = Date.now();
    const old = new Map(radarRooms.map((r) => [r.roomid, r]));
    radarRooms = list.map((r, i) => {
      const p = old.get(r.roomid);
      if (!p) {
        return {
          roomid: r.roomid, uid: r.uid, uname: r.uname, title: r.title,
          online: r.online, live: r.live,
          /* 首发错峰，避免开场瞬间集中请求 */
          nextAt: now + Math.min(i * 500, 15000) + Math.floor(Math.random() * 300),
          flight: false,
          fail: 0
        };
      }
      p.uname = r.uname || p.uname;
      p.title = r.title || p.title;
      p.online = r.online;
      p.live = r.live;
      return p;
    });
    radarFetchAt = now;
  }

  function radarPoolStale() {
    return Date.now() - radarPoolAt > RADAR_LIST_MS;
  }

  /* 多个来源各自取房间后合并去重，同一个直播间只留一份 */
  async function loadRadarRooms(epoch) {
    radarLoading = true;
    radarPoolAt = Date.now();
    radarDiag = '';
    radarStatCache = null;
    renderRadarPanel();
    const lists = [];
    let bad = 0;
    for (let i = 0; i < radarSels.length; i++) {
      const sel = radarSels[i];
      const one = radarGroupOf(sel) ? await fetchGroupRooms(sel) : await fetchAreaRooms(sel, radarNum);
      if (one) lists.push(one);
      else bad++;
    }
    const cur = epoch === radarEpoch;
    radarLoading = false;
    if (!cur) return;
    /* 未选来源或全部失败都会得到空池 */
    if (!lists.length) {
      if (bad) radarDiag = '房间列表获取失败';
      radarApplyRooms([]);
      renderRadarPanel();
      return;
    }
    if (bad) radarDiag = (radarDiag ? radarDiag + ' · ' : '') + bad + ' 个来源获取失败';
    const seen = new Set();
    const out = [];
    lists.forEach((l) => l.forEach((r) => {
      if (seen.has(r.roomid)) return;
      seen.add(r.roomid);
      out.push(r);
    }));
    out.sort((a, b) => b.online - a.online);
    radarApplyRooms(out);
    renderRadarPanel();
  }

  /* 换分区或档位后旧房间池作废，未启动时也要清掉，启动时才不会扫到上一批房间 */
  function radarPoolDrop() {
    radarRooms = [];
    radarPoolAt = 0;
    radarFetchAt = 0;
    radarEpoch++;
    radarStatCache = null;
  }

  /* 分区与分组共用一组选中项，点一次加入，再点一次移除 */
  function toggleRadarSel(id) {
    if (!id) return;
    const i = radarSels.indexOf(id);
    if (i >= 0) radarSels.splice(i, 1);
    else radarSels.push(id);
    radarMap.clear();
    radarPrefSave();
    radarPoolDrop();
    renderRadarPanel();
    if (radarOn) loadRadarRooms(radarEpoch);
  }

  function selectRadarNum(n) {
    if (RADAR_NUMS.indexOf(n) < 0 || n === radarNum) return;
    radarNum = n;
    radarPrefSave();
    radarPoolDrop();
    renderRadarPanel();
    if (radarOn) loadRadarRooms(radarEpoch);
  }

  function radarAdd(info, room) {
    const old = radarMap.get(info.lotId);
    if (old) {
      let upd = false;
      if (info.endTime && info.endTime !== old.endTime) { old.endTime = info.endTime; upd = true; }
      if (info.awards.length && rpAwardKey(info.awards) !== rpAwardKey(old.awards)) {
        old.awards = info.awards;
        upd = true;
      }
      if (info.total && info.total !== old.total) { old.total = info.total; upd = true; }
      if (info.need && info.need !== old.need) { old.need = info.need; upd = true; }
      if (info.needFollow && !old.needFollow) { old.needFollow = true; upd = true; }
      if (info.shared && !old.shared) { old.shared = true; upd = true; }
      return upd ? 2 : 0;
    }
    radarMap.set(info.lotId, {
      lotId: info.lotId,
      rpType: info.rpType,
      guard: !!info.guard,
      sender: info.sender,
      awards: info.awards,
      endTime: info.endTime,
      total: info.total,
      need: info.need,
      needFollow: !!info.needFollow,
      shared: !!info.shared,
      roomid: room.roomid,
      uid: room.uid,
      uname: room.uname,
      rtitle: room.title,
      online: 0,
      at: Date.now()
    });
    return 1;
  }

  function radarPrune() {
    const now = Date.now();
    let removed = false;
    radarMap.forEach((row, lotId) => {
      if (now - (row.endTime ? row.endTime * 1000 : row.at) <= RP_KEEP_MS) return;
      radarMap.delete(lotId);
      removed = true;
    });
    return removed;
  }

  function radarEndedCount() {
    const now = nowSec();
    let n = 0;
    radarMap.forEach((r) => { if (r.endTime && r.endTime <= now) n++; });
    return n;
  }

  function radarToast(n) {
    radarNewCount += n;
    clearTimeout(radarNewTimer);
    toast('雷达检测到 ' + radarNewCount + ' 个新红包', true);
    radarNewTimer = setTimeout(() => { radarNewCount = 0; }, 2000);
  }

  async function radarScan(room) {
    const epoch = radarEpoch;
    room.flight = true;
    let ok = false;
    let bad = '';
    let list = null;
    try {
      const j = await fetchJson(API_RPLOTTERY + '?roomid=' + encodeURIComponent(room.roomid));
      if (j && rpNum(j.code) === 0) {
        ok = true;
        list = j.data && Array.isArray(j.data.popularity_red_pocket) ? j.data.popularity_red_pocket : [];
      } else {
        bad = j ? String(rpNum(j.code)) : '响应异常';
      }
    } catch (e) {
      bad = e.message || '网络错误';
    }
    room.flight = false;
    if (epoch !== radarEpoch) return;
    const now = Date.now();
    if (!ok) {
      room.fail++;
      room.nextAt = now + radarCoolJitter(room.fail >= RADAR_FAILS ? RADAR_COOL_MS : radarCold());
      /* 风控码与其他失败分开计数，只有风控码才提示过验证 */
      const risk = RADAR_RISK_CODES.indexOf(rpNum(bad)) >= 0;
      const fails = risk ? ++radarFails : ++radarErrFails;
      if (fails >= RADAR_PAUSE_FAILS) {
        if (risk) radarFails = 0;
        else radarErrFails = 0;
        /* 达阈值只提示并清零计数，扫描继续；降速交由各房间的冷间隔处理 */
        radarFailMsg = risk ? '请刷新网页过验证' : '扫描异常';
        /* 具体失败码留在控制台，状态行只给简短提示 */
        if (window.console) console.warn('[qmdmb] 雷达连续失败：' + bad);
      }
      return;
    }
    room.fail = 0;
    radarFails = 0;
    radarErrFails = 0;
    radarFailMsg = '';
    let hot = false;
    let changed = false;
    let fresh = 0;
    list.forEach((it) => {
      const info = rpParse(it);
      if (!info) return;
      if (info.endTime && info.endTime <= nowSec()) return;
      hot = true;
      const st = radarAdd(info, room);
      if (st) changed = true;
      if (st === 1) fresh++;
    });
    room.nextAt = now + radarJitter(hot ? RP_POLL_MS : radarCold());
    if (changed) renderRadarPanel();
    else paintRadarLefts();
    if (fresh) {
      radarToast(fresh);
      radarRefreshOnline();
    }
  }

  function startRadarTimer() {
    if (radarTimer) return;
    radarTimer = setInterval(radarTick, 1000);
  }

  function radarStart() {
    if (radarOn) return;
    radarOn = true;
    radarFailMsg = '';
    radarFails = 0;
    radarErrFails = 0;
    radarTokenAt = 0;
    radarTokens = RADAR_BUCKET_MAX;
    radarStatCache = null;
    renderRadarPanel();
    startRadarTimer();
    if (!radarRooms.length || radarPoolStale()) loadRadarRooms(radarEpoch);
  }

  function radarStop() {
    if (!radarOn) return;
    radarOn = false;
    radarFailMsg = '';
    radarFails = 0;
    radarErrFails = 0;
    radarStatCache = null;
    renderRadarPanel();
  }

  function radarToggleRun() {
    if (radarOn) radarStop();
    else radarStart();
  }

  function stopRadarTimer() {
    clearInterval(radarTimer);
    radarTimer = null;
  }

  function radarTick() {
    if (!document.getElementById(RADAR_ID) || !document.getElementById(PANEL_ID) || document.hidden) {
      stopRadarTimer();
      return;
    }
    if (radarPrune() || radarEndedCount() !== radarEndedMark) renderRadarPanel();
    else paintRadarLefts();
    paintRadarStat();
    /* 未启动不发扫描请求 */
    if (!radarOn) return;
    const now = Date.now();
    /* 房间池长期不重建会漏掉新开播的直播间 */
    if (!radarLoading && radarPoolStale()) loadRadarRooms(radarEpoch);
    let n = 0;
    radarRooms.forEach((r) => { if (r.flight) n++; });
    if (n < RADAR_CONC) {
      /* 当前所在直播间由主面板轮询，导航进入后立即从雷达排除 */
      const self = rpRoom ? rpRoom.roomId : 0;
      const due = radarRooms
        .filter((r) => !r.flight && r.nextAt <= now && r.roomid !== self)
        .sort((a, b) => a.nextAt - b.nextAt);
      for (let i = 0; i < due.length && n < RADAR_CONC; i++) {
        /* 令牌用完说明本次节拍的额度已打满，剩下的留到下一拍 */
        if (!radarTokenTake()) break;
        radarScan(due[i]);
        n++;
      }
    }
    if (now - radarOnlineAt > LIVE_ONLINE_MS) radarRefreshOnline();
    paintRadarStat();
  }

  function radarSelName(sel) {
    const g = radarGroupOf(sel);
    if (g) return g.name;
    const a = (radarAreas || RADAR_AREAS_FALLBACK).filter((x) => x.id === sel)[0];
    return a ? a.name : '';
  }

  function radarStatText() {
    const parts = [];
    const names = radarSels.map(radarSelName).filter(Boolean);
    if (names.length) parts.push(names.join('、'));
    if (radarLoading) parts.push('房间列表加载中…');
    else if (radarOn) parts.push('扫描 ' + radarRooms.length + ' 个直播间');
    else if (radarRooms.length) parts.push('已停止');
    else parts.push('未启动');
    if (radarMap.size) parts.push('命中 ' + radarMap.size);
    if (radarOn && radarFetchAt) parts.push(radarTime(radarFetchAt) + ' 更新');
    if (radarOn && radarFailMsg) parts.push(radarFailMsg);
    if (radarOn && radarDiag) parts.push(radarDiag);
    return parts.join(' · ');
  }

  function radarAreasHtml() {
    const area = (radarAreas || RADAR_AREAS_FALLBACK).map((a) =>
      '<span class="rd-btn rd-area' + (radarSels.indexOf(a.id) >= 0 ? ' on' : '') +
      '" data-area="' + a.id + '">' + esc(a.name) + '</span>').join('');
    /* 归属分组跟在分区之后，与分区共用同一组选中项 */
    const grp = RADAR_GROUPS.map((g) =>
      '<span class="rd-btn rd-grp' + (radarSels.indexOf(g.key) >= 0 ? ' on' : '') +
      '" data-grp="' + g.key + '">' + g.name + '</span>').join('');
    return area + grp;
  }

  function radarNumsHtml() {
    /* 只选分组时人数固定，档位无意义 */
    const onlyGrp = radarSels.length > 0 && radarSels.every((s) => !!radarGroupOf(s));
    const nums = onlyGrp ? '' : RADAR_NUMS.map((n) =>
      '<span class="rd-btn rd-num' + (n === radarNum ? ' on' : '') +
      '" data-num="' + n + '">前' + n + '</span>').join('');
    return nums + '<span class="rd-btn rd-run' + (radarOn ? ' on' : '') + '">' +
      (radarOn ? '停止' : '启动') + '</span>';
  }

  /* 跨房间只能显示条件文本，无法判断是否已满足；是否满足由直播间内的参与流程处理 */
  function radarCondText(row) {
    if (row.need === 2) return '需先加入粉丝团';
    if (row.need === 3) return '需先开通大航海';
    if (row.need === 1 || row.needFollow) return '需先关注主播';
    if (row.shared) return '需分享后参与';
    return '';
  }

  function radarRowHtml(row) {
    const anchor = row.uname || ('房间 ' + row.roomid);
    const title = [rpTypeName(row), row.sender].filter(Boolean).join(' · ');
    const awards = rpAwardText(row.awards, row.total);
    const total = !row.guard && !RP_NO_TOTAL[row.rpType] && row.total
      ? Math.round(row.total / GOLD_PER_BATTERY) : 0;
    const cond = radarCondText(row);
    const condHtml = cond ? '<span class="rp-cond">' + esc(cond) + '</span>' : '';
    /* 未结束显示进入，倒计时结束后只剩手动移除的 × */
    let tail;
    if (row.endTime && row.endTime <= nowSec()) {
      tail = '<span class="rp-x" data-lot="' + row.lotId + '" title="已结束，点击移除">×</span>';
    } else {
      /* 开奖时刻在直播间的用户才可中奖，雷达只负责发现，参与要在直播间内完成 */
      tail = '<a class="rp-go" href="https://live.bilibili.com/' + Number(row.roomid) +
        '" target="_blank" rel="noopener"' + (row.rtitle ? ' title="' + esc(row.rtitle) + '"' : '') +
        '>进入</a>';
    }
    return '<div class="rp-item"><div class="rp-row"><div class="rp-meta">' +
      '<span class="rp-top"><span class="rp-anchor">' + esc(anchor) + '</span>' +
      '<span class="rp-on" data-lot="' + row.lotId + '">' + esc(radarOnlineText(row)) + '</span></span>' +
      (title ? '<span class="rp-title">' + esc(title) + '</span>' : '') +
      (total > 0 ? '<span class="rp-total">总价值：' + total + '电池</span>' : '') +
      (awards ? '<span class="rp-award">' + esc(awards) + '</span>' : '') +
      '</div>' + condHtml +
      '<span class="rp-left" data-lot="' + row.lotId + '">' + rpLeftText(row) + '</span>' +
      tail + '</div></div>';
  }

  /* 已结束的红包由用户手动移除，避免长期占位 */
  function radarDrop(lotId) {
    if (!radarMap.delete(lotId)) return;
    renderRadarPanel();
  }

  function radarListHtml() {
    const rows = Array.from(radarMap.values()).sort((a, b) => a.endTime - b.endTime);
    if (!rows.length) return '<div class="dim">未检测到红包</div>';
    return rows.map(radarRowHtml).join('');
  }

  function paintRadarLefts() {
    const q = document.getElementById(RADAR_ID);
    if (!q) return;
    q.querySelectorAll('.rp-left').forEach((el) => {
      const row = radarMap.get(Number(el.getAttribute('data-lot')));
      if (!row) return;
      const t = rpLeftText(row);
      if (el.textContent !== t) el.textContent = t;
    });
  }

  function radarOnlineText(row) {
    return '同接 ' + fmtOnline(row.online);
  }

  function paintRadarOnline(lotId) {
    const q = document.getElementById(RADAR_ID);
    const row = radarMap.get(lotId);
    const el = q && q.querySelector('.rp-on[data-lot="' + lotId + '"]');
    if (el && row) el.textContent = radarOnlineText(row);
  }

  /* 逐房间取真实在线人数，与所有直播间面板同一接口；串行请求以限制速率 */
  async function radarRefreshOnline() {
    if (radarOnlineBusy || !radarMap.size) return;
    radarOnlineBusy = true;
    radarOnlineAt = Date.now();
    try {
      const rows = Array.from(radarMap.values());
      for (let i = 0; i < rows.length; i++) {
        const row = rows[i];
        if (!row.roomid || !row.uid || !radarMap.has(row.lotId)) continue;
        const n = await fetchOnlineNum(row.roomid, row.uid);
        if (n == null) continue;
        row.online = n;
        paintRadarOnline(row.lotId);
      }
    } catch (e) {
    } finally {
      radarOnlineBusy = false;
    }
  }

  function paintRadarStat() {
    const q = document.getElementById(RADAR_ID);
    const el = q && q.querySelector('.rd-stat');
    if (!el) return;
    const t = radarStatText();
    if (t === radarStatCache) return;
    radarStatCache = t;
    el.textContent = t;
  }

  /* 副面板定位为单向链：主面板 → 中奖名单 → 雷达 → 所有直播间 */
  function syncRadarBox() {
    const q = document.getElementById(RADAR_ID);
    const p = document.getElementById(PANEL_ID);
    if (!q || !p) return;
    const r = p.getBoundingClientRect();
    let right = r.right;
    const w = document.getElementById(RPWIN_ID);
    if (w) right = Math.max(right, w.getBoundingClientRect().right);
    const left = Math.round(right + 10);
    q.style.left = left + 'px';
    q.style.top = 'auto';
    q.style.bottom = '10px';
    const lim = Math.max(160, window.innerHeight - 20);
    if (panelSizes[RADAR_ID]) q.style.width = panelSizes[RADAR_ID].w + 'px';
    q.style.maxHeight = sizeMaxH(RADAR_ID, lim) + 'px';
    q.style.maxWidth = Math.max(300, window.innerWidth - left - 16) + 'px';
  }

  function renderRadarPanel() {
    let q = document.getElementById(RADAR_ID);
    if (!q) {
      q = document.createElement('div');
      q.id = RADAR_ID;
      q.addEventListener('click', (e) => {
        const t = e.target;
        if (!t || !t.classList) return;
        if (t.classList.contains('x')) closeRadarPanel();
        else if (t.classList.contains('rd-area')) toggleRadarSel(Number(t.getAttribute('data-area')));
        else if (t.classList.contains('rd-grp')) toggleRadarSel(t.getAttribute('data-grp'));
        else if (t.classList.contains('rd-num')) selectRadarNum(Number(t.getAttribute('data-num')));
        else if (t.classList.contains('rd-run')) radarToggleRun();
        else if (t.classList.contains('rp-x')) radarDrop(Number(t.getAttribute('data-lot')));
      });
      document.documentElement.appendChild(q);
    }
    radarStatCache = radarStatText();
    q.innerHTML = '<div class="hd">红包雷达' +
      (radarMap.size ? '<span class="dim"> ' + radarMap.size + ' 个红包</span>' : '') +
      '<span class="x" title="关闭">×</span></div>' +
      '<div class="rd-areas">' + radarAreasHtml() + '</div>' +
      '<div class="rd-nums">' + radarNumsHtml() + '</div>' +
      '<div class="rd-stat">' + esc(radarStatCache) + '</div>' +
      '<div class="rd-list">' + radarListHtml() + '</div>' + RESIZE_HTML;
    radarEndedMark = radarEndedCount();
    syncRadarBox();
    if (document.getElementById(LIVE_PANEL_ID)) syncLiveBox();
    toggleRadarBtn();
  }

  function radarBtnHtml() {
    return '<span class="rp-radar' + (document.getElementById(RADAR_ID) ? ' on' : '') +
      '" title="红包雷达">雷达</span>';
  }

  function toggleRadarBtn() {
    const p = document.getElementById(PANEL_ID);
    const btn = p && p.querySelector('.rp-radar');
    if (btn) btn.classList.toggle('on', !!document.getElementById(RADAR_ID));
  }

  /* 面板关闭即停止扫描，重新打开后处于未启动状态 */
  function closeRadarPanel() {
    radarEpoch++;
    radarEndedMark = -1;
    radarOn = false;
    radarFailMsg = '';
    radarFails = 0;
    radarErrFails = 0;
    stopRadarTimer();
    const q = document.getElementById(RADAR_ID);
    if (q) q.remove();
    toggleRadarBtn();
    syncLiveBox();
  }

  async function toggleRadarPanel() {
    if (document.getElementById(RADAR_ID)) {
      closeRadarPanel();
      return;
    }
    if (!document.getElementById(PANEL_ID)) return;
    radarEpoch++;
    const epoch = radarEpoch;
    radarStatCache = null;
    renderRadarPanel();
    /* 计时器只驱动界面刷新；扫描要等点「启动」 */
    startRadarTimer();
    if (!radarAreas) {
      const list = await fetchAreaList();
      if (epoch !== radarEpoch || !document.getElementById(RADAR_ID)) return;
      radarAreas = list || RADAR_AREAS_FALLBACK;
      /* 分区会增删，恢复出的旧 id 若已不存在就丢掉 */
      radarSels = radarSels.filter((s) => radarGroupOf(s) || radarAreas.some((a) => a.id === s));
      if (!radarSels.length) radarSels = [radarAreas[0].id];
      radarPrefSave();
      renderRadarPanel();
    }
  }

  let refreshing = false;

  /* 手动刷新：先按当天重建本地累计，再绕开缓存整体重拉服务端数据 */
  async function refreshPanel() {
    if (refreshing || !document.getElementById(PANEL_ID)) return;
    refreshing = true;
    const btn = document.querySelector('#' + PANEL_ID + ' .rf');
    if (btn) btn.classList.add('on');
    resetDaily();
    noCache = true;
    let ok = false;
    try {
      ok = await open();
    } finally {
      noCache = false;
      refreshing = false;
      const b = document.querySelector('#' + PANEL_ID + ' .rf');
      if (b) b.classList.remove('on');
    }
    /* open 失败时自己已经弹过原因，这里不再覆盖 */
    if (ok) toast('已刷新', true);
  }

  async function open() {
    try {
      const room = await resolveRoom();
      const meta = await getRoomMeta(room.roomId);
      const medal = await getMyMedal(room.uid);
      const t = await fetchTasks(room.uid);
      const [coins, guardActive] = await Promise.all([fetchCoins(), fetchGuardActive(room.uid)]);
      if (!rpRoom || rpRoom.uid !== room.uid) {
        rpFollow = null;
        rpFollowAt = 0;
      }
      rpRoom = { roomId: room.roomId, uid: room.uid };
      startCounters(guardActive, room.uid);
      startRpPoll();
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
      return true;
    } catch (e) {
      toast('打开失败：' + e.message, false);
      return false;
    }
  }

  /* ---------- 按钮注入 ---------- */

  function togglePanel() {
    const p = document.getElementById(PANEL_ID);
    if (p) {
      stopCounters();
      closeLivePanel();
      closeWinPanel();
      closeRadarPanel();
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
      syncRadarBox();
      syncLiveBox();
    }, 1000);
  }

  installWsHook();
  loadGifts();
  loadRp();
  radarPrefLoad();
  sizeLoad();
  loadUid();
  document.addEventListener('visibilitychange', onVisibilityChange);
  document.addEventListener('mousedown', onResizeDown, true);

  if (document.body) start();
  else document.addEventListener('DOMContentLoaded', start, { once: true });
})();
