// ==UserScript==
// @name         自动炼造助手
// @namespace    https://ling.muge.info/
// @version      1.2.12
// @description  自动炼造
// @author       耀
// @match        https://ling.muge.info/*
// @grant        none
// @run-at       document-end
// @downloadURL  https://gh-proxy.org/https://raw.githubusercontent.com/ming-a1/LingVerse-Script/main/ling-craft.js
// @updateURL    https://gh-proxy.org/https://raw.githubusercontent.com/ming-a1/LingVerse-Script/main/ling-craft.js
// ==/UserScript==

(function() {
    'use strict';

    // ==================== 主题系统 ====================
    function getSystemTheme() {
        return window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';
    }
    function applyTheme(theme) {
        document.documentElement.classList.remove('theme-dark', 'theme-light');
        document.documentElement.classList.add('theme-' + theme);
    }
    applyTheme(getSystemTheme());
    window.matchMedia('(prefers-color-scheme: dark)').addEventListener('change', e => {
        applyTheme(e.matches ? 'dark' : 'light');
    });

    const DEFAULT_DELAY = { alchemy: 5000, forge: 7000, talisman: 3000 };
    const MODE = { alchemy: '炼丹', forge: '炼器', talisman: '制符' };

    // ==================== 样式 ====================
    const STYLES = `
        html.theme-dark {
            --craft-float-bg: linear-gradient(135deg, #1a1a2e 0%, #16213e 100%);
            --craft-float-color: #ffd700;
            --craft-float-border: #c9a33a;
        }
        html.theme-light {
            --craft-float-bg: linear-gradient(135deg, #f9f9f8 0%, #eeedeb 100%);
            --craft-float-color: #b8463e;
            --craft-float-border: #b8463e;
        }

        html.theme-dark #auto-craft-panel {
            --craft-bg: linear-gradient(135deg, #1a1a2e 0%, #16213e 100%);
            --craft-text: #e8e0d0; --craft-text-secondary: #a8a090; --craft-text-muted: #6a6560;
            --craft-gold: #ffd700; --craft-border: rgba(201,153,58,0.25);
            --craft-accent: rgba(201,163,58,0.12); --craft-accent-hover: rgba(201,163,58,0.28);
            --craft-input-bg: rgba(0,0,0,0.3); --craft-danger: rgba(220,53,69,0.2);
            --craft-danger-hover: rgba(220,53,69,0.35); --craft-success: #8fcf8f;
            --craft-card-bg: rgba(255,255,255,0.03); --craft-log-bg: rgba(0,0,0,0.2);
            --craft-min-btn-bg: rgba(201,163,58,0.12);
            --craft-min-btn-color: #e8e0d0;
            --craft-buy-btn-bg: linear-gradient(135deg, rgba(76,175,80,0.2), rgba(76,175,80,0.08));
            --craft-buy-btn-border: rgba(76,175,80,0.5);
            --craft-buy-btn-color: #a5d6a7;
            --craft-buy-btn-hover-bg: linear-gradient(135deg, rgba(76,175,80,0.35), rgba(76,175,80,0.15));
            --craft-buy-btn-hover-shadow: 0 0 12px rgba(76,175,80,0.3);
        }
        html.theme-light #auto-craft-panel {
            --craft-bg: linear-gradient(135deg, #f9f9f8 0%, #eeedeb 100%);
            --craft-text: #1a1a1a; --craft-text-secondary: #5a5a5a; --craft-text-muted: #8a8a8a;
            --craft-gold: #b8463e; --craft-border: rgba(184,70,62,0.25);
            --craft-accent: rgba(184,70,62,0.1); --craft-accent-hover: rgba(184,70,62,0.2);
            --craft-input-bg: rgba(0,0,0,0.04); --craft-danger: rgba(200,50,50,0.12);
            --craft-danger-hover: rgba(200,50,50,0.2); --craft-success: #3a6a7a;
            --craft-card-bg: rgba(0,0,0,0.02); --craft-log-bg: rgba(0,0,0,0.03);
            --craft-min-btn-bg: rgba(184,70,62,0.1);
            --craft-min-btn-color: #1a1a1a;
            --craft-buy-btn-bg: linear-gradient(135deg, rgba(76,175,80,0.12), rgba(76,175,80,0.04));
            --craft-buy-btn-border: rgba(76,175,80,0.4);
            --craft-buy-btn-color: #2e7d32;
            --craft-buy-btn-hover-bg: linear-gradient(135deg, rgba(76,175,80,0.2), rgba(76,175,80,0.08));
            --craft-buy-btn-hover-shadow: 0 0 12px rgba(76,175,80,0.2);
        }

        #auto-craft-panel {
            position: fixed; z-index: 99998;
            border: 2px solid var(--craft-gold); border-radius: 12px; width: 400px;
            font-family: "Microsoft YaHei", "微软雅黑", sans-serif;
            transition: none; overflow: hidden;
            box-shadow: 0 8px 32px rgba(0,0,0,0.5), 0 0 20px rgba(201,163,58,0.15);
            background: var(--craft-bg); color: var(--craft-text);
        }
        #auto-craft-panel.minimized { display: none !important; }
        #auto-craft-panel .panel-header {
            display: flex; align-items: center; justify-content: space-between;
            padding: 12px 14px 8px; cursor: move; user-select: none;
            background: transparent; border-bottom: 1px solid var(--craft-border);
        }
        #auto-craft-panel .panel-header .panel-title {
            font-size: 16px; font-weight: bold; color: var(--craft-gold);
            letter-spacing: 2px; pointer-events: none;
            background: transparent; padding: 0; margin: 0; border: none; display: inline;
        }
        #auto-craft-panel .panel-header .header-btns { display: flex; gap: 6px; }
        #auto-craft-panel .panel-header .header-btns button {
            width: 28px; height: 28px;
            border: 1px solid var(--craft-border);
            border-radius: 6px;
            background: var(--craft-min-btn-bg);
            color: var(--craft-min-btn-color);
            cursor: pointer; font-size: 16px; display: flex; align-items: center;
            justify-content: center; padding: 0; min-width: auto; line-height: 1;
            transition: all 0.2s;
        }
        #auto-craft-panel .panel-header .header-btns button:hover {
            background: var(--craft-accent-hover); border-color: var(--craft-gold); color: var(--craft-gold);
        }
        #auto-craft-panel .panel-body { padding: 6px 14px 14px; max-height: 65vh; overflow-y: auto; }
        #auto-craft-panel .section-title { font-size: 12px; color: var(--craft-gold); margin: 8px 0 4px; letter-spacing: 1px; font-weight: bold; }
        #auto-craft-panel .btn-row { display: flex; gap: 8px; margin-bottom: 8px; flex-wrap: wrap; }
        #auto-craft-panel .btn-row button {
            flex: 1; min-width: 70px; padding: 8px 10px;
            border: 1px solid var(--craft-gold); border-radius: 8px;
            background: var(--craft-accent); color: var(--craft-text);
            cursor: pointer; font-size: 13px; font-family: inherit; transition: all 0.2s; white-space: nowrap;
        }
        #auto-craft-panel .btn-row button:hover { background: var(--craft-accent-hover); }
        #auto-craft-panel .btn-row button.active {
            background: rgba(201,163,58,0.35); border-color: var(--craft-gold);
            color: var(--craft-gold); font-weight: bold;
        }
        #auto-craft-panel .btn-row button.stop-btn { background: var(--craft-danger); border-color: #dc3545; color: #ff6b6b; }
        #auto-craft-panel .btn-row button.stop-btn:hover { background: var(--craft-danger-hover); }
        #auto-craft-panel .btn-row button:disabled { opacity: 0.4; cursor: not-allowed; }
        
        #auto-craft-panel .buy-btn {
            padding: 6px 12px;
            border: 1px solid var(--craft-buy-btn-border);
            border-radius: 6px;
            background: var(--craft-buy-btn-bg);
            color: var(--craft-buy-btn-color);
            cursor: pointer;
            font-size: 11px;
            font-family: inherit;
            font-weight: bold;
            letter-spacing: 1px;
            white-space: nowrap;
            flex-shrink: 0;
            transition: all 0.25s ease;
        }
        #auto-craft-panel .buy-btn:hover {
            background: var(--craft-buy-btn-hover-bg);
            border-color: #4caf50;
            box-shadow: var(--craft-buy-btn-hover-shadow);
            transform: translateY(-1px);
        }
        #auto-craft-panel .buy-btn.loading { pointer-events: none; opacity: 0.7; }
        
        #auto-craft-panel .input-group { display: flex; align-items: center; gap: 8px; margin-bottom: 6px; }
        #auto-craft-panel .input-group label { font-size: 11px; color: var(--craft-gold); min-width: 60px; }
        #auto-craft-panel .input-group input[type="number"] {
            flex: 1; padding: 5px 6px; border: 1px solid var(--craft-border);
            border-radius: 4px; background: var(--craft-input-bg); color: var(--craft-text);
            font-size: 12px; text-align: center; min-width: 0;
        }
        #auto-craft-panel .input-group input[type="checkbox"] { width: 16px; height: 16px; cursor: pointer; margin-left: 8px; }
        #auto-craft-panel .status-text { font-size: 11px; color: var(--craft-success); text-align: center; margin-top: 6px; min-height: 14px; }
        #auto-craft-panel .progress-bar { width: 100%; height: 4px; background: rgba(255,255,255,0.1); border-radius: 2px; margin-top: 6px; overflow: hidden; }
        #auto-craft-panel .progress-fill { height: 100%; background: linear-gradient(90deg, #c9a33a, #ffd700); border-radius: 2px; transition: width 0.3s; width: 0%; }
        #auto-craft-panel .recipe-list { max-height: 200px; overflow-y: auto; margin: 4px 0; border: 1px solid var(--craft-border); border-radius: 6px; }
        #auto-craft-panel .recipe-item {
            padding: 8px 10px; cursor: pointer; border-bottom: 1px solid var(--craft-border);
            transition: background 0.15s; font-size: 12px; background: var(--craft-card-bg);
            display: flex; justify-content: space-between; align-items: center; gap: 8px;
        }
        #auto-craft-panel .recipe-item:hover { background: var(--craft-accent); }
        #auto-craft-panel .recipe-item.selected { background: var(--craft-accent-hover); border-left: 3px solid var(--craft-gold); }
        #auto-craft-panel .recipe-item .recipe-info { flex: 1; min-width: 0; }
        #auto-craft-panel .recipe-item .recipe-name { font-weight: bold; }
        #auto-craft-panel .recipe-item .recipe-mats { font-size: 10px; color: var(--craft-text-secondary); margin-top: 2px; }
        #auto-craft-panel .mat-ok { color: var(--craft-success); }
        #auto-craft-panel .mat-lack { color: #ff6b6b; }
        #auto-craft-panel .mat-warn { color: #ff9800; font-size: 10px; }
        #auto-craft-panel .no-recipe { text-align: center; padding: 12px; color: var(--craft-text-muted); font-size: 12px; }
        #auto-craft-panel .craft-log {
            max-height: 220px; overflow-y: auto; margin: 6px 0;
            border: 1px solid var(--craft-border); border-radius: 6px;
            padding: 8px 10px; font-size: 11px; line-height: 1.6;
            background: var(--craft-log-bg);
        }
        #auto-craft-panel .craft-log .log-line {
            padding: 3px 0; border-bottom: 1px solid rgba(255,255,255,0.04); display: flex; gap: 6px;
        }
        #auto-craft-panel .craft-log .log-line:last-child { border-bottom: none; }
        #auto-craft-panel .craft-log .log-empty { text-align: center; color: var(--craft-text-muted); padding: 20px; font-size: 12px; }
        #auto-craft-panel .craft-log .log-time { color: var(--craft-text-muted); font-size: 10px; white-space: nowrap; flex-shrink: 0; min-width: 52px; }
        #auto-craft-panel .craft-log .log-msg { flex: 1; }
        #auto-craft-panel .craft-log .log-craft { color: var(--craft-success); }
        #auto-craft-panel .craft-log .log-error { color: #ff6b6b; }
        #auto-craft-panel .craft-log .log-info { color: var(--craft-text-secondary); }
        #auto-craft-panel .craft-log .log-summary { color: var(--craft-gold); font-weight: bold; }
        #auto-craft-panel .log-clear-btn {
            font-size: 10px; padding: 2px 8px; border: 1px solid var(--craft-border);
            border-radius: 4px; background: var(--craft-accent); color: var(--craft-text-secondary);
            cursor: pointer; margin-left: 8px;
        }
        #auto-craft-float-btn {
            position: fixed; z-index: 99999; width: 44px; height: 44px;
            border: 2px solid var(--craft-float-border); border-radius: 10px;
            background: var(--craft-float-bg);
            color: var(--craft-float-color); cursor: pointer; font-size: 20px;
            display: flex; align-items: center; justify-content: center;
            box-shadow: 0 4px 16px rgba(0,0,0,0.25), 0 0 12px rgba(201,163,58,0.12);
            user-select: none;
            transition: transform .2s;
        }
        #auto-craft-float-btn:hover { transform: scale(1.1); }
        #auto-craft-float-btn.lv-mini-dragging { transition: none; opacity: .9; transform: none; }
        @keyframes auto-toast-in { from { opacity: 0; transform: translateY(-10px); } to { opacity: 1; transform: translateY(0); } }
        @keyframes auto-toast-out { from { opacity: 1; transform: translateY(0); } to { opacity: 0; transform: translateY(-10px); } }
        @keyframes buyPulse { 0%,100% { box-shadow: 0 0 0 0 rgba(76,175,80,0.4); } 50% { box-shadow: 0 0 0 6px rgba(76,175,80,0); } }
        #auto-craft-panel .buy-btn.buy-success { animation: buyPulse .6s ease; background: rgba(76,175,80,0.3); border-color: #4caf50; }
        @media (max-width: 768px) {
            #auto-craft-panel { width: calc(100vw - 20px); left: 10px !important; right: 10px !important; top: auto !important; bottom: 10px !important; }
            #auto-craft-float-btn { width: 48px; height: 48px; font-size: 22px; }
        }
    `;

    if (typeof GM_addStyle === 'function') GM_addStyle(STYLES);
    else { const s = document.createElement('style'); s.textContent = STYLES; document.head.appendChild(s); }

    // ==================== MD5签名工具 ====================
    var _md5 = (function () {
        function safeAdd(x,y){var l=(x&0xFFFF)+(y&0xFFFF);return(((x>>16)+(y>>16)+(l>>16))<<16)|(l&0xFFFF);}
        function bitRotateLeft(n,c){return(n<<c)|(n>>>(32-c));}
        function md5cmn(q,a,b,x,s,t){return safeAdd(bitRotateLeft(safeAdd(safeAdd(a,q),safeAdd(x,t)),s),b);}
        function md5ff(a,b,c,d,x,s,t){return md5cmn((b&c)|(~b&d),a,b,x,s,t);}
        function md5gg(a,b,c,d,x,s,t){return md5cmn((b&d)|(c&~d),a,b,x,s,t);}
        function md5hh(a,b,c,d,x,s,t){return md5cmn(b^c^d,a,b,x,s,t);}
        function md5ii(a,b,c,d,x,s,t){return md5cmn(c^(b|~d),a,b,x,s,t);}
        function binlMD5(x,len){x[len>>5]|=0x80<<(len%32);x[((len+64)>>>9<<4)+14]=len;var a=1732584193,b=-271733879,c=-1732584194,d=271733878;for(var i=0;i<x.length;i+=16){var oa=a,ob=b,oc=c,od=d;a=md5ff(a,b,c,d,x[i],7,-680876936);d=md5ff(d,a,b,c,x[i+1],12,-389564586);c=md5ff(c,d,a,b,x[i+2],17,606105819);b=md5ff(b,c,d,a,x[i+3],22,-1044525330);a=md5ff(a,b,c,d,x[i+4],7,-176418897);d=md5ff(d,a,b,c,x[i+5],12,1200080426);c=md5ff(c,d,a,b,x[i+6],17,-1473231341);b=md5ff(b,c,d,a,x[i+7],22,-45705983);a=md5ff(a,b,c,d,x[i+8],7,1770035416);d=md5ff(d,a,b,c,x[i+9],12,-1958414417);c=md5ff(c,d,a,b,x[i+10],17,-42063);b=md5ff(b,c,d,a,x[i+11],22,-1990404162);a=md5ff(a,b,c,d,x[i+12],7,1804603682);d=md5ff(d,a,b,c,x[i+13],12,-40341101);c=md5ff(c,d,a,b,x[i+14],17,-1502002290);b=md5ff(b,c,d,a,x[i+15],22,1236535329);a=md5gg(a,b,c,d,x[i+1],5,-165796510);d=md5gg(d,a,b,c,x[i+6],9,-1069501632);c=md5gg(c,d,a,b,x[i+11],14,643717713);b=md5gg(b,c,d,a,x[i],20,-373897302);a=md5gg(a,b,c,d,x[i+5],5,-701558691);d=md5gg(d,a,b,c,x[i+10],9,38016083);c=md5gg(c,d,a,b,x[i+15],14,-660478335);b=md5gg(b,c,d,a,x[i+4],20,-405537848);a=md5gg(a,b,c,d,x[i+9],5,568446438);d=md5gg(d,a,b,c,x[i+14],9,-1019803690);c=md5gg(c,d,a,b,x[i+3],14,-187363961);b=md5gg(b,c,d,a,x[i+8],20,1163531501);a=md5gg(a,b,c,d,x[i+13],5,-1444681467);d=md5gg(d,a,b,c,x[i+2],9,-51403784);c=md5gg(c,d,a,b,x[i+7],14,1735328473);b=md5gg(b,c,d,a,x[i+12],20,-1926607734);a=md5hh(a,b,c,d,x[i+5],4,-378558);d=md5hh(d,a,b,c,x[i+8],11,-2022574463);c=md5hh(c,d,a,b,x[i+11],16,1839030562);b=md5hh(b,c,d,a,x[i+14],23,-35309556);a=md5hh(a,b,c,d,x[i+1],4,-1530992060);d=md5hh(d,a,b,c,x[i+4],11,1272893353);c=md5hh(c,d,a,b,x[i+7],16,-155497632);b=md5hh(b,c,d,a,x[i+10],23,-1094730640);a=md5hh(a,b,c,d,x[i+13],4,681279174);d=md5hh(d,a,b,c,x[i],11,-358537222);c=md5hh(c,d,a,b,x[i+3],16,-722521979);b=md5hh(b,c,d,a,x[i+6],23,76029189);a=md5hh(a,b,c,d,x[i+9],4,-640364487);d=md5hh(d,a,b,c,x[i+12],11,-421815835);c=md5hh(c,d,a,b,x[i+15],16,530742520);b=md5hh(b,c,d,a,x[i+2],23,-995338651);a=md5ii(a,b,c,d,x[i],6,-198630844);d=md5ii(d,a,b,c,x[i+7],10,1126891415);c=md5ii(c,d,a,b,x[i+14],15,-1416354905);b=md5ii(b,c,d,a,x[i+5],21,-57434055);a=md5ii(a,b,c,d,x[i+12],6,1700485571);d=md5ii(d,a,b,c,x[i+3],10,-1894986606);c=md5ii(c,d,a,b,x[i+10],15,-1051523);b=md5ii(b,c,d,a,x[i+1],21,-2054922799);a=md5ii(a,b,c,d,x[i+8],6,1873313359);d=md5ii(d,a,b,c,x[i+15],10,-30611744);c=md5ii(c,d,a,b,x[i+6],15,-1560198380);b=md5ii(b,c,d,a,x[i+13],21,1309151649);a=md5ii(a,b,c,d,x[i+4],6,-145523070);d=md5ii(d,a,b,c,x[i+11],10,-1120210379);c=md5ii(c,d,a,b,x[i+2],15,718787259);b=md5ii(b,c,d,a,x[i+9],21,-343485551);a=safeAdd(a,oa);b=safeAdd(b,ob);c=safeAdd(c,oc);d=safeAdd(d,od);}return[a,b,c,d];}
        function str2binl(s){var o=[];for(var i=0;i<s.length*8;i+=8)o[i>>5]|=(s.charCodeAt(i/8)&0xFF)<<(i%32);return o;}
        function binl2hex(b){var h='0123456789abcdef',s='';for(var i=0;i<b.length*4;i++)s+=h.charAt((b[i>>2]>>((i%4)*8+4))&0xF)+h.charAt((b[i>>2]>>((i%4)*8))&0xF);return s;}
        return function(s){return binl2hex(binlMD5(str2binl(unescape(encodeURIComponent(s))),s.length*8));};
    })();

    // ==================== 签名工具 ====================
    function getSalt() { if (window.__S) return window.__S; const saved = localStorage.getItem('ac_salt'); return saved || ''; }
    function saveSalt(salt) { if (salt) { localStorage.setItem('ac_salt', salt); window.__S = salt; } }
    function generateSign(path, bodyStr, ts) { return _md5(path + ':' + ts + ':' + _md5(bodyStr) + ':' + getSalt()); }

    // ==================== 独立API层（带签名）====================
    function getToken() { return localStorage.getItem('token'); }

    async function apiRequest(method, path, body) {
        const token = getToken(); if (!token) throw new Error('未登录');
        const headers = { 'Authorization': 'Bearer ' + token, 'Content-Type': 'application/json' };
        const ts = Math.floor(Date.now() / 1000).toString();
        const bodyStr = (body && method !== 'GET') ? JSON.stringify(body) : '';
        headers['X-Sign'] = generateSign(path, bodyStr, ts); headers['X-Ts'] = ts;
        const options = { method, headers }; if (body && method !== 'GET') options.body = bodyStr;
        const resp = await fetch(path, options);
        const newSalt = resp.headers.get('X-Salt'); if (newSalt) saveSalt(newSalt);
        const renewedToken = resp.headers.get('X-New-Token'); if (renewedToken) localStorage.setItem('token', renewedToken);
        if (resp.status === 403 && newSalt) return apiRequest(method, path, body);
        if (resp.status === 401) { localStorage.removeItem('token'); window.location.href = '/'; throw new Error('登录过期'); }
        return resp.json();
    }
    async function apiGet(path) { return apiRequest('GET', path); }
    async function apiPost(path, body) { return apiRequest('POST', path, body); }

    async function craftApiPost(path, body) {
        const result = await apiPost(path, body);
        const apis = ['/api/game/alchemy/batch-craft','/api/game/forge/batch-craft','/api/game/talisman/batch-craft','/api/game/alchemy/craft','/api/game/forge/craft','/api/game/talisman/craft'];
        if (apis.includes(path) && result) {
            if (result.code === 200 && result.data?.message) addLog(result.data.message, /失败\s*[1-9]/.test(result.data.message) ? 'error' : 'craft');
            else if (result.code !== 200) addLog(`${MODE[currentTask]||''}失败: ${result.message||'未知错误'}`, 'error');
        }
        if (path === '/api/game/craft/quick-buy-mats' && result?.code === 200) addLog(`材料补充成功 ×${body?.amount||10}`, 'info');
        return result;
    }

    // ==================== 存储 ====================
    function getStored(key, def) { try { const v = localStorage.getItem('ac_' + key); return v !== null ? JSON.parse(v) : def; } catch (e) { return def; } }
    function setStored(key, val) { try { localStorage.setItem('ac_' + key, JSON.stringify(val)); } catch (e) {} }
    function loadPanelPos() { const p = getStored('panelPos', null); if (p && p.left >= 0 && p.top >= 0 && p.left < window.innerWidth - 100) return p; return { left: window.innerWidth - 420, top: 100 }; }
    function savePanelPos(l, t) { setStored('panelPos', { left: l, top: t }); }
    function loadFloatPos() { const p = getStored('floatPos', { right: 20, bottom: 80 }); if (typeof p.right === 'number' && typeof p.bottom === 'number') return p; return { right: 20, bottom: 80 }; }
    function saveFloatPos(r, b) { setStored('floatPos', { right: r, bottom: b }); }
    function loadMinimized() { return !!getStored('minimized', false); }
    function saveMinimized(v) { setStored('minimized', v); }
    function loadLastMode() { return getStored('lastMode', 'alchemy'); }
    function saveLastMode(m) { setStored('lastMode', m); }
    function loadLastRecipeIdx() { return getStored('lastRecipeIdx', -1); }
    function saveLastRecipeIdx(i) { setStored('lastRecipeIdx', i); }
    function loadRunningState() { return !!getStored('isRunning', false); }
    function saveRunningState(v) { setStored('isRunning', v); }

    // ==================== 全局状态 ====================
    let currentTask = loadLastMode(), currentRecipe = null, selectedRecipeIdx = loadLastRecipeIdx(), recipeList = [], isRunning = loadRunningState(), stopRequested = false;
    let savedLogs = getStored('savedLogs', []), savedProgress = getStored('savedProgress', { current: 0, total: 0, status: '就绪 - 请选择配方' }), savedCfg = getStored('savedCfg', { batch: 50, loops: 50, delay: DEFAULT_DELAY[currentTask], buy: false });
    const MAX_LOGS = 300;

    // ==================== 日志 ====================
    function addLog(msg, type) {
        const t = new Date(); const ts = ('0'+t.getHours()).slice(-2)+':'+('0'+t.getMinutes()).slice(-2)+':'+('0'+t.getSeconds()).slice(-2);
        savedLogs.push({ ts, msg, type: type||'info' }); if (savedLogs.length > MAX_LOGS) savedLogs.shift();
        setStored('savedLogs', savedLogs); refreshLog();
    }
    function refreshLog() { const el = document.getElementById('craft-log-content'); if (!el) return; if (savedLogs.length === 0) { el.innerHTML = '<div class="log-empty">暂无日志</div>'; return; } el.innerHTML = savedLogs.map(l => { let cls = 'log-info'; if (l.type === 'error') cls = 'log-error'; else if (l.type === 'craft') cls = 'log-craft'; else if (l.type === 'summary') cls = 'log-summary'; return `<div class="log-line"><span class="log-time">${l.ts}</span><span class="log-msg ${cls}">${esc(l.msg)}</span></div>`; }).join(''); el.scrollTop = el.scrollHeight; }
    function clearLog() { savedLogs = []; setStored('savedLogs', []); refreshLog(); }
    function saveProgress(c, t, s) { savedProgress = { current: c, total: t, status: s }; setStored('savedProgress', savedProgress); }
    function saveSettings() { const bs = document.getElementById('bs'), lc = document.getElementById('lc'), dl = document.getElementById('dl'), ab = document.getElementById('ab'); if (bs && lc && dl && ab) { savedCfg = { batch: +bs.value||50, loops: +lc.value||50, delay: +dl.value||DEFAULT_DELAY[currentTask], buy: ab.checked }; setStored('savedCfg', savedCfg); } }

    // ==================== 拖拽 ====================
    function makeDraggable(el, handle, onEnd) {
        let sx, sy, ix, iy, dragging = false; const h = handle || el;
        function md(e) { if (e.button !== undefined && e.button !== 0) return; if (['BUTTON','INPUT','SELECT','TEXTAREA'].includes(e.target.tagName)) return; dragging = true; const p = e.touches ? e.touches[0] : e; sx = p.clientX; sy = p.clientY; const r = el.getBoundingClientRect(); ix = r.left; iy = r.top; el.style.transition = 'none'; document.addEventListener('mousemove', mm); document.addEventListener('mouseup', mu); document.addEventListener('touchmove', mm, { passive: false }); document.addEventListener('touchend', mu); e.preventDefault(); }
        function mm(e) { if (!dragging) return; e.preventDefault(); const p = e.touches ? e.touches[0] : e; let l = ix + p.clientX - sx, t = iy + p.clientY - sy; l = Math.max(0, Math.min(l, window.innerWidth - el.offsetWidth)); t = Math.max(0, Math.min(t, window.innerHeight - el.offsetHeight)); el.style.left = l + 'px'; el.style.top = t + 'px'; el.style.right = 'auto'; el.style.bottom = 'auto'; }
        function mu() { if (!dragging) return; dragging = false; document.removeEventListener('mousemove', mm); document.removeEventListener('mouseup', mu); document.removeEventListener('touchmove', mm); document.removeEventListener('touchend', mu); if (onEnd) { const r = el.getBoundingClientRect(); onEnd(r.left, r.top); } }
        h.addEventListener('mousedown', md); h.addEventListener('touchstart', md, { passive: true });
    }

    // ==================== 悬浮按钮拖拽 ====================
    let fbDragging = false, fbMx, fbMy, fbMr, fbMb;
    function floatStart(e) {
        if (e.button !== undefined && e.button !== 0) return;
        fbDragging = true;
        const btn = document.getElementById('auto-craft-float-btn');
        if (!btn) return;
        btn.classList.add('lv-mini-dragging');
        const r = btn.getBoundingClientRect();
        fbMx = (e.touches ? e.touches[0].clientX : e.clientX);
        fbMy = (e.touches ? e.touches[0].clientY : e.clientY);
        fbMr = window.innerWidth - r.right;
        fbMb = window.innerHeight - r.bottom;
        e.preventDefault();
    }
    function floatMove(e) {
        if (!fbDragging) return;
        const btn = document.getElementById('auto-craft-float-btn');
        if (!btn) return;
        const cx = (e.touches ? e.touches[0].clientX : e.clientX);
        const cy = (e.touches ? e.touches[0].clientY : e.clientY);
        const s = 44;
        let nr = fbMr - (cx - fbMx);
        let nb = fbMb - (cy - fbMy);
        nr = Math.max(3, Math.min(window.innerWidth - s - 3, nr));
        nb = Math.max(3, Math.min(window.innerHeight - s - 6, nb));
        btn.style.right = nr + 'px'; btn.style.bottom = nb + 'px';
        btn.style.left = 'auto'; btn.style.top = 'auto';
    }
    function floatEnd(e) {
        if (!fbDragging) return;
        fbDragging = false;
        const btn = document.getElementById('auto-craft-float-btn');
        if (!btn) return;
        btn.classList.remove('lv-mini-dragging');
        const cx = (e.changedTouches ? e.changedTouches[0].clientX : e.clientX);
        const cy = (e.changedTouches ? e.changedTouches[0].clientY : e.clientY);
        const r = btn.getBoundingClientRect();
        saveFloatPos(window.innerWidth - r.right, window.innerHeight - r.bottom);
        if (Math.abs(cx - fbMx) < 5 && Math.abs(cy - fbMy) < 5) restorePanel();
    }
    document.addEventListener('mousemove', floatMove);
    document.addEventListener('touchmove', floatMove, { passive: false });
    document.addEventListener('mouseup', floatEnd);
    document.addEventListener('touchend', floatEnd);

    // ==================== UI ====================
    function createFloatBtn() {
        document.getElementById('auto-craft-float-btn')?.remove();
        const p = loadFloatPos();
        const b = document.createElement('div');
        b.id = 'auto-craft-float-btn'; b.innerHTML = '⚒️'; b.title = '自动炼造助手';
        b.style.right = p.right + 'px'; b.style.bottom = p.bottom + 'px';
        b.addEventListener('mousedown', floatStart);
        b.addEventListener('touchstart', floatStart, { passive: false });
        document.body.appendChild(b);
    }
    function minimize() { saveMinimized(true); saveRunningState(isRunning); saveLastRecipeIdx(selectedRecipeIdx); document.getElementById('auto-craft-panel')?.remove(); createFloatBtn(); }
    function restorePanel() { saveMinimized(false); isRunning = loadRunningState(); document.getElementById('auto-craft-float-btn')?.remove(); createPanel(); }

    function createPanel() {
        document.getElementById('auto-craft-panel')?.remove();
        isRunning = loadRunningState();
        const p = document.createElement('div'); p.id = 'auto-craft-panel';
        const pos = loadPanelPos();
        p.style.left = pos.left + 'px'; p.style.top = pos.top + 'px'; p.style.right = 'auto'; p.style.bottom = 'auto';
        const cfg = savedCfg; const pp = savedProgress.total > 0 ? (savedProgress.current / savedProgress.total * 100) : 0;
        p.innerHTML = `<div class="panel-header" id="drag-handle"><span class="panel-title">⚒️ 自动炼造</span><div class="header-btns"><button id="min-btn" title="最小化">─</button></div></div><div class="panel-body"><div class="section-title">▼ 炼制模式</div><div class="btn-row" id="mode-btns"><button data-mode="alchemy">炼丹</button><button data-mode="forge">炼器</button><button data-mode="talisman">制符</button></div><div class="section-title">▼ 选择配方</div><div class="recipe-list" id="recipe-list"><div class="no-recipe">加载中...</div></div><div class="section-title">▼ 炼制日志 <button class="log-clear-btn" id="clear-log">清空</button></div><div class="craft-log" id="craft-log-content"><div class="log-empty">暂无日志</div></div><div class="section-title">▼ 炼制设置</div><div class="input-group"><label>每次数量</label><input type="number" id="bs" value="${cfg.batch}" min="1" max="50"></div><div class="input-group"><label>循环次数</label><input type="number" id="lc" value="${cfg.loops}" min="1" max="999"></div><div class="input-group"><label>间隔(ms)</label><input type="number" id="dl" value="${cfg.delay||DEFAULT_DELAY[currentTask]}" min="100" max="30000" step="100"></div><div class="input-group"><label>自动补材料</label><input type="checkbox" id="ab" ${cfg.buy?'checked':''}></div><div class="btn-row"><button id="start-btn" style="flex:2;${isRunning?'display:none;':''}">开始炼制</button><button id="stop-btn" class="stop-btn" style="flex:1;${isRunning?'':'display:none;'}">停止</button></div><div class="progress-bar"><div class="progress-fill" id="prog" style="width:${pp}%"></div></div><div class="status-text" id="status">${savedProgress.status}</div></div>`;
        document.body.appendChild(p);
        makeDraggable(p, document.getElementById('drag-handle'), savePanelPos); refreshLog();
        document.querySelectorAll('#mode-btns button').forEach(b => { b.classList.remove('active'); if (b.dataset.mode === currentTask) b.classList.add('active'); });
        document.querySelectorAll('#mode-btns button').forEach(b => b.addEventListener('click', function() { if (isRunning) return; document.querySelectorAll('#mode-btns button').forEach(x => x.classList.remove('active')); this.classList.add('active'); currentTask = this.dataset.mode; saveLastMode(currentTask); document.getElementById('dl').value = DEFAULT_DELAY[currentTask]; saveSettings(); loadRecipes(currentTask); }));
        document.getElementById('min-btn').addEventListener('click', () => { saveSettings(); saveProgress(isRunning?Math.max(0,savedProgress.current):0, isRunning?savedProgress.total:0, document.getElementById('status')?.textContent||''); minimize(); });
        document.getElementById('clear-log').addEventListener('click', clearLog); document.getElementById('start-btn').addEventListener('click', start); document.getElementById('stop-btn').addEventListener('click', () => { stopRequested = true; setStatus('停止中...'); });
        ['bs','lc','dl'].forEach(id => document.getElementById(id)?.addEventListener('change', saveSettings)); document.getElementById('ab')?.addEventListener('change', saveSettings);
        loadRecipes(currentTask);
    }

    // ==================== 配方加载 ====================
    async function loadRecipes(mode) {
        currentRecipe = null; const el = document.getElementById('recipe-list'); if (!el) return;
        el.innerHTML = '<div class="no-recipe">加载中...</div>'; const sb = document.getElementById('start-btn');
        if (sb && !isRunning) { sb.disabled = true; sb.textContent = '请先选择配方'; }
        if (!getToken()) { el.innerHTML = '<div class="no-recipe">请先登录</div>'; return; }
        try {
            const urls = { alchemy:'/api/game/alchemy/recipes', forge:'/api/game/forge/recipes', talisman:'/api/game/talisman/recipes' };
            const res = await apiGet(urls[mode]);
            if (res.code !== 200 || !res.data?.recipes) { el.innerHTML = '<div class="no-recipe">暂无配方</div>'; return; }
            recipeList = res.data.recipes.filter(r => r.recipeId || r.pillId);
            if (!recipeList.length) { el.innerHTML = '<div class="no-recipe">无可用配方</div>'; return; }
            el.innerHTML = recipeList.map((r, i) => {
                const name = r.pillName || r.name || '?', mats = (r.materials||[]).map(m => `<span class="${m.have>=m.need?'mat-ok':'mat-lack'}">${m.name} ${m.have}/${m.need}</span>`).join(' ');
                const craftable = (mode === 'forge' ? r.canForge : r.canCraft) === true, canBuy = r.canQuickBuy === true;
                const label = craftable ? '' : ' <span class="mat-warn">[材料不足]</span>';
                const buyBtn = (!craftable && canBuy) ? `<button class="buy-btn" data-recipe-id="${r.recipeId||r.pillId}" data-mode="${mode}">+ 补充</button>` : '';
                return `<div class="recipe-item" data-i="${i}"><div class="recipe-info"><div class="recipe-name">${esc(name)}${label}</div><div class="recipe-mats">${mats}</div></div>${buyBtn}</div>`;
            }).join('');
            el.querySelectorAll('.recipe-item').forEach(item => item.addEventListener('click', function(e) { if (e.target.classList.contains('buy-btn')) return; if (isRunning) return; el.querySelectorAll('.recipe-item').forEach(x => x.classList.remove('selected')); this.classList.add('selected'); selectedRecipeIdx = +this.dataset.i; saveLastRecipeIdx(selectedRecipeIdx); currentRecipe = recipeList[selectedRecipeIdx]; if (sb) { sb.disabled = false; sb.textContent = '开始炼制'; } setStatus(`已选择: ${currentRecipe.pillName||currentRecipe.name}`); }));
            el.querySelectorAll('.buy-btn').forEach(btn => btn.addEventListener('click', function(e) { e.stopPropagation(); manualBuyMats(this.dataset.mode, this.dataset.recipeId, this); }));
            const si = loadLastRecipeIdx(); if (si >= 0 && si < recipeList.length) { const pi = el.querySelector(`.recipe-item[data-i="${si}"]`); if (pi) { pi.classList.add('selected'); currentRecipe = recipeList[si]; selectedRecipeIdx = si; if (sb&&!isRunning) { sb.disabled=false; sb.textContent='开始炼制'; } } }
            setStatus(currentRecipe?`已选择: ${currentRecipe.pillName||currentRecipe.name}`:`找到 ${recipeList.length} 个配方`);
        } catch (e) { el.innerHTML = '<div class="no-recipe">加载失败: ' + esc(e.message) + '</div>'; }
    }

    // ==================== 补充材料 ====================
    async function manualBuyMats(mode, recipeId, btn) {
        if (typeof promptAsync === 'function' && typeof confirmAsync === 'function') {
            const amountStr = await promptAsync('请输入要补齐多少份材料：', '1'); if (!amountStr) return;
            const amount = parseInt(amountStr); if (isNaN(amount) || amount <= 0) { toast('数量无效'); return; }
            let costMsg = ''; try { const previewRes = await apiPost('/api/game/craft/quick-buy-mats', { type: mode, id: recipeId, amount: amount, preview: true }); const totalCost = previewRes?.data?.totalCost ?? previewRes?.totalCost ?? null; costMsg = totalCost !== null && totalCost !== undefined ? `预计总费用约 ${totalCost} 灵石（${amount}份），确认补充？` : `无法预估费用，确认补充 ${amount} 份材料？`; } catch (e) { costMsg = `无法预估费用，确认补充 ${amount} 份材料？`; }
            if (!await confirmAsync(costMsg)) return;
            btn.textContent = '补充中...'; btn.classList.add('loading'); btn.disabled = true;
            try { addLog('正在补充材料...', 'info'); const r = await apiPost('/api/game/craft/quick-buy-mats', { type: mode, id: recipeId, amount }); if (r.code === 200) { addLog(`材料补充成功 ×${amount}`, 'info'); btn.classList.add('buy-success'); btn.textContent = '✓ 已补充'; } else { addLog(`补充失败: ${r.message}`, 'error'); btn.textContent = '✗ 失败'; } } catch (e) { addLog(`补充异常: ${e.message}`, 'error'); btn.textContent = '✗ 异常'; }
            finally { setTimeout(() => { btn.classList.remove('buy-success', 'loading'); btn.disabled = false; btn.textContent = '+ 补充'; }, 1500); setTimeout(() => loadRecipes(currentTask), 800); }
        }
    }

    // ==================== 炼制 ====================
    function setStatus(m) { const e = document.getElementById('status'); if(e){e.textContent=m;saveProgress(savedProgress.current,savedProgress.total,m);} }
    function setProg(c,t) { const e = document.getElementById('prog'); if(e)e.style.width=t>0?`${c/t*100}%`:'0%'; saveProgress(c,t,document.getElementById('status')?.textContent||''); }
    const sleep = ms => new Promise(r => setTimeout(r, ms));
    function getCfg() { saveSettings(); return savedCfg; }
    async function start() {
        if (isRunning || !currentRecipe) return;
        const cfg = getCfg(); if (cfg.batch < 1 || cfg.batch > 50) { toast('每次1-50'); return; } if (cfg.loops < 1 || cfg.loops > 999) { toast('循环1-999'); return; }
        const name = currentRecipe.pillName||currentRecipe.name, mn = MODE[currentTask], total = cfg.batch*cfg.loops, est = Math.ceil(cfg.loops*cfg.delay/1000), ts = est>=60?`约 ${Math.floor(est/60)} 分 ${est%60} 秒`:`约 ${est} 秒`;
        if (!await confirm(`确认开始${mn}？\n\n配方: ${name}\n每次: ${cfg.batch}个\n循环: ${cfg.loops}次\n总计: ${total}个\n预计耗时: ${ts}`)) return;
        isRunning=true;stopRequested=false;saveRunningState(true);
        document.getElementById('start-btn').style.display='none'; document.getElementById('stop-btn').style.display='block';
        setProg(0,cfg.loops); addLog(`===== 开始${mn}: ${name} =====`,'summary'); addLog(`设置: 每次${cfg.batch}个 × ${cfg.loops}次，共计${total}个，预计${ts}`,'info');
        try { const rid = currentRecipe.recipeId || currentRecipe.pillId; let ok=0,fail=0; for(let i=1;i<=cfg.loops;i++) { if(stopRequested){addLog('用户手动停止','summary');break;} setStatus(`第 ${i}/${cfg.loops} 轮`);setProg(i,cfg.loops); try { const r = await batchCraft(currentTask,rid,cfg.batch); if(r.ok)ok++; else if(r.msg?.includes('材料不足')) { if(cfg.buy) { if(await confirm(`材料不足！\n\n是否自动补充 10 份材料？\n(取消将停止炼制)`)) { addLog('材料不足，自动补充中...','info'); if(await buyMats(currentTask,rid,10)){await sleep(500);const r2=await batchCraft(currentTask,rid,cfg.batch);if(r2.ok)ok++;else{fail++;addLog('补充后仍失败','error');}} else{fail++;addLog('材料补充失败','error');} }else{addLog('取消补充，停止炼制','summary');break;} }else{addLog('材料不足（自动补充未开启），停止炼制','error');break;} }else fail++; }catch(e){fail++;addLog(`异常: ${e.message}`,'error');} if(i<cfg.loops&&!stopRequested)await sleep(cfg.delay); } setStatus(`完成! 成功:${ok} 失败:${fail}`);setProg(cfg.loops,cfg.loops); addLog(`===== ${mn}完成 =====`,'summary'); addLog(`成功 ${ok} 轮，失败 ${fail} 轮`,ok>0?'craft':'error'); toast(`炼造完成！成功${ok}次，失败${fail}次`); }catch(e){setStatus('错误: '+e.message);addLog(`严重错误: ${e.message}`,'error');}
        finally { isRunning=false;saveRunningState(false); const sb=document.getElementById('start-btn');if(sb){sb.style.display='';sb.disabled=false;sb.textContent='开始炼制';} const stb=document.getElementById('stop-btn');if(stb)stb.style.display='none'; setProg(0,0);saveProgress(0,0,document.getElementById('status')?.textContent||''); }
    }
    async function batchCraft(mode, recipeId, cnt) { let path, body; if (mode === 'alchemy') { path = '/api/game/alchemy/batch-craft'; body = { pillId: recipeId, count: cnt }; } else { path = `/api/game/${mode}/batch-craft`; body = { recipeId: recipeId, count: cnt }; } const r = await craftApiPost(path, body); return r.code === 200 ? { ok: true } : { ok: false, msg: r.message || '失败' }; }
    async function buyMats(mode, recipeId, amount) { try { const r = await craftApiPost('/api/game/craft/quick-buy-mats', { type: mode, id: recipeId, amount: amount || 10 }); return r.code === 200; } catch (e) { return false; } }

    // ==================== 工具 ====================
    function esc(s) { return String(s||'').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;'); }
    function toast(m) { if (typeof showToast==='function') { showToast(m); return; } let c = document.getElementById('ac-toast'); if (!c) { c = document.createElement('div'); c.id = 'ac-toast'; c.style.cssText = 'position:fixed;top:20px;left:50%;transform:translateX(-50%);z-index:999999;pointer-events:none;'; document.body.appendChild(c); } const t = document.createElement('div'); t.style.cssText = 'background:rgba(0,0,0,.85);color:#ffd700;padding:10px 20px;border-radius:20px;margin-bottom:8px;font-size:14px;text-align:center;animation:auto-toast-in .3s,auto-toast-out .3s 2.5s forwards;border:1px solid #c9a33a;white-space:nowrap;'; t.textContent = m; c.appendChild(t); setTimeout(()=>t.remove(),2800); }
    function confirm(m) { return new Promise(res => { if (typeof gameConfirm==='function') { gameConfirm(m,()=>res(true),()=>res(false),false); return; } const o = document.createElement('div'); o.style.cssText = 'position:fixed;inset:0;z-index:999999;background:rgba(0,0,0,.7);display:flex;align-items:center;justify-content:center;'; o.innerHTML = `<div style="background:#1a1a2e;border:2px solid #c9a33a;border-radius:12px;padding:24px;max-width:90vw;width:400px;color:#e0d5b7;font-family:"Microsoft YaHei","微软雅黑",sans-serif;"><div style="white-space:pre-line;margin-bottom:16px;text-align:center;">${m}</div><div style="display:flex;gap:12px;"><button id="ac-yes" style="flex:1;padding:10px;background:rgba(201,163,58,.2);border:1px solid #c9a33a;border-radius:8px;color:#ffd700;cursor:pointer;">确认</button><button id="ac-no" style="flex:1;padding:10px;background:rgba(255,255,255,.05);border:1px solid #666;border-radius:8px;color:#aaa;cursor:pointer;">取消</button></div></div>`; document.body.appendChild(o); o.querySelector('#ac-yes').onclick = ()=>{o.remove();res(true);}; o.querySelector('#ac-no').onclick = ()=>{o.remove();res(false);}; o.addEventListener('click',e=>{if(e.target===o){o.remove();res(false);}}); }); }

    // ==================== 初始化 ====================
    function init() { savedLogs = getStored('savedLogs', []); savedProgress = getStored('savedProgress', { current:0, total:0, status:'就绪 - 请选择配方' }); savedCfg = getStored('savedCfg', { batch:50, loops:50, delay:DEFAULT_DELAY[currentTask], buy:false }); currentTask = loadLastMode(); selectedRecipeIdx = loadLastRecipeIdx(); isRunning = loadRunningState(); if (loadMinimized()) createFloatBtn(); else createPanel(); }
    if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init); else init();
})();