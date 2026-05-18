// ==UserScript==
// @name         自动扫荡塔
// @namespace    https://github.com/yourname/lingverse-sweeper
// @version      1.0.5
// @description  一键扫荡试炼塔（自动收功），支持次数限制（0=不限，最大100万次）、扫荡间隔、灵石监控、屏幕常亮、面板置顶。扫荡消耗直接读取 nextRefreshCost。
// @author       耀
// @match        *://ling.muge.info/*
// @grant        none
// @run-at       document-end
// @downloadURL  https://gh-proxy.org/https://raw.githubusercontent.com/ming-a1/LingVerse-Script/main/Auto-Sweep-Tower.js
// @updateURL    https://gh-proxy.org/https://raw.githubusercontent.com/ming-a1/LingVerse-Script/main/Auto-Sweep-Tower.js
// ==/UserScript==

(function () {
    'use strict';

    // ---------- Token 检测 ----------
    function hasValidToken() {
        try {
            if (localStorage.getItem('token') && localStorage.getItem('token').length > 0) return true;
            if (typeof api !== 'undefined' && api.token && api.token.length > 0) return true;
            if (window.__token && window.__token.length > 0) return true;
        } catch (e) {}
        return false;
    }

    if (!hasValidToken()) {
        console.log('[自动扫荡塔] 未检测到有效 token，脚本未激活');
        return;
    }

    // ---------- 常量与工具函数 ----------
    const STORAGE_KEY = 'sweeper_config_v1';
    const POS_KEY = 'sweeper_position';
    const FLOAT_POS_KEY = 'sweeper_float_position';
    const COLLAPSED_KEY = 'sweeper_collapsed';
    const PC_COLLAPSED_KEY = 'sweeper_pc_collapsed';

    function loadJSON(key) { try { const r = localStorage.getItem(key); return r ? JSON.parse(r) : null; } catch (e) { return null; } }
    function saveJSON(key, val) { try { localStorage.setItem(key, JSON.stringify(val)); } catch (e) {} }
    function loadCollapsed() { try { return localStorage.getItem(COLLAPSED_KEY) === '1'; } catch (e) { return false; } }
    function saveCollapsed(collapsed) { try { localStorage.setItem(COLLAPSED_KEY, collapsed ? '1' : '0'); } catch (e) {} }
    function loadPcCollapsed() { try { return localStorage.getItem(PC_COLLAPSED_KEY) === '1'; } catch (e) { return false; } }
    function savePcCollapsed(collapsed) { try { localStorage.setItem(PC_COLLAPSED_KEY, collapsed ? '1' : '0'); } catch (e) {} }

    const isMobile = () => window.matchMedia('(max-width: 768px)').matches;
    const DEFAULT_PAGE_TITLE = document.title || 'LingVerse';

    // ---------- 状态 ----------
    const state = {
        isSweeping: false,
        stopRequested: false,
        sweepCount: 0,
        totalSweeps: 0,
        totalCostLingShi: 0,
        totalGainMap: 0,
        startTime: 0,
        maxSweepCount: 5,
        sweepIntervalMs: 1000,
        screenAlwaysOn: false,
        _wakeLock: null,
        lingShi: 0,
        bestFloor: 0,
        isPanelOpen: true,
        isCollapsed: false,
        isPinned: false,
    };

    function saveConfig() {
        saveJSON(STORAGE_KEY, {
            maxSweepCount: state.maxSweepCount,
            sweepIntervalMs: state.sweepIntervalMs,
            screenAlwaysOn: state.screenAlwaysOn,
        });
    }

    function loadConfig() {
        const c = loadJSON(STORAGE_KEY);
        if (c) {
            if (typeof c.maxSweepCount === 'number') state.maxSweepCount = Math.max(0, Math.min(1000000, c.maxSweepCount));
            if (typeof c.sweepIntervalMs === 'number') state.sweepIntervalMs = Math.max(100, Math.min(5000, c.sweepIntervalMs));
            if (typeof c.screenAlwaysOn === 'boolean') state.screenAlwaysOn = c.screenAlwaysOn;
        }
    }

    // ---------- Wake Lock ----------
    async function requestWakeLock() {
        if (!state.screenAlwaysOn || !('wakeLock' in navigator)) return;
        try {
            state._wakeLock = await navigator.wakeLock.request('screen');
            state._wakeLock.addEventListener('release', () => { state._wakeLock = null; });
            addLog('info', '屏幕常亮已开启');
        } catch (e) { addLog('warn', '屏幕常亮开启失败: ' + e.message); }
    }
    function releaseWakeLock() {
        if (state._wakeLock) { state._wakeLock.release(); state._wakeLock = null; addLog('info', '屏幕常亮已关闭'); }
    }
    function syncWakeLock() { if (state.screenAlwaysOn) requestWakeLock(); else releaseWakeLock(); }
    document.addEventListener('visibilitychange', () => { if (document.visibilityState === 'visible' && state.screenAlwaysOn && !state._wakeLock) requestWakeLock(); });

    // ---------- API 工具 ----------
    function withTimeout(promise, ms = 20000) {
        let timer;
        const timeout = new Promise((_, reject) => { timer = setTimeout(() => reject(new Error('请求超时')), ms); });
        return Promise.race([promise, timeout]).finally(() => clearTimeout(timer));
    }

    async function apiGet(path, retryCount = 0) {
        if (typeof api === 'undefined') throw new Error('API 未就绪');
        try {
            const res = await withTimeout(api.get(path));
            if (res && res.code === 429 && retryCount < 3) {
                await wait(5000);
                return apiGet(path, retryCount + 1);
            }
            return res;
        } catch (e) {
            if (retryCount < 3 && e.message?.includes('超时')) {
                await wait(3000 * (retryCount + 1));
                return apiGet(path, retryCount + 1);
            }
            throw e;
        }
    }

    async function apiPost(path, body, retryCount = 0) {
        if (typeof api === 'undefined') throw new Error('API 未就绪');
        try {
            const res = await withTimeout(api.post(path, body || {}));
            if (res && res.code === 429 && retryCount < 3) {
                await wait(5000);
                return apiPost(path, body, retryCount + 1);
            }
            return res;
        } catch (e) {
            if (retryCount < 3 && e.message?.includes('超时')) {
                await wait(3000 * (retryCount + 1));
                return apiPost(path, body, retryCount + 1);
            }
            throw e;
        }
    }

    function wait(ms) { return new Promise(r => setTimeout(r, ms)); }

    // ---------- 冥想检测与收功 ----------
    async function ensureNotMeditating(source = '扫荡前') {
        const dialogBtn = document.getElementById('gameDialogConfirmBtn');
        if (dialogBtn && dialogBtn.offsetParent !== null) {
            dialogBtn.click();
            addLog('info', `[${source}] 已点击确认弹窗`);
            await wait(3000);
            return true;
        }

        const stopBtn = document.querySelector('.btn-stop-meditate');
        if (stopBtn && stopBtn.offsetParent !== null && !stopBtn.disabled) {
            addLog('info', `[${source}] 检测到收功按钮，点击收功...`);
            stopBtn.click();
            await wait(500);
            const retryBtn = document.getElementById('gameDialogConfirmBtn');
            if (retryBtn && retryBtn.offsetParent !== null) retryBtn.click();
            await wait(3000);
            addLog('success', '收功完成');
            return true;
        }

        try {
            const sr = await apiGet('/api/game/meditate/status');
            if (sr?.code === 200 && sr.data?.isMeditating) {
                addLog('info', `[${source}] API 确认冥想中，收功...`);
                try { await apiPost('/api/game/meditate/stop'); } catch (e) {}
                await wait(500);
                const retryBtn = document.getElementById('gameDialogConfirmBtn');
                if (retryBtn && retryBtn.offsetParent !== null) retryBtn.click();
                await wait(3000);
                addLog('success', '收功完成');
                return true;
            }
        } catch (e) { addLog('warn', '冥想状态检查异常: ' + e.message); }
        return false;
    }

    // ---------- 获取玩家资源（只获取灵石）----------
    async function fetchPlayerResources() {
        try {
            const res = await apiGet('/api/player/info');
            if (res?.code === 200 && res.data) {
                state.lingShi = res.data.lowerStone ?? res.data.spiritStone ?? res.data.money ?? 0;
                updateResourceDisplay();
                return { lingShi: state.lingShi };
            }
        } catch (e) {
            addLog('warn', '获取玩家资源失败: ' + e.message);
        }
        return { lingShi: 0 };
    }

    // 格式化数字：万、百万、千万、亿
    function formatLingShi(value) {
        if (value >= 100000000) {
            return (value / 100000000).toFixed(2) + '亿';
        } else if (value >= 10000000) {
            return (value / 10000000).toFixed(2) + '千万';
        } else if (value >= 1000000) {
            return (value / 1000000).toFixed(2) + '百万';
        } else if (value >= 10000) {
            return (value / 10000).toFixed(2) + '万';
        } else {
            return Math.floor(value).toLocaleString();
        }
    }

    function updateResourceDisplay() {
        const lingShiEl = document.getElementById('sweeper-lingShi');
        if (lingShiEl) {
            lingShiEl.textContent = formatLingShi(state.lingShi);
            lingShiEl.title = state.lingShi.toLocaleString();
        }
    }

    function updateBestFloorDisplay() {
        const bestEl = document.getElementById('sweeper-best-floor');
        if (bestEl) bestEl.textContent = state.bestFloor || '--';
    }

    // ---------- 扫荡核心（修正：消耗从 nextRefreshCost 读取）----------
    async function performSweep() {
        let cost = 0;
        try {
            const infoRes = await apiGet('/api/trial-tower/info');
            if (infoRes?.code === 200 && infoRes.data) {
                cost = infoRes.data.nextRefreshCost || 0;
                if (cost === 0) {
                    addLog('warn', 'nextRefreshCost 为 0，可能无法扫荡');
                }
            } else {
                addLog('error', '获取扫荡消耗失败');
                return { success: false };
            }
        } catch (e) {
            addLog('error', '获取扫荡消耗异常: ' + (e.message || e));
            return { success: false };
        }

        try {
            const res = await apiPost('/api/trial-tower/sweep');
            if (res?.code === 200) {
                let reachedFloor = res.data?.reachedFloor ?? 0;
                if (reachedFloor === 0) {
                    const infoRes2 = await apiGet('/api/trial-tower/info');
                    if (infoRes2?.code === 200 && infoRes2.data) {
                        reachedFloor = infoRes2.data.activeFloor || 0;
                    }
                }
                addLog('success', `扫荡成功，抵达第 ${reachedFloor} 层`);

                if (reachedFloor > state.bestFloor) {
                    state.bestFloor = reachedFloor;
                    updateBestFloorDisplay();
                }

                let gainMap = 0;
                if (res.data?.rewardMaps !== undefined && res.data?.rewardMaps !== null) {
                    gainMap = res.data.rewardMaps;
                } else if (res.data?.treasureMap) {
                    gainMap = res.data.treasureMap;
                } else if (res.data?.treasureMapCount) {
                    gainMap = res.data.treasureMapCount;
                } else if (res.data?.items) {
                    const mapItem = res.data.items.find(i => i.name === '藏宝图' || i.id === 'treasure_map');
                    if (mapItem) gainMap = mapItem.count || mapItem.amount || 0;
                }

                await fetchPlayerResources();
                return { success: true, costLingShi: cost, gainMap, reachedFloor };
            } else {
                addLog('error', '扫荡失败: ' + (res?.message || '未知错误'));
                return { success: false };
            }
        } catch (e) {
            addLog('error', '扫荡异常: ' + (e.message || e));
            return { success: false };
        }
    }

    async function startAutoSweep() {
        if (state.isSweeping) return;
        state.isSweeping = true;
        state.stopRequested = false;
        state.sweepCount = 0;
        state.totalSweeps = 0;
        state.totalCostLingShi = 0;
        state.totalGainMap = 0;
        state.startTime = Date.now();

        const infoRes = await apiGet('/api/trial-tower/info');
        if (infoRes?.code === 200) {
            state.bestFloor = infoRes.data.bestFloor || 0;
            updateBestFloorDisplay();
        }

        toggleSweepButton(true);
        await ensureNotMeditating('开始扫荡');
        await fetchPlayerResources();

        addLog('gold', `════════ 开始自动扫荡 ════════`);
        addLog('info', `最大次数: ${state.maxSweepCount === 0 ? '不限' : state.maxSweepCount}，间隔: ${state.sweepIntervalMs}ms`);

        while (state.isSweeping && !state.stopRequested) {
            if (state.maxSweepCount > 0 && state.sweepCount >= state.maxSweepCount) {
                addLog('gold', `已达到最大扫荡次数 (${state.sweepCount}/${state.maxSweepCount})，停止扫荡`);
                break;
            }

            const result = await performSweep();
            if (!result.success) {
                addLog('error', '扫荡失败，终止自动扫荡');
                break;
            }

            state.sweepCount++;
            state.totalSweeps++;
            state.totalCostLingShi += result.costLingShi;
            state.totalGainMap += result.gainMap;
            addLog('info', `第 ${state.sweepCount} 次扫荡完成 | 消耗灵石 ${result.costLingShi} | 获得藏宝图 ${result.gainMap}`);

            if (state.maxSweepCount === 0 || state.sweepCount < state.maxSweepCount) {
                if (!state.stopRequested) await wait(state.sweepIntervalMs);
            }
        }

        const elapsedSec = ((Date.now() - state.startTime) / 1000).toFixed(1);
        addLog('gold', `════════ 扫荡结算 ════════`);
        addLog('gold', `✔ 扫荡次数: ${state.totalSweeps}`);
        addLog('gold', `✔ 消耗灵石: ${state.totalCostLingShi.toLocaleString()}`);
        addLog('gold', `✔ 获得藏宝图: ${state.totalGainMap}`);
        addLog('gold', `✔ 总耗时: ${elapsedSec} 秒`);
        addLog('gold', `══════════════════════════`);

        state.isSweeping = false;
        toggleSweepButton(false);
    }

    function stopAutoSweep() {
        if (!state.isSweeping) return;
        state.stopRequested = true;
        addLog('warn', '收到停止指令，将在当前扫荡完成后停止...');
    }

    function toggleSweepButton(sweeping) {
        const startBtn = document.getElementById('sweeper-btn-start');
        const stopBtn = document.getElementById('sweeper-btn-stop');
        if (startBtn && stopBtn) {
            if (sweeping) {
                startBtn.classList.add('hidden');
                stopBtn.classList.remove('hidden');
            } else {
                startBtn.classList.remove('hidden');
                stopBtn.classList.add('hidden');
            }
        }
    }

    // ---------- 配置界面 ----------
    let configOverlay = null;
    function openConfigModal() {
        if (configOverlay) {
            configOverlay.classList.remove('hidden');
            document.getElementById('cfg-max-sweep').value = state.maxSweepCount;
            document.getElementById('cfg-sweep-interval').value = state.sweepIntervalMs;
            document.getElementById('cfg-screen-always-on').checked = state.screenAlwaysOn;
            return;
        }

        const overlay = document.createElement('div');
        overlay.className = 'atp-config-overlay';
        overlay.id = 'sweeper-config-overlay';
        overlay.innerHTML = `
            <div class="atp-config-dialog">
                <div class="atp-config-header">
                    <span class="atp-config-title">⚙ 自动扫荡 · 配置</span>
                    <button class="atp-config-close" id="sweeper-config-close">✕</button>
                </div>
                <div class="atp-config-body">
                    <div class="atp-section-title">✦ 扫荡设置</div>
                    <div class="atp-toggle-row"><span>最大扫荡次数 (0=不限)</span><input type="number" id="cfg-max-sweep" value="${state.maxSweepCount}" min="0" max="1000000" style="width:90px;"></div>
                    <div class="atp-toggle-row" style="flex-wrap:wrap;"><span>扫荡间隔 (毫秒)</span><input type="number" id="cfg-sweep-interval" value="${state.sweepIntervalMs}" min="100" max="5000" step="100" style="width:90px;"><div id="interval-warn" style="width:100%;font-size:12px;color:#e7a33e;margin-top:4px;"></div></div>
                    <div class="atp-section-title">✦ 其他</div>
                    <label class="atp-toggle-row"><span>屏幕常亮</span><input type="checkbox" id="cfg-screen-always-on" ${state.screenAlwaysOn ? 'checked' : ''}></label>
                </div>
                <div class="atp-config-footer"><button class="atp-config-save-btn" id="sweeper-config-save">保 存 配 置</button></div>
            </div>
        `;
        document.body.appendChild(overlay);

        const intervalInput = overlay.querySelector('#cfg-sweep-interval');
        const warnDiv = overlay.querySelector('#interval-warn');
        const checkInterval = () => {
            const val = parseInt(intervalInput.value, 10);
            warnDiv.textContent = val <= 500 ? '⚠ 间隔 ≤500ms 可能触发反脚本机制，建议 ≥800ms' : '';
        };
        intervalInput.addEventListener('input', checkInterval);
        checkInterval();

        overlay.addEventListener('click', e => { if (e.target === overlay) closeConfigModal(); });
        overlay.querySelector('#sweeper-config-close').addEventListener('click', closeConfigModal);
        overlay.querySelector('#sweeper-config-save').addEventListener('click', () => {
            let maxVal = parseInt(overlay.querySelector('#cfg-max-sweep').value, 10);
            if (isNaN(maxVal)) maxVal = 5;
            state.maxSweepCount = Math.max(0, Math.min(1000000, maxVal));
            
            state.sweepIntervalMs = Math.max(100, Math.min(5000, parseInt(intervalInput.value, 10) || 1000));
            state.screenAlwaysOn = overlay.querySelector('#cfg-screen-always-on').checked;
            saveConfig();
            syncWakeLock();
            addLog('info', `配置已保存 (最大次数=${state.maxSweepCount===0?'不限':state.maxSweepCount}, 间隔=${state.sweepIntervalMs}ms)`);
            closeConfigModal();
        });
        configOverlay = overlay;
    }
    function closeConfigModal() { if (configOverlay) configOverlay.classList.add('hidden'); }

    // ---------- 拖拽功能 ----------
    function clamp(val, min, max) { return Math.max(min, Math.min(max, val)); }
    let _dragCleanups = [];
    function registerDragCleanup(fn) { _dragCleanups.push(fn); }

    function makeDraggable(handle, target, onEnd) {
        let d = false, sx, sy, ol, ot;
        function mv(e) {
            if (!d) return;
            const w = target.offsetWidth, h = target.offsetHeight;
            target.style.left = clamp(ol + e.clientX - sx, 0, innerWidth - w) + 'px';
            target.style.top = clamp(ot + e.clientY - sy, 0, innerHeight - h) + 'px';
        }
        function up() {
            if (!d) return;
            d = false;
            target.style.transition = '';
            const r = target.getBoundingClientRect();
            if (onEnd) onEnd({ left: clamp(r.left, 0, innerWidth - target.offsetWidth), top: clamp(r.top, 0, innerHeight - target.offsetHeight) });
        }
        function md(e) {
            if (e.button !== 0 || e.target.closest('button, input, select, textarea, label') || isMobile()) return;
            e.preventDefault();
            d = true;
            sx = e.clientX; sy = e.clientY;
            const r = target.getBoundingClientRect();
            ol = r.left; ot = r.top;
            target.style.transition = 'none';
            target.style.right = 'auto';
            target.style.bottom = 'auto';
            target.style.transform = 'none';
        }
        handle.addEventListener('mousedown', md);
        document.addEventListener('mousemove', mv);
        document.addEventListener('mouseup', up);
        registerDragCleanup(() => {
            handle.removeEventListener('mousedown', md);
            document.removeEventListener('mousemove', mv);
            document.removeEventListener('mouseup', up);
        });
    }

    function initFloatDraggable(btn) {
        let d = false, m = false, sx, sy, ol, ot;
        function s(cx, cy) {
            d = true; m = false;
            sx = cx; sy = cy;
            const r = btn.getBoundingClientRect();
            ol = r.left; ot = r.top;
            btn.style.transition = 'none';
            btn.style.left = ol + 'px';
            btn.style.top = ot + 'px';
            btn.style.right = 'auto';
            btn.style.bottom = 'auto';
            btn.style.transform = 'none';
        }
        function mvMouse(e) {
            if (!d) return;
            if (Math.abs(e.clientX - sx) > 2 || Math.abs(e.clientY - sy) > 2) m = true;
            btn.style.left = clamp(ol + e.clientX - sx, 0, innerWidth - 44) + 'px';
            btn.style.top = clamp(ot + e.clientY - sy, 0, innerHeight - 44) + 'px';
        }
        function mvTouch(e) {
            if (!d) return;
            e.preventDefault();
            const t = e.touches[0];
            if (Math.abs(t.clientX - sx) > 2 || Math.abs(t.clientY - sy) > 2) m = true;
            btn.style.left = clamp(ol + t.clientX - sx, 0, innerWidth - 44) + 'px';
            btn.style.top = clamp(ot + t.clientY - sy, 0, innerHeight - 44) + 'px';
        }
        function end() {
            if (!d) return;
            d = false;
            btn.style.transition = '';
            saveJSON(FLOAT_POS_KEY, {
                left: clamp(parseFloat(btn.style.left), 0, innerWidth - 44),
                top: clamp(parseFloat(btn.style.top), 0, innerHeight - 44)
            });
        }
        function md(e) {
            if (e.button !== 0) return;
            e.preventDefault();
            s(e.clientX, e.clientY);
        }
        function ts(e) {
            const t = e.touches[0];
            s(t.clientX, t.clientY);
        }
        btn.addEventListener('mousedown', md);
        btn.addEventListener('touchstart', ts, { passive: false });
        document.addEventListener('mousemove', mvMouse);
        document.addEventListener('mouseup', end);
        document.addEventListener('touchmove', mvTouch, { passive: false });
        document.addEventListener('touchend', end);
        registerDragCleanup(() => {
            btn.removeEventListener('mousedown', md);
            btn.removeEventListener('touchstart', ts);
            document.removeEventListener('mousemove', mvMouse);
            document.removeEventListener('mouseup', end);
            document.removeEventListener('touchmove', mvTouch);
            document.removeEventListener('touchend', end);
        });
        return { wasDragged: () => m, resetMoved: () => { m = false; } };
    }

    // ---------- 日志 ----------
    function addLog(type, message) {
        const logEl = document.getElementById('sweeper-log');
        if (!logEl) return;
        const time = new Date().toLocaleTimeString('zh-CN', { hour:'2-digit', minute:'2-digit', second:'2-digit' });
        const entry = document.createElement('div');
        entry.className = `atp-log-entry ${type}`;
        const isDark = !document.documentElement.classList.contains('theme-light');
        entry.innerHTML = `<span style="color:${isDark?'#6a6560':'#8a8278'};">[${time}]</span> ${message}`;
        logEl.appendChild(entry);
        entry.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
        while (logEl.children.length > 200) logEl.removeChild(logEl.firstChild);
    }

    function updateBreathingLight() {
        const pnl = document.getElementById('sweeper-panel');
        const btn = document.getElementById('sweeper-float-btn');
        if (!pnl || !btn) return;
        const panelHidden = state.isCollapsed || !state.isPanelOpen;
        if (state.isSweeping && panelHidden && !isMobile()) pnl.classList.add('breathing-blue');
        else pnl.classList.remove('breathing-blue');
        if (state.isSweeping && panelHidden) btn.classList.add('breathing');
        else btn.classList.remove('breathing');
    }

    function togglePin() {
        state.isPinned = !state.isPinned;
        const cnt = document.getElementById('sweeper-container');
        const btn = document.getElementById('sweeper-pin-btn');
        if (cnt) {
            if (state.isPinned) cnt.classList.add('atp-pinned');
            else cnt.classList.remove('atp-pinned');
        }
        if (btn) {
            if (state.isPinned) {
                btn.classList.add('pin-active');
                btn.textContent = '⇩';
                btn.title = '取消置顶';
            } else {
                btn.classList.remove('pin-active');
                btn.textContent = '⇧';
                btn.title = '面板置顶';
            }
        }
        addLog('info', state.isPinned ? '面板已置顶' : '面板已取消置顶');
    }

    // ---------- 构建面板（两列：历史最佳、灵石，无仙缘）----------
    function buildPanel() {
        _dragCleanups.forEach(fn => fn());
        _dragCleanups.length = 0;

        const container = document.createElement('div');
        container.className = 'atp-container';
        container.id = 'sweeper-container';
        const pos = loadJSON(POS_KEY);
        if (!isMobile() && pos) {
            container.style.left = clamp(pos.left, 0, innerWidth - 320) + 'px';
            container.style.top = clamp(pos.top, 0, innerHeight - 40) + 'px';
            container.style.right = 'auto';
            container.style.bottom = 'auto';
            container.style.transform = 'none';
        } else {
            container.style.top = '50%';
            container.style.right = '20px';
            container.style.transform = 'translateY(-50%)';
        }

        container.innerHTML = `
            <div class="atp-panel" id="sweeper-panel">
                <div class="atp-header" id="sweeper-header">
                    <span class="atp-title"><span class="atp-title-icon">⚔️</span><span>自动扫荡 v1.0.5</span></span>
                    <div class="atp-header-btns">
                        <button class="atp-header-btn" id="sweeper-pin-btn" title="面板置顶">⇧</button>
                        <button class="atp-header-btn" id="sweeper-config-btn" title="配置">⚙</button>
                        <button class="atp-header-btn" id="sweeper-collapse-btn" title="收起/展开">▼</button>
                    </div>
                </div>
                <div class="atp-body-wrap" id="sweeper-body-wrap">
                    <div class="atp-body">
                        <div class="atp-status-row">
                            <span class="atp-status-dot idle" id="sweeper-status-dot"></span>
                            <span class="atp-status-text" id="sweeper-status-text">就绪</span>
                        </div>
                        <div class="atp-stats" style="grid-template-columns:1fr 1fr;">
                            <div class="atp-stat-item"><div class="atp-stat-label">历史最佳</div><div class="atp-stat-value gold" id="sweeper-best-floor">--</div></div>
                            <div class="atp-stat-item"><div class="atp-stat-label">灵石</div><div class="atp-stat-value" id="sweeper-lingShi">--</div></div>
                        </div>
                        <div class="atp-actions">
                            <button class="atp-btn" id="sweeper-btn-start">一 键 扫 荡</button>
                            <button class="atp-btn stop hidden" id="sweeper-btn-stop">停 止 扫 荡</button>
                        </div>
                        <div class="atp-log" id="sweeper-log"></div>
                    </div>
                </div>
            </div>
        `;
        document.body.appendChild(container);

        const floatBtn = document.createElement('button');
        floatBtn.className = 'atp-float-btn';
        floatBtn.id = 'sweeper-float-btn';
        floatBtn.title = '自动扫荡塔';
        floatBtn.textContent = '⚔️';
        document.body.appendChild(floatBtn);

        apiGet('/api/trial-tower/info').then(res => {
            if (res?.code === 200) {
                state.bestFloor = res.data.bestFloor || 0;
                updateBestFloorDisplay();
            }
        }).catch(e => addLog('warn', '获取历史最佳失败: ' + e.message));
        fetchPlayerResources();

        const headerEl = document.getElementById('sweeper-header');
        const bodyWrap = document.getElementById('sweeper-body-wrap');
        makeDraggable(headerEl, container, pos => saveJSON(POS_KEY, pos));

        const fp = loadJSON(FLOAT_POS_KEY);
        if (fp) {
            floatBtn.style.left = clamp(fp.left, 0, innerWidth - 44) + 'px';
            floatBtn.style.top = clamp(fp.top, 0, innerHeight - 44) + 'px';
        } else {
            floatBtn.style.right = '16px';
            floatBtn.style.bottom = '100px';
        }
        const fd = initFloatDraggable(floatBtn);
        floatBtn.addEventListener('click', function () {
            if (fd.wasDragged()) { fd.resetMoved(); return; }
            const panel = document.getElementById('sweeper-panel');
            panel.classList.remove('hidden');
            floatBtn.classList.add('hidden');
            state.isPanelOpen = true;
            saveCollapsed(false);
            updateBreathingLight();
        });
        if (isMobile()) {
            floatBtn.classList.remove('hidden');
            if (loadCollapsed()) {
                document.getElementById('sweeper-panel').classList.add('hidden');
                state.isPanelOpen = false;
            }
        } else {
            floatBtn.classList.add('hidden');
        }
        if (!isMobile()) {
            const pcCollapsed = loadPcCollapsed();
            if (pcCollapsed) {
                state.isCollapsed = true;
                headerEl.classList.add('collapsed');
                bodyWrap.style.maxHeight = '0px';
            } else {
                state.isCollapsed = false;
                headerEl.classList.remove('collapsed');
                bodyWrap.style.maxHeight = '';
            }
        }
        document.getElementById('sweeper-collapse-btn').addEventListener('click', () => {
            if (isMobile()) {
                const panel = document.getElementById('sweeper-panel');
                panel.classList.add('hidden');
                floatBtn.classList.remove('hidden');
                state.isPanelOpen = false;
                saveCollapsed(true);
            } else {
                state.isCollapsed = !state.isCollapsed;
                savePcCollapsed(state.isCollapsed);
                if (state.isCollapsed) {
                    headerEl.classList.add('collapsed');
                    bodyWrap.style.maxHeight = '0px';
                } else {
                    headerEl.classList.remove('collapsed');
                    bodyWrap.style.maxHeight = '';
                }
            }
            updateBreathingLight();
        });

        document.getElementById('sweeper-btn-start').addEventListener('click', startAutoSweep);
        document.getElementById('sweeper-btn-stop').addEventListener('click', stopAutoSweep);
        document.getElementById('sweeper-config-btn').addEventListener('click', openConfigModal);
        document.getElementById('sweeper-pin-btn').addEventListener('click', togglePin);
    }

    // ---------- 样式与主题（保留原样）----------
    function injectStyles() {
        if (document.getElementById('sweeper-styles')) return;
        const style = document.createElement('style');
        style.id = 'sweeper-styles';
        style.textContent = `
            .atp-container { position: fixed; z-index: 99999; font-family: "Microsoft YaHei", 微软雅黑, "PingFang SC", "Helvetica Neue", sans-serif; }
            .atp-container.atp-pinned { z-index: 2147483647 !important; }
            .atp-panel { width: 320px; background: var(--atp-bg); border: 2px solid var(--atp-border); border-radius: 12px; box-shadow: var(--atp-shadow); overflow: hidden; display: flex; flex-direction: column; transition: box-shadow 0.5s, border-color 0.5s; }
            .atp-panel.breathing-blue { animation: atp-panel-breathe-blue 2s ease-in-out infinite; }
            @keyframes atp-panel-breathe-blue { 0%,100% { box-shadow: 0 0 12px rgba(74,192,224,0.3), 0 0 24px rgba(74,192,224,0.1); border-color: rgba(74,192,224,0.4); } 50% { box-shadow: 0 0 24px rgba(74,192,224,0.6), 0 0 48px rgba(74,192,224,0.2); border-color: rgba(74,192,224,0.9); } }
            .atp-header { display: flex; align-items: center; justify-content: space-between; padding: 10px 14px; background: var(--atp-header-bg); border-bottom: 2px solid var(--atp-border2); user-select: none; cursor: move; flex-shrink: 0; transition: all 0.3s; touch-action: none; -webkit-touch-callout: none; }
            .atp-header.collapsed { padding: 6px 14px; border-bottom: none; }
            .atp-header.collapsed .atp-title { font-size: 13px; }
            .atp-title { display: flex; align-items: center; gap: 8px; color: var(--atp-gold); font-size: 14px; font-weight: 700; letter-spacing: 2px; pointer-events: none; transition: all 0.3s; }
            .atp-title-icon { font-size: 16px; }
            .atp-header-btns { display: flex; gap: 6px; }
            .atp-header-btn { width: 28px; height: 28px; display: flex; align-items: center; justify-content: center; border: 2px solid var(--atp-btn-border); border-radius: 4px; background: var(--atp-btn-bg); color: var(--atp-gold); cursor: pointer; font-size: 16px; transition: all 0.2s; touch-action: manipulation; }
            .atp-header-btn:hover { background: var(--atp-btn-hover-bg); border-color: var(--atp-btn-hover-border); }
            .atp-header-btn.pin-active { background: var(--atp-pin-active-bg); border-color: var(--atp-pin-active-border); color: var(--atp-pin-active-color); }
            .atp-body-wrap { overflow: hidden; transition: max-height 0.3s; flex: 1; min-height: 0; display: flex; flex-direction: column; touch-action: pan-y; overscroll-behavior-y: contain; }
            .atp-body { padding: 14px; display: flex; flex-direction: column; gap: 10px; max-height: 55vh; overflow-y: auto; -webkit-overflow-scrolling: touch; flex: 1; min-height: 0; touch-action: pan-y; overscroll-behavior-y: contain; }
            .atp-body::-webkit-scrollbar { width: 4px; }
            .atp-body::-webkit-scrollbar-track { background: transparent; }
            .atp-body::-webkit-scrollbar-thumb { background: var(--atp-scrollbar-thumb); border-radius: 3px; }
            .atp-status-row { display: flex; align-items: center; gap: 8px; padding: 8px 10px; background: var(--atp-glass); border: 2px solid var(--atp-border3); border-radius: 6px; font-size: 12px; color: var(--atp-text2); }
            .atp-status-dot { width: 8px; height: 8px; border-radius: 50%; flex-shrink: 0; background: var(--atp-text3); transition: background 0.3s; }
            .atp-status-dot.idle { background: var(--atp-text3); }
            .atp-status-dot.running { background: #4ac0e0; box-shadow: 0 0 6px rgba(74,192,224,0.5); animation: atp-pulse 1.5s ease-in-out infinite; }
            .atp-status-dot.success { background: #3dab97; box-shadow: 0 0 6px rgba(61,171,151,0.5); }
            .atp-status-dot.error { background: #e06060; box-shadow: 0 0 6px rgba(224,96,96,0.5); }
            @keyframes atp-pulse { 0%,100%{opacity:1;} 50%{opacity:0.4;} }
            .atp-status-text { flex: 1; min-width: 0; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
            .atp-stats { display: grid; gap: 8px; flex-shrink: 0; }
            .atp-stat-item { padding: 10px 12px; background: var(--atp-glass); border: 2px solid var(--atp-border3); border-radius: 6px; text-align: center; }
            .atp-stat-label { font-size: 11px; color: var(--atp-text3); margin-bottom: 4px; letter-spacing: 1px; }
            .atp-stat-value { font-size: 20px; font-weight: 700; color: var(--atp-text); }
            .atp-stat-value.gold { color: var(--atp-gold); }
            .atp-actions { display: flex; flex-direction: column; gap: 8px; flex-shrink: 0; }
            .atp-btn { width: 100%; padding: 12px 10px; border: 2px solid var(--atp-action-border); border-radius: 6px; background: var(--atp-action-bg); color: var(--atp-gold2); font-family: inherit; font-size: 15px; font-weight: 700; letter-spacing: 3px; cursor: pointer; transition: all 0.2s; touch-action: manipulation; -webkit-tap-highlight-color: transparent; }
            .atp-btn:hover { background: var(--atp-action-hover-bg); border-color: var(--atp-action-hover-border); }
            .atp-btn:active { transform: scale(0.97); }
            .atp-btn:disabled { opacity: 0.4; cursor: not-allowed; }
            .atp-log { margin-top: 4px; padding: 8px 10px; background: var(--atp-log-bg); border: 2px solid var(--atp-log-border); border-radius: 6px; height: 180px; min-height: 180px; max-height: 180px; overflow-y: auto; font-size: 11px; color: var(--atp-text3); line-height: 1.6; font-family: Consolas, "Microsoft YaHei", monospace; flex-shrink: 0; }
            .atp-log-entry { padding: 1px 0; word-break: break-all; white-space: pre-wrap; }
            .atp-log-entry.info { color: var(--atp-text3); }
            .atp-log-entry.warn { color: #c88820; }
            .atp-log-entry.success { color: var(--atp-jade); }
            .atp-log-entry.error { color: var(--atp-red); }
            .atp-log-entry.gold { color: var(--atp-gold); font-weight: bold; }
            .atp-config-overlay { position: fixed; inset: 0; z-index: 100000; background: rgba(0,0,0,0.5); display: flex; align-items: center; justify-content: center; padding: 16px; }
            .atp-config-dialog { width: 380px; max-width: 100%; max-height: 85vh; background: var(--atp-bg); border: 2px solid var(--atp-border); border-radius: 12px; box-shadow: var(--atp-config-shadow); overflow: hidden; display: flex; flex-direction: column; touch-action: none; }
            .atp-config-header { display: flex; align-items: center; justify-content: space-between; padding: 14px 16px; background: var(--atp-header-bg); border-bottom: 2px solid var(--atp-border2); flex-shrink: 0; }
            .atp-config-title { color: var(--atp-gold); font-size: 16px; font-weight: 700; letter-spacing: 2px; }
            .atp-config-close { width: 32px; height: 32px; display: flex; align-items: center; justify-content: center; border: 2px solid var(--atp-btn-border); border-radius: 4px; background: var(--atp-btn-bg); color: var(--atp-gold); cursor: pointer; font-size: 18px; transition: all 0.2s; touch-action: manipulation; }
            .atp-config-body { padding: 16px; display: flex; flex-direction: column; gap: 10px; overflow-y: auto; flex: 1; -webkit-overflow-scrolling: touch; touch-action: pan-y; }
            .atp-section-title { font-size: 12px; color: var(--atp-text3); letter-spacing: 2px; padding: 4px 0; border-bottom: 1px solid var(--atp-border3); }
            .atp-toggle-row { display: flex; align-items: center; justify-content: space-between; padding: 12px 14px; background: var(--atp-glass); border: 2px solid var(--atp-border3); border-radius: 6px; font-size: 14px; color: var(--atp-text2); user-select: none; transition: all 0.15s; touch-action: manipulation; -webkit-tap-highlight-color: transparent; }
            .atp-toggle-row input[type="checkbox"] { accent-color: var(--atp-accent-check); width: 18px; height: 18px; cursor: pointer; flex-shrink: 0; }
            .atp-toggle-row input[type="number"] { width: 65px; padding: 6px 8px; background: var(--atp-bg2); border: 2px solid var(--atp-input-border); border-radius: 4px; color: var(--atp-text); text-align: center; font-family: inherit; font-size: 14px; flex-shrink: 0; }
            .atp-config-footer { padding: 12px 16px; border-top: 2px solid var(--atp-config-footer-border); flex-shrink: 0; }
            .atp-config-save-btn { width: 100%; padding: 14px 10px; border: 2px solid var(--atp-action-border); border-radius: 6px; background: var(--atp-action-bg); color: var(--atp-gold2); font-family: inherit; font-size: 16px; font-weight: 700; letter-spacing: 3px; cursor: pointer; touch-action: manipulation; }
            .atp-float-btn { position: fixed; width: 44px; height: 44px; border-radius: 50%; background: var(--atp-float-bg); border: 2px solid var(--atp-border); color: var(--atp-gold); font-size: 20px; cursor: grab; z-index: 99998; display: flex; align-items: center; justify-content: center; user-select: none; -webkit-user-select: none; transition: box-shadow 0.5s, border-color 0.5s; touch-action: none; -webkit-touch-callout: none; }
            .atp-float-btn.breathing { animation: atp-float-breathe 2s ease-in-out infinite; }
            @keyframes atp-float-breathe { 0%,100% { box-shadow: 0 0 12px rgba(102,187,106,0.4), 0 0 24px rgba(102,187,106,0.15); border-color: #66bb6a; } 50% { box-shadow: 0 0 24px rgba(102,187,106,0.8), 0 0 48px rgba(102,187,106,0.35); border-color: #81c784; } }
            .hidden { display: none !important; }
            @media (max-width: 768px) {
                .atp-container { top: auto !important; bottom: 0 !important; right: 0 !important; left: 0 !important; transform: none !important; }
                .atp-panel { width: 100%; max-height: 70vh; border-radius: 14px 14px 0 0; border-bottom: none; display: flex; flex-direction: column; overflow: hidden; }
                .atp-header { padding: 14px 16px; flex-shrink: 0; cursor: default; }
                .atp-header.collapsed { padding: 8px 16px; }
                .atp-title { font-size: 16px; }
                .atp-header-btn { width: 32px; height: 32px; font-size: 18px; }
                .atp-body-wrap { flex: 1; min-height: 0; overflow-y: auto; -webkit-overflow-scrolling: touch; touch-action: pan-y; overscroll-behavior-y: contain; }
                .atp-body { padding: 12px 14px; gap: 10px; max-height: none; overflow: visible; flex: none; }
                .atp-stat-value { font-size: 22px; }
                .atp-btn { padding: 14px 10px; font-size: 16px; }
                .atp-log { height: 260px; min-height: 260px; max-height: 260px; flex-shrink: 0; }
                .atp-float-btn { width: 44px; height: 44px; font-size: 20px; }
                .atp-config-overlay { padding: 0; align-items: flex-end; }
                .atp-config-dialog { width: 100%; max-width: 100%; max-height: 85vh; border-radius: 14px 14px 0 0; border-bottom: none; }
                .atp-toggle-row { padding: 14px 16px; font-size: 14px; }
                .atp-config-save-btn { padding: 16px 10px; font-size: 17px; }
            }
        `;
        document.head.appendChild(style);
    }

    function updateThemeStyle() {
        const html = document.documentElement;
        const isLight = html.classList.contains('theme-light');
        const isDark = !isLight;
        const vars = {
            '--atp-bg': isDark ? '#151d2e' : '#faf8f5',
            '--atp-bg2': isDark ? '#111827' : '#f5f0e8',
            '--atp-border': isDark ? 'rgba(201,153,58,0.45)' : 'rgba(180,140,50,0.5)',
            '--atp-border2': isDark ? 'rgba(201,153,58,0.3)' : 'rgba(180,140,50,0.35)',
            '--atp-border3': isDark ? 'rgba(201,153,58,0.18)' : 'rgba(180,140,50,0.2)',
            '--atp-gold': isDark ? '#c9993a' : '#8b6914',
            '--atp-gold2': isDark ? '#c9993a' : '#7a5c10',
            '--atp-text': isDark ? '#e8e0d0' : '#3d3328',
            '--atp-text2': isDark ? '#a8a090' : '#5a5246',
            '--atp-text3': isDark ? '#6a6560' : '#8a8278',
            '--atp-jade': isDark ? '#3dab97' : '#2d8a78',
            '--atp-red': isDark ? '#e06060' : '#c04040',
            '--atp-glass': isDark ? 'rgba(255,255,255,0.02)' : 'rgba(0,0,0,0.02)',
            '--atp-glass2': isDark ? 'rgba(255,255,255,0.01)' : 'rgba(0,0,0,0.01)',
            '--atp-border-glass': isDark ? 'rgba(255,255,255,0.04)' : 'rgba(0,0,0,0.04)',
            '--atp-shadow': isDark ? '0 0 30px rgba(0,0,0,0.6)' : '0 0 30px rgba(0,0,0,0.12)',
            '--atp-config-shadow': isDark ? '0 0 40px rgba(0,0,0,0.7)' : '0 0 40px rgba(0,0,0,0.2)',
            '--atp-header-bg': isDark ? 'linear-gradient(90deg, rgba(201,153,58,0.12) 0%, rgba(201,153,58,0.06) 100%)' : 'linear-gradient(90deg, rgba(180,140,50,0.1) 0%, rgba(180,140,50,0.04) 100%)',
            '--atp-btn-border': isDark ? 'rgba(201,153,58,0.4)' : 'rgba(180,140,50,0.45)',
            '--atp-btn-bg': isDark ? 'rgba(201,153,58,0.08)' : 'rgba(180,140,50,0.06)',
            '--atp-btn-hover-bg': isDark ? 'rgba(201,153,58,0.2)' : 'rgba(180,140,50,0.16)',
            '--atp-btn-hover-border': isDark ? 'rgba(201,153,58,0.6)' : 'rgba(180,140,50,0.7)',
            '--atp-pin-active-bg': isDark ? 'rgba(255,215,0,0.25)' : 'rgba(200,160,30,0.25)',
            '--atp-pin-active-border': isDark ? 'rgba(255,215,0,0.7)' : 'rgba(200,160,30,0.7)',
            '--atp-pin-active-color': isDark ? '#ffd700' : '#b8960d',
            '--atp-scrollbar-thumb': isDark ? 'rgba(201,153,58,0.15)' : 'rgba(180,140,50,0.15)',
            '--atp-action-bg': isDark ? 'linear-gradient(180deg, rgba(201,153,58,0.12) 0%, rgba(201,153,58,0.04) 100%)' : 'linear-gradient(180deg, rgba(180,140,50,0.1) 0%, rgba(180,140,50,0.03) 100%)',
            '--atp-action-border': isDark ? 'rgba(201,153,58,0.4)' : 'rgba(180,140,50,0.5)',
            '--atp-action-hover-bg': isDark ? 'linear-gradient(180deg, rgba(201,153,58,0.2) 0%, rgba(201,153,58,0.08) 100%)' : 'linear-gradient(180deg, rgba(180,140,50,0.18) 0%, rgba(180,140,50,0.06) 100%)',
            '--atp-action-hover-border': isDark ? 'rgba(201,153,58,0.7)' : 'rgba(180,140,50,0.8)',
            '--atp-log-bg': isDark ? 'rgba(0,0,0,0.3)' : 'rgba(0,0,0,0.04)',
            '--atp-log-border': isDark ? 'rgba(201,153,58,0.2)' : 'rgba(180,140,50,0.22)',
            '--atp-accent-check': isDark ? '#c9993a' : '#b48c32',
            '--atp-input-border': isDark ? 'rgba(201,153,58,0.25)' : 'rgba(180,140,50,0.3)',
            '--atp-config-footer-border': isDark ? 'rgba(201,153,58,0.22)' : 'rgba(180,140,50,0.25)',
            '--atp-float-bg': isDark ? 'linear-gradient(135deg, rgba(201,153,58,0.2) 0%, rgba(201,153,58,0.1) 100%)' : 'linear-gradient(135deg, rgba(180,140,50,0.18) 0%, rgba(180,140,50,0.08) 100%)',
        };
        for (const [k, v] of Object.entries(vars)) document.documentElement.style.setProperty(k, v);
    }
    function initThemeWatcher() {
        const observer = new MutationObserver(() => updateThemeStyle());
        observer.observe(document.documentElement, { attributes: true, attributeFilter: ['class'] });
        updateThemeStyle();
    }

    // ---------- 初始化 ----------
    function init() {
        if (document.getElementById('sweeper-container')) return;
        injectStyles();
        initThemeWatcher();
        loadConfig();
        syncWakeLock();
        buildPanel();
        addLog('info', '自动扫荡塔 v1.0.5 已就绪');
        addLog('info', 'Token 验证通过');
    }

    window.addEventListener('beforeunload', () => {
        releaseWakeLock();
        _dragCleanups.forEach(fn => fn());
    });

    if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init);
    else init();
})();