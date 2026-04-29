// ==UserScript==
// @name         天道试炼塔自动挑战助手
// @namespace    ling-trial-tower-assistant
// @version      4.2.8
// @description  PC+移动端自动挑战天道试炼塔，事件驱动冥想控制、暴击优先、灵石刷新（修复天赋丢失）
// @author       AutoTrial
// @match        https://ling.muge.info/*
// @match        http://ling.muge.info/*
// @grant        GM_getValue
// @grant        GM_setValue
// @grant        GM_addStyle
// @grant        GM_registerMenuCommand
// @run-at       document-end
// @downloadURL  https://raw.githubusercontent.com/ming-a1/LingVerse-Script/refs/heads/main/ling-trial-tower-assistant.js
// @updateURL    https://raw.githubusercontent.com/ming-a1/LingVerse-Script/refs/heads/main/ling-trial-tower-assistant.js
// ==/UserScript==

(function() {
    'use strict';

    // ============ 域名限制 ============
    const currentHost = window.location.hostname;
    if (!['ling.muge.info', 'www.ling.muge.info'].includes(currentHost)) return;

    // ============ 设备检测 ============
    const isMobile = /Android|iPhone|iPad|iPod|webOS/i.test(navigator.userAgent);

    // ============ GM兼容存储 ============
    const Storage = {
        KEY: 'auto_trial_settings_v428',
        save(settings) {
            try {
                const data = JSON.stringify(settings);
                (typeof GM_setValue !== 'undefined' ? GM_setValue : localStorage.setItem.bind(localStorage))(this.KEY, data);
            } catch(e) {}
        },
        load() {
            try {
                const data = (typeof GM_getValue !== 'undefined' ? GM_getValue : localStorage.getItem.bind(localStorage))(this.KEY, null);
                return data ? JSON.parse(data) : null;
            } catch(e) { return null; }
        },
        getDefault() {
            return {
                strategy: 'balanced',
                autoRetry: false,
                skipCombat: true,
                refreshWithGems: false,
                targetFloor: 0,
                btnPos: { top: 80, right: 12 }
            };
        }
    };

    // ============ Toast 提示 ============
    function showToast(msg, duration = 1500) {
        const toast = document.createElement('div');
        toast.className = isMobile ? 'tt-toast' : 'at-toast';
        toast.textContent = msg;
        document.body.appendChild(toast);
        setTimeout(() => { if (toast.parentNode) toast.remove(); }, duration);
    }

    // ============ 冥想控制 ============
    function isMeditating() {
        const medBtn = document.getElementById('meditateBtn');
        if (medBtn && medBtn.classList.contains('meditating')) return true;
        if (window.playerInfo?.data?.isMeditating) return true;
        return false;
    }

    async function ensureStopMeditate() {
        if (!isMeditating()) return;
        log.add('⏸ 暂停冥想', 'meditate');
        const stopBtn = document.querySelector('.btn-stop-meditate');
        if (stopBtn) stopBtn.click();
        for (let i = 0; i < 15; i++) {
            await wait(1000);
            const btn = document.getElementById('meditateBtn');
            if (!btn?.classList.contains('meditating')) { log.add('✅ 冥想已停止', 'success'); return; }
            document.querySelector('.btn-stop-meditate')?.click();
        }
        log.add('⚠️ 无法停止冥想', 'error');
    }

    function ensureStartMeditate() {
        if (isMeditating()) return;
        const medBtn = document.getElementById('meditateBtn');
        if (medBtn && medBtn.offsetParent !== null) {
            log.add('🧘 开始冥想', 'meditate');
            medBtn.click();
        }
    }

    // ============ 天赋效果追踪器 ============
    const EffectTracker = {
        stats: null,
        updateFromServer(trialStats) { if (!trialStats) return; this.stats = { ...trialStats }; this.updateUI(); },
        reset() { this.stats = null; this.updateUI(); },
        getCritBonus() { return this.stats ? (this.stats.critBonus || 0) : 0; },
        updateUI() {
            if (isMobile) this.updateUIMobile();
            else this.updateUIPC();
        },
        updateUIPC() {
            const area = document.getElementById('at-effect-panel-content');
            if (!area) return;
            if (!this.stats) { area.innerHTML = '<span class="at-placeholder-text">— 暂无加成 —</span>'; return; }
            const items = [];
            const s = this.stats;
            if (s.atkBonus > 0) items.push({ text: `攻+${Math.round(s.atkBonus)}%`, legendary: false });
            if (s.defBonus > 0) items.push({ text: `防+${Math.round(s.defBonus)}%`, legendary: false });
            if (s.hpBonus > 0) items.push({ text: `血+${Math.round(s.hpBonus)}%`, legendary: false });
            if (s.mpBonus > 0) items.push({ text: `灵+${Math.round(s.mpBonus)}%`, legendary: false });
            if (s.critBonus > 0) items.push({ text: `暴+${Math.round(s.critBonus)}%`, legendary: false });
            if (s.leechPercent > 0) items.push({ text: `吸${Math.round(s.leechPercent)}%`, legendary: false });
            if (s.thornPercent > 0) items.push({ text: `反${Math.round(s.thornPercent)}%`, legendary: false });
            if (s.doubleStrikeChance > 0) items.push({ text: `连${Math.round(s.doubleStrikeChance)}%`, legendary: false });
            if (s.healBonus > 0) items.push({ text: `回+${Math.round(s.healBonus)}%`, legendary: false });
            if (s.skillTriggerBonus > 0) items.push({ text: `技+${Math.round(s.skillTriggerBonus)}%`, legendary: false });
            if (s.hasImmortal) items.push({ text: '不死', legendary: true });
            if (s.hasExecute) items.push({ text: '斩杀', legendary: true });
            if (s.hasAbsorb) items.push({ text: '汲取', legendary: true });
            if (s.rootAmplify) items.push({ text: '灵根共鸣', legendary: true });
            if (s.hasWrath) items.push({ text: '天怒', legendary: true });
            let html = '<div class="at-effect-grid">';
            items.forEach(item => {
                const cls = item.legendary ? 'at-effect-item at-effect-item-legendary' : 'at-effect-item';
                html += `<span class="${cls}">${item.text}</span>`;
            });
            html += '</div>';
            area.innerHTML = html;
        },
        updateUIMobile() {
            const area = document.getElementById('stats-display');
            if (!area) return;
            if (!this.stats) { area.innerHTML = '<div class="tt-no-stats">暂无天赋加成</div>'; return; }
            const s = this.stats;
            let h = '<div class="tt-stats-grid">';
            if (s.atkBonus > 0) h += `<div class="tt-stat-item"><span>⚔️ 攻击</span><span>+${Math.round(s.atkBonus)}%</span></div>`;
            if (s.defBonus > 0) h += `<div class="tt-stat-item"><span>🛡️ 防御</span><span>+${Math.round(s.defBonus)}%</span></div>`;
            if (s.hpBonus > 0) h += `<div class="tt-stat-item"><span>❤️ 生命</span><span>+${Math.round(s.hpBonus)}%</span></div>`;
            if (s.mpBonus > 0) h += `<div class="tt-stat-item"><span>✨ 灵力</span><span>+${Math.round(s.mpBonus)}%</span></div>`;
            if (s.critBonus > 0) h += `<div class="tt-stat-item"><span>💥 暴击</span><span>+${Math.round(s.critBonus)}%</span></div>`;
            h += '</div>';
            area.innerHTML = h;
        }
    };

    // ============ 天赋组合追踪 ============
    const BuffTracker = {
        buffs: [],
        add(name, rarity, floor) {
            if (!this.buffs.find(b => b.name === name)) {
                this.buffs.push({ name, rarity: rarity || '普通', floor });
                this.updateUI();
            }
        },
        clear() { this.buffs = []; EffectTracker.reset(); this.updateUI(); },
        getSummary() {
            const legendary = this.buffs.filter(b => b.rarity === '传说');
            const rare = this.buffs.filter(b => b.rarity === '稀有');
            const common = this.buffs.filter(b => b.rarity === '普通');
            return { total: this.buffs.length, legendary: legendary.length, rare: rare.length, common: common.length };
        },
        updateUI() {
            if (isMobile) {
                const area = document.getElementById('buff-combo-display');
                if (!area) return;
                if (!this.buffs.length) { area.innerHTML = '<div style="color:#999;text-align:center;">暂无天赋记录</div>'; return; }
                let h = '';
                this.buffs.forEach(b => {
                    let c = 'tt-buff-common';
                    if (b.rarity === '传说') c = 'tt-buff-legendary';
                    else if (b.rarity === '稀有') c = 'tt-buff-rare';
                    h += `<span class="tt-buff-tag ${c}">${b.name}</span>`;
                });
                area.innerHTML = h;
            } else {
                const area = document.getElementById('at-log-area-buffs');
                if (!area) return;
                if (!this.buffs.length) { area.innerHTML = '<div class="at-empty-state">✨ 暂无天赋记录</div>'; return; }
                const s = this.getSummary();
                let html = `<div class="at-stats-row"><span class="at-stat-badge">📦 ${s.total}</span>`;
                if (s.legendary) html += `<span class="at-stat-badge at-stat-badge-legendary">★ ${s.legendary}</span>`;
                if (s.rare) html += `<span class="at-stat-badge at-stat-badge-rare">◆ ${s.rare}</span>`;
                html += `<span class="at-stat-badge">· ${s.common}</span></div><div class="at-buff-wall">`;
                this.buffs.forEach(b => {
                    let cls = 'at-buff-tag';
                    if (b.rarity === '传说') cls += ' at-buff-tag-legendary';
                    else if (b.rarity === '稀有') cls += ' at-buff-tag-rare';
                    html += `<span class="${cls}">${b.name}</span>`;
                });
                html += '</div>';
                area.innerHTML = html;
            }
        }
    };

    // ============ CSS样式 ============
    const PC_STYLES = `
        #at-auto-trial-container{position:fixed;top:20px;right:20px;width:420px;background:#FFFFFF;border-radius:20px;box-shadow:0 4px 20px rgba(0,0,0,0.08);z-index:99999;font-family:"Microsoft YaHei",sans-serif;overflow:hidden;border:1px solid #E8E8E8;}
        .at-header{background:#F8F9FA;padding:14px 20px;display:flex;justify-content:space-between;align-items:center;cursor:move;user-select:none;border-bottom:1px solid #EEEEEE;}
        .at-header h3{margin:0;font-size:16px;font-weight:600;color:#333;}
        .at-header-controls{display:flex;gap:6px;align-items:center;}
        .at-btn-icon{width:28px;height:28px;border:none;border-radius:50%;background:#E0E0E0;color:#666;cursor:pointer;font-size:14px;display:flex;align-items:center;justify-content:center;transition:all 0.2s;line-height:1;padding:0;}
        .at-btn-icon:hover{background:#CCCCCC;color:#333;}
        .at-body{padding:20px;background:#FFFFFF;max-height:70vh;overflow-y:auto;}
        .at-body::-webkit-scrollbar{width:4px;}
        .at-body::-webkit-scrollbar-track{background:#F0F0F0;border-radius:4px;}
        .at-body::-webkit-scrollbar-thumb{background:#CCC;border-radius:4px;}
        .at-card-section{background:#F8F9FA;border-radius:16px;padding:16px;margin-bottom:16px;border:1px solid #EFEFEF;}
        .at-section-title{font-size:13px;font-weight:600;color:#888;margin-bottom:12px;display:flex;align-items:center;gap:6px;}
        .at-select{width:100%;padding:10px 14px;border:1px solid #E5E5E5;border-radius:12px;background:#FFFFFF;font-size:13px;color:#333;outline:none;cursor:pointer;box-sizing:border-box;font-family:"Microsoft YaHei",sans-serif;}
        .at-select:focus{border-color:#CCC;box-shadow:0 0 0 2px rgba(0,0,0,0.05);}
        .at-input-full{width:100%;padding:10px 14px;border:1px solid #E5E5E5;border-radius:12px;background:#FFFFFF;font-size:13px;box-sizing:border-box;}
        .at-checkbox-grid{display:grid;grid-template-columns:1fr 1fr;gap:8px;}
        .at-checkbox-item{display:flex;align-items:center;gap:8px;font-size:12px;color:#555;cursor:pointer;padding:6px 0;}
        .at-checkbox-item input{accent-color:#333;cursor:pointer;}
        .at-button-group{display:flex;gap:12px;margin:20px 0 16px;}
        .at-btn{flex:1;padding:12px 0;border:none;border-radius:40px;font-size:13px;font-weight:500;cursor:pointer;transition:all 0.2s;font-family:"Microsoft YaHei",sans-serif;}
        .at-btn-primary{background:#1A1A1A;color:#FFFFFF;}
        .at-btn-primary:hover:not(:disabled){background:#333;transform:translateY(-1px);}
        .at-btn-primary:disabled{background:#E0E0E0;color:#999;cursor:not-allowed;transform:none;}
        .at-btn-danger{background:#FFFFFF;color:#E74C3C;border:1px solid #FFCDD2;}
        .at-btn-danger:hover:not(:disabled){background:#FFF5F5;border-color:#E74C3C;}
        .at-btn-danger:disabled{background:#F5F5F5;color:#CCC;border-color:#E0E0E0;cursor:not-allowed;}
        .at-status-bar{padding:10px 14px;border-radius:40px;font-size:12px;margin:12px 0;display:flex;align-items:center;gap:8px;font-weight:500;}
        .at-status-running{background:#E8F4FD;color:#4A90D9;}
        .at-status-stopped{background:#F5F5F5;color:#888;}
        .at-status-completed{background:#E8F5E9;color:#27AE60;}
        .at-effect-panel{background:#F8F9FA;border-radius:16px;padding:14px;margin:16px 0;border:1px solid #EFEFEF;}
        .at-effect-panel-title{font-size:11px;font-weight:600;color:#999;text-align:center;margin-bottom:10px;letter-spacing:1px;}
        .at-effect-grid{display:flex;flex-wrap:wrap;justify-content:center;gap:6px;}
        .at-effect-item{font-size:11px;padding:4px 10px;background:#FFFFFF;border-radius:20px;color:#555;border:1px solid #E8E8E8;}
        .at-effect-item-legendary{background:#FFF8E1;color:#F39C12;border-color:#FFE0A3;}
        .at-placeholder-text{font-size:11px;color:#BBB;text-align:center;display:block;}
        .at-log-container{margin-top:12px;border-radius:16px;overflow:hidden;border:1px solid #EFEFEF;background:#FFFFFF;}
        .at-log-tabs{display:flex;background:#F8F9FA;border-bottom:1px solid #EFEFEF;}
        .at-log-tab{flex:1;padding:10px;text-align:center;font-size:12px;font-weight:500;cursor:pointer;color:#999;transition:all 0.2s;background:transparent;border:none;font-family:"Microsoft YaHei",sans-serif;}
        .at-log-tab.at-active{color:#333;background:#FFFFFF;border-bottom:2px solid #333;}
        .at-log-area{max-height:200px;overflow-y:auto;padding:12px;background:#FFFFFF;font-size:11px;line-height:1.5;}
        .at-log-area::-webkit-scrollbar{width:4px;}
        .at-log-area::-webkit-scrollbar-track{background:#F0F0F0;}
        .at-log-area::-webkit-scrollbar-thumb{background:#CCC;}
        .at-log-item{padding:6px 0;border-bottom:1px solid #F5F5F5;color:#666;font-family:'SF Mono',Monaco,monospace;font-size:10px;white-space:pre-wrap;word-break:break-all;}
        .at-log-item:last-child{border-bottom:none;}
        .at-stats-row{display:flex;gap:8px;flex-wrap:wrap;margin-bottom:14px;padding-bottom:10px;border-bottom:1px solid #F0F0F0;}
        .at-stat-badge{font-size:10px;padding:3px 10px;background:#F5F5F5;border-radius:20px;color:#666;}
        .at-stat-badge-legendary{background:#FFF8E1;color:#F39C12;}
        .at-stat-badge-rare{background:#E8F4FD;color:#4A90D9;}
        .at-buff-wall{display:flex;flex-wrap:wrap;gap:8px;}
        .at-buff-tag{font-size:11px;padding:4px 10px;background:#F5F5F5;border-radius:20px;color:#555;}
        .at-buff-tag-legendary{background:#FFF8E1;color:#F39C12;}
        .at-buff-tag-rare{background:#E8F4FD;color:#4A90D9;}
        .at-empty-state{text-align:center;color:#BBB;padding:20px;font-size:11px;}
        .at-refresh-btn{text-align:right;margin-top:8px;}
        .at-refresh-btn button{background:none;border:none;font-size:10px;color:#4A90D9;cursor:pointer;padding:2px 8px;border-radius:12px;transition:background 0.2s;}
        .at-refresh-btn button:hover{background:#F0F7FF;}
        .at-toast{position:fixed;bottom:30%;left:50%;transform:translateX(-50%);background:rgba(0,0,0,0.8);color:#fff;padding:8px 18px;border-radius:20px;font-size:12px;z-index:100001;pointer-events:none;font-family:"Microsoft YaHei",sans-serif;animation:at-toast-fade 1.5s forwards;}
        @keyframes at-toast-fade{0%{opacity:1;transform:translateX(-50%) scale(1)}70%{opacity:1;transform:translateX(-50%) scale(1)}100%{opacity:0;transform:translateX(-50%) scale(0.9)}}
    `;

    const MOBILE_STYLES = `
        #trial-floating-btn{position:fixed;width:44px;height:44px;border-radius:50%;background:linear-gradient(135deg,#667eea,#764ba2);box-shadow:0 4px 12px rgba(0,0,0,0.3);z-index:99998;display:flex;align-items:center;justify-content:center;cursor:grab;border:2px solid rgba(255,255,255,0.3);touch-action:none;user-select:none;-webkit-tap-highlight-color:transparent;}
        #trial-floating-btn:active{transform:scale(0.9);}
        #trial-floating-btn.tt-dragging{opacity:0.7;transition:none;}
        #trial-floating-btn span{font-size:22px;pointer-events:none;line-height:1;}
        #trial-floating-btn.tt-running{background:linear-gradient(135deg,#27ae60,#2ecc71);animation:tt-pulse 1.5s infinite;}
        @keyframes tt-pulse{0%{box-shadow:0 0 0 0 rgba(46,204,113,0.7)}70%{box-shadow:0 0 0 14px rgba(46,204,113,0)}100%{box-shadow:0 0 0 0 rgba(46,204,113,0)}}
        #tt-auto-trial-container{position:fixed;bottom:0;left:0;right:0;background:#fff;border-radius:20px 20px 0 0;box-shadow:0 -4px 20px rgba(0,0,0,0.15);z-index:99999;font-family:'Microsoft YaHei',sans-serif;transition:transform 0.3s;transform:translateY(100%);max-height:85vh;display:flex;flex-direction:column;}
        #tt-auto-trial-container.tt-open{transform:translateY(0);}
        .tt-drag-handle{width:40px;height:4px;background:#ddd;border-radius:2px;margin:12px auto 8px;}
        .tt-header{padding:12px 16px;background:linear-gradient(135deg,#667eea,#764ba2);color:#fff;display:flex;justify-content:space-between;align-items:center;border-radius:20px 20px 0 0;}
        .tt-header h3{margin:0;font-size:16px;font-weight:600;}
        .tt-content{flex:1;overflow-y:auto;padding:12px 16px;-webkit-overflow-scrolling:touch;}
        .tt-card{background:#f8f9fa;border-radius:12px;padding:12px;margin-bottom:12px;}
        .tt-card-title{font-size:13px;font-weight:600;color:#333;margin-bottom:10px;display:flex;align-items:center;gap:6px;border-left:3px solid #667eea;padding-left:8px;}
        .tt-select{width:100%;padding:12px;border:1px solid #e0e0e0;border-radius:10px;background:#fff;font-size:14px;color:#333;outline:none;}
        .tt-select:disabled{background:#f0f0f0;color:#999;}
        .tt-switch-group{display:flex;flex-direction:column;gap:10px;}
        .tt-switch-item{display:flex;justify-content:space-between;align-items:center;padding:8px 0;font-size:13px;color:#555;}
        .tt-switch{position:relative;display:inline-block;width:44px;height:24px;}
        .tt-switch input{opacity:0;width:0;height:0;}
        .tt-switch-slider{position:absolute;cursor:pointer;top:0;left:0;right:0;bottom:0;background:#ccc;transition:0.3s;border-radius:24px;}
        .tt-switch-slider:before{content:"";position:absolute;height:18px;width:18px;left:3px;bottom:3px;background:#fff;transition:0.3s;border-radius:50%;}
        .tt-switch input:checked+.tt-switch-slider{background:#667eea;}
        .tt-switch input:checked+.tt-switch-slider:before{transform:translateX(20px);}
        .tt-number-input{padding:10px;border:1px solid #e0e0e0;border-radius:10px;font-size:14px;width:100%;box-sizing:border-box;text-align:center;}
        .tt-btn-group{display:flex;gap:10px;margin-top:16px;margin-bottom:10px;}
        .tt-btn{flex:1;padding:12px;border:none;border-radius:10px;font-size:14px;font-weight:600;cursor:pointer;-webkit-tap-highlight-color:transparent;touch-action:manipulation;}
        .tt-btn:active{opacity:0.8;}
        .tt-btn-start{background:linear-gradient(135deg,#667eea,#764ba2);color:#fff;}
        .tt-btn-start:disabled{background:#ccc;opacity:0.6;}
        .tt-btn-stop{background:#fff;color:#e74c3c;border:2px solid #e74c3c;}
        .tt-btn-stop:disabled{border-color:#ccc;color:#ccc;}
        .tt-status{padding:8px 12px;border-radius:10px;font-size:11px;margin-top:10px;display:flex;align-items:center;gap:8px;}
        .tt-stats-grid{display:grid;grid-template-columns:1fr 1fr;gap:8px;}
        .tt-stat-item{display:flex;justify-content:space-between;align-items:center;background:#fff;padding:6px 10px;border-radius:8px;font-size:11px;}
        .tt-stat-name{color:#666;font-weight:500;}
        .tt-stat-value{color:#667eea;font-weight:600;}
        .tt-legend-stats{margin-top:8px;padding-top:6px;border-top:1px dashed #e0e0e0;}
        .tt-legend-stat{display:flex;justify-content:space-between;align-items:center;background:#fff8e1;padding:5px 10px;border-radius:8px;font-size:10px;margin-top:4px;}
        .tt-no-stats{text-align:center;color:#999;font-size:11px;padding:12px;}
        .tt-refresh-btn{text-align:right;margin-top:6px;}
        .tt-refresh-btn button{background:none;border:none;font-size:10px;color:#667eea;cursor:pointer;}
        .tt-buff-combo{background:#f8f9fa;border-radius:10px;padding:10px;margin-top:10px;max-height:120px;overflow-y:auto;}
        .tt-buff-tag{display:inline-block;padding:3px 8px;margin:3px;border-radius:14px;font-size:9px;font-weight:500;}
        .tt-buff-legendary{background:#fff3cd;color:#856404;border:1px solid #ffc107;}
        .tt-buff-rare{background:#d4edff;color:#0c5460;border:1px solid #4da3ff;}
        .tt-buff-common{background:#e9ecef;color:#666;border:1px solid #dee2e6;}
        .tt-log{background:#fff;border-radius:10px;padding:8px;max-height:150px;overflow-y:auto;font-size:10px;font-family:'Microsoft YaHei',monospace;border:1px solid #eee;}
        .tt-log-item{padding:3px 0;border-bottom:1px solid #f0f0f0;color:#666;white-space:pre-wrap;word-break:break-all;}
        .tt-overlay{position:fixed;top:0;left:0;right:0;bottom:0;background:rgba(0,0,0,0.5);z-index:99997;display:none;}
        .tt-overlay.tt-show{display:block;}
        .tt-toast{position:fixed;bottom:30%;left:50%;transform:translateX(-50%);background:rgba(0,0,0,0.8);color:#fff;padding:6px 14px;border-radius:20px;font-size:11px;z-index:99999;animation:tt-fadeOut 1.5s forwards;pointer-events:none;}
        @keyframes tt-fadeOut{0%{opacity:1;transform:translateX(-50%) scale(1)}70%{opacity:1;transform:translateX(-50%) scale(1)}100%{opacity:0;transform:translateX(-50%) scale(0.9)}}
    `;

    if (isMobile) { GM_addStyle(MOBILE_STYLES); }
    else { const s = document.createElement('style'); s.textContent = PC_STYLES; document.head.appendChild(s); }

    // ============ 清理旧元素 ============
    ['at-auto-trial-container', 'tt-auto-trial-container', 'trial-floating-btn'].forEach(id => {
        const el = document.getElementById(id); if (el) el.remove();
    });
    document.querySelectorAll('.tt-overlay').forEach(el => el.remove());

    // ============ UI构建 ============
    const savedSettings = Storage.load() || Storage.getDefault();
    const highFloor = parseInt(localStorage.getItem('auto_trial_high_floor') || '0');
    let container, fBtn, overlay;

    if (isMobile) {
        overlay = document.createElement('div'); overlay.className = 'tt-overlay'; document.body.appendChild(overlay);
        fBtn = document.createElement('div'); fBtn.id = 'trial-floating-btn'; fBtn.innerHTML = '<span>⚔️</span>'; document.body.appendChild(fBtn);
        container = document.createElement('div'); container.id = 'tt-auto-trial-container';
        container.innerHTML = `
            <div class="tt-drag-handle" id="tt-drag-handle"></div>
            <div class="tt-header"><h3>⚔️ 自动试炼塔 v4.2.8</h3><button id="tt-minimize" style="background:rgba(255,255,255,0.25);border:none;color:#fff;font-size:16px;width:28px;height:28px;border-radius:50%;cursor:pointer;display:flex;align-items:center;justify-content:center;transition:background 0.2s;">✕</button></div>
            <div class="tt-content">
                <div class="tt-card"><div class="tt-card-title">🎯 天赋策略</div><select class="tt-select" id="tt-strategy"><option value="balanced" ${savedSettings.strategy==='balanced'?'selected':''}>综合平衡（暴击优先）</option><option value="attack" ${savedSettings.strategy==='attack'?'selected':''}>攻击优先</option><option value="defense" ${savedSettings.strategy==='defense'?'selected':''}>防御优先</option><option value="legendary" ${savedSettings.strategy==='legendary'?'selected':''}>传说品质优先</option></select></div>
                <div class="tt-card"><div class="tt-card-title">⚙️ 自动设置</div><div class="tt-switch-group">
                    <div class="tt-switch-item"><span>🔄 失败自动重试</span><label class="tt-switch"><input type="checkbox" id="tt-auto-retry" ${savedSettings.autoRetry?'checked':''}><span class="tt-switch-slider"></span></label></div>
                    <div class="tt-switch-item"><span>⚡ 跳过战斗动画</span><label class="tt-switch"><input type="checkbox" id="tt-skip-combat" ${savedSettings.skipCombat?'checked':''}><span class="tt-switch-slider"></span></label></div>
                    <div class="tt-switch-item"><span>💎 灵石刷新天赋</span><label class="tt-switch"><input type="checkbox" id="tt-refresh-gems" ${savedSettings.refreshWithGems?'checked':''}><span class="tt-switch-slider"></span></label></div>
                </div></div>
                <div class="tt-card"><div class="tt-card-title">🎯 目标层数 ${highFloor>0?`<span style="font-size:10px;color:#999;margin-left:auto;">最高: ${highFloor}层</span>`:''}</div><input type="number" class="tt-number-input" id="tt-target" value="${savedSettings.targetFloor}" min="0" max="999"></div>
                <div class="tt-btn-group"><button class="tt-btn tt-btn-start" id="tt-start">▶ 开始挑战</button><button class="tt-btn tt-btn-stop" id="tt-stop" disabled>⏹ 停止</button></div>
                <div class="tt-status" id="tt-status-box" style="background:#f5f5f5;color:#888;"><span>⚡</span><span id="tt-status-text">就绪</span></div>
                <div class="tt-card"><div class="tt-card-title">✨ 天赋加成</div><div id="stats-display"><div class="tt-no-stats">加载中...</div></div><div class="tt-refresh-btn"><button id="tt-refresh-stats">🔄 刷新数据</button></div></div>
                <div class="tt-card"><div class="tt-card-title">🧬 当前天赋组合</div><div class="tt-buff-combo" id="buff-combo-display"><div style="color:#999;text-align:center;">加载中...</div></div></div>
                <div class="tt-card"><div class="tt-card-title">📋 战斗日志</div><div class="tt-log" id="tt-log"><div class="tt-log-item">📋 等待指令...</div></div></div>
            </div>`;
    } else {
        container = document.createElement('div'); container.id = 'at-auto-trial-container';
        container.innerHTML = `
            <div class="at-header" id="at-header"><h3>⚔️ 自动试炼塔 v4.2.8</h3><div class="at-header-controls"><button class="at-btn-icon" id="at-btn-minimize">−</button></div></div>
            <div class="at-body" id="at-body">
                <div class="at-card-section"><div class="at-section-title">🎯 天赋策略</div><select class="at-select" id="at-strategy"><option value="balanced" ${savedSettings.strategy==='balanced'?'selected':''}>综合平衡（暴击优先）</option><option value="attack" ${savedSettings.strategy==='attack'?'selected':''}>攻击优先</option><option value="defense" ${savedSettings.strategy==='defense'?'selected':''}>防御优先</option><option value="legendary" ${savedSettings.strategy==='legendary'?'selected':''}>传说品质优先</option></select></div>
                <div class="at-card-section"><div class="at-section-title">⚙️ 自动设置</div><div class="at-checkbox-grid">
                    <label class="at-checkbox-item"><input type="checkbox" id="at-auto-retry" ${savedSettings.autoRetry?'checked':''}> 失败自动重试</label>
                    <label class="at-checkbox-item"><input type="checkbox" id="at-skip-combat" ${savedSettings.skipCombat?'checked':''}> 跳过战斗动画</label>
                    <label class="at-checkbox-item"><input type="checkbox" id="at-refresh-gems" ${savedSettings.refreshWithGems?'checked':''}> 💎 灵石刷新</label>
                </div></div>
                <div class="at-card-section"><div class="at-section-title">🎯 目标层数 ${highFloor>0?`<span style="font-size:10px;color:#999;margin-left:auto;">最高: ${highFloor}层</span>`:''}</div><input type="number" class="at-input-full" id="at-target" value="${savedSettings.targetFloor}" min="0" max="999"></div>
                <div class="at-effect-panel"><div class="at-effect-panel-title">—— 天赋加成 ——</div><div id="at-effect-panel-content"><span class="at-placeholder-text">— 暂无加成 —</span></div><div class="at-refresh-btn"><button id="at-refresh-stats">🔄 刷新数据</button></div></div>
                <div class="at-button-group"><button class="at-btn at-btn-primary" id="at-start">▶ 开始挑战</button><button class="at-btn at-btn-danger" id="at-stop" disabled>⏹ 停止</button></div>
                <div class="at-status-bar at-status-stopped" id="at-status-box"><span>⚡</span><span id="at-status-text">就绪</span></div>
                <div class="at-log-container"><div class="at-log-tabs"><button class="at-log-tab at-active" data-tab="process">📋 过程日志</button><button class="at-log-tab" data-tab="buffs">🧬 天赋组合</button></div><div class="at-log-area" id="at-log-area-process"><div class="at-log-item">📋 等待指令...</div></div><div class="at-log-area" id="at-log-area-buffs" style="display:none;"><div class="at-empty-state">✨ 暂无天赋记录</div></div></div>
            </div>`;
    }
    document.body.appendChild(container);

    // ============ 移动端拖拽 ============
    if (isMobile) {
        let btnPos = { ...(savedSettings.btnPos || { top: 80, right: 12 }) };
        function applyPos() { fBtn.style.top = btnPos.top + 'px'; fBtn.style.right = btnPos.right + 'px'; fBtn.style.bottom = 'auto'; fBtn.style.left = 'auto'; }
        applyPos();
        let ds = { a: false, sx: 0, sy: 0, st: 0, sr: 0, mv: false };
        fBtn.addEventListener('touchstart', e => { e.preventDefault(); ds.a = true; ds.mv = false; const t = e.touches[0]; ds.sx = t.clientX; ds.sy = t.clientY; const p = { top: parseFloat(fBtn.style.top)||80, right: parseFloat(fBtn.style.right)||12 }; ds.st = p.top; ds.sr = p.right; fBtn.classList.add('tt-dragging'); }, { passive: false });
        fBtn.addEventListener('touchmove', e => { if (!ds.a) return; e.preventDefault(); const t = e.touches[0]; if (Math.abs(ds.sx-t.clientX)>5||Math.abs(ds.sy-t.clientY)>5) ds.mv = true; const top = Math.min(Math.max(ds.st-(ds.sy-t.clientY),10),window.innerHeight-60); const right = Math.min(Math.max(ds.sr+(ds.sx-t.clientX),10),window.innerWidth-60); fBtn.style.top = top+'px'; fBtn.style.right = right+'px'; }, { passive: false });
        fBtn.addEventListener('touchend', () => { if (!ds.a) return; ds.a = false; fBtn.classList.remove('tt-dragging'); btnPos = { top: parseFloat(fBtn.style.top)||80, right: parseFloat(fBtn.style.right)||12 }; savedSettings.btnPos = btnPos; Storage.save(savedSettings); if (!ds.mv) { container.classList.toggle('tt-open'); overlay.classList.toggle('tt-show'); } ds.mv = false; });
        overlay.addEventListener('click', () => { container.classList.remove('tt-open'); overlay.classList.remove('tt-show'); });
        document.getElementById('tt-minimize').addEventListener('click', () => { container.classList.remove('tt-open'); overlay.classList.remove('tt-show'); });
        let sy = 0;
        document.getElementById('tt-drag-handle').addEventListener('touchstart', e => { sy = e.touches[0].clientY; });
        document.getElementById('tt-drag-handle').addEventListener('touchmove', e => { if (e.touches[0].clientY - sy > 50) { container.classList.remove('tt-open'); overlay.classList.remove('tt-show'); } });
    }

    // ============ PC端拖拽和标签 ============
    if (!isMobile) {
        let isDrag = false, ox, oy;
        document.getElementById('at-header').addEventListener('mousedown', function(e) { if (e.target.tagName==='BUTTON') return; isDrag=true; const r=container.getBoundingClientRect(); ox=e.clientX-r.left; oy=e.clientY-r.top; container.style.cursor='grabbing'; e.preventDefault(); });
        document.addEventListener('mousemove', e => { if(!isDrag) return; let l=e.clientX-ox, t=e.clientY-oy; l=Math.max(0,Math.min(l,window.innerWidth-container.offsetWidth)); t=Math.max(0,Math.min(t,window.innerHeight-container.offsetHeight)); container.style.left=l+'px'; container.style.top=t+'px'; container.style.right='auto'; container.style.bottom='auto'; });
        document.addEventListener('mouseup', () => { if(isDrag){isDrag=false;container.style.cursor='';} });
        let min = false;
        document.getElementById('at-btn-minimize').addEventListener('click', function() { const b = document.getElementById('at-body'); min = !min; b.style.display = min?'none':'block'; this.textContent = min?'+':'−'; });
        document.querySelectorAll('.at-log-tab').forEach(tab => { tab.addEventListener('click', function() { document.querySelectorAll('.at-log-tab').forEach(t=>t.classList.remove('at-active')); this.classList.add('at-active'); const n=this.dataset.tab; document.getElementById('at-log-area-process').style.display=n==='process'?'block':'none'; document.getElementById('at-log-area-buffs').style.display=n==='buffs'?'block':'none'; }); });
    }

    // ============ 核心逻辑 ============
    const log = {
        el: isMobile ? document.getElementById('tt-log') : document.getElementById('at-log-area-process'),
        add(msg, type = 'info') {
            const d = document.createElement('div'); d.className = isMobile ? 'tt-log-item' : 'at-log-item';
            const icon = type==='success'?'✅':(type==='error'?'❌':(type==='crit'?'💥':(type==='gems'?'💎':(type==='meditate'?'🧘':(type==='buff'?'⭐':'ℹ️')))));
            d.textContent = `${icon} ${new Date().toLocaleTimeString().slice(0,8)} ${msg}`;
            this.el.insertBefore(d, this.el.firstChild);
            if (this.el.children.length > 50) this.el.removeChild(this.el.lastChild);
        },
        clear() { 
            this.el.innerHTML = isMobile ? '<div class="tt-log-item">📋 日志已清空</div>' : '<div class="at-log-item">📋 日志已清空</div>'; 
        }
    };

    const state = { running: false, currentFloor: 0, totalFights: 0, totalDeaths: 0, trialCount: 0 };
    const IDS = isMobile ? { strategy:'tt-strategy', autoRetry:'tt-auto-retry', skipCombat:'tt-skip-combat', refreshGems:'tt-refresh-gems', target:'tt-target', start:'tt-start', stop:'tt-stop', refresh:'tt-refresh-stats' } : { strategy:'at-strategy', autoRetry:'at-auto-retry', skipCombat:'at-skip-combat', refreshGems:'at-refresh-gems', target:'at-target', start:'at-start', stop:'at-stop', refresh:'at-refresh-stats' };
    function G(k) { return document.getElementById(IDS[k]); }

    const strategies = {
        balanced: { atk:5, def:4, hp:4, mp:3, crit:15, leg:8, rare:4, com:2 },
        attack:   { atk:8, def:2, hp:3, mp:3, crit:12, leg:7, rare:5, com:3 },
        defense:  { atk:3, def:8, hp:5, mp:2, crit:12, leg:7, rare:5, com:3 },
        legendary:{ atk:3, def:3, hp:3, mp:2, crit:10, leg:10, rare:3, com:1 }
    };
    function getWeights() { return strategies[G('strategy').value] || strategies.balanced; }
    function isCritBuff(b) { return /暴击|会心|致命|必杀|crit/i.test((b.desc||b.name||'').toLowerCase()); }
    function isCritSatisfied() { return EffectTracker.getCritBonus() >= 100; }

    function getBuffDesc(buff) {
        if (buff.desc) return buff.desc;
        if (buff.effect) return buff.effect;
        return '';
    }

    function formatBuffList(buffs) {
        if (!buffs?.length) return '无';
        return buffs.map(b => {
            const desc = getBuffDesc(b);
            const mark = b.rarity === '传说' ? '★' : (b.rarity === '稀有' ? '◆' : '·');
            const descPart = desc ? ` ${desc}` : '';
            return `  ${mark}[${b.name}]${descPart}`;
        }).join('\n');
    }

    function chooseBestBuff(buffs) {
        if (!buffs?.length) return null;
        
        log.add('📋 可选天赋:\n' + formatBuffList(buffs), 'buff');
        
        if (!isCritSatisfied()) {
            const cb = buffs.find(b => isCritBuff(b));
            if (cb) {
                log.add(`💥 暴击优先: ★[${cb.name}] ${getBuffDesc(cb)} (暴击: ${Math.round(EffectTracker.getCritBonus())}%)`, 'crit');
                BuffTracker.add(cb.name, cb.rarity, state.currentFloor);
                return cb;
            }
        }
        
        const w = getWeights();
        let best = buffs[0], bestScore = 0;
        buffs.forEach(b => {
            let s = 0;
            if (b.rarity==='传说') s+=w.leg;
            else if (b.rarity==='稀有') s+=w.rare;
            else s+=w.com;
            const d=(b.desc||b.name||'').toLowerCase();
            if (isCritBuff(b)) s+=w.crit;
            if (/攻击|天怒/.test(d)) s+=w.atk;
            if (/防御/.test(d)) s+=w.def;
            if (/生命/.test(d)) s+=w.hp;
            if (/灵力/.test(d)) s+=w.mp;
            if (/不死/.test(d)) s+=8;
            if (/斩杀/.test(d)) s+=7;
            if (/汲取|天道/.test(d)) s+=7;
            if (/灵根/.test(d)) s+=8;
            if (s>bestScore){bestScore=s;best=b;}
        });
        
        log.add(`⭐ 选择: [${best.name}] ${getBuffDesc(best)} (${best.rarity})`, 'buff');
        BuffTracker.add(best.name, best.rarity, state.currentFloor);
        return best;
    }

    async function wait(ms) { return new Promise(r => setTimeout(r, ms)); }

    async function apiCall(method, url, data) {
        try {
            if (typeof api !== 'undefined') {
                if (typeof api.post === 'function') return method==='get' ? await api.get(url) : await api.post(url, data);
                if (typeof api.request === 'function') return method==='get' ? await api.request('get', url) : await api.request('post', url, data);
            }
            const t = localStorage.getItem('token');
            const o = { method: method.toUpperCase(), headers: { 'Content-Type': 'application/json' }, credentials: 'include' };
            if (t) o.headers['Authorization'] = 'Bearer ' + t;
            if (data) o.body = JSON.stringify(data);
            return await (await fetch(url, o)).json();
        } catch(e) { log.add('API错误', 'error'); return null; }
    }

    async function getTrialInfo() {
        const res = await apiCall('get', '/api/trial-tower/info');
        if (res?.code === 200 && res.data) {
            if (res.data.trialStats) EffectTracker.updateFromServer(res.data.trialStats);
            const hf = parseInt(localStorage.getItem('auto_trial_high_floor')||'0');
            if (res.data.bestFloor !== undefined && res.data.bestFloor > hf) localStorage.setItem('auto_trial_high_floor', res.data.bestFloor.toString());
            return res.data;
        }
        return null;
    }

    async function refreshBuffsWithGems() {
        const infoBefore = await getTrialInfo();
        const beforeBuffs = infoBefore?.pendingBuffs || [];
        
        log.add('💎 使用灵石刷新天赋...', 'gems');
        if (beforeBuffs.length > 0) {
            log.add('📋 刷新前:\n' + formatBuffList(beforeBuffs), 'gems');
        }
        
        const res = await apiCall('post', '/api/trial-tower/refresh-buff', { useGems: true });
        if (res?.code === 200 && res.data?.success) {
            const infoAfter = await getTrialInfo();
            const afterBuffs = infoAfter?.pendingBuffs || [];
            
            log.add('💎 刷新成功 (消耗1000灵石)', 'success');
            if (afterBuffs.length > 0) {
                log.add('📋 刷新后:\n' + formatBuffList(afterBuffs), 'success');
            }
            showToast('💎 天赋已刷新');
            await getTrialInfo();
            return true;
        }
        log.add('⚠️ 刷新失败（灵石不足或不可用）', 'error');
        return false;
    }

    async function selectBuffWithRefresh() {
        const info = await getTrialInfo();
        if (!info?.pendingBuffs?.length) return false;
        
        if (G('refreshGems').checked && !info.pendingBuffs.some(b => b.rarity==='传说')) {
            if (isCritSatisfied() || !info.pendingBuffs.some(b => isCritBuff(b))) {
                log.add('💎 天赋不理想，尝试刷新...', 'gems');
                if (await refreshBuffsWithGems()) {
                    const ni = await getTrialInfo();
                    if (ni?.pendingBuffs?.length) {
                        const bb = chooseBestBuff(ni.pendingBuffs);
                        if (bb) { await apiCall('post', '/api/trial-tower/choose-buff', { buffId: bb.id }); await getTrialInfo(); return true; }
                    }
                }
                log.add('刷新失败，使用当前天赋', 'info');
            }
        }
        
        const bb = chooseBestBuff(info.pendingBuffs);
        if (!bb) return false;
        await apiCall('post', '/api/trial-tower/choose-buff', { buffId: bb.id });
        await getTrialInfo();
        return true;
    }

    // ✅ 修复：startTrial 不清除天赋组合（仅在新一轮试炼时清除）
    async function startTrial(isRetry = false) {
        const info = await getTrialInfo();
        if (!info) return false;
        if (info.hasActiveTrial) {
            state.currentFloor = info.activeFloor;
            // ✅ 从服务器恢复当前天赋组合
            if (info.activeBuffs?.length && BuffTracker.buffs.length === 0) {
                for (const bn of info.activeBuffs) {
                    let r = '普通';
                    const nameStr = typeof bn === 'string' ? bn : (bn.name || bn);
                    if (/不死|斩杀|汲取|灵根|天怒|天道/.test(nameStr)) r = '传说';
                    else if (/强化|增幅|进阶|精通/.test(nameStr)) r = '稀有';
                    BuffTracker.add(nameStr.replace(/[★✦⭐💠]/g, '').trim(), r, '?');
                }
            }
            ensureStartMeditate();
            return true;
        }
        // ✅ 只在真正开始新一轮试炼时清除
        state.trialCount++;
        if (state.trialCount > 1 || isRetry) {
            BuffTracker.clear();
        }
        log.add(`开始第${state.trialCount}轮试炼`, 'success');
        const res = await apiCall('post', '/api/trial-tower/start', { useAdPoints: false });
        if (res?.code === 200) { await getTrialInfo(); ensureStartMeditate(); return true; }
        if (G('autoRetry').checked) { 
            const rr = await apiCall('post', '/api/trial-tower/start', { useAdPoints: false }); 
            if (rr?.code === 200) { await getTrialInfo(); ensureStartMeditate(); return true; } 
        }
        log.add('无法开始试炼', 'error'); return false;
    }

    async function fightBoss() {
        const res = await apiCall('post', '/api/trial-tower/fight');
        if (res?.code !== 200) return null;
        state.totalFights++; const d = res.data;
        if (d.trialStats) EffectTracker.updateFromServer(d.trialStats);
        if (d.logs?.length) log.add(`第${d.floor||'?'}层: ${d.logs[d.logs.length-1].substring(0,40)}`);
        return d;
    }

    function updateStatus(msg, type = 'running') {
        const sb = document.getElementById('at-status-box') || document.getElementById('tt-status-box');
        const st = document.getElementById('at-status-text') || document.getElementById('tt-status-text');
        const colors = { running: ['#f0f4ff', '#667eea'], stopped: ['#f5f5f5', '#888'], completed: ['#f0fff4', '#27ae60'] };
        if (sb && st && colors[type]) { sb.style.background = colors[type][0]; sb.style.color = colors[type][1]; st.textContent = `${type==='running'?'🔄':type==='stopped'?'⏸':'✅'} ${msg}`; }
        if (isMobile && fBtn) { state.running ? fBtn.classList.add('tt-running') : fBtn.classList.remove('tt-running'); }
    }

    async function runAutoTrial() {
        if (!state.running) return;
        const target = parseInt(G('target').value) || 0;
        try {
            updateStatus('启动中...', 'running');
            if (!await startTrial()) { stopAutoTrial(false); return; }
            let info = await getTrialInfo();
            if (!info) { stopAutoTrial(false); return; }
            state.currentFloor = info.activeFloor || 0;
            if (target > 0 && state.currentFloor >= target) { updateStatus(`已达目标`, 'completed'); stopAutoTrial(true); return; }
            if (info.pendingBuffs?.length) { await selectBuffWithRefresh(); await wait(300); }
            while (state.running) {
                if (target > 0 && state.currentFloor >= target) { updateStatus(`已达目标`, 'completed'); stopAutoTrial(true); return; }
                updateStatus(`挑战第${state.currentFloor+1}层`, 'running');
                const result = await fightBoss();
                if (!result) { await wait(2000); continue; }
                if (result.victory) {
                    state.currentFloor = result.floor || state.currentFloor + 1;
                    if (result.buffs?.length) {
                        log.add('🎁 获得天赋:\n' + formatBuffList(result.buffs), 'buff');
                        await wait(500);
                        const nfo = await getTrialInfo();
                        if (nfo?.pendingBuffs?.length) await selectBuffWithRefresh();
                        else {
                            const bb = chooseBestBuff(result.buffs);
                            await apiCall('post', '/api/trial-tower/choose-buff', { buffId: bb.id });
                            await getTrialInfo();
                        }
                        await wait(300);
                    }
                } else {
                    state.totalDeaths++; log.add(`第${state.currentFloor+1}层失败`, 'error');
                    if (G('autoRetry').checked) { 
                        await wait(1500); await ensureStopMeditate(); 
                        if (!state.running) return; 
                        BuffTracker.clear(); 
                        if (!await startTrial(true)) { stopAutoTrial(false); return; } 
                        state.currentFloor = 0; 
                    }
                    else { updateStatus(`失败于第${state.currentFloor+1}层`, 'stopped'); stopAutoTrial(false); return; }
                }
                await wait(800);
            }
        } catch(e) { stopAutoTrial(false); }
    }

    function startAutoTrial() {
        if (state.running) return;
        ensureStopMeditate().then(() => {
            state.running = true; state.totalFights = 0; state.totalDeaths = 0;
            G('start').disabled = true; G('stop').disabled = false;
            updateStatus('准备中...', 'running'); 
            log.clear(); 
            log.add('🚀 自动战斗启动', 'success');
            if (window.GameSettings && G('skipCombat')) window.GameSettings.skipCombat = G('skipCombat').checked;
            saveSettings(); showToast('🚀 自动挑战'); 
            runAutoTrial();
        }).catch(() => { log.add('启动失败', 'error'); });
    }

    // ✅ 修复：停止时不丢失天赋组合
    function stopAutoTrial(completed) {
        state.running = false; 
        G('start').disabled = false; 
        G('stop').disabled = true;
        if (state.totalFights > 0 && !completed) log.add(`📊 战斗${state.totalFights}次 抵达${state.currentFloor}层`);
        if (!completed) { 
            const s = BuffTracker.getSummary(); 
            if (s.total > 0) log.add(`🏆 当前天赋: ★${s.legendary} ◆${s.rare} ·${s.common}`, 'success'); 
        }
        updateStatus('就绪', 'stopped'); 
        ensureStartMeditate(); 
        // ✅ 恢复服务器数据但不清理本地天赋
        setTimeout(() => getTrialInfo(), 500);
    }

    function saveSettings() {
        Storage.save({ strategy: G('strategy').value, autoRetry: G('autoRetry').checked, skipCombat: G('skipCombat').checked, refreshWithGems: G('refreshGems').checked, targetFloor: parseInt(G('target').value)||0, btnPos: savedSettings.btnPos });
    }

    // ============ 事件绑定 ============
    G('start').addEventListener('click', e => { e.preventDefault(); startAutoTrial(); });
    G('stop').addEventListener('click', e => { e.preventDefault(); stopAutoTrial(false); updateStatus('已停止', 'stopped'); showToast('⏹ 已停止'); });
    if (isMobile) { G('start').addEventListener('touchend', e => { e.preventDefault(); startAutoTrial(); }); G('stop').addEventListener('touchend', e => { e.preventDefault(); stopAutoTrial(false); }); }
    G('refresh').addEventListener('click', async () => { await getTrialInfo(); showToast('🔄 已刷新'); });
    Object.values(IDS).forEach(id => { const el = document.getElementById(id); if (el) { el.addEventListener('change', saveSettings); if (el.type === 'checkbox') el.addEventListener('click', saveSettings); } });
    document.addEventListener('keydown', e => { if (e.ctrlKey && e.key === 't') { e.preventDefault(); state.running ? stopAutoTrial(false) : startAutoTrial(); } });

    window.AutoTrial = { start: startAutoTrial, stop: () => stopAutoTrial(false), refreshData: getTrialInfo, getState: () => ({ running: state.running, floor: state.currentFloor }) };
    if (typeof GM_registerMenuCommand !== 'undefined') { GM_registerMenuCommand('▶ 开始', startAutoTrial); GM_registerMenuCommand('⏹ 停止', () => stopAutoTrial(false)); GM_registerMenuCommand('🔄 刷新', getTrialInfo); }

    (async () => { await getTrialInfo(); console.log('✅ v4.2.8 已加载（修复天赋丢失）'); updateStatus('就绪', 'stopped'); })();
})();