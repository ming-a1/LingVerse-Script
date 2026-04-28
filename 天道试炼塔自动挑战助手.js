// ==UserScript==
// @name         天道试炼塔自动挑战助手
// @namespace    https://viayoo.com/trial-tower-mobile
// @version      4.4.5
// @description  移动端自动挑战天道试炼塔，CSS命名空间隔离，使用服务器bestFloor
// @author       AutoTrial
// @match        https://ling.muge.info/*
// @match        http://ling.muge.info/*
// @grant        GM_getValue
// @grant        GM_setValue
// @grant        GM_addStyle
// @grant        GM_registerMenuCommand
// @run-at       document-end
// ==/UserScript==

(function() {
    'use strict';

    const currentHost = window.location.hostname;
    if (!['ling.muge.info', 'www.ling.muge.info'].includes(currentHost)) return;

    const h2cScript = document.createElement('script');
    h2cScript.src = 'https://html2canvas.hertzen.com/dist/html2canvas.min.js';
    document.head.appendChild(h2cScript);

    function waitForH2C() {
        return new Promise(r => {
            if (window.html2canvas) {
                r();
                return;
            }
            const i = setInterval(() => {
                if (window.html2canvas) {
                    clearInterval(i);
                    r();
                }
            }, 100);
        });
    }

    const S = {
        P: 'tt_',
        set(k, v) {
            try {
                (typeof GM_setValue !== 'undefined' ? GM_setValue : localStorage.setItem.bind(localStorage))(this.P + k, JSON.stringify(v));
            } catch (e) {}
        },
        get(k, d = null) {
            try {
                const r = (typeof GM_setValue !== 'undefined' ? GM_getValue : localStorage.getItem.bind(localStorage))(this.P + k);
                return r ? JSON.parse(r) : d;
            } catch (e) {
                return d;
            }
        }
    };

    // 默认设置：不启用自动重试，不启用灵石刷新
    const saved = S.get('settings', {
        strategy: 'balanced',
        autoRetry: false,
        targetFloor: 0,
        skipCombat: true,
        autoRefreshBuffs: false,
        btnPos: {
            b: 80,
            r: 12
        }
    });

    let running = false,
        curFloor = 0,
        highFloor = 0,
        currentRunMaxFloor = 0,  // 【修复】本次战斗实际最高层数
        totalFights = 0,
        totalDeaths = 0;
    let loggedIn = false,
        active = false,
        loginTimer = null;

    let buffCombo = [],
        bestHistory = [];
    let stats = {
        ab: 0,
        db: 0,
        hb: 0,
        mb: 0,
        cb: 0,
        lp: 0,
        tp: 0,
        dsc: 0,
        hlb: 0,
        stb: 0,
        im: false,
        ex: false,
        abx: false,
        ra: false,
        wr: false
    };

    function parseStats(d) {
        if (!d) return null;
        return {
            ab: d.atkBonus || 0,
            db: d.defBonus || 0,
            hb: d.hpBonus || 0,
            mb: d.mpBonus || 0,
            cb: d.critBonus || 0,
            lp: d.leechPercent || 0,
            tp: d.thornPercent || 0,
            dsc: d.doubleStrikeChance || 0,
            hlb: d.healBonus || 0,
            stb: d.skillTriggerBonus || 0,
            im: d.hasImmortal || false,
            ex: d.hasExecute || false,
            abx: d.hasAbsorb || false,
            ra: d.rootAmplify || false,
            wr: d.hasWrath || false
        };
    }

    function parseBuffs(active, bestStr) {
        const legKw = ['不死', '斩杀', '汲取', '灵根共鸣', '天道', '神', '天怒'];
        const rareKw = ['强化', '增幅', '进阶', '精通'];
        const getRarity = n => {
            for (const k of legKw)
                if (n.includes(k)) return '传说';
            for (const k of rareKw)
                if (n.includes(k)) return '稀有';
            return '普通';
        };
        if (active && Array.isArray(active) && active.length) {
            return active.map(b => typeof b === 'string' ? {
                name: b,
                rarity: getRarity(b)
            } : {
                name: b.name || b,
                rarity: b.rarity || '普通'
            });
        }
        if (bestStr && typeof bestStr === 'string' && bestStr !== '无') {
            return bestStr.split(' ').filter(n => n && n.trim()).map(n => ({
                name: n.trim(),
                rarity: getRarity(n)
            }));
        }
        return [];
    }

    async function refreshData() {
        if (!active && !loggedIn) return false;
        try {
            const r = await doApi('get', '/api/trial-tower/info');
            if (r?.code === 200 && r.data) {
                const d = r.data;
                if (d.activeFloor !== undefined) curFloor = d.activeFloor;
                if (d.bestFloor !== undefined && d.bestFloor > highFloor) {
                    highFloor = d.bestFloor;
                    S.set('high', highFloor);
                }
                if (d.bestBuffs && d.bestBuffs !== '无') {
                    bestHistory = parseBuffs(null, d.bestBuffs);
                    S.set('bh', bestHistory);
                }
                if (d.trialStats) {
                    stats = parseStats(d.trialStats);
                    updateStatsUI();
                }
                if (d.hasActiveTrial) {
                    if (d.activeBuffs && Array.isArray(d.activeBuffs)) {
                        buffCombo = parseBuffs(d.activeBuffs);
                        updateBuffUI();
                        S.set('lb', buffCombo);
                        S.set('ls', stats);
                    }
                } else {
                    if (bestHistory.length) {
                        buffCombo = bestHistory;
                        updateBuffUI();
                    } else if (d.bestBuffs && d.bestBuffs !== '无') {
                        const p = parseBuffs(null, d.bestBuffs);
                        if (p.length) {
                            buffCombo = bestHistory = p;
                            updateBuffUI();
                            S.set('bh', p);
                        }
                    } else {
                        const sv = S.get('lb', []);
                        if (sv.length) {
                            buffCombo = sv;
                            updateBuffUI();
                        } else {
                            buffCombo = [];
                            updateBuffUI();
                        }
                    }
                }
                return true;
            }
            return false;
        } catch (e) {
            const sv = S.get('lb', []),
                ss = S.get('ls', null);
            if (sv.length) {
                buffCombo = sv;
                updateBuffUI();
                if (ss) {
                    stats = ss;
                    updateStatsUI();
                }
            }
            return false;
        }
    }

    async function forceRefresh() {
        return await refreshData();
    }

    function updateStatsUI() {
        const el = document.getElementById('stats-display');
        if (!el) return;
        let h = '<div class="tt-stats-grid">';
        if (stats.ab > 0) h += `<div class="tt-stat-item"><span class="tt-stat-name">⚔️ 攻击</span><span class="tt-stat-value">+${Math.round(stats.ab)}%</span></div>`;
        if (stats.db > 0) h += `<div class="tt-stat-item"><span class="tt-stat-name">🛡️ 防御</span><span class="tt-stat-value">+${Math.round(stats.db)}%</span></div>`;
        if (stats.hb > 0) h += `<div class="tt-stat-item"><span class="tt-stat-name">❤️ 生命</span><span class="tt-stat-value">+${Math.round(stats.hb)}%</span></div>`;
        if (stats.mb > 0) h += `<div class="tt-stat-item"><span class="tt-stat-name">✨ 灵力</span><span class="tt-stat-value">+${Math.round(stats.mb)}%</span></div>`;
        if (stats.cb > 0) h += `<div class="tt-stat-item"><span class="tt-stat-name">💥 暴击</span><span class="tt-stat-value">+${Math.round(stats.cb)}%</span></div>`;
        if (stats.lp > 0) h += `<div class="tt-stat-item"><span class="tt-stat-name">🩸 吸血</span><span class="tt-stat-value">${Math.round(stats.lp)}%</span></div>`;
        if (stats.tp > 0) h += `<div class="tt-stat-item"><span class="tt-stat-name">⚡ 反伤</span><span class="tt-stat-value">${Math.round(stats.tp)}%</span></div>`;
        if (stats.dsc > 0) h += `<div class="tt-stat-item"><span class="tt-stat-name">🔁 连击</span><span class="tt-stat-value">${Math.round(stats.dsc)}%</span></div>`;
        if (stats.hlb > 0) h += `<div class="tt-stat-item"><span class="tt-stat-name">💚 回血</span><span class="tt-stat-value">+${Math.round(stats.hlb)}%</span></div>`;
        if (stats.stb > 0) h += `<div class="tt-stat-item"><span class="tt-stat-name">🎯 技能触发</span><span class="tt-stat-value">+${Math.round(stats.stb)}%</span></div>`;
        h += '</div>';
        let lh = '';
        if (stats.im) lh += '<div class="tt-legend-stat"><span class="tt-stat-name">✨ 不死</span><span class="tt-stat-value">首次HP归零恢复20%HP</span></div>';
        if (stats.ra) lh += '<div class="tt-legend-stat"><span class="tt-stat-name">🌿 灵根共鸣</span><span class="tt-stat-value">灵根战斗特效强化</span></div>';
        if (stats.ex) lh += '<div class="tt-legend-stat"><span class="tt-stat-name">⚔️ 斩杀</span><span class="tt-stat-value">敌人HP<20%伤害翻倍</span></div>';
        if (stats.abx) lh += '<div class="tt-legend-stat"><span class="tt-stat-name">🌀 天道汲取</span><span class="tt-stat-value">击杀回复30%HP+30%MP</span></div>';
        if (stats.wr) lh += '<div class="tt-legend-stat"><span class="tt-stat-name">⚡ 天怒</span><span class="tt-stat-value">攻击+30%</span></div>';
        if (lh) h += '<div class="tt-legend-stats">' + lh + '</div>';
        if (!h.includes('tt-stat-item') && !lh) h = '<div class="tt-no-stats">暂无天赋加成，开始挑战后显示</div>';
        el.innerHTML = h;
    }

    function updateBuffUI() {
        const el = document.getElementById('buff-combo-display'),
            bd = document.getElementById('buff-badge');
        if (!el) return;
        if (!buffCombo.length) {
            el.innerHTML = '<div style="color:#999;text-align:center;padding:10px;">暂无天赋记录</div>';
            if (bd) bd.textContent = '';
            return;
        }
        let h = '';
        buffCombo.forEach(b => {
            let c = 'tt-buff-common';
            if (b.rarity === '传说') c = 'tt-buff-legendary';
            else if (b.rarity === '稀有') c = 'tt-buff-rare';
            h += `<span class="tt-buff-tag ${c}">${b.name}(${b.rarity})</span>`;
        });
        el.innerHTML = h;
        if (bd) bd.textContent = `(${buffCombo.length})`;
    }

    GM_addStyle(`
        #trial-floating-btn{position:fixed;width:40px;height:40px;border-radius:50%;background:linear-gradient(135deg,#667eea,#764ba2);box-shadow:0 3px 10px rgba(0,0,0,0.3);z-index:99998;display:flex;align-items:center;justify-content:center;cursor:grab;transition:box-shadow 0.2s,transform 0.1s,opacity 0.3s;border:2px solid rgba(255,255,255,0.3);touch-action:none;user-select:none;-webkit-tap-highlight-color:transparent;}
        #trial-floating-btn:active{cursor:grabbing;transform:scale(0.95);}
        #trial-floating-btn.tt-dragging{opacity:0.8;cursor:grabbing;transition:none;}
        #trial-floating-btn span{font-size:20px;pointer-events:none;}
        #trial-floating-btn.tt-running{background:linear-gradient(135deg,#27ae60,#2ecc71);animation:tt-pulse 1.5s infinite;}
        #trial-floating-btn.tt-logged-out{background:#999!important;opacity:0.6;}
        @keyframes tt-pulse{0%{box-shadow:0 0 0 0 rgba(46,204,113,0.7)}70%{box-shadow:0 0 0 12px rgba(46,204,113,0)}100%{box-shadow:0 0 0 0 rgba(46,204,113,0)}}
        #tt-domain-badge{position:fixed;bottom:10px;left:10px;background:rgba(0,0,0,0.6);color:#fff;font-size:9px;padding:4px 8px;border-radius:12px;z-index:99997;display:flex;align-items:center;gap:6px;font-weight:500;pointer-events:none;}
        .tt-login-dot{display:inline-block;width:8px;height:8px;border-radius:50%;margin-right:4px;}
        .tt-login-dot.tt-online{background:#2ecc71;box-shadow:0 0 4px #2ecc71;animation:tt-pulse-green 1.5s infinite;}
        .tt-login-dot.tt-offline{background:#e74c3c;box-shadow:0 0 2px #e74c3c;}
        @keyframes tt-pulse-green{0%{box-shadow:0 0 0 0 rgba(46,204,113,0.7)}70%{box-shadow:0 0 0 4px rgba(46,204,113,0)}100%{box-shadow:0 0 0 0 rgba(46,204,113,0)}}
        #tt-auto-trial-container{position:fixed;bottom:0;left:0;right:0;background:#fff;border-radius:20px 20px 0 0;box-shadow:0 -4px 20px rgba(0,0,0,0.15);z-index:99999;font-family:'Microsoft YaHei','微软雅黑',sans-serif;transition:transform 0.3s;transform:translateY(100%);max-height:85vh;display:flex;flex-direction:column;}
        #tt-auto-trial-container.tt-open{transform:translateY(0);}
        #tt-auto-trial-container .tt-drag-handle{width:40px;height:4px;background:#ddd;border-radius:2px;margin:12px auto 8px;}
        #tt-auto-trial-container .tt-header{padding:12px 16px;background:linear-gradient(135deg,#667eea,#764ba2);color:#fff;display:flex;justify-content:space-between;align-items:center;border-radius:20px 20px 0 0;}
        #tt-auto-trial-container .tt-header h3{margin:0;font-size:16px;font-weight:600;display:flex;align-items:center;gap:6px;}
        #tt-auto-trial-container .tt-header-actions{display:flex;gap:12px;}
        #tt-auto-trial-container .tt-header-actions button{background:rgba(255,255,255,0.2);border:none;color:#fff;font-size:18px;padding:6px 10px;border-radius:8px;cursor:pointer;}
        #tt-auto-trial-container .tt-content{flex:1;overflow-y:auto;padding:12px 16px;-webkit-overflow-scrolling:touch;}
        #tt-auto-trial-container .tt-card{background:#f8f9fa;border-radius:12px;padding:12px;margin-bottom:12px;}
        #tt-auto-trial-container .tt-card-title{font-size:13px;font-weight:600;color:#333;margin-bottom:10px;display:flex;align-items:center;gap:6px;border-left:3px solid #667eea;padding-left:8px;}
        #tt-auto-trial-container .tt-select{width:100%;padding:12px;border:1px solid #e0e0e0;border-radius:10px;background:#fff;font-size:14px;color:#333;outline:none;}
        #tt-auto-trial-container .tt-select:disabled{background:#f0f0f0;color:#999;}
        #tt-auto-trial-container .tt-switch-group{display:flex;flex-direction:column;gap:10px;}
        #tt-auto-trial-container .tt-switch-item{display:flex;justify-content:space-between;align-items:center;padding:8px 0;}
        #tt-auto-trial-container .tt-switch-label{font-size:13px;color:#555;display:flex;align-items:center;gap:8px;}
        #tt-auto-trial-container .tt-switch{position:relative;display:inline-block;width:44px;height:24px;}
        #tt-auto-trial-container .tt-switch input{opacity:0;width:0;height:0;}
        #tt-auto-trial-container .tt-switch-slider{position:absolute;cursor:pointer;top:0;left:0;right:0;bottom:0;background:#ccc;transition:0.3s;border-radius:24px;}
        #tt-auto-trial-container .tt-switch-slider:before{content:"";position:absolute;height:18px;width:18px;left:3px;bottom:3px;background:#fff;transition:0.3s;border-radius:50%;}
        #tt-auto-trial-container .tt-switch input:checked+.tt-switch-slider{background:#667eea;}
        #tt-auto-trial-container .tt-switch input:checked+.tt-switch-slider:before{transform:translateX(20px);}
        #tt-auto-trial-container .tt-number-input{padding:10px;border:1px solid #e0e0e0;border-radius:10px;font-size:14px;width:100%;box-sizing:border-box;text-align:center;}
        #tt-auto-trial-container .tt-btn-group{display:flex;gap:10px;margin-top:16px;margin-bottom:10px;}
        #tt-auto-trial-container .tt-btn{flex:1;padding:12px;border:none;border-radius:10px;font-size:14px;font-weight:600;cursor:pointer;}
        #tt-auto-trial-container .tt-btn-start{background:linear-gradient(135deg,#667eea,#764ba2);color:#fff;}
        #tt-auto-trial-container .tt-btn-start:disabled{background:#ccc;opacity:0.6;}
        #tt-auto-trial-container .tt-btn-stop{background:#fff;color:#e74c3c;border:2px solid #e74c3c;}
        #tt-auto-trial-container .tt-btn-stop:disabled{border-color:#ccc;color:#ccc;}
        #tt-auto-trial-container .tt-btn-share{background:linear-gradient(135deg,#f093fb,#f5576c);color:#fff;width:100%;}
        #tt-auto-trial-container .tt-btn-share:disabled{background:#ccc;opacity:0.6;}
        #tt-auto-trial-container .tt-status{padding:8px 12px;border-radius:10px;font-size:11px;margin-top:10px;display:flex;align-items:center;gap:8px;}
        #tt-auto-trial-container .tt-stats-grid{display:grid;grid-template-columns:1fr 1fr;gap:8px;}
        #tt-auto-trial-container .tt-stat-item{display:flex;justify-content:space-between;align-items:center;background:#fff;padding:6px 10px;border-radius:8px;font-size:11px;}
        #tt-auto-trial-container .tt-stat-name{color:#666;font-weight:500;}
        #tt-auto-trial-container .tt-stat-value{color:#667eea;font-weight:600;}
        #tt-auto-trial-container .tt-legend-stats{margin-top:8px;padding-top:6px;border-top:1px dashed #e0e0e0;}
        #tt-auto-trial-container .tt-legend-stat{display:flex;justify-content:space-between;align-items:center;background:#fff8e1;padding:5px 10px;border-radius:8px;font-size:10px;margin-top:4px;}
        #tt-auto-trial-container .tt-legend-stat .tt-stat-name{color:#e67e22;}
        #tt-auto-trial-container .tt-legend-stat .tt-stat-value{color:#e67e22;font-size:9px;}
        #tt-auto-trial-container .tt-no-stats{text-align:center;color:#999;font-size:11px;padding:12px;}
        #tt-auto-trial-container .tt-refresh-btn{text-align:right;margin-top:6px;}
        #tt-auto-trial-container .tt-refresh-btn button{background:none;border:none;font-size:10px;color:#667eea;cursor:pointer;}
        #tt-auto-trial-container .tt-buff-combo{background:#f8f9fa;border-radius:10px;padding:10px;margin-top:10px;max-height:120px;overflow-y:auto;}
        #tt-auto-trial-container .tt-buff-tag{display:inline-block;padding:3px 8px;margin:3px;border-radius:14px;font-size:9px;font-weight:500;}
        #tt-auto-trial-container .tt-buff-legendary{background:#fff3cd;color:#856404;border:1px solid #ffc107;}
        #tt-auto-trial-container .tt-buff-rare{background:#d4edff;color:#0c5460;border:1px solid #4da3ff;}
        #tt-auto-trial-container .tt-buff-common{background:#e9ecef;color:#666;border:1px solid #dee2e6;}
        #tt-auto-trial-container .tt-log{background:#fff;border-radius:10px;padding:8px;max-height:150px;overflow-y:auto;font-size:10px;font-family:'Microsoft YaHei','微软雅黑',monospace;border:1px solid #eee;}
        #tt-auto-trial-container .tt-log-item{padding:3px 0;border-bottom:1px solid #f0f0f0;color:#666;}
        .tt-overlay{position:fixed;top:0;left:0;right:0;bottom:0;background:rgba(0,0,0,0.5);z-index:99998;display:none;}
        .tt-overlay.tt-show{display:block;}
        #tt-auto-trial-container .tt-login-warn{background:#f8d7da;color:#721c24;padding:6px 10px;border-radius:8px;font-size:10px;text-align:center;margin-bottom:10px;}
        #tt-auto-trial-container .tt-game-wait{background:#fff3cd;color:#856404;padding:6px 10px;border-radius:8px;font-size:10px;text-align:center;margin-bottom:10px;}
        .tt-toast{position:fixed;bottom:30%;left:50%;transform:translateX(-50%);background:rgba(0,0,0,0.8);color:#fff;padding:6px 14px;border-radius:20px;font-size:11px;z-index:99999;animation:tt-fadeOut 1.5s forwards;pointer-events:none;}
        @keyframes tt-fadeOut{0%{opacity:1;transform:translateX(-50%) scale(1)}70%{opacity:1;transform:translateX(-50%) scale(1)}100%{opacity:0;transform:translateX(-50%) scale(0.9)}}
    `);

    const badge = document.createElement('div');
    badge.id = 'tt-domain-badge';
    badge.innerHTML = '<span class="tt-login-dot tt-offline" id="tt-login-dot"></span>⚔️ 试炼助手 | 检测中...';
    document.body.appendChild(badge);

    const overlay = document.createElement('div');
    overlay.className = 'tt-overlay';
    document.body.appendChild(overlay);

    const fBtn = document.createElement('div');
    fBtn.id = 'trial-floating-btn';
    fBtn.innerHTML = '<span>⚔️</span>';
    document.body.appendChild(fBtn);

    const panel = document.createElement('div');
    panel.id = 'tt-auto-trial-container';
    panel.innerHTML = `
        <div class="tt-drag-handle" id="tt-drag-handle"></div>
        <div class="tt-header"><h3><span>⚔️</span> 自动试炼塔<span id="buff-badge" style="font-size:10px;background:rgba(255,255,255,0.2);padding:2px 8px;border-radius:20px;margin-left:auto;"></span></h3><div class="tt-header-actions"><button id="tt-minimize">✕</button></div></div>
        <div class="tt-content">
            <div id="tt-login-warn" class="tt-login-warn" style="display:none;">⚠️ 未检测到登录状态，请先登录游戏账号</div>
            <div class="tt-game-wait" id="tt-game-wait" style="display:none;">⏳ 等待游戏模块加载...</div>
            <div class="tt-card"><div class="tt-card-title">🎯 天赋策略</div><select class="tt-select" id="tt-strategy"><option value="balanced" ${saved.strategy==='balanced'?'selected':''}>综合评分（推荐）</option><option value="attack" ${saved.strategy==='attack'?'selected':''}>攻击优先</option><option value="defense" ${saved.strategy==='defense'?'selected':''}>防御优先</option><option value="legendary" ${saved.strategy==='legendary'?'selected':''}>传说品质优先</option></select></div>
            <div class="tt-card"><div class="tt-card-title">⚙️ 自动设置</div><div class="tt-switch-group">
                <div class="tt-switch-item"><label class="tt-switch-label"><span>🔄</span> 失败后自动重来（含重置）</label><label class="tt-switch"><input type="checkbox" id="tt-auto-retry" ${saved.autoRetry?'checked':''}><span class="tt-switch-slider"></span></label></div>
                <div class="tt-switch-item"><label class="tt-switch-label"><span>⚡</span> 跳过战斗动画</label><label class="tt-switch"><input type="checkbox" id="tt-skip-combat" ${saved.skipCombat?'checked':''}><span class="tt-switch-slider"></span></label></div>
                <div class="tt-switch-item"><label class="tt-switch-label"><span>💎</span> 灵石刷新天赋</label><label class="tt-switch"><input type="checkbox" id="tt-auto-refresh-buffs" ${saved.autoRefreshBuffs?'checked':''}><span class="tt-switch-slider"></span></label></div>
            </div></div>
            <div class="tt-card"><div class="tt-card-title">🎯 目标层数（0=不限）</div><input type="number" class="tt-number-input" id="tt-target" value="${saved.targetFloor}" min="0" max="999"></div>
            <div class="tt-btn-group"><button class="tt-btn tt-btn-start" id="tt-start" disabled>▶ 开始挑战</button><button class="tt-btn tt-btn-stop" id="tt-stop" disabled>⏹ 停止</button></div>
            <button class="tt-btn tt-btn-share" id="tt-share" disabled style="margin-bottom:10px;">📸 生成并分享战报</button>
            <div class="tt-status" id="tt-status-box"><span>🔒</span><span id="tt-status-text">检测登录状态中...</span></div>
            <div class="tt-card"><div class="tt-card-title">✨ 天赋加成<span style="font-size:9px;margin-left:auto;color:#999;" id="tt-stats-time"></span></div><div id="stats-display"><div class="tt-no-stats">加载中...</div></div><div class="tt-refresh-btn"><button id="tt-refresh-stats">🔄 刷新数据</button></div></div>
            <div class="tt-card"><div class="tt-card-title">🧬 当前天赋组合</div><div class="tt-buff-combo" id="buff-combo-display"><div style="color:#999;text-align:center;padding:10px;">加载中...</div></div></div>
            <div class="tt-card"><div class="tt-card-title">📋 战斗日志</div><div class="tt-log" id="tt-log"><div class="tt-log-item">📋 等待启动...</div></div></div>
        </div>`;
    document.body.appendChild(panel);

    let btnPos = saved.btnPos;

    function applyPos() {
        fBtn.style.bottom = btnPos.b + 'px';
        fBtn.style.right = btnPos.r + 'px';
        fBtn.style.left = 'auto';
        fBtn.style.top = 'auto';
    }
    applyPos();

    function toast(m, d = 1500) {
        const t = document.createElement('div');
        t.className = 'tt-toast';
        t.textContent = m;
        document.body.appendChild(t);
        setTimeout(() => t.remove(), d);
    }

    function resetPos() {
        btnPos = {
            b: 80,
            r: 12
        };
        applyPos();
        S.set('settings', {
            ...saved,
            btnPos
        });
        toast('📍 按钮已重置');
    }
    let ds = {
        a: false,
        sx: 0,
        sy: 0,
        sb: 0,
        sr: 0,
        mv: false
    };

    function gp() {
        return {
            b: parseFloat(fBtn.style.bottom) || 80,
            r: parseFloat(fBtn.style.right) || 12
        };
    }

    function clp(b, r) {
        return {
            b: Math.min(Math.max(b, 10), window.innerHeight - 50),
            r: Math.min(Math.max(r, 10), window.innerWidth - 50)
        };
    }

    function dsStart(e) {
        if (!active && !running) {
            toast('请先登录');
            return;
        }
        e.preventDefault();
        ds.a = true;
        ds.mv = false;
        const t = e.touches ? e.touches[0] : e;
        ds.sx = t.clientX;
        ds.sy = t.clientY;
        const p = gp();
        ds.sb = p.b;
        ds.sr = p.r;
        fBtn.classList.add('tt-dragging');
        fBtn.style.transition = 'none';
    }

    function dsMove(e) {
        if (!ds.a) return;
        e.preventDefault();
        const t = e.touches ? e.touches[0] : e;
        const dx = ds.sx - t.clientX,
            dy = ds.sy - t.clientY;
        if (Math.abs(dx) > 5 || Math.abs(dy) > 5) ds.mv = true;
        const c = clp(ds.sb + dy, ds.sr + dx);
        fBtn.style.bottom = c.b + 'px';
        fBtn.style.right = c.r + 'px';
    }

    function dsEnd() {
        if (!ds.a) {
            fBtn.classList.remove('tt-dragging');
            return;
        }
        ds.a = false;
        fBtn.classList.remove('tt-dragging');
        fBtn.style.transition = '';
        btnPos = gp();
        S.set('settings', {
            ...saved,
            btnPos
        });
        if (!ds.mv) {
            setTimeout(() => {
                panel.classList.toggle('tt-open');
                overlay.classList.toggle('tt-show');
            }, 50);
        }
        ds.mv = false;
    }
    fBtn.addEventListener('touchstart', dsStart, {
        passive: false
    });
    fBtn.addEventListener('touchmove', dsMove, {
        passive: false
    });
    fBtn.addEventListener('touchend', dsEnd);
    fBtn.addEventListener('mousedown', dsStart);
    window.addEventListener('mousemove', dsMove);
    window.addEventListener('mouseup', dsEnd);
    window.addEventListener('resize', () => {
        if (!ds.a) {
            const c = clp(btnPos.b, btnPos.r);
            if (c.b !== btnPos.b || c.r !== btnPos.r) {
                btnPos = c;
                applyPos();
            }
        }
    });

    const log = {
        el: document.getElementById('tt-log'),
        add(m, t = 'info') {
            const d = document.createElement('div');
            d.className = 'tt-log-item';
            d.textContent = `${t==='success'?'✅':t==='error'?'❌':'ℹ️'} ${new Date().toLocaleTimeString().slice(0,8)} ${m}`;
            this.el.insertBefore(d, this.el.firstChild);
            if (this.el.children.length > 50) this.el.removeChild(this.el.lastChild);
        }
    };

    // 策略权重：显著提高暴击(crit)权重
    const strats = {
        balanced: { atk: 5, def: 4, hp: 4, mp: 3, leg: 8, rare: 4, com: 2 },
        attack: { atk: 8, def: 2, hp: 3, mp: 3, leg: 7, rare: 5, com: 3 },
        defense: { atk: 3, def: 8, hp: 5, mp: 2, leg: 7, rare: 5, com: 3 },
        legendary: { atk: 3, def: 3, hp: 3, mp: 2, leg: 10, rare: 3, com: 1 }
    };

    function gw() {
        return strats[document.getElementById('tt-strategy').value] || strats.balanced;
    }

    function sb(b, w) {
        let s = 0;
        if (b.rarity === '传说') s += w.leg;
        else if (b.rarity === '稀有') s += w.rare;
        else s += w.com;
        const d = (b.desc || b.name || '').toLowerCase();
        if (/攻击|天怒/.test(d)) s += w.atk;
        if (/防御/.test(d)) s += w.def;
        if (/生命|血量/.test(d)) s += w.hp;
        if (/灵力/.test(d)) s += w.mp;
        // 提高暴击相关天赋的得分权重
        if (/暴击/.test(d)) s += 15;
        if (/不死/.test(d)) s += 8;
        if (/斩杀/.test(d)) s += 7;
        if (/汲取|天道/.test(d)) s += 7;
        if (/灵根/.test(d)) s += 8;
        return s;
    }

    function best(buffs) {
        const w = gw();
        // 1. 如果当前暴击率不足100%，优先选择包含"暴击"的天赋
        if (stats.cb < 100) {
            const critBuff = buffs.find(b => (b.desc || b.name || '').includes('暴击'));
            if (critBuff) {
                log.add(`优先选择暴击天赋: ${critBuff.name} (当前暴击${Math.round(stats.cb)}%)`, 'success');
                return critBuff;
            }
        }
        // 2. 否则按综合评分选择
        let bestBuff = buffs[0];
        let bestScore = sb(bestBuff, w);
        for (let i = 1; i < buffs.length; i++) {
            const score = sb(buffs[i], w);
            if (score > bestScore) {
                bestScore = score;
                bestBuff = buffs[i];
            }
        }
        log.add(`综合选择: ${bestBuff.name} (${bestBuff.rarity})`, 'success');
        return bestBuff;
    }

    function wait(ms) {
        return new Promise(r => setTimeout(r, ms));
    }

    async function doApi(method, url, data = null, retries = 2) {
        if (typeof api !== 'undefined' && api.request) {
            for (let i = 0; i <= retries; i++) {
                try {
                    const r = method === 'get' ? await api.get(url) : await api.post(url, data);
                    if (r && (r.code === 401 || r.code === 403)) {
                        onLogout();
                        return null;
                    }
                    return r;
                } catch (e) {
                    if (i === retries) return null;
                    await wait(1000);
                }
            }
        }
        for (let i = 0; i <= retries; i++) {
            try {
                const token = localStorage.getItem('token');
                const o = {
                    method: method.toUpperCase(),
                    headers: { 'Content-Type': 'application/json' },
                    credentials: 'include'
                };
                if (token) o.headers['Authorization'] = 'Bearer ' + token;
                if (data) o.body = JSON.stringify(data);
                const resp = await fetch(url, o);
                if (resp.status === 401 || resp.status === 403) {
                    onLogout();
                    return null;
                }
                return await resp.json();
            } catch (e) {
                if (i === retries) return null;
                await wait(1000);
            }
        }
        return null;
    }

    async function getInfo() {
        if (!active && !loggedIn) {
            document.getElementById('tt-login-warn').style.display = 'block';
            return null;
        }
        document.getElementById('tt-login-warn').style.display = 'none';
        const r = await doApi('get', '/api/trial-tower/info');
        if (r?.code === 200 && r.data) {
            document.getElementById('tt-game-wait').style.display = 'none';
            return r.data;
        }
        document.getElementById('tt-game-wait').style.display = 'block';
        return null;
    }

    async function doStart() {
        if (!active && !loggedIn) { log.add('请先登录', 'error'); return false; }
        const info = await getInfo();
        if (!info) { log.add('获取试炼信息失败', 'error'); return false; }
        if (info.hasActiveTrial) {
            curFloor = info.activeFloor;
            await refreshData();
            ensureStartMeditate();
            return true;
        }
        const r = await doApi('post', '/api/trial-tower/start', { useAdPoints: false });
        if (r?.code === 200) {
            log.add('开始新试炼', 'success');
            await forceRefresh();
            ensureStartMeditate();
            return true;
        }
        // 如果开启了自动重试（同时尝试重置）
        if (document.getElementById('tt-auto-retry').checked) {
            log.add('尝试灵石重置...');
            const rr = await doApi('post', '/api/trial-tower/start', { useAdPoints: false });
            if (rr?.code === 200) {
                log.add('重置成功', 'success');
                await forceRefresh();
                ensureStartMeditate();
                return true;
            }
        }
        log.add('无法开始试炼', 'error');
        return false;
    }

    async function doFight() {
        if (!active && !loggedIn) return null;
        const r = await doApi('post', '/api/trial-tower/fight');
        if (r?.code !== 200) return null;
        totalFights++;
        const d = r.data;
        if (d.logs?.length) log.add(`第${d.floor||'?'}层: ${d.logs[d.logs.length-1].substring(0,40)}`);
        return d;
    }

    async function doSelect() {
        if (!active && !loggedIn) return false;
        const info = await getInfo();
        if (!info?.pendingBuffs?.length) return false;
        
        // 如果开启了灵石刷新天赋，尝试刷新一次
        if (document.getElementById('tt-auto-refresh-buffs').checked) {
            const currentBuffs = info.pendingBuffs;
            const selected = best(currentBuffs);
            // 判断当前选择是否满意（非普通或特殊天赋）
            if (selected.rarity === '普通') {
                log.add('当前天赋普通，尝试灵石刷新...', 'info');
                const refreshRes = await doApi('post', '/api/trial-tower/refresh-buff', { useAdPoints: false });
                if (refreshRes?.code === 200) {
                    log.add('天赋已刷新', 'success');
                    const newInfo = await getInfo();
                    if (newInfo?.pendingBuffs?.length) {
                        const newSelected = best(newInfo.pendingBuffs);
                        const r = await doApi('post', '/api/trial-tower/choose-buff', { buffId: newSelected.id });
                        if (r?.code === 200) {
                            log.add(`选择刷新后天赋: ${newSelected.name}`, 'success');
                            await refreshData();
                            return true;
                        }
                    }
                } else {
                    log.add('刷新失败，使用当前天赋', 'info');
                }
            }
        }
        
        const bb = best(info.pendingBuffs);
        const r = await doApi('post', '/api/trial-tower/choose-buff', { buffId: bb.id });
        if (r?.code === 200) {
            log.add(`选择天赋: ${bb.name}`, 'success');
            await refreshData();
            return true;
        }
        return false;
    }

    function updateStatus(msg, type = 'running') {
        const sb = document.getElementById('tt-status-box'),
            st = document.getElementById('tt-status-text');
        if (!active && !loggedIn) {
            sb.style.background = '#fff3cd';
            sb.style.color = '#856404';
            st.innerHTML = '🔒 未登录';
            return;
        }
        const colors = {
            running: ['#f0f4ff', '#667eea'],
            stopped: ['#fff5f5', '#e74c3c'],
            completed: ['#f0fff4', '#27ae60']
        };
        sb.style.background = colors[type][0];
        sb.style.color = colors[type][1];
        st.innerHTML = `${type==='running'?'🔄':type==='stopped'?'⏸':'✅'} ${msg}`;
        if (running && active) fBtn.classList.add('tt-running');
        else fBtn.classList.remove('tt-running');
    }

    function isMeditating() {
        const medBtn = document.getElementById('meditateBtn');
        return medBtn && medBtn.classList.contains('meditating');
    }

    async function ensureStopMeditate() {
        const isMeditatingNow = isMeditating() || (window.playerInfo?.data?.isMeditating);
        if (!isMeditatingNow) return;
        
        log.add('⏸ 暂停冥想', 'info');
        const stopBtn = document.querySelector('.btn-stop-meditate');
        if (stopBtn) stopBtn.click();
        
        for (let i = 0; i < 15; i++) {
            await wait(1000);
            const btn = document.getElementById('meditateBtn');
            if (!btn?.classList.contains('meditating')) {
                log.add('冥想已停止', 'info');
                return;
            }
            document.querySelector('.btn-stop-meditate')?.click();
        }
        log.add('⚠️ 无法停止冥想', 'error');
    }

    function ensureStartMeditate() {
        if (isMeditating()) return;
        const medBtn = document.getElementById('meditateBtn');
        if (medBtn && medBtn.offsetParent !== null) {
            log.add('🧘 开始冥想', 'info');
            medBtn.click();
        }
    }

    async function runBattle() {
        if (!running) return;
        if (!active && !loggedIn) { stopBattle(); return; }
        const tf = parseInt(document.getElementById('tt-target').value) || 0;
        try {
            updateStatus('启动中...', 'running');
            if (!await doStart()) { stopBattle(); return; }
            const info = await getInfo();
            if (!info) { stopBattle(); return; }
            curFloor = info.activeFloor || 0;
            if (info.bestFloor !== undefined && info.bestFloor > highFloor) { highFloor = info.bestFloor; S.set('high', highFloor); }
            // 【修复】初始化本次战斗最高层数
            if (curFloor > currentRunMaxFloor) currentRunMaxFloor = curFloor;
            if (tf > 0 && curFloor >= tf) { updateStatus(`达到目标 ${tf} 层`, 'completed'); stopBattle(); return; }
            if (info.pendingBuffs?.length) { await doSelect(); await wait(500); }

            while (running) {
                if (!active && !loggedIn) { stopBattle(); return; }
                if (tf > 0 && curFloor >= tf) { updateStatus(`达到目标 ${tf} 层`, 'completed'); stopBattle(); return; }

                updateStatus(`挑战第${curFloor+1}层...`, 'running');
                const fr = await doFight();

                if (!fr) { await wait(2000); continue; }

                if (fr.victory) {
                    curFloor = fr.floor || curFloor + 1;
                    if (curFloor > highFloor) { highFloor = curFloor; S.set('high', highFloor); }
                    // 【修复】更新本次战斗最高层数
                    if (curFloor > currentRunMaxFloor) currentRunMaxFloor = curFloor;
                    updateStatus(`第${curFloor}层通关！`, 'running');
                    await refreshData();
                    if (fr.buffs?.length) {
                        await wait(500);
                        const fi = await getInfo();
                        if (fi?.pendingBuffs?.length) await doSelect();
                        else {
                            const bb = best(fr.buffs);
                            await doApi('post', '/api/trial-tower/choose-buff', { buffId: bb.id });
                            await refreshData();
                        }
                        await wait(500);
                    }
                } else {
                    totalDeaths++;
                    log.add(`第${curFloor+1}层失败`, 'error');
                    if (document.getElementById('tt-auto-retry').checked) {
                        updateStatus('重来中...', 'running');
                        await wait(1500);
                        await ensureStopMeditate();
                        if (!running) return;
                        if (!await doStart()) { stopBattle(); return; }
                        await forceRefresh();
                    } else {
                        updateStatus(`失败于第${curFloor+1}层`, 'stopped');
                        stopBattle();
                        await forceRefresh();
                        return;
                    }
                }
                await wait(800);
            }
        } catch (e) {
            stopBattle();
            await forceRefresh();
        }
    }

    async function startBattle() {
        if (!active && !loggedIn) { toast('请先登录'); return; }
        if (running) return;
        await ensureStopMeditate();
        running = true;
        totalFights = 0;
        totalDeaths = 0;
        currentRunMaxFloor = 0;  // 【修复】重置本次战斗最高层数
        document.getElementById('tt-start').disabled = true;
        document.getElementById('tt-stop').disabled = false;
        document.getElementById('tt-share').disabled = true;
        if (window.GameSettings) window.GameSettings.skipCombat = document.getElementById('tt-skip-combat').checked;
        log.add('🚀 自动战斗启动', 'success');
        runBattle();
    }

    function stopBattle() {
        running = false;
        document.getElementById('tt-start').disabled = !active;
        document.getElementById('tt-stop').disabled = true;
        document.getElementById('tt-share').disabled = !active;
        // 【修复】日志中显示本次战斗实际最高层
        const displayFloor = currentRunMaxFloor > 0 ? currentRunMaxFloor : curFloor;
        if (totalFights > 0) log.add(`📊 战斗${totalFights}次 死亡${totalDeaths}次 抵达${displayFloor}层`);
        S.set('high', highFloor);
        ensureStartMeditate();
        setTimeout(() => forceRefresh(), 500);
    }

    function saveSets() {
        S.set('settings', {
            strategy: document.getElementById('tt-strategy').value,
            autoRetry: document.getElementById('tt-auto-retry').checked,
            skipCombat: document.getElementById('tt-skip-combat').checked,
            targetFloor: parseInt(document.getElementById('tt-target').value) || 0,
            autoRefreshBuffs: document.getElementById('tt-auto-refresh-buffs').checked,
            btnPos
        });
    }

    function collectRpt() {
        const sm = {
            balanced: '综合评分',
            attack: '攻击优先',
            defense: '防御优先',
            legendary: '传说品质优先'
        };
        // 【修复】使用本次战斗实际最高层数
        const reportFloor = currentRunMaxFloor > 0 ? currentRunMaxFloor : curFloor;
        return {
            cf: reportFloor,
            tf: totalFights,
            td: totalDeaths,
            st: sm[document.getElementById('tt-strategy').value] || '综合评分',
            bf: [...buffCombo],
            ss: { ...stats },
            ts: new Date().toLocaleString('zh-CN', { hour12: false })
        };
    }

    async function genImage(rpt) {
        await waitForH2C();
        const c = document.createElement('div');
        c.style.cssText = 'position:fixed;left:-9999px;top:0;width:720px;background:#fff;font-family:"Microsoft YaHei","微软雅黑",sans-serif;padding:32px;box-sizing:border-box;z-index:-1;';
        let bH = '';
        if (rpt.bf.length) {
            bH = rpt.bf.map((b, i) => {
                let cl = '#666', bg = '#f5f5f5', bc = '#ddd';
                if (b.rarity === '传说') { cl = '#b8860b'; bg = '#fff8dc'; bc = '#daa520'; }
                else if (b.rarity === '稀有') { cl = '#1e6bb8'; bg = '#e8f4fd'; bc = '#5ba3e6'; }
                return `<div style="display:flex;align-items:center;padding:14px 0;border-bottom:1px solid #eee;font-size:18px;"><span style="color:${cl};font-weight:bold;min-width:34px;font-size:20px;">${i+1}.</span><span style="color:#222;margin-left:12px;font-weight:600;flex:1;">${b.name}</span><span style="color:${cl};margin-left:14px;font-size:15px;background:${bg};padding:6px 16px;border-radius:20px;border:2px solid ${bc};font-weight:700;">${b.rarity}</span></div>`;
            }).join('');
        } else {
            bH = '<div style="color:#999;text-align:center;padding:28px;font-size:18px;">暂无天赋记录</div>';
        }
        const s = rpt.ss;
        const items = [];
        if (s.ab > 0) items.push(`<div style="display:flex;justify-content:space-between;padding:9px 0;border-bottom:1px solid #f0f0f0;font-size:16px;"><span style="color:#333;">⚔️ 攻击加成</span><span style="color:#667eea;font-weight:700;">+${Math.round(s.ab)}%</span></div>`);
        if (s.db > 0) items.push(`<div style="display:flex;justify-content:space-between;padding:9px 0;border-bottom:1px solid #f0f0f0;font-size:16px;"><span style="color:#333;">🛡️ 防御加成</span><span style="color:#27ae60;font-weight:700;">+${Math.round(s.db)}%</span></div>`);
        if (s.hb > 0) items.push(`<div style="display:flex;justify-content:space-between;padding:9px 0;border-bottom:1px solid #f0f0f0;font-size:16px;"><span style="color:#333;">❤️ 生命加成</span><span style="color:#e74c3c;font-weight:700;">+${Math.round(s.hb)}%</span></div>`);
        if (s.mb > 0) items.push(`<div style="display:flex;justify-content:space-between;padding:9px 0;border-bottom:1px solid #f0f0f0;font-size:16px;"><span style="color:#333;">✨ 灵力加成</span><span style="color:#8e44ad;font-weight:700;">+${Math.round(s.mb)}%</span></div>`);
        if (s.cb > 0) items.push(`<div style="display:flex;justify-content:space-between;padding:9px 0;border-bottom:1px solid #f0f0f0;font-size:16px;"><span style="color:#333;">💥 暴击加成</span><span style="color:#e74c3c;font-weight:700;">+${Math.round(s.cb)}%</span></div>`);
        if (s.im) items.push(`<div style="display:flex;justify-content:space-between;padding:9px 0;border-bottom:1px solid #f0f0f0;font-size:15px;"><span style="color:#333;">✨ 不死</span><span style="color:#b8860b;font-weight:700;">首次HP归零恢复20%HP</span></div>`);
        if (s.ra) items.push(`<div style="display:flex;justify-content:space-between;padding:9px 0;border-bottom:1px solid #f0f0f0;font-size:15px;"><span style="color:#333;">🌿 灵根共鸣</span><span style="color:#b8860b;font-weight:700;">灵根战斗特效强化</span></div>`);
        if (s.ex) items.push(`<div style="display:flex;justify-content:space-between;padding:9px 0;border-bottom:1px solid #f0f0f0;font-size:15px;"><span style="color:#333;">⚔️ 斩杀</span><span style="color:#b8860b;font-weight:700;">敌人HP<20%伤害翻倍</span></div>`);
        if (s.abx) items.push(`<div style="display:flex;justify-content:space-between;padding:9px 0;border-bottom:1px solid #f0f0f0;font-size:15px;"><span style="color:#333;">🌀 天道汲取</span><span style="color:#b8860b;font-weight:700;">击杀回复30%HP+30%MP</span></div>`);
        if (s.wr) items.push(`<div style="display:flex;justify-content:space-between;padding:9px 0;border-bottom:1px solid #f0f0f0;font-size:15px;"><span style="color:#333;">⚡ 天怒</span><span style="color:#b8860b;font-weight:700;">攻击+30%</span></div>`);
        let sH = '';
        if (items.length) sH = `<div style="background:#f8f9fa;border-radius:12px;padding:22px;margin-bottom:26px;"><div style="font-size:22px;font-weight:bold;color:#333;margin-bottom:16px;padding-left:6px;border-left:4px solid #667eea;">✨ 天赋加成详情</div>${items.join('')}</div>`;

        c.innerHTML = `<div style="background:linear-gradient(135deg,#667eea,#764ba2);color:#fff;padding:36px 40px;border-radius:14px 14px 0 0;margin:-32px -32px 28px -32px;"><div style="font-size:34px;font-weight:bold;text-align:center;margin-bottom:6px;">⚔️ 天道试炼塔战报</div><div style="text-align:center;font-size:15px;opacity:0.9;">${rpt.ts}</div></div><div style="display:grid;grid-template-columns:1fr 1fr;gap:14px;margin-bottom:28px;"><div style="background:linear-gradient(135deg,#f0f4ff,#e8eeff);border-radius:12px;padding:22px;border:1px solid #d4dfff;"><div style="font-size:14px;color:#555;margin-bottom:8px;">🏆 最高层数</div><div style="font-size:44px;font-weight:bold;color:#667eea;">${rpt.cf}</div></div><div style="background:linear-gradient(135deg,#fff5f5,#ffe8e8);border-radius:12px;padding:22px;border:1px solid #ffd4d4;"><div style="font-size:14px;color:#555;margin-bottom:8px;">⚔️ 战斗次数</div><div style="font-size:44px;font-weight:bold;color:#e74c3c;">${rpt.tf}</div></div><div style="background:linear-gradient(135deg,#fff8f0,#fff0e0);border-radius:12px;padding:22px;border:1px solid #ffe0c0;"><div style="font-size:14px;color:#555;margin-bottom:8px;">💀 失败次数</div><div style="font-size:44px;font-weight:bold;color:#f39c12;">${rpt.td}</div></div><div style="background:linear-gradient(135deg,#f5fff5,#e8ffe8);border-radius:12px;padding:22px;border:1px solid #d4ffd4;"><div style="font-size:14px;color:#555;margin-bottom:8px;">🎯 天赋策略</div><div style="font-size:18px;font-weight:bold;color:#333;">${rpt.st}</div></div></div>${sH}<div style="background:#f8f9fa;border-radius:12px;padding:24px;margin-bottom:24px;"><div style="font-size:22px;font-weight:bold;color:#333;margin-bottom:16px;padding-left:6px;border-left:4px solid #667eea;">🧬 天赋组合详情 (共${rpt.bf.length}个)</div><div style="background:#fff;border-radius:10px;padding:6px 20px;border:1px solid #eee;">${bH}</div></div><div style="text-align:center;padding-top:18px;border-top:1px solid #eee;color:#aaa;font-size:12px;">由"天道试炼塔自动挑战助手"生成 · ${rpt.ts}</div>`;
        document.body.appendChild(c);
        try {
            const cv = await html2canvas(c, { scale: 2, backgroundColor: '#fff', allowTaint: true, useCORS: true, logging: false });
            document.body.removeChild(c);
            return cv;
        } catch (e) {
            if (document.body.contains(c)) document.body.removeChild(c);
            throw e;
        }
    }

    function dlImg(cv) {
        const a = document.createElement('a');
        a.download = `天道试炼塔战报_${new Date().toISOString().slice(0,10)}.png`;
        a.href = cv.toDataURL('image/png');
        a.click();
    }

    async function shareImg(cv) {
        if (navigator.share && /Android|iPhone|iPad|iPod/i.test(navigator.userAgent)) {
            cv.toBlob(async (b) => {
                try {
                    await navigator.share({
                        title: '天道试炼塔战报',
                        text: `我在试炼塔达到了第 ${highFloor} 层！`,
                        files: [new File([b], '战报.png', { type: 'image/png' })]
                    });
                } catch (e) { dlImg(cv); }
            });
        } else { dlImg(cv); }
    }

    async function doShare() {
        if (!active && !loggedIn) { toast('请先登录'); return; }
        const wr = running;
        if (wr) { stopBattle(); await wait(600); }
        try {
            await forceRefresh();
            await wait(400);
            const info = await doApi('get', '/api/trial-tower/info');
            if (info?.data?.bestFloor !== undefined && info.data.bestFloor > highFloor) {
                highFloor = info.data.bestFloor;
                S.set('high', highFloor);
            }
            const rpt = collectRpt();
            const cv = await genImage(rpt);
            await shareImg(cv);
            // 【修复】日志显示战报实际层数
            log.add(`✅ 战报分享成功！(最高层数: ${rpt.cf})`, 'success');
        } catch (e) {
            log.add('❌ 战报生成失败', 'error');
        } finally {
            if (wr) startBattle();
        }
    }

    async function checkLogin() {
        if (document.getElementById('trialTowerContent')) return true;
        if (document.querySelector('.trial-tower-card')) return true;
        if (localStorage.getItem('token')) return true;
        if (localStorage.getItem('playerId')) return true;
        try {
            if (typeof api !== 'undefined' && api.request) {
                const r = await api.get('/api/trial-tower/info');
                if (r && r.code === 200 && r.data) return true;
            } else {
                const token = localStorage.getItem('token');
                const headers = { 'Content-Type': 'application/json' };
                if (token) headers['Authorization'] = 'Bearer ' + token;
                const t = await fetch('/api/trial-tower/info', { method: 'GET', credentials: 'include', headers });
                if (t && t.ok) { const d = await t.json(); if (d && d.code === 200) return true; }
            }
        } catch (e) {}
        return false;
    }

    function updateLoginUI() {
        const sb = document.getElementById('tt-status-box'), st = document.getElementById('tt-status-text');
        const bs = document.getElementById('tt-start'), bh = document.getElementById('tt-share');
        const lw = document.getElementById('tt-login-warn'), dot = document.getElementById('tt-login-dot');
        if (dot) dot.className = `tt-login-dot ${loggedIn?'tt-online':'tt-offline'}`;
        const db = document.getElementById('tt-domain-badge');
        if (db) db.innerHTML = `<span class="tt-login-dot ${loggedIn?'tt-online':'tt-offline'}" id="tt-login-dot"></span>⚔️ 试炼助手 | ${loggedIn?'✅已登录':'🔒未登录'}`;
        if (loggedIn) {
            active = true;
            sb.style.background = '#f0f4ff'; sb.style.color = '#667eea'; st.innerHTML = '✅ 已登录 - 就绪';
            bs.disabled = false; bs.style.opacity = '1'; bs.textContent = '▶ 开始挑战';
            bh.disabled = false; bh.style.opacity = '1';
            fBtn.style.opacity = '1'; fBtn.style.background = 'linear-gradient(135deg,#667eea,#764ba2)';
            fBtn.classList.remove('tt-logged-out'); lw.style.display = 'none';
            forceRefresh(); log.add('已登录，脚本激活', 'success');
        } else {
            active = false; if (running) stopBattle();
            sb.style.background = '#fff3cd'; sb.style.color = '#856404'; st.innerHTML = '🔒 未登录';
            bs.disabled = true; bs.style.opacity = '0.5'; bs.textContent = '🔒 请先登录';
            bh.disabled = true; bh.style.opacity = '0.5';
            fBtn.style.opacity = '0.6'; fBtn.style.background = '#999';
            fBtn.classList.add('tt-logged-out'); lw.style.display = 'block';
        }
        if (running && active) fBtn.classList.add('tt-running'); else fBtn.classList.remove('tt-running');
    }

    function onLogin() { if (!loggedIn) { loggedIn = true; active = true; updateLoginUI(); } }
    function onLogout() { if (loggedIn) { loggedIn = false; active = false; if (running) stopBattle(); updateLoginUI(); } }

    async function startMonitor() {
        if (loginTimer) clearInterval(loginTimer);
        await wait(1000);
        const init = await checkLogin();
        loggedIn = init; active = init;
        updateLoginUI();
        console.log(init ? '✅ 检测到已登录状态' : '🔒 未检测到登录状态，脚本待机中');
        loginTimer = setInterval(async () => {
            if (running) return;
            const s = await checkLogin();
            if (s !== loggedIn) { if (s) onLogin(); else onLogout(); }
            else if (loggedIn) await refreshData();
        }, 15000);
    }

    document.addEventListener('visibilitychange', () => {
        if (!document.hidden) setTimeout(async () => {
            const s = await checkLogin();
            if (s !== loggedIn) { if (s) onLogin(); else onLogout(); }
            else if (loggedIn) await forceRefresh();
        }, 500);
    });
    let lu = location.href;
    new MutationObserver(() => {
        const u = location.href;
        if (u !== lu) { lu = u; setTimeout(async () => { if (!running) { const s = await checkLogin(); if (s !== loggedIn) { if (s) onLogin(); else onLogout(); } else if (loggedIn) await forceRefresh(); } }, 1000); }
    }).observe(document, { subtree: true, childList: true });

    document.getElementById('tt-start').addEventListener('click', startBattle);
    document.getElementById('tt-stop').addEventListener('click', stopBattle);
    document.getElementById('tt-share').addEventListener('click', doShare);
    document.getElementById('tt-refresh-stats').addEventListener('click', async () => {
        const tl = document.getElementById('tt-stats-time');
        if (tl) tl.textContent = '刷新中...';
        await forceRefresh();
        if (tl) { tl.textContent = '更新于 ' + new Date().toLocaleTimeString().slice(0,5); setTimeout(() => tl.textContent = '', 3000); }
    });
    overlay.addEventListener('click', () => { panel.classList.remove('tt-open'); overlay.classList.remove('tt-show'); });
    document.getElementById('tt-minimize').addEventListener('click', () => { panel.classList.remove('tt-open'); overlay.classList.remove('tt-show'); });
    ['tt-strategy', 'tt-auto-retry', 'tt-skip-combat', 'tt-auto-refresh-buffs', 'tt-target'].forEach(id => {
        const el = document.getElementById(id);
        if (el) { el.addEventListener('change', saveSets); if (el.type === 'checkbox') el.addEventListener('click', saveSets); }
    });
    let sy = 0;
    document.getElementById('tt-drag-handle').addEventListener('touchstart', e => { sy = e.touches[0].clientY; });
    document.getElementById('tt-drag-handle').addEventListener('touchmove', e => { if (e.touches[0].clientY - sy > 50) { panel.classList.remove('tt-open'); overlay.classList.remove('tt-show'); } });
    panel.addEventListener('touchmove', e => { if (e.target === panel || e.target.classList.contains('tt-content')) e.stopPropagation(); });
    setTimeout(() => forceRefresh(), 2000);

    if (typeof GM_registerMenuCommand !== 'undefined') {
        GM_registerMenuCommand('▶ 开始挑战', startBattle);
        GM_registerMenuCommand('⏹ 停止挑战', stopBattle);
        GM_registerMenuCommand('📸 生成战报', doShare);
        GM_registerMenuCommand('🗑 清空缓存', () => { S.set('lb',[]); S.set('ls',null); S.set('bh',[]); forceRefresh(); log.add('缓存已清空','info'); });
        GM_registerMenuCommand('📍 重置按钮', resetPos);
        GM_registerMenuCommand('🔍 检测登录', async () => { const s = await checkLogin(); if(s) onLogin(); else onLogout(); toast(s?'✅ 已登录':'🔒 未登录'); });
        GM_registerMenuCommand('🔄 刷新数据', forceRefresh);
    }

    startMonitor();
    console.log('✅ 天道试炼塔助手 v4.4.5 已加载');
})();