// ==UserScript==
// @name         灵界储物助手
// @namespace    https://github.com/ming-a1/LingVerse-Script
// @version      2.5
// @description  灵界游戏储物出售助手 - 记忆位置、修复点击、优化拖拽、默认收起
// @author       助手
// @match        *://ling.muge.info/*
// @grant        none
// @run-at       document-end
// @downloadURL  https://raw.githubusercontent.com/ming-a1/LingVerse-Script/refs/heads/main/lingverse-sell-helper.js
// @updateURL    https://raw.githubusercontent.com/ming-a1/LingVerse-Script/refs/heads/main/lingverse-sell-helper.js
// ==/UserScript==

(function() {
  'use strict';

  var checkInterval = setInterval(function() {
    if (typeof _inventoryCache !== 'undefined' || typeof api !== 'undefined') {
      clearInterval(checkInterval);
      init();
    }
  }, 500);
  setTimeout(function() { clearInterval(checkInterval); }, 30000);

  function init() {
    var oldPanel = document.getElementById('lingjieHelperPanel');
    if (oldPanel) oldPanel.remove();
    var oldBtn = document.getElementById('lingjieHelperFloatBtn');
    if (oldBtn) oldBtn.remove();

    var isMobile = /Android|iPhone|iPad|iPod|webOS/i.test(navigator.userAgent) || ('ontouchstart' in window && window.innerWidth <= 768);

    var STORAGE_KEY_PANEL = 'lingjie_helper_panel_pos';
    var STORAGE_KEY_BTN = 'lingjie_helper_btn_pos';

    function loadPosition(key) {
      try {
        var raw = localStorage.getItem(key);
        if (raw) {
          var pos = JSON.parse(raw);
          if (typeof pos.left === 'number' && typeof pos.top === 'number') {
            return { left: pos.left, top: pos.top };
          }
        }
      } catch(e) {}
      return { left: null, top: null };
    }

    function savePosition(key, left, top) {
      try {
        localStorage.setItem(key, JSON.stringify({ left: left, top: top }));
      } catch(e) {}
    }

    var savedPanelPos = loadPosition(STORAGE_KEY_PANEL);
    var savedBtnPos = loadPosition(STORAGE_KEY_BTN);

    function el(tag, attrs, children) {
      var e = document.createElement(tag);
      for (var k in attrs || {}) {
        if (k === 'style' && typeof attrs[k] === 'object') {
          for (var s in attrs[k]) e.style[s] = attrs[k][s];
        } else if (k === 'onclick') {
          e.onclick = attrs[k];
        } else if (k === 'onkeydown') {
          e.onkeydown = attrs[k];
        } else {
          e.setAttribute(k, attrs[k]);
        }
      }
      if (children) {
        if (typeof children === 'string') e.innerHTML = children;
        else if (Array.isArray(children)) children.forEach(function(c) { e.appendChild(c); });
        else e.appendChild(children);
      }
      return e;
    }

    function formatNum(n) {
      if (typeof formatNumber === 'function') return formatNumber(n);
      return n.toLocaleString();
    }

    function rarityColor(r) {
      if (typeof getRarityColor === 'function') return getRarityColor(r);
      return ['', '#aaa', '#4ade80', '#60a5fa', '#c084fc', '#fbbf24'][r] || '#aaa';
    }

    function fuzzyMatch(text, query) {
      if (!query) return true;
      var t = text.toLowerCase(), q = query.toLowerCase();
      if (t.indexOf(q) >= 0) return true;
      var qi = 0;
      for (var i = 0; i < t.length && qi < q.length; i++) {
        if (t[i] === q[qi]) qi++;
      }
      return qi === q.length;
    }

    function canSellItem(item) {
      if (item.type === 'currency') return false;
      if (item.isNatal) return false;
      if (item.isBound) return false;
      if (item.isEquipped || item.isIncarnationEquipped) return false;
      if (item.isLocked) return false;
      if (item.tradeCooldown && item.tradeCooldown > Date.now()) return false;
      return true;
    }

    function getUnsellableReasons(item) {
      var reasons = [];
      if (item.isNatal) reasons.push('本命法宝');
      if (item.isBound) reasons.push('已绑定');
      if (item.isEquipped) reasons.push('已装备');
      if (item.isIncarnationEquipped) reasons.push('化身穿戴');
      if (item.isLocked) reasons.push('已锁定');
      if (item.tradeCooldown && item.tradeCooldown > Date.now()) {
        var diffMs = item.tradeCooldown - Date.now();
        var diffMins = Math.ceil(diffMs / 60000);
        var hours = Math.floor(diffMins / 60);
        var mins = diffMins % 60;
        var timeStr = hours > 0 ? (hours + '小时' + mins + '分') : (mins + '分');
        reasons.push('冻结中(' + timeStr + ')');
      }
      return reasons;
    }

    function getDisplayPrice(item) {
      if (item.sellPrice > 0) return item.sellPrice;
      return 1;
    }

    function calcFinalSellPriceSafe(sellPrice, wearRate, inscJson) {
      try { if (typeof calcFinalSellPrice === 'function') return calcFinalSellPrice(sellPrice, wearRate, inscJson); } catch(e) {}
      var price = sellPrice > 0 ? sellPrice : 1;
      var base = wearRate > 0 ? Math.max(1, Math.floor(price * (1.0 - (wearRate / 10000) * 0.5))) : price;
      return Math.max(1, Math.floor(base));
    }

    function escapeHtmlSafe(str) {
      if (!str) return '';
      if (typeof escapeHtml === 'function') return escapeHtml(str);
      return String(str).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
    }

    var panelDragInfo = null;
    var btnDragInfo = null;
    var DRAG_THRESHOLD = 6;

    function getPos(e) {
      if (e.touches && e.touches.length > 0) return { x: e.touches[0].clientX, y: e.touches[0].clientY };
      if (e.changedTouches && e.changedTouches.length > 0) return { x: e.changedTouches[0].clientX, y: e.changedTouches[0].clientY };
      return { x: e.clientX, y: e.clientY };
    }

    function startPanelDrag(e) {
      var tag = (e.target || {}).tagName;
      if (tag === 'BUTTON' || tag === 'INPUT' || tag === 'SELECT' || tag === 'TEXTAREA' || tag === 'SPAN') return;
      e.preventDefault();
      var panel = document.getElementById('lingjieHelperPanel');
      if (!panel) return;
      var pos = getPos(e);
      var rect = panel.getBoundingClientRect();
      panelDragInfo = { el: panel, sx: pos.x, sy: pos.y, sl: rect.left, st: rect.top, moved: false };
    }

    function movePanelDrag(e) {
      if (!panelDragInfo) return;
      var pos = getPos(e);
      var dx = pos.x - panelDragInfo.sx;
      var dy = pos.y - panelDragInfo.sy;
      if (Math.abs(dx) < DRAG_THRESHOLD && Math.abs(dy) < DRAG_THRESHOLD) return;
      e.preventDefault();
      panelDragInfo.moved = true;
      var nl = Math.max(0, Math.min(panelDragInfo.sl + dx, window.innerWidth - panelDragInfo.el.offsetWidth));
      var nt = Math.max(0, Math.min(panelDragInfo.st + dy, window.innerHeight - 60));
      panelDragInfo.el.style.left = nl + 'px';
      panelDragInfo.el.style.top = nt + 'px';
      panelDragInfo.el.style.transform = 'none';
    }

    function endPanelDrag() {
      if (panelDragInfo && panelDragInfo.moved) {
        var rect = panelDragInfo.el.getBoundingClientRect();
        savePosition(STORAGE_KEY_PANEL, rect.left, rect.top);
      }
      panelDragInfo = null;
    }

    function startBtnDrag(e) {
      e.preventDefault();
      e.stopPropagation();
      var btn = document.getElementById('lingjieHelperFloatBtn');
      if (!btn) return;
      var pos = getPos(e);
      var rect = btn.getBoundingClientRect();
      btnDragInfo = { el: btn, sx: pos.x, sy: pos.y, sl: rect.left, st: rect.top, moved: false };
    }

    function moveBtnDrag(e) {
      if (!btnDragInfo) return;
      var pos = getPos(e);
      var dx = pos.x - btnDragInfo.sx;
      var dy = pos.y - btnDragInfo.sy;
      if (Math.abs(dx) < DRAG_THRESHOLD && Math.abs(dy) < DRAG_THRESHOLD) return;
      btnDragInfo.moved = true;
      var size = btnDragInfo.el.offsetWidth;
      var nl = Math.max(0, Math.min(btnDragInfo.sl + dx, window.innerWidth - size));
      var nt = Math.max(0, Math.min(btnDragInfo.st + dy, window.innerHeight - size));
      btnDragInfo.el.style.left = nl + 'px';
      btnDragInfo.el.style.top = nt + 'px';
      btnDragInfo.el.style.right = 'auto';
      btnDragInfo.el.style.bottom = 'auto';
    }

    function endBtnDrag() {
      if (btnDragInfo && btnDragInfo.moved) {
        var rect = btnDragInfo.el.getBoundingClientRect();
        savePosition(STORAGE_KEY_BTN, rect.left, rect.top);
      }
      if (btnDragInfo && !btnDragInfo.moved) {
        togglePanel();
      }
      btnDragInfo = null;
    }

    function bindDragEvents(el) {
      el.addEventListener('mousedown', startPanelDrag);
      el.addEventListener('touchstart', startPanelDrag, { passive: false });
    }

    document.addEventListener('mousemove', function(e) { movePanelDrag(e); moveBtnDrag(e); });
    document.addEventListener('touchmove', function(e) { movePanelDrag(e); moveBtnDrag(e); }, { passive: false });
    document.addEventListener('mouseup', function() { endPanelDrag(); endBtnDrag(); });
    document.addEventListener('touchend', function() { endPanelDrag(); endBtnDrag(); });

    var panelW = isMobile ? Math.min(360, window.innerWidth - 16) : 420;
    var panelMaxH = isMobile ? Math.floor(window.innerHeight * 0.55) : Math.floor(window.innerHeight * 0.75);
    var fontSize = isMobile ? 12 : 13;
    var btnFontSize = isMobile ? 11 : 12;
    var pad = isMobile ? 8 : 10;

    var panelStyle = {
      position: 'fixed',
      width: panelW + 'px',
      maxWidth: '96vw',
      maxHeight: panelMaxH + 'px',
      background: '#1a1a2e',
      border: '1px solid rgba(201,153,58,0.3)',
      borderRadius: isMobile ? '6px' : '10px',
      zIndex: '2147483647',
      display: 'none',
      flexDirection: 'column',
      boxShadow: '0 6px 30px rgba(0,0,0,0.6)',
      fontFamily: 'system-ui, -apple-system, sans-serif',
      color: '#ccc',
      fontSize: fontSize + 'px',
      overflow: 'hidden',
      userSelect: 'none',
      WebkitUserSelect: 'none'
    };

    if (savedPanelPos.left !== null && savedPanelPos.top !== null) {
      var pl = Math.max(0, Math.min(savedPanelPos.left, window.innerWidth - panelW));
      var pt = Math.max(0, Math.min(savedPanelPos.top, window.innerHeight - 60));
      panelStyle.left = pl + 'px';
      panelStyle.top = pt + 'px';
      panelStyle.transform = 'none';
    } else {
      panelStyle.top = isMobile ? '8%' : '12%';
      panelStyle.left = '50%';
      panelStyle.transform = 'translateX(-50%)';
    }

    var panel = el('div', { id: 'lingjieHelperPanel', style: panelStyle });

    var titleBar = el('div', {
      style: {
        display: 'flex', justifyContent: 'space-between', alignItems: 'center',
        padding: (pad - 2) + 'px ' + pad + 'px',
        background: 'rgba(201,153,58,0.1)',
        borderBottom: '1px solid rgba(201,153,58,0.3)',
        flexShrink: '0', cursor: 'move', touchAction: 'none',
        minHeight: isMobile ? '32px' : '36px'
      }
    }, [
      el('span', { style: { fontWeight: 'bold', fontSize: (fontSize + 1) + 'px', color: '#c9983a', pointerEvents: 'none' }},
        (isMobile ? '' : '↕ ') + '出售助手'),
      el('span', { style: { cursor: 'pointer', fontSize: isMobile ? '22px' : '16px', color: '#888', padding: isMobile ? '6px 10px' : '2px 4px', pointerEvents: 'auto' },
        onclick: function(e) { e.stopPropagation(); hidePanel(); }
      }, '✕')
    ]);
    bindDragEvents(titleBar);
    panel.appendChild(titleBar);

    var contentArea = el('div', {
      style: { flex: '1', overflowY: 'auto', padding: pad + 'px', minHeight: isMobile ? '120px' : '180px', WebkitOverflowScrolling: 'touch' }
    });
    panel.appendChild(contentArea);

    var floatSize = isMobile ? 44 : 44;
    var btnStyle = {
      position: 'fixed',
      zIndex: '2147483646',
      width: floatSize + 'px',
      height: floatSize + 'px',
      borderRadius: '50%',
      background: 'linear-gradient(135deg, #c9983a, #e0b84c)',
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
      boxShadow: '0 4px 16px rgba(201,153,58,0.5)',
      fontSize: (floatSize * 0.5) + 'px',
      userSelect: 'none',
      touchAction: 'none',
      cursor: 'pointer',
      WebkitTapHighlightColor: 'transparent'
    };

    if (savedBtnPos.left !== null && savedBtnPos.top !== null) {
      var bl = Math.max(0, Math.min(savedBtnPos.left, window.innerWidth - floatSize));
      var bt = Math.max(0, Math.min(savedBtnPos.top, window.innerHeight - floatSize));
      btnStyle.left = bl + 'px';
      btnStyle.top = bt + 'px';
    } else {
      btnStyle.bottom = isMobile ? '16px' : '20px';
      btnStyle.right = isMobile ? '14px' : '20px';
    }

    var floatBtn = el('div', { id: 'lingjieHelperFloatBtn', style: btnStyle }, '📦');

    floatBtn.addEventListener('mousedown', startBtnDrag);
    floatBtn.addEventListener('touchstart', startBtnDrag, { passive: false });

    function hidePanel() {
      var p = document.getElementById('lingjieHelperPanel');
      if (p) p.style.display = 'none';
    }

    function togglePanel() {
      var p = document.getElementById('lingjieHelperPanel');
      if (!p) return;
      var isHidden = p.style.display === 'none';
      p.style.display = isHidden ? 'flex' : 'none';
      if (isHidden) {
        setTimeout(function() {
          var input = document.getElementById('lingjieSearchInput');
          if (input && isMobile) input.focus();
        }, 300);
      }
    }

    window.addEventListener('resize', function() {
      var p = document.getElementById('lingjieHelperPanel');
      if (p) {
        p.style.width = Math.min(isMobile ? 360 : 420, window.innerWidth - 16) + 'px';
        p.style.maxHeight = (isMobile ? Math.floor(window.innerHeight * 0.55) : Math.floor(window.innerHeight * 0.75)) + 'px';
        var rect = p.getBoundingClientRect();
        if (rect.right > window.innerWidth) p.style.left = Math.max(0, window.innerWidth - rect.width) + 'px';
        if (rect.bottom > window.innerHeight) p.style.top = Math.max(0, window.innerHeight - rect.height - 20) + 'px';
        if (rect.left < 0) p.style.left = '0px';
        if (rect.top < 0) p.style.top = '0px';
      }
      var btn = document.getElementById('lingjieHelperFloatBtn');
      if (btn) {
        var brect = btn.getBoundingClientRect();
        if (brect.right > window.innerWidth) btn.style.left = Math.max(0, window.innerWidth - floatSize) + 'px';
        if (brect.bottom > window.innerHeight) btn.style.top = Math.max(0, window.innerHeight - floatSize) + 'px';
        if (brect.left < 0) { btn.style.left = '0px'; btn.style.right = 'auto'; }
        if (brect.top < 0) { btn.style.top = '0px'; btn.style.bottom = 'auto'; }
      }
    });

    function refreshInventory(callback) {
      if (typeof loadInventory === 'function') {
        loadInventory().then(function() { if (callback) callback(); }).catch(function() { if (callback) callback(); });
      } else if (typeof api !== 'undefined') {
        api.get('/api/game/inventory').then(function(res) {
          if (res.code === 200 && Array.isArray(res.data)) {
            window._inventoryCache = res.data;
            if (typeof syncEquipGridCacheFromInventory === 'function') syncEquipGridCacheFromInventory(res.data);
          }
          if (callback) callback();
        }).catch(function() { if (callback) callback(); });
      } else {
        if (callback) callback();
      }
    }

    var currentSearchQuery = '';

    function doSearch() {
      var input = document.getElementById('lingjieSearchInput');
      currentSearchQuery = input ? input.value.trim() : '';
      renderListOnly();
    }

    function renderContent() {
      contentArea.innerHTML = '';

      contentArea.appendChild(el('div', { style: { marginBottom: '8px' }}, [
        el('div', { style: { fontSize: (fontSize + 1) + 'px', color: '#c9983a', marginBottom: '5px', fontWeight: 'bold' }}, '按回车搜索物品出售'),
        el('div', { style: { display: 'flex', gap: '5px', marginBottom: '6px' }}, [
          el('input', {
            id: 'lingjieSearchInput',
            style: {
              flex: '1', padding: (isMobile ? '10px' : '8px') + ' ' + pad + 'px',
              background: 'rgba(0,0,0,0.3)', border: '1px solid rgba(201,153,58,0.3)',
              borderRadius: isMobile ? '4px' : '6px', color: '#ccc',
              fontSize: (isMobile ? 14 : fontSize) + 'px', outline: 'none', minWidth: '0'
            },
            placeholder: '输入名称搜索...',
            value: currentSearchQuery,
            onkeydown: function(e) {
              if (e.key === 'Enter') { e.preventDefault(); this.blur(); doSearch(); }
            }
          }),
          el('button', {
            style: {
              padding: (pad - 3) + 'px ' + (isMobile ? '10px' : '12px'),
              background: 'rgba(201,153,58,0.15)', border: '1px solid #c9983a',
              borderRadius: isMobile ? '4px' : '6px', color: '#c9983a',
              cursor: 'pointer', fontSize: btnFontSize + 'px', whiteSpace: 'nowrap', flexShrink: '0',
              WebkitTapHighlightColor: 'transparent'
            },
            onclick: function(e) { e.stopPropagation(); doSearch(); }
          }, '搜索'),
          el('button', {
            style: {
              padding: (pad - 3) + 'px ' + (isMobile ? '10px' : '10px'),
              background: 'rgba(61,171,151,0.15)', border: '1px solid #3dab97',
              borderRadius: isMobile ? '4px' : '6px', color: '#3dab97',
              cursor: 'pointer', fontSize: btnFontSize + 'px', whiteSpace: 'nowrap', flexShrink: '0',
              WebkitTapHighlightColor: 'transparent'
            },
            onclick: function(e) {
              e.stopPropagation();
              var btn = this;
              btn.disabled = true;
              btn.textContent = '...';
              refreshInventory(function() {
                btn.disabled = false;
                btn.textContent = '刷新';
                renderContent();
              });
            }
          }, '刷新')
        ])
      ]));

      var listWrap = el('div', { id: 'lingjieListWrap' });
      contentArea.appendChild(listWrap);
      renderListOnly();
    }

    function renderListOnly() {
      var wrap = document.getElementById('lingjieListWrap');
      if (!wrap) return;
      wrap.innerHTML = '';

      if (typeof _inventoryCache === 'undefined' || !_inventoryCache) {
        wrap.appendChild(el('div', { style: { textAlign: 'center', color: '#888', padding: '25px 0', fontSize: fontSize + 'px' }},
          '请先打开游戏储物面板'));
        return;
      }

      var results = getSearchResults(currentSearchQuery);

      if (results.length === 0) {
        wrap.appendChild(el('div', { style: { textAlign: 'center', color: '#888', padding: '20px 0', fontSize: fontSize + 'px' }},
          currentSearchQuery ? '未找到匹配物品' : '没有可显示的物品'));
        return;
      }

      var sellableCount = 0, sellableGold = 0, unsellableCount = 0, zeroPriceCount = 0;
      results.forEach(function(item) {
        if (canSellItem(item)) {
          sellableCount += item.quantity;
          sellableGold += calcFinalSellPriceSafe(getDisplayPrice(item), item.wearRate || 0, item.inscriptionsJson || '') * item.quantity;
          if ((item.sellPrice || 0) <= 0) zeroPriceCount += item.quantity;
        } else {
          unsellableCount += item.quantity;
        }
      });

      var sf = isMobile ? '10px' : '11px';
      var statsHtml = '共' + results.length + '种 | <span style="color:#4ade80;">可售:' + sellableCount + '件 ≈ ' + formatNum(sellableGold) + '灵石</span>';
      if (zeroPriceCount > 0) statsHtml += ' <span style="color:#e0a040;font-size:10px;">(' + zeroPriceCount + '件按1灵石)</span>';
      statsHtml += ' | <span style="color:#e05050;">不可售:' + unsellableCount + '件</span>';

      wrap.appendChild(el('div', {
        style: { fontSize: sf, color: '#888', marginBottom: '8px', padding: '6px 8px', background: 'rgba(255,255,255,0.03)', borderRadius: '4px', lineHeight: '1.4' }
      }, statsHtml));

      results.forEach(function(item) {
        var sellable = canSellItem(item);
        var reasons = sellable ? [] : getUnsellableReasons(item);
        var reasonsStr = reasons.join(' / ');
        var displayPrice = getDisplayPrice(item);
        var zeroPrice = (item.sellPrice || 0) <= 0;
        var finalPrice = calcFinalSellPriceSafe(displayPrice, item.wearRate || 0, item.inscriptionsJson || '');

        var tf = isMobile ? '9px' : '10px';
        var tags = [];
        if (item.isEquipped) tags.push('<span style="color:#8fcf8f;">[已装备]</span>');
        if (item.isIncarnationEquipped) tags.push('<span style="color:#a78bfa;">[化身]</span>');
        if (item.isLocked) tags.push('<span style="color:#e0a040;">[已锁定]</span>');
        if (item.isNatal) tags.push('<span style="color:#c792ea;">[本命]</span>');
        if (item.isBound) tags.push('<span style="color:#ff8a65;">[绑定]</span>');
        var tagsStr = tags.length > 0 ? ' <span style="font-size:' + tf + ';">' + tags.join(' ') + '</span>' : '';

        var wearStr = item.wearRate > 0 ? ' <span style="color:#e0a040;font-size:' + tf + ';">[破损' + (item.wearRate / 100).toFixed(2) + '%]</span>' : '';
        var priceStr = zeroPrice && sellable ? ' <span style="color:#e0a040;font-size:' + tf + ';">[无售价]</span>' : '';

        var bs = {};
        if (sellable) {
          bs = zeroPrice
            ? { bg: 'rgba(224,160,64,0.2)', bd: '1px solid rgba(224,160,64,0.5)', c: '#e0a040', t: isMobile ? '售(1石)' : '出售(1灵石)' }
            : { bg: 'rgba(201,153,58,0.2)', bd: '1px solid rgba(201,153,58,0.5)', c: '#c9983a', t: '出售' };
        } else {
          bs = { bg: 'rgba(255,255,255,0.03)', bd: '1px solid rgba(255,255,255,0.08)', c: '#888', t: reasons[0] || '不可出售' };
        }

        var row = el('div', {
          style: {
            display: 'flex', alignItems: 'center', justifyContent: 'space-between',
            padding: (pad - 2) + 'px ' + pad + 'px', marginBottom: '4px',
            background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.06)',
            borderRadius: isMobile ? '4px' : '6px', opacity: sellable ? '1' : '0.7'
          }
        });

        row.appendChild(el('div', { style: { flex: '1', minWidth: '0', marginRight: '8px', overflow: 'hidden' }}, [
          el('div', { style: { fontWeight: 'bold', fontSize: fontSize + 'px', color: rarityColor(item.rarity), lineHeight: '1.3', wordBreak: 'break-all' }},
            escapeHtmlSafe(item.name) + ' x' + item.quantity + wearStr + priceStr + tagsStr),
          el('div', { style: { fontSize: (fontSize - 2) + 'px', color: '#888', marginTop: '2px', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }},
            (item.description || '') + ' | 单价' + formatNum(finalPrice) + '灵石')
        ]));

        var btn = el('div', {
          style: {
            padding: (isMobile ? '6px 12px' : '5px 14px'), background: bs.bg, border: bs.bd,
            borderRadius: '4px', color: bs.c, fontSize: (isMobile ? 13 : btnFontSize) + 'px', fontWeight: 'bold',
            whiteSpace: 'nowrap', flexShrink: '0', textAlign: 'center',
            minWidth: isMobile ? '60px' : '70px', cursor: sellable ? 'pointer' : 'not-allowed',
            WebkitTapHighlightColor: 'transparent'
          }
        }, reasonsStr || bs.t);

        if (sellable) {
          btn.addEventListener('click', (function(it) { return function(e) { e.stopPropagation(); sellSingleItem(it); }; })(item));
          btn.addEventListener('touchend', (function(it) { return function(e) { e.stopPropagation(); e.preventDefault(); sellSingleItem(it); }; })(item));
        }

        row.appendChild(btn);
        wrap.appendChild(row);
      });
    }

    function getSearchResults(query) {
      if (typeof _inventoryCache === 'undefined' || !_inventoryCache) return [];
      var items = _inventoryCache.filter(function(item) { return item.type !== 'currency'; });
      if (!query) return items;
      return items.filter(function(item) { return fuzzyMatch(item.name, query); });
    }

    function sellSingleItem(item) {
      if (!item) return;
      var effectivePrice = item.sellPrice > 0 ? item.sellPrice : 1;
      if (typeof sellItem === 'function') {
        sellItem(item.id, effectivePrice, item.name, item.quantity, item.wearRate || 0);
      } else {
        alert('请先打开储物面板以激活出售功能');
      }
    }

    document.body.appendChild(panel);
    document.body.appendChild(floatBtn);
    renderContent();
    console.log('✅ 灵界储物助手 v2.5 已启动 (面板默认收起)');
  }
})();
