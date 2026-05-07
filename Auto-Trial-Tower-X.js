// ==UserScript==
// @name         自动试炼塔[X]
// @namespace    https://github.com/yourname/lingverse-trial-tower
// @version      1.6.0
// @description  智能天赋选择(暴击优先/特殊词条排序)，自动挑战/重试/冥想处理，浏览器标题显示层数，天赋权重自配，主题日夜切换，蓝色呼吸灯提示，PC端标题栏收起/移动端悬浮球，面板位置记忆
// @author       耀
// @match        *://ling.muge.info/*
// @grant        none
// @run-at       document-end
// @downloadURL  https://v6.gh-proxy.org/https://raw.githubusercontent.com/ming-a1/LingVerse-Script/main/Auto-Trial-Tower-X.js
// @updateURL    https://v6.gh-proxy.org/https://raw.githubusercontent.com/ming-a1/LingVerse-Script/main/Auto-Trial-Tower-X.js
// ==/UserScript==

(function () {
    'use strict';

    if (typeof window === 'undefined' || typeof window.__S === 'undefined' || !window.__S) {
        console.log('[自动试炼塔] 盐值未获取，脚本未激活');
        return;
    }

    const STORAGE_KEY = 'atp_config';
    const POS_KEY = 'atp_position';
    const FLOAT_POS_KEY = 'atp_float_position';
    const COLLAPSED_KEY = 'atp_collapsed';
    const THEME_KEY = 'atp_theme';

    function loadJSON(key) { try { const r = localStorage.getItem(key); return r ? JSON.parse(r) : null; } catch (e) { return null; } }
    function saveJSON(key, val) { try { localStorage.setItem(key, JSON.stringify(val)); } catch (e) {} }
    function loadCollapsed() { try { return localStorage.getItem(COLLAPSED_KEY) === '1'; } catch (e) { return false; } }
    function saveCollapsed(collapsed) { try { localStorage.setItem(COLLAPSED_KEY, collapsed ? '1' : '0'); } catch (e) {} }
    function loadTheme() { try { return localStorage.getItem(THEME_KEY) || 'dark'; } catch (e) { return 'dark'; } }
    function saveTheme(theme) { try { localStorage.setItem(THEME_KEY, theme); } catch (e) {} }

    const isMobile = () => window.matchMedia('(max-width: 768px)').matches;

    let currentTheme = loadTheme();
    const DEFAULT_PAGE_TITLE = document.title || 'LingVerse';

    const DEFAULT_WEIGHTS = {
        '斩杀': 95, '不死': 100, '天怒': 90, '灵根共鸣': 85, '天道汲取': 80,
        '暴击': 50, '攻击': 30, '生命': 25, '防御': 20, '灵力': 10,
        '血量': 22, '回血': 18, '技能触发': 15,
    };
    const WEIGHT_KEYS_SPECIAL = ['斩杀', '不死', '天怒', '灵根共鸣', '天道汲取'];
    const WEIGHT_KEYS_NORMAL = ['暴击', '攻击', '生命', '防御', '灵力', '血量', '回血', '技能触发'];

    function getDefaultWeight(name, desc, isCritFull) {
        const text = (name + ' ' + (desc || '')).toLowerCase();
        if (text.includes('不死')) return 100;
        if (text.includes('斩杀')) return 95;
        if (text.includes('天怒')) return 90;
        if (text.includes('天道汲取')) return 85;
        if (text.includes('灵根共鸣')) return 80;
        if (isCritFull) {
            if (text.includes('攻击') || text.includes('伤害') || text.includes('会心')) return 50;
            if (text.includes('生命') || text.includes('血量')) return 40;
            if (text.includes('防御') || text.includes('减伤') || text.includes('护盾') || text.includes('水盾') || text.includes('土壁')) return 30;
            if (text.includes('灵力') || text.includes('法力') || text.includes('灵气')) return 20;
            if (text.includes('暴击')) return 1;
            if (text.includes('回血') || text.includes('回复') || text.includes('恢复') || text.includes('再生')) return 12;
            if (text.includes('技能触发')) return 15;
            return 10;
        } else {
            if (text.includes('暴击')) return 90;
            if (text.includes('攻击') || text.includes('伤害') || text.includes('会心')) return 50;
            if (text.includes('生命') || text.includes('血量')) return 40;
            if (text.includes('防御') || text.includes('减伤') || text.includes('护盾') || text.includes('水盾') || text.includes('土壁')) return 30;
            if (text.includes('灵力') || text.includes('法力') || text.includes('灵气')) return 20;
            if (text.includes('回血') || text.includes('回复') || text.includes('恢复') || text.includes('再生')) return 12;
            if (text.includes('技能触发')) return 15;
            return 10;
        }
    }

    let _retainedBuffs = []; let _retainedStats = null;

    const style = document.createElement('style');
    style.id = 'atp-theme-style';
    document.head.appendChild(style);

    function updateThemeStyle() {
        const isDark = currentTheme === 'dark' || (currentTheme === 'system' && window.matchMedia('(prefers-color-scheme: dark)').matches);
        const bg = isDark ? '#151d2e' : '#faf8f5';
        const bg2 = isDark ? '#111827' : '#f5f0e8';
        const border = isDark ? 'rgba(201,153,58,0.45)' : 'rgba(180,140,50,0.5)';
        const border2 = isDark ? 'rgba(201,153,58,0.3)' : 'rgba(180,140,50,0.35)';
        const border3 = isDark ? 'rgba(201,153,58,0.18)' : 'rgba(180,140,50,0.2)';
        const gold = isDark ? '#c9993a' : '#8b6914';
        const gold2 = isDark ? '#c9993a' : '#7a5c10';
        const text = isDark ? '#e8e0d0' : '#3d3328';
        const text2 = isDark ? '#a8a090' : '#5a5246';
        const text3 = isDark ? '#6a6560' : '#8a8278';
        const jade = isDark ? '#3dab97' : '#2d8a78';
        const red = isDark ? '#e06060' : '#c04040';
        const red2 = isDark ? '#e06060' : '#b54040';
        const bgGlass = isDark ? 'rgba(255,255,255,0.02)' : 'rgba(0,0,0,0.02)';
        const bgGlass2 = isDark ? 'rgba(255,255,255,0.01)' : 'rgba(0,0,0,0.01)';
        const borderGlass = isDark ? 'rgba(255,255,255,0.04)' : 'rgba(0,0,0,0.04)';

        style.textContent = `
        .atp-container { position: fixed; z-index: 99999; font-family: "Microsoft YaHei", 微软雅黑, "PingFang SC", "Helvetica Neue", sans-serif; }
        .atp-panel { width: 320px; background: ${bg}; border: 2px solid ${border}; border-radius: 12px; box-shadow: ${isDark ? '0 0 30px rgba(0,0,0,0.6)' : '0 0 30px rgba(0,0,0,0.12)'}; overflow: hidden; display: flex; flex-direction: column; transition: box-shadow 0.5s, border-color 0.5s; }
        .atp-panel.breathing-blue { animation: atp-panel-breathe-blue 2s ease-in-out infinite; }
        @keyframes atp-panel-breathe-blue {
            0%,100% { box-shadow: 0 0 12px rgba(74,192,224,0.3), 0 0 24px rgba(74,192,224,0.1); border-color: rgba(74,192,224,0.4); }
            50%     { box-shadow: 0 0 24px rgba(74,192,224,0.6), 0 0 48px rgba(74,192,224,0.2); border-color: rgba(74,192,224,0.9); }
        }
        .atp-header { display: flex; align-items: center; justify-content: space-between; padding: 10px 14px; background: ${isDark ? 'linear-gradient(90deg, rgba(201,153,58,0.12) 0%, rgba(201,153,58,0.06) 100%)' : 'linear-gradient(90deg, rgba(180,140,50,0.1) 0%, rgba(180,140,50,0.04) 100%)'}; border-bottom: 2px solid ${border2}; user-select: none; cursor: move; flex-shrink: 0; transition: all 0.3s; touch-action: none; -webkit-touch-callout: none; }
        .atp-header.collapsed { padding: 6px 14px; border-bottom: none; }
        .atp-header.collapsed .atp-title { font-size: 13px; }
        .atp-title { display: flex; align-items: center; gap: 8px; color: ${gold}; font-size: 14px; font-weight: 700; letter-spacing: 2px; pointer-events: none; transition: all 0.3s; }
        .atp-title-icon { font-size: 16px; }
        .atp-header-btns { display: flex; gap: 6px; }
        .atp-header-btn { width: 28px; height: 28px; display: flex; align-items: center; justify-content: center; border: 2px solid ${isDark ? 'rgba(201,153,58,0.4)' : 'rgba(180,140,50,0.45)'}; border-radius: 4px; background: ${isDark ? 'rgba(201,153,58,0.08)' : 'rgba(180,140,50,0.06)'}; color: ${gold}; cursor: pointer; font-size: 16px; transition: all 0.2s; touch-action: manipulation; }
        .atp-header-btn:hover { background: ${isDark ? 'rgba(201,153,58,0.2)' : 'rgba(180,140,50,0.16)'}; border-color: ${isDark ? 'rgba(201,153,58,0.6)' : 'rgba(180,140,50,0.7)'}; }
        .atp-body-wrap { overflow: hidden; transition: max-height 0.3s; flex: 1; min-height: 0; display: flex; flex-direction: column; touch-action: pan-y; overscroll-behavior-y: contain; }
        .atp-body { padding: 14px; display: flex; flex-direction: column; gap: 10px; max-height: 55vh; overflow-y: auto; -webkit-overflow-scrolling: touch; flex: 1; min-height: 0; touch-action: pan-y; overscroll-behavior-y: contain; }
        .atp-body::-webkit-scrollbar { width: 4px; }
        .atp-body::-webkit-scrollbar-track { background: transparent; }
        .atp-body::-webkit-scrollbar-thumb { background: ${isDark ? 'rgba(201,153,58,0.15)' : 'rgba(180,140,50,0.15)'}; border-radius: 3px; }
        .atp-status-row { display: flex; align-items: center; gap: 8px; padding: 8px 10px; background: ${bgGlass}; border: 2px solid ${border3}; border-radius: 6px; font-size: 12px; color: ${text2}; }
        .atp-status-dot { width: 8px; height: 8px; border-radius: 50%; flex-shrink: 0; background: ${text3}; transition: background 0.3s; }
        .atp-status-dot.idle { background: ${text3}; }
        .atp-status-dot.running { background: #4ac0e0; box-shadow: 0 0 6px rgba(74,192,224,0.5); animation: atp-pulse 1.5s ease-in-out infinite; }
        .atp-status-dot.success { background: #3dab97; box-shadow: 0 0 6px rgba(61,171,151,0.5); }
        .atp-status-dot.error { background: #e06060; box-shadow: 0 0 6px rgba(224,96,96,0.5); }
        @keyframes atp-pulse { 0%,100%{opacity:1;} 50%{opacity:0.4;} }
        .atp-status-text { flex: 1; min-width: 0; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
        .atp-stats { display: grid; grid-template-columns: 1fr 1fr; gap: 8px; flex-shrink: 0; }
        .atp-stat-item { padding: 10px 12px; background: ${bgGlass}; border: 2px solid ${border3}; border-radius: 6px; text-align: center; }
        .atp-stat-label { font-size: 11px; color: ${text3}; margin-bottom: 4px; letter-spacing: 1px; }
        .atp-stat-value { font-size: 20px; font-weight: 700; color: ${text}; }
        .atp-stat-value.gold { color: ${gold}; }

        .atp-buffs-panel { background: ${bgGlass}; border: 2px solid ${isDark ? 'rgba(201,153,58,0.22)' : 'rgba(180,140,50,0.25)'}; border-radius: 6px; flex-shrink: 0; }
        .atp-buffs-header { display: flex; align-items: center; justify-content: center; padding: 8px 10px; font-size: 11px; color: ${text3}; letter-spacing: 1px; cursor: pointer; user-select: none; border-bottom: 1px solid transparent; transition: all 0.2s; flex-shrink: 0; }
        .atp-buffs-header.expanded { border-bottom-color: ${border3}; }
        .atp-buffs-header-text { flex: 1; text-align: center; }
        .atp-buffs-arrow { flex-shrink: 0; margin-left: auto; }
        .atp-buffs-body { overflow: hidden; padding: 0 10px; max-height: 0; transition: max-height 0.3s, padding 0.3s; }
        .atp-buffs-body.expanded { max-height: 300px; padding: 10px; }
        .atp-bonus-row { font-size: 11px; line-height: 2; color: ${text2}; min-height: 20px; display: flex; flex-wrap: wrap; justify-content: center; }
        .atp-bonus-empty { font-size: 11px; color: ${text3}; font-style: italic; }
        .atp-bonus-row .atp-bonus-item { margin: 0 7px; white-space: nowrap; }
        .atp-bonus-row .atp-bonus-item .val { font-weight: 700; }
        .atp-bonus-row .atp-bonus-item .val.positive { color: ${jade}; }
        .atp-special-row { font-size: 11px; line-height: 1.5; padding-top: 6px; display: flex; flex-wrap: wrap; align-items: center; justify-content: center; gap: 4px; }
        .atp-special-row .atp-special-label { color: #ff6040; margin-right: 4px; font-weight: 700; }
        .atp-buff-tags { display: flex; flex-wrap: wrap; gap: 4px; padding-top: 6px; justify-content: center; }
        .atp-buff-tag { padding: 2px 7px; border-radius: 4px; font-size: 10px; background: ${isDark ? 'rgba(201,153,58,0.1)' : 'rgba(180,140,50,0.08)'}; border: 1px solid ${isDark ? 'rgba(201,153,58,0.25)' : 'rgba(180,140,50,0.3)'}; color: ${gold}; white-space: nowrap; }
        .atp-buff-tag.special { background: ${isDark ? 'rgba(255,80,50,0.12)' : 'rgba(200,80,50,0.08)'}; border-color: ${isDark ? 'rgba(255,80,50,0.35)' : 'rgba(200,80,50,0.4)'}; color: ${isDark ? '#ff6040' : '#b54040'}; }

        .atp-actions { display: flex; flex-direction: column; gap: 8px; flex-shrink: 0; }
        .atp-btn { width: 100%; padding: 12px 10px; border: 2px solid ${isDark ? 'rgba(201,153,58,0.4)' : 'rgba(180,140,50,0.5)'}; border-radius: 6px; background: ${isDark ? 'linear-gradient(180deg, rgba(201,153,58,0.12) 0%, rgba(201,153,58,0.04) 100%)' : 'linear-gradient(180deg, rgba(180,140,50,0.1) 0%, rgba(180,140,50,0.03) 100%)'}; color: ${gold2}; font-family: inherit; font-size: 15px; font-weight: 700; letter-spacing: 3px; cursor: pointer; transition: all 0.2s; touch-action: manipulation; -webkit-tap-highlight-color: transparent; }
        .atp-btn:hover { background: ${isDark ? 'linear-gradient(180deg, rgba(201,153,58,0.2) 0%, rgba(201,153,58,0.08) 100%)' : 'linear-gradient(180deg, rgba(180,140,50,0.18) 0%, rgba(180,140,50,0.06) 100%)'}; border-color: ${isDark ? 'rgba(201,153,58,0.7)' : 'rgba(180,140,50,0.8)'}; }
        .atp-btn:active { transform: scale(0.97); }
        .atp-btn.stop { background: ${isDark ? 'linear-gradient(180deg, rgba(224,96,96,0.12) 0%, rgba(224,96,96,0.04) 100%)' : 'linear-gradient(180deg, rgba(200,80,80,0.1) 0%, rgba(200,80,80,0.03) 100%)'}; border-color: ${isDark ? 'rgba(224,96,96,0.4)' : 'rgba(200,80,80,0.5)'}; color: ${red2}; }
        .atp-btn:disabled { opacity: 0.4; cursor: not-allowed; }

        .atp-log { margin-top: 4px; padding: 8px 10px; background: ${isDark ? 'rgba(0,0,0,0.3)' : 'rgba(0,0,0,0.04)'}; border: 2px solid ${isDark ? 'rgba(201,153,58,0.2)' : 'rgba(180,140,50,0.22)'}; border-radius: 6px; height: 180px; min-height: 180px; max-height: 180px; overflow-y: auto; font-size: 11px; color: ${text3}; line-height: 1.6; font-family: Consolas, "Microsoft YaHei", monospace; flex-shrink: 0; }
        .atp-log-entry { padding: 1px 0; word-break: break-all; white-space: pre-wrap; }
        .atp-log-entry.info { color: ${text3}; }
        .atp-log-entry.warn { color: #c88820; }
        .atp-log-entry.success { color: ${jade}; }
        .atp-log-entry.error { color: ${red}; }
        .atp-log-entry.gold { color: ${gold}; font-weight: bold; }

        .atp-config-overlay { position: fixed; inset: 0; z-index: 100000; background: rgba(0,0,0,0.5); display: flex; align-items: center; justify-content: center; font-family: "Microsoft YaHei", 微软雅黑, "PingFang SC", "Helvetica Neue", sans-serif; padding: 16px; }
        .atp-config-dialog { width: 380px; max-width: 100%; max-height: 85vh; background: ${bg}; border: 2px solid ${border}; border-radius: 12px; box-shadow: ${isDark ? '0 0 40px rgba(0,0,0,0.7)' : '0 0 40px rgba(0,0,0,0.2)'}; overflow: hidden; display: flex; flex-direction: column; touch-action: none; }
        .atp-config-header { display: flex; align-items: center; justify-content: space-between; padding: 14px 16px; background: ${isDark ? 'linear-gradient(90deg, rgba(201,153,58,0.12) 0%, rgba(201,153,58,0.06) 100%)' : 'linear-gradient(90deg, rgba(180,140,50,0.1) 0%, rgba(180,140,50,0.04) 100%)'}; border-bottom: 2px solid ${border2}; flex-shrink: 0; }
        .atp-config-title { color: ${gold}; font-size: 16px; font-weight: 700; letter-spacing: 2px; }
        .atp-config-close { width: 32px; height: 32px; display: flex; align-items: center; justify-content: center; border: 2px solid ${isDark ? 'rgba(201,153,58,0.4)' : 'rgba(180,140,50,0.45)'}; border-radius: 4px; background: ${isDark ? 'rgba(201,153,58,0.08)' : 'rgba(180,140,50,0.06)'}; color: ${gold}; cursor: pointer; font-size: 18px; transition: all 0.2s; touch-action: manipulation; }
        .atp-config-body { padding: 16px; display: flex; flex-direction: column; gap: 10px; overflow-y: auto; flex: 1; -webkit-overflow-scrolling: touch; touch-action: pan-y; }
        .atp-section-title { font-size: 12px; color: ${text3}; letter-spacing: 2px; padding: 4px 0; border-bottom: 1px solid ${border3}; }
        .atp-toggle-row { display: flex; align-items: center; justify-content: space-between; padding: 12px 14px; background: ${bgGlass}; border: 2px solid ${border3}; border-radius: 6px; font-size: 14px; color: ${text2}; user-select: none; transition: all 0.15s; touch-action: manipulation; -webkit-tap-highlight-color: transparent; }
        .atp-toggle-row input[type="checkbox"] { accent-color: ${isDark ? '#c9993a' : '#b48c32'}; width: 18px; height: 18px; cursor: pointer; flex-shrink: 0; }
        .atp-toggle-row input[type="number"] { width: 65px; padding: 6px 8px; background: ${bg2}; border: 2px solid ${isDark ? 'rgba(201,153,58,0.25)' : 'rgba(180,140,50,0.3)'}; border-radius: 4px; color: ${text}; text-align: center; font-family: inherit; font-size: 14px; flex-shrink: 0; }
        .atp-toggle-row input[type="text"] { flex: 1; padding: 6px 8px; background: ${bg2}; border: 2px solid ${isDark ? 'rgba(201,153,58,0.25)' : 'rgba(180,140,50,0.3)'}; border-radius: 4px; color: ${text}; font-family: inherit; font-size: 13px; }
        .atp-config-footer { padding: 12px 16px; border-top: 2px solid ${isDark ? 'rgba(201,153,58,0.22)' : 'rgba(180,140,50,0.25)'}; flex-shrink: 0; }
        .atp-config-save-btn { width: 100%; padding: 14px 10px; border: 2px solid ${isDark ? 'rgba(201,153,58,0.4)' : 'rgba(180,140,50,0.5)'}; border-radius: 6px; background: ${isDark ? 'linear-gradient(180deg, rgba(201,153,58,0.12) 0%, rgba(201,153,58,0.04) 100%)' : 'linear-gradient(180deg, rgba(180,140,50,0.1) 0%, rgba(180,140,50,0.03) 100%)'}; color: ${gold2}; font-family: inherit; font-size: 16px; font-weight: 700; letter-spacing: 3px; cursor: pointer; touch-action: manipulation; }
        .atp-strategy-toggle { display: flex; gap: 0; border-radius: 6px; overflow: hidden; border: 2px solid ${isDark ? 'rgba(201,153,58,0.4)' : 'rgba(180,140,50,0.45)'}; }
        .atp-strategy-option { flex: 1; padding: 10px 12px; text-align: center; font-size: 13px; cursor: pointer; user-select: none; background: ${bgGlass}; color: ${text3}; transition: all 0.2s; touch-action: manipulation; }
        .atp-strategy-option:first-child { border-right: 2px solid ${border2}; }
        .atp-strategy-option.active { background: ${isDark ? 'rgba(201,153,58,0.15)' : 'rgba(180,140,50,0.12)'}; color: ${gold}; font-weight: 700; }
        .atp-weight-section { border: 2px solid ${isDark ? 'rgba(201,153,58,0.22)' : 'rgba(180,140,50,0.25)'}; border-radius: 6px; }
        .atp-weight-header { display: flex; align-items: center; justify-content: space-between; padding: 10px 12px; font-size: 13px; color: ${text2}; cursor: pointer; user-select: none; background: ${bgGlass2}; transition: all 0.2s; }
        .atp-weight-body { display: none; padding: 10px 12px; }
        .atp-weight-body.expanded { display: block; }
        .atp-weight-row { display: flex; align-items: center; justify-content: space-between; padding: 8px 0; }
        .atp-weight-row + .atp-weight-row { border-top: 1px solid ${borderGlass}; }
        .atp-weight-label { font-size: 13px; color: ${text2}; display: flex; align-items: center; gap: 6px; }
        .atp-weight-label .atp-weight-dot { width: 6px; height: 6px; border-radius: 50%; flex-shrink: 0; }
        .atp-weight-label .atp-weight-dot.special { background: #ff6040; }
        .atp-weight-label .atp-weight-dot.normal { background: ${isDark ? '#c9993a' : '#b48c32'}; }
        .atp-weight-row input[type="number"] { width: 65px; padding: 5px 8px; background: ${bg2}; border: 2px solid ${isDark ? 'rgba(201,153,58,0.25)' : 'rgba(180,140,50,0.3)'}; border-radius: 4px; color: ${text}; text-align: center; font-family: inherit; font-size: 13px; flex-shrink: 0; }
        .atp-weight-reset { font-size: 12px; color: ${text3}; cursor: pointer; text-align: right; text-decoration: underline; user-select: none; }
        .atp-weight-config-area.disabled { opacity: 0.45; pointer-events: none; }

        .atp-float-btn { position: fixed; width: 44px; height: 44px; border-radius: 50%; background: ${isDark ? 'linear-gradient(135deg, rgba(201,153,58,0.2) 0%, rgba(201,153,58,0.1) 100%)' : 'linear-gradient(135deg, rgba(180,140,50,0.18) 0%, rgba(180,140,50,0.08) 100%)'}; border: 2px solid ${border}; color: ${gold}; font-size: 20px; cursor: grab; z-index: 99998; display: flex; align-items: center; justify-content: center; user-select: none; -webkit-user-select: none; transition: box-shadow 0.5s, border-color 0.5s; touch-action: none; -webkit-touch-callout: none; }
        .atp-float-btn.breathing { animation: atp-float-breathe 2s ease-in-out infinite; }
        @keyframes atp-float-breathe {
            0%,100% { box-shadow: 0 0 8px ${isDark ? 'rgba(201,153,58,0.2)' : 'rgba(180,140,50,0.2)'}; border-color: ${border}; }
            50%     { box-shadow: 0 0 20px ${isDark ? 'rgba(201,153,58,0.5)' : 'rgba(180,140,50,0.5)'}, 0 0 40px ${isDark ? 'rgba(201,153,58,0.2)' : 'rgba(180,140,50,0.2)'}; border-color: ${isDark ? 'rgba(201,153,58,0.85)' : 'rgba(180,140,50,0.9)'}; }
        }

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
    }

    function initThemeWatcher() {
        window.matchMedia('(prefers-color-scheme: dark)').addEventListener('change', () => {
            if (currentTheme === 'system') updateThemeStyle();
        });
    }

    function cycleTheme() {
        if (currentTheme === 'dark') currentTheme = 'light';
        else currentTheme = 'dark';
        saveTheme(currentTheme);
        updateThemeStyle();
        addLog('info', `主题切换: ${currentTheme === 'dark' ? '夜间' : '日间'}`);
    }

    const state = {
        isRunning: false, isPanelOpen: true, isCollapsed: false,
        currentFloor: 0, bestFloor: 0,
        autoRetry: false, skipCombat: true, stoneRefresh: false,
        refreshMaxAttempts: 3, autoMeditate: false, stopOnFloor: 0,
        useDefaultStrategy: true, weights: { ...DEFAULT_WEIGHTS },
        showFloorInTitle: false, titleTemplate: '天道塔挑战中【{floor}】层',
        _stopRequested: false, _refreshAttempts: 0, _meditateActive: false,
        buffs: [], stats: null,
    };

    function saveConfig() { saveJSON(STORAGE_KEY, { autoRetry: state.autoRetry, skipCombat: state.skipCombat, stoneRefresh: state.stoneRefresh, refreshMaxAttempts: state.refreshMaxAttempts, autoMeditate: state.autoMeditate, stopOnFloor: state.stopOnFloor, useDefaultStrategy: state.useDefaultStrategy, weights: state.weights, showFloorInTitle: state.showFloorInTitle, titleTemplate: state.titleTemplate }); }
    function loadConfig() { const c = loadJSON(STORAGE_KEY); if (c) { if (typeof c.autoRetry === 'boolean') state.autoRetry = c.autoRetry; if (typeof c.skipCombat === 'boolean') state.skipCombat = c.skipCombat; if (typeof c.stoneRefresh === 'boolean') state.stoneRefresh = c.stoneRefresh; if (typeof c.refreshMaxAttempts === 'number') state.refreshMaxAttempts = c.refreshMaxAttempts; if (typeof c.autoMeditate === 'boolean') state.autoMeditate = c.autoMeditate; if (typeof c.stopOnFloor === 'number') state.stopOnFloor = c.stopOnFloor; if (typeof c.useDefaultStrategy === 'boolean') state.useDefaultStrategy = c.useDefaultStrategy; if (c.weights) Object.keys(DEFAULT_WEIGHTS).forEach(k => { if (typeof c.weights[k] === 'number') state.weights[k] = c.weights[k]; }); if (typeof c.showFloorInTitle === 'boolean') state.showFloorInTitle = c.showFloorInTitle; if (typeof c.titleTemplate === 'string') state.titleTemplate = c.titleTemplate; } }

    let container, panel, floatBtn, headerEl, bodyWrap;
    let els = {};

    function updateTitle() {
        if (state.showFloorInTitle && state.isRunning) {
            const tpl = state.titleTemplate || '天道塔挑战中【{floor}】层';
            document.title = tpl.replace('{floor}', state.currentFloor || '0');
        } else {
            document.title = DEFAULT_PAGE_TITLE;
        }
    }

    function cacheElements() {
        els.statusDot = document.getElementById('atp-status-dot'); els.statusText = document.getElementById('atp-status-text');
        els.currentFloor = document.getElementById('atp-current-floor'); els.bestFloor = document.getElementById('atp-best-floor');
        els.btnStart = document.getElementById('atp-btn-start'); els.btnStop = document.getElementById('atp-btn-stop');
        els.logEl = document.getElementById('atp-log'); els.bonusRow = document.getElementById('atp-bonus-row');
        els.specialRow = document.getElementById('atp-special-row'); els.buffsTags = document.getElementById('atp-buffs-tags');
    }

    function addLog(type, message) {
        const time = new Date().toLocaleTimeString('zh-CN', { hour: '2-digit', minute: '2-digit', second: '2-digit' });
        if (!els.logEl) return;
        const entry = document.createElement('div'); entry.className = `atp-log-entry ${type}`;
        const isDark = currentTheme === 'dark' || (currentTheme === 'system' && window.matchMedia('(prefers-color-scheme: dark)').matches);
        entry.innerHTML = `<span style="color:${isDark ? '#6a6560' : '#8a8278'};">[${time}]</span> ${message}`;
        els.logEl.appendChild(entry); els.logEl.scrollTop = els.logEl.scrollHeight;
        while (els.logEl.children.length > 200) els.logEl.removeChild(els.logEl.firstChild);
    }

    function setStatus(s, t) { if (els.statusDot) els.statusDot.className = 'atp-status-dot ' + s; if (els.statusText) els.statusText.textContent = t; }
    function updateStat(id, val) { const el = document.getElementById(id); if (el) el.textContent = val; }
    function updateAllStats() { updateStat('atp-current-floor', state.currentFloor || '--'); updateStat('atp-best-floor', state.bestFloor || '--'); updateTitle(); renderBuffPanel(); }
    function toggleButtons(r) { const s = els.btnStart || document.getElementById('atp-btn-start'), t = els.btnStop || document.getElementById('atp-btn-stop'); if (r) { s.classList.add('hidden'); t.classList.remove('hidden'); } else { s.classList.remove('hidden'); t.classList.add('hidden'); } }

    function updateBreathingLight() {
        const pnl = document.getElementById('atp-panel');
        if (!pnl || !floatBtn) return;
        const running = state.isRunning;
        const panelHidden = state.isCollapsed || !state.isPanelOpen;

        // PC端：运行中 + 收起 → 面板蓝色呼吸
        if (running && panelHidden && !isMobile()) {
            pnl.classList.add('breathing-blue');
        } else {
            pnl.classList.remove('breathing-blue');
        }

        // 移动端悬浮球：运行中 + 收起 → 金色呼吸
        if (running && panelHidden) {
            floatBtn.classList.add('breathing');
        } else {
            floatBtn.classList.remove('breathing');
        }
    }

    function hasAnyBonus(st) { if (!st) return false; return (st.atkBonus || 0) > 0 || (st.hpBonus || 0) > 0 || (st.mpBonus || 0) > 0 || (st.critBonus || 0) > 0 || (st.defBonus || 0) > 0 || (st.leechPercent || 0) > 0 || (st.thornPercent || 0) > 0 || (st.doubleStrikeChance || 0) > 0 || (st.skillTriggerBonus || 0) > 0 || (st.healBonus || 0) > 0; }

    function renderBuffPanel() {
        if (!els.bonusRow || !els.specialRow) return;
        const st = state.stats;
        if (!st || !hasAnyBonus(st)) { els.bonusRow.innerHTML = '<span class="atp-bonus-empty">暂无天赋加成数据</span>'; els.specialRow.innerHTML = ''; els.specialRow.style.display = 'none'; if (els.buffsTags) els.buffsTags.innerHTML = ''; return; }
        els.bonusRow.innerHTML = [['攻击', st.atkBonus || 0], ['血量', st.hpBonus || 0], ['灵力', st.mpBonus || 0], ['暴击', Math.round(st.critBonus || 0)], ['防御', st.defBonus || 0], ['吸血', Math.round(st.leechPercent || 0)], ['反伤', Math.round(st.thornPercent || 0)], ['连击', Math.round(st.doubleStrikeChance || 0)], ['技能触发', Math.round(st.skillTriggerBonus || 0)], ['层间回血', Math.round(st.healBonus || 0)]].map(([l, v]) => `<span class="atp-bonus-item">${l}<span class="val${v > 0 ? ' positive' : ' zero'}">+${v}%</span></span>`).join('');
        const buffs = state.buffs || [], sB = buffs.filter(b => WEIGHT_KEYS_SPECIAL.some(k => (b.name || b).includes(k))), nB = buffs.filter(b => !WEIGHT_KEYS_SPECIAL.some(k => (b.name || b).includes(k)));
        if (sB.length > 0) { els.specialRow.innerHTML = '<span class="atp-special-label">特殊词条</span>' + sB.map(b => `<span class="atp-buff-tag special">${b.name || b}</span>`).join(''); els.specialRow.style.display = 'flex'; } else { els.specialRow.innerHTML = ''; els.specialRow.style.display = 'none'; }
        if (els.buffsTags) { if (nB.length > 0) { els.buffsTags.innerHTML = nB.map(b => `<span class="atp-buff-tag">${b.name || b}</span>`).join(''); els.buffsTags.style.display = 'flex'; } else { els.buffsTags.innerHTML = ''; els.buffsTags.style.display = 'none'; } }
    }
    function updateBuffData(info) { if (info.trialStats) state.stats = info.trialStats; if (info.activeBuffs) state.buffs = info.activeBuffs.map(b => typeof b === 'string' ? { name: b } : b); renderBuffPanel(); }

    function wait(ms) { return new Promise(r => setTimeout(r, ms)); }
    async function apiGet(p) { if (typeof api === 'undefined') throw new Error('API 未就绪'); return api.get(p); }
    async function apiPost(p, b) { if (typeof api === 'undefined') throw new Error('API 未就绪'); return api.post(p, b || {}); }
    function ensureSkipCombat(on) { try { localStorage.setItem('skip_combat', on ? 'true' : 'false'); if (typeof api !== 'undefined') api.post('/api/player/toggle-skip-combat', { enabled: !!on }).catch(() => {}); } catch (e) {} }

    const SPECIAL_ORDER = ['不死', '斩杀', '天怒', '灵根共鸣', '天道汲取'];

    function getCritPercent() { return Math.round((state.stats || {}).critBonus || 0); }
    function isCritFull() { return getCritPercent() >= 100; }

    function getBuffWeight(name, desc) { if (state.useDefaultStrategy) return getDefaultWeight(name, desc, isCritFull()); const text = (name + ' ' + (desc || '')).toLowerCase(); for (const kw of [...WEIGHT_KEYS_SPECIAL, ...WEIGHT_KEYS_NORMAL]) if (text.includes(kw)) return state.weights[kw] || DEFAULT_WEIGHTS[kw]; return 5; }
    function getSpecialOrder(name) { const idx = SPECIAL_ORDER.findIndex(k => (name || '').includes(k)); return idx >= 0 ? SPECIAL_ORDER.length - idx : 0; }

    function selectBestBuff(buffs) {
        if (!buffs || buffs.length === 0) return null;
        let scored = buffs.map(b => ({ b, score: getBuffWeight(b.name, b.desc) + getSpecialOrder(b.name) * 0.5 + extractBuffValue(b.desc) * 0.3 + getBuffRarityScore(b.rarity) * 0.1 }));
        scored.sort((a, b) => { if (Math.abs(a.score - b.score) > 0.01) return b.score - a.score; const va = extractBuffValue(a.b.desc), vb = extractBuffValue(b.b.desc); if (va !== vb) return vb - va; return getBuffRarityScore(b.b.rarity) - getBuffRarityScore(a.b.rarity); });
        return scored[0].b;
    }

    function extractBuffValue(desc) { if (!desc) return 0; const m = desc.match(/(\d+(?:\.\d+)?)\s*%/); return m ? parseFloat(m[1]) : 0; }
    function getBuffRarityScore(rarity) { const map = { '传说': 5, '稀有': 4, '史诗': 4, '优良': 3, '普通': 1 }; return map[rarity] || 1; }

    function formatBuffLine(buff, hl) {
        const isDark = currentTheme === 'dark' || (currentTheme === 'system' && window.matchMedia('(prefers-color-scheme: dark)').matches);
        const sym = buff.rarity === '传说' ? '⭐' : '◆', name = buff.name || '?', desc = buff.desc || '', weight = getBuffWeight(name, desc), prefix = hl ? '▶ ' : '';
        return `${prefix}${sym}[${name}] ${desc} <span style="color:${isDark ? '#6a6560' : '#8a8278'};">(${weight}分)</span>`;
    }

    async function handleMeditationBeforeStart() {
        try {
            const sr = await apiGet('/api/game/meditate/status');
            const isMeditating = sr && sr.code === 200 && sr.data && sr.data.isMeditating;
            if (isMeditating) { addLog('info', '检测到正在冥想，先收功...'); await apiPost('/api/game/meditate/stop'); state._meditateActive = false; await wait(500); if (state.autoMeditate) { addLog('info', '1秒后重新开启冥想...'); await wait(1000); const r = await apiPost('/api/game/meditate/start'); if (r && r.code === 200) { state._meditateActive = true; addLog('success', '冥想已重新开启'); } else { addLog('warn', '冥想重新开启失败'); } } else { addLog('success', '冥想已结束'); } }
            else if (state.autoMeditate) { addLog('info', '开启冥想...'); const r = await apiPost('/api/game/meditate/start'); if (r && r.code === 200) { state._meditateActive = true; addLog('success', '冥想已开启'); } }
        } catch (e) { addLog('warn', '冥想处理异常'); }
    }

    async function trialLoop() {
        while (state.isRunning && !state._stopRequested) {
            if (state.stopOnFloor > 0 && state.currentFloor >= state.stopOnFloor) { addLog('gold', `已到达目标层数 ${state.stopOnFloor}，停止试炼`); break; }
            let info;
            try { const res = await apiGet('/api/trial-tower/info'); if (!res || res.code !== 200) { addLog('error', '获取信息失败'); break; } info = res.data; } catch (e) { addLog('error', '网络错误'); await wait(2000); continue; }
            if (info.activeFloor) { state.currentFloor = info.activeFloor; if (info.activeFloor > state.bestFloor) state.bestFloor = info.activeFloor; updateTitle(); }

            if (info.pendingBuffs && info.pendingBuffs.length > 0) {
                updateBuffData(info);
                const best = selectBestBuff(info.pendingBuffs), bestWeight = getBuffWeight(best.name, best.desc);
                let listHtml = '📋 可选天赋:\n'; info.pendingBuffs.forEach(b => { listHtml += formatBuffLine(b, b.id === best.id) + '\n'; }); addLog('info', listHtml);
                addLog('success', `优先选择: <b>[${best.name}] ${best.desc || ''}</b> <span style="font-size:10px;">(权重: ${bestWeight}分)</span>`);
                if (state.stoneRefresh && bestWeight < 30 && state._refreshAttempts < state.refreshMaxAttempts) { state._refreshAttempts++; addLog('warn', `权重偏低(${bestWeight}分)，刷新第${state._refreshAttempts}次...`); try { const refRes = await apiPost('/api/trial-tower/refresh-buff', { useAdPoints: false }); if (refRes && refRes.code === 200) { addLog('info', '已刷新'); await wait(500); continue; } else addLog('warn', '刷新失败'); } catch (e) { addLog('error', '刷新异常'); } }
                try { const chooseRes = await apiPost('/api/trial-tower/choose-buff', { buffId: best.id }); if (chooseRes && chooseRes.code === 200) { state._refreshAttempts = 0; addLog('gold', `🎁 获得天赋: ${formatBuffLine(best, true)}`); if (info.activeBuffs) state.buffs = [...info.activeBuffs.map(b => typeof b === 'string' ? { name: b } : b), { name: best.name, rarity: best.rarity }]; renderBuffPanel(); await wait(500); continue; } else addLog('error', '选择失败'); } catch (e) { addLog('error', '选择异常'); }
                await wait(1000); continue;
            }

            if (info.hasActiveTrial) { updateBuffData(info); updateAllStats(); addLog('info', `⚔️ 第${info.activeFloor}层 战斗开始`); setStatus('running', `第${info.activeFloor}层战斗中...`);
                try { const fightRes = await apiPost('/api/trial-tower/fight'); if (!fightRes || fightRes.code !== 200) { addLog('error', '战斗失败'); break; } if (fightRes.data.victory) { addLog('success', `✅ 第${info.activeFloor}层 胜利!`); updateAllStats(); await wait(300); } else { addLog('error', `❌ 第${info.activeFloor}层 战败`); updateAllStats(); break; } } catch (e) { addLog('error', '战斗异常'); await wait(2000); continue; }
                continue;
            }

            addLog('info', '🚀 开始新试炼');
            try { const startRes = await apiPost('/api/trial-tower/start', { useAdPoints: false }); if (startRes && startRes.code === 200) { addLog('success', '试炼已开启'); state._refreshAttempts = 0; await wait(800); continue; } else { addLog('error', '开始失败'); break; } } catch (e) { addLog('error', '开始异常'); await wait(2000); continue; }
        }
        _retainedBuffs = [...state.buffs]; _retainedStats = state.stats ? { ...state.stats } : null;
        addLog('gold', '━━━━━━━━━━━━━━━━━━━━'); addLog('gold', `试炼结束 · ${state.currentFloor}层 · 最佳${state.bestFloor}层`);

        if (state.autoRetry && state.isRunning && !state._stopRequested) {
            addLog('info', '3秒后自动重试...'); await wait(3000);
            if (state.isRunning && !state._stopRequested) {
                addLog('info', '━━━ 自动重试 ━━━'); state.currentFloor = 0; state._refreshAttempts = 0; updateTitle();
                if (state.autoMeditate) { try { const sr = await apiGet('/api/game/meditate/status'); if (sr && sr.code === 200 && sr.data && sr.data.isMeditating) { addLog('info', '重试前先收功...'); await apiPost('/api/game/meditate/stop'); state._meditateActive = false; await wait(500); } } catch (e) {} }
                try {
                    const resetRes = await apiPost('/api/trial-tower/start', { useAdPoints: false });
                    if (resetRes && resetRes.code === 200) { addLog('success', '试炼已重置'); if (state.autoMeditate) { try { const r = await apiPost('/api/game/meditate/start'); if (r && r.code === 200) { state._meditateActive = true; addLog('success', '冥想已重新开启'); } } catch (e) {} } trialLoop(); return; }
                    else { addLog('error', '重试失败: ' + (resetRes?.message || '')); }
                } catch (e) { addLog('error', '重试异常: ' + e.message); }
            }
        }
        stopTrialInternal();
    }

    async function startTrial() {
        if (state.isRunning) return;
        state.isRunning = true; state._stopRequested = false; state.currentFloor = 0; state._refreshAttempts = 0;
        if (_retainedBuffs.length > 0) { state.buffs = [..._retainedBuffs]; state.stats = _retainedStats ? { ..._retainedStats } : null; }
        updateAllStats(); toggleButtons(true); setStatus('running', '启动中...'); updateBreathingLight(); updateTitle();
        await handleMeditationBeforeStart();
        if (state.skipCombat) { ensureSkipCombat(true); addLog('info', '跳过战斗: 开'); }
        addLog('gold', `━━━ 自动试炼开始 (${state.useDefaultStrategy ? '默认策略' : '自配权重'}) ━━━`);
        trialLoop().catch(e => { addLog('error', '异常: ' + e.message); stopTrialInternal(); });
    }
    function stopTrial() { state._stopRequested = true; addLog('warn', '收到停止指令...'); }
    function stopTrialInternal() { state.isRunning = false; state._stopRequested = false; toggleButtons(false); setStatus('idle', '就绪'); updateBreathingLight(); updateTitle(); if (state.skipCombat) ensureSkipCombat(false); if (!state.autoMeditate && state._meditateActive) { stopMeditationIfNeeded(); } }
    async function stopMeditationIfNeeded() { try { const sr = await apiGet('/api/game/meditate/status'); if (sr?.code === 200 && sr.data?.isMeditating) { await apiPost('/api/game/meditate/stop'); state._meditateActive = false; } } catch (e) {} }

    function openConfigModal() {
        const existing = document.getElementById('atp-config-overlay'); if (existing) existing.remove();
        const overlay = document.createElement('div'); overlay.className = 'atp-config-overlay'; overlay.id = 'atp-config-overlay';
        const btnDefault = document.createElement('div'); btnDefault.className = 'atp-strategy-option' + (state.useDefaultStrategy ? ' active' : ''); btnDefault.textContent = '默认配置';
        const btnCustom = document.createElement('div'); btnCustom.className = 'atp-strategy-option' + (state.useDefaultStrategy ? '' : ' active'); btnCustom.textContent = '天赋权重自配';
        const weightArea = document.createElement('div'); weightArea.className = 'atp-weight-config-area' + (state.useDefaultStrategy ? ' disabled' : ''); weightArea.id = 'atp-weight-config-area';
        weightArea.innerHTML = `<div class="atp-weight-section" style="border:none;"><div class="atp-weight-header" id="atp-weight-header"><span>传说特殊</span><span id="atp-weight-arrow">▸</span></div><div class="atp-weight-body" id="atp-weight-body-special">${WEIGHT_KEYS_SPECIAL.map(k => `<div class="atp-weight-row"><span class="atp-weight-label"><span class="atp-weight-dot special"></span>${k}</span><input type="number" id="atp-weight-${k}" value="${state.weights[k]}" min="1" max="100" oninput="if(+this.value>100)this.value=100;if(+this.value<1)this.value=1;"></div>`).join('')}</div></div><div class="atp-weight-section" style="border:none;margin-top:8px;"><div class="atp-weight-header" id="atp-weight-header-normal"><span>普通词条</span><span id="atp-weight-arrow-normal">▸</span></div><div class="atp-weight-body" id="atp-weight-body-normal">${WEIGHT_KEYS_NORMAL.map(k => `<div class="atp-weight-row"><span class="atp-weight-label"><span class="atp-weight-dot normal"></span>${k}</span><input type="number" id="atp-weight-${k}" value="${state.weights[k]}" min="1" max="100" oninput="if(+this.value>100)this.value=100;if(+this.value<1)this.value=1;"></div>`).join('')}</div></div>`;
        btnDefault.addEventListener('click', function (e) { e.stopPropagation(); btnDefault.classList.add('active'); btnCustom.classList.remove('active'); weightArea.classList.add('disabled'); });
        btnCustom.addEventListener('click', function (e) { e.stopPropagation(); btnCustom.classList.add('active'); btnDefault.classList.remove('active'); weightArea.classList.remove('disabled'); });
        const strategyToggle = document.createElement('div'); strategyToggle.className = 'atp-strategy-toggle'; strategyToggle.appendChild(btnDefault); strategyToggle.appendChild(btnCustom);
        const dialog = document.createElement('div'); dialog.className = 'atp-config-dialog';
        const isDark = currentTheme === 'dark' || (currentTheme === 'system' && window.matchMedia('(prefers-color-scheme: dark)').matches);
        const gold = isDark ? '#c9993a' : '#8b6914';
        const text3 = isDark ? '#6a6560' : '#8a8278';
        dialog.innerHTML = `<div class="atp-config-header"><span class="atp-config-title">⚙ 自动试炼 · 配置</span><button class="atp-config-close" id="atp-config-close">✕</button></div><div class="atp-config-body"><div class="atp-section-title">✦ 试炼设置</div><label class="atp-toggle-row"><span>失败自动重试</span><input type="checkbox" id="atp-cfg-auto-retry" ${state.autoRetry ? 'checked' : ''}></label><label class="atp-toggle-row"><span>跳过战斗动画</span><input type="checkbox" id="atp-cfg-skip-combat" ${state.skipCombat ? 'checked' : ''}></label><div class="atp-toggle-row"><span>到达此层停止</span><input type="number" id="atp-cfg-stop-floor" value="${state.stopOnFloor}" min="0" max="999"></div><div class="atp-section-title">✦ 天赋刷新</div><label class="atp-toggle-row"><span>灵石刷新天赋</span><input type="checkbox" id="atp-cfg-stone-refresh" ${state.stoneRefresh ? 'checked' : ''}></label><div class="atp-toggle-row"><span>最大刷新次数</span><input type="number" id="atp-cfg-refresh-max" value="${state.refreshMaxAttempts}" min="1" max="10"></div><div class="atp-section-title">✦ 天赋策略 (二选一)</div><div id="atp-strategy-container"></div><div id="atp-weight-container"></div><div class="atp-weight-reset" id="atp-weight-reset">恢复默认权重</div><div class="atp-section-title" style="margin-top:4px;">✦ 浏览器标题</div><label class="atp-toggle-row"><span>标题显示挑战层数</span><input type="checkbox" id="atp-cfg-show-floor" ${state.showFloorInTitle ? 'checked' : ''}></label><div class="atp-toggle-row"><span>标题模板</span><input type="text" id="atp-cfg-title-template" value="${state.titleTemplate.replace(/"/g, '&quot;')}" placeholder="天道塔挑战中【{floor}】层"></div><div class="atp-section-title" style="margin-top:4px;">✦ 主题</div><div class="atp-toggle-row" id="atp-cfg-theme-system" style="cursor:pointer;"><span>跟随系统</span><span style="color:${currentTheme==='system'?gold:text3};font-weight:${currentTheme==='system'?'700':'400'};">${currentTheme==='system'?'● 当前':'○'}</span></div><div class="atp-section-title">✦ 其他</div><label class="atp-toggle-row"><span>自动冥想</span><input type="checkbox" id="atp-cfg-auto-meditate" ${state.autoMeditate ? 'checked' : ''}></label></div><div class="atp-config-footer"><button class="atp-config-save-btn" id="atp-config-save">保 存 配 置</button></div>`;
        dialog.querySelector('#atp-strategy-container').appendChild(strategyToggle); dialog.querySelector('#atp-weight-container').appendChild(weightArea); overlay.appendChild(dialog); document.body.appendChild(overlay);
        ['special', 'normal'].forEach(type => { const h = document.getElementById(`atp-weight-header${type === 'normal' ? '-normal' : ''}`), b = document.getElementById(`atp-weight-body-${type}`), a = document.getElementById(`atp-weight-arrow${type === 'normal' ? '-normal' : ''}`); if (h) h.addEventListener('click', () => { const ex = b.classList.toggle('expanded'); if (a) a.textContent = ex ? '▾' : '▸'; }); });
        document.getElementById('atp-weight-reset').addEventListener('click', () => { [...WEIGHT_KEYS_SPECIAL, ...WEIGHT_KEYS_NORMAL].forEach(k => { const inp = overlay.querySelector(`#atp-weight-${k}`); if (inp) inp.value = DEFAULT_WEIGHTS[k]; }); });
        document.getElementById('atp-cfg-theme-system').addEventListener('click', () => { currentTheme = 'system'; saveTheme(currentTheme); updateThemeStyle(); addLog('info', '主题切换: 跟随系统'); closeConfigModal(); });
        overlay.addEventListener('click', e => { if (e.target === overlay) closeConfigModal(); }); document.getElementById('atp-config-close').addEventListener('click', closeConfigModal);
        document.getElementById('atp-config-save').addEventListener('click', () => { const isDefault = btnDefault.classList.contains('active'); state.useDefaultStrategy = isDefault; state.autoRetry = document.getElementById('atp-cfg-auto-retry').checked; state.skipCombat = document.getElementById('atp-cfg-skip-combat').checked; state.stoneRefresh = document.getElementById('atp-cfg-stone-refresh').checked; state.refreshMaxAttempts = parseInt(document.getElementById('atp-cfg-refresh-max').value, 10) || 3; state.autoMeditate = document.getElementById('atp-cfg-auto-meditate').checked; state.stopOnFloor = parseInt(document.getElementById('atp-cfg-stop-floor').value, 10) || 0; state.showFloorInTitle = document.getElementById('atp-cfg-show-floor').checked; state.titleTemplate = document.getElementById('atp-cfg-title-template').value.trim() || '天道塔挑战中【{floor}】层'; if (!isDefault) [...WEIGHT_KEYS_SPECIAL, ...WEIGHT_KEYS_NORMAL].forEach(k => { const inp = overlay.querySelector(`#atp-weight-${k}`); if (inp) state.weights[k] = parseInt(inp.value, 10) || DEFAULT_WEIGHTS[k]; }); saveConfig(); updateTitle(); addLog('info', `配置已保存 (${isDefault ? '默认策略' : '自配权重'})`); closeConfigModal(); });
        document.addEventListener('keydown', function esc(e) { if (e.key === 'Escape') { closeConfigModal(); document.removeEventListener('keydown', esc); } });
    }
    function closeConfigModal() { const o = document.getElementById('atp-config-overlay'); if (o) o.remove(); }

    function clamp(val, min, max) { return Math.max(min, Math.min(max, val)); }

    function makeDraggable(handle, target, onEnd) {
        let d = false, sx, sy, ol, ot;
        handle.addEventListener('mousedown', function (e) { if (e.button !== 0 || e.target.closest('button, input, select, textarea, label') || isMobile()) return; e.preventDefault(); d = true; sx = e.clientX; sy = e.clientY; const r = target.getBoundingClientRect(); ol = r.left; ot = r.top; target.style.transition = 'none'; target.style.right = 'auto'; target.style.bottom = 'auto'; target.style.transform = 'none'; });
        function mv(e) { if (!d) return; const w = target.offsetWidth, h = target.offsetHeight; target.style.left = clamp(ol + e.clientX - sx, 0, innerWidth - w) + 'px'; target.style.top = clamp(ot + e.clientY - sy, 0, innerHeight - h) + 'px'; }
        function up() { if (!d) return; d = false; target.style.transition = ''; const r = target.getBoundingClientRect(); if (onEnd) onEnd({ left: clamp(r.left, 0, innerWidth - target.offsetWidth), top: clamp(r.top, 0, innerHeight - target.offsetHeight) }); }
        document.addEventListener('mousemove', mv); document.addEventListener('mouseup', up);
    }

    function initFloatDraggable(btn) {
        let d = false, m = false, sx, sy, ol, ot;
        function s(cx, cy) { d = true; m = false; sx = cx; sy = cy; const r = btn.getBoundingClientRect(); ol = r.left; ot = r.top; btn.style.transition = 'none'; btn.style.left = ol + 'px'; btn.style.top = ot + 'px'; btn.style.right = 'auto'; btn.style.bottom = 'auto'; btn.style.transform = 'none'; }
        function mv(cx, cy) { if (!d) return; if (Math.abs(cx - sx) > 2 || Math.abs(cy - sy) > 2) m = true; btn.style.left = clamp(ol + cx - sx, 0, innerWidth - 44) + 'px'; btn.style.top = clamp(ot + cy - sy, 0, innerHeight - 44) + 'px'; }
        function e() { if (!d) return; d = false; btn.style.transition = ''; saveJSON(FLOAT_POS_KEY, { left: clamp(parseFloat(btn.style.left), 0, innerWidth - 44), top: clamp(parseFloat(btn.style.top), 0, innerHeight - 44) }); }
        btn.addEventListener('mousedown', function (ev) { if (ev.button !== 0) return; ev.preventDefault(); s(ev.clientX, ev.clientY); });
        document.addEventListener('mousemove', function (ev) { mv(ev.clientX, ev.clientY); }); document.addEventListener('mouseup', e);
        btn.addEventListener('touchstart', function (ev) { const t = ev.touches[0]; s(t.clientX, t.clientY); }, { passive: false });
        document.addEventListener('touchmove', function (ev) { if (!d) return; const t = ev.touches[0]; mv(t.clientX, t.clientY); }, { passive: false }); document.addEventListener('touchend', e);
        return { wasDragged: () => m, resetMoved: () => { m = false; } };
    }

    function buildPanel() {
        container = document.createElement('div'); container.className = 'atp-container'; container.id = 'atp-container';
        const pos = loadJSON(POS_KEY);
        if (!isMobile() && pos) { container.style.left = clamp(pos.left, 0, innerWidth - 320) + 'px'; container.style.top = clamp(pos.top, 0, innerHeight - 40) + 'px'; container.style.right = 'auto'; container.style.bottom = 'auto'; container.style.transform = 'none'; }
        else { container.style.top = '50%'; container.style.right = '20px'; container.style.transform = 'translateY(-50%)'; }
        container.innerHTML = `<div class="atp-panel" id="atp-panel"><div class="atp-header" id="atp-header"><span class="atp-title"><span class="atp-title-icon">⚔️</span><span>自动试炼</span></span><div class="atp-header-btns"><button class="atp-header-btn" id="atp-theme-btn" title="切换主题">🌓</button><button class="atp-header-btn" id="atp-config-btn" title="配置">⚙</button><button class="atp-header-btn" id="atp-collapse-btn" title="收起/展开">▼</button></div></div><div class="atp-body-wrap" id="atp-body-wrap"><div class="atp-body"><div class="atp-status-row"><span class="atp-status-dot idle" id="atp-status-dot"></span><span class="atp-status-text" id="atp-status-text">就绪 · 等待指令</span></div><div class="atp-stats"><div class="atp-stat-item"><div class="atp-stat-label">当前层数</div><div class="atp-stat-value gold" id="atp-current-floor">--</div></div><div class="atp-stat-item"><div class="atp-stat-label">历史最佳</div><div class="atp-stat-value" id="atp-best-floor">--</div></div></div><div class="atp-buffs-panel"><div class="atp-buffs-header" id="atp-buffs-header"><span class="atp-buffs-header-text">—— 天赋加成 ——</span><span class="atp-buffs-arrow" id="atp-buffs-arrow">▸</span></div><div class="atp-buffs-body" id="atp-buffs-body"><div class="atp-bonus-row" id="atp-bonus-row"><span class="atp-bonus-empty">暂无天赋加成数据</span></div><div class="atp-special-row" id="atp-special-row" style="display:none;"></div><div class="atp-buff-tags" id="atp-buffs-tags"></div></div></div><div class="atp-actions"><button class="atp-btn" id="atp-btn-start">开 始 试 炼</button><button class="atp-btn stop hidden" id="atp-btn-stop">停 止 试 炼</button></div><div class="atp-log" id="atp-log"></div></div></div></div>`;
        floatBtn = document.createElement('button'); floatBtn.className = 'atp-float-btn'; floatBtn.id = 'atp-float-btn'; floatBtn.title = '自动试炼塔'; floatBtn.textContent = '⚔️';
        document.body.appendChild(container); document.body.appendChild(floatBtn); cacheElements();
        headerEl = document.getElementById('atp-header');
        const fp = loadJSON(FLOAT_POS_KEY); if (fp) { floatBtn.style.left = clamp(fp.left, 0, innerWidth - 44) + 'px'; floatBtn.style.top = clamp(fp.top, 0, innerHeight - 44) + 'px'; } else { floatBtn.style.right = '16px'; floatBtn.style.bottom = '100px'; }
        const fd = initFloatDraggable(floatBtn);
        floatBtn.addEventListener('click', function () { if (fd.wasDragged()) { fd.resetMoved(); return; } panel = document.getElementById('atp-panel'); panel.classList.remove('hidden'); floatBtn.classList.add('hidden'); state.isPanelOpen = true; saveCollapsed(false); updateBreathingLight(); });
        if (isMobile()) { floatBtn.classList.remove('hidden'); if (loadCollapsed()) { document.getElementById('atp-panel').classList.add('hidden'); state.isPanelOpen = false; } } else { floatBtn.classList.add('hidden'); }
        document.getElementById('atp-buffs-header').addEventListener('click', () => { const b = document.getElementById('atp-buffs-body'), a = document.getElementById('atp-buffs-arrow'), ex = b.classList.toggle('expanded'); document.getElementById('atp-buffs-header').classList.toggle('expanded', ex); a.textContent = ex ? '▾' : '▸'; });
        bodyWrap = document.getElementById('atp-body-wrap');
        document.getElementById('atp-collapse-btn').addEventListener('click', () => { if (isMobile()) { panel = document.getElementById('atp-panel'); panel.classList.add('hidden'); floatBtn.classList.remove('hidden'); state.isPanelOpen = false; saveCollapsed(true); } else { state.isCollapsed = !state.isCollapsed; if (state.isCollapsed) { headerEl.classList.add('collapsed'); bodyWrap.style.maxHeight = '0px'; } else { headerEl.classList.remove('collapsed'); bodyWrap.style.maxHeight = ''; } } updateBreathingLight(); });
        makeDraggable(headerEl, container, pos => saveJSON(POS_KEY, pos));
        updateTitle(); updateBreathingLight();
    }

    function bindEvents() { document.getElementById('atp-theme-btn').addEventListener('click', cycleTheme); document.getElementById('atp-config-btn').addEventListener('click', openConfigModal); document.getElementById('atp-btn-start').addEventListener('click', startTrial); document.getElementById('atp-btn-stop').addEventListener('click', stopTrial); }
    function init() { if (document.getElementById('atp-container')) return; loadConfig(); initThemeWatcher(); updateThemeStyle(); buildPanel(); bindEvents(); addLog('info', `自动试炼塔 v1.6.0 已就绪`); addLog('info', '盐值验证通过'); addLog('info', `策略已加载：${state.useDefaultStrategy ? '默认策略' : '自配权重'}`); updateAllStats(); }
    if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init); else init();
})();