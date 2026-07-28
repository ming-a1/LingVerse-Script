// ==UserScript==
// @name         操作区折叠
// @namespace    https://ling.muge.info/
// @version      1.5.4
// @description  在操作按钮上方添加收起/展开按钮，点击可向下收起或展开操作区域面板（含底部功能按钮组）
// @author       Minis
// @match        https://ling.muge.info/*
// @grant        none
// @run-at       document-idle
// ==/UserScript==

(function () {
  'use strict';

  const PANEL_KEY = 'ling_meditation_toggle_collapsed';
  const SECTION_KEY_PREFIX = 'ling_section_collapsed_';
  const PANEL_KEY_LEFT = 'ling_player_panel_collapsed';

  // ---- 样式 ----
  const style = document.createElement('style');
  style.textContent = `
    /* 右侧操作区折叠按钮 */
    #meditation-toggle-btn {
      display: flex; align-items: center; justify-content: center;
      width: 100%; height: 24px;
      background: rgba(138, 94, 30, 0.06);
      border: 1px solid rgba(138, 94, 30, 0.15);
      border-radius: 5px;
      color: rgb(138, 94, 30); font-size: 11px; font-weight: 500;
      font-family: inherit; letter-spacing: 0.5px;
      cursor: pointer; user-select: none; -webkit-tap-highlight-color: transparent;
      transition: background 0.2s; flex: 0 0 100%; box-sizing: border-box;
    }
    #meditation-toggle-btn:active { background: rgba(138, 94, 30, 0.12); }
    .meditation-toggle-hide { display: none !important; }

    /* 左侧区块折叠按钮 */
    .section-toggle-btn {
      display: inline-flex; align-items: center; justify-content: center;
      width: 20px; height: 20px;
      background: rgba(138, 94, 30, 0.06);
      border: 1px solid rgba(138, 94, 30, 0.15);
      border-radius: 3px;
      color: rgb(138, 94, 30); font-size: 9px;
      cursor: pointer; margin-left: 6px; vertical-align: middle;
      transition: background 0.2s; flex-shrink: 0;
    }
    .section-toggle-btn:active { background: rgba(138, 94, 30, 0.12); }
    .section-content-hide { display: none !important; }

    /* 左侧面板整体折叠 */
    #player-panel-side-toggle {
      position: fixed; left: 0; top: 50%;
      width: 24px; height: 60px;
      background: rgba(138, 94, 30, 0.15);
      border: 1px solid rgba(138, 94, 30, 0.25);
      border-left: none; border-radius: 0 5px 5px 0;
      color: rgb(138, 94, 30); font-size: 10px;
      writing-mode: vertical-rl; cursor: grab; z-index: 100;
      display: none; align-items: center; justify-content: center;
    }
    #player-panel-side-toggle:active { cursor: grabbing; background: rgba(138, 94, 30, 0.3); }

    #playerPanel.panel-collapsed {
      position: fixed; left: -240px; top: 0; height: 100vh; width: 240px;
      transition: left 0.3s ease; z-index: 99; overflow: visible;
      margin: 0; padding: 0;
    }
    #playerPanel.panel-collapsed .panel-section,
    #playerPanel.panel-collapsed .player-panel-samsara-entry,
    #playerPanel.panel-collapsed .panel-server-credit,
    #playerPanel.panel-collapsed .player-panel-footer { display: none !important; }
    #playerPanel:not(.panel-collapsed) { transition: left 0.3s ease; }

    /* 收起后主内容区贴边 */
    .main-panel { transition: margin-left 0.3s ease; }
    body.panel-collapsed-active .main-panel { margin-left: 0 !important; }
  `;
  document.head.appendChild(style);

  // ---- 右侧操作区折叠 ----
  function init() {
    const primaryGroup = document.querySelector('.action-group--primary');
    const secondaryGroup = document.querySelector('#bottomBarActionGroup');
    const actionBar = document.querySelector('.action-bar');
    if (!primaryGroup || !actionBar) { setTimeout(init, 500); return; }
    if (document.querySelector('#meditation-toggle-btn')) return;

    const toggleBtn = document.createElement('button');
    toggleBtn.id = 'meditation-toggle-btn';
    toggleBtn.textContent = '收起操作区';
    actionBar.insertBefore(toggleBtn, primaryGroup);

    const wasCollapsed = localStorage.getItem(PANEL_KEY) === '1';
    if (wasCollapsed) {
      primaryGroup.classList.add('meditation-toggle-hide');
      if (secondaryGroup) secondaryGroup.classList.add('meditation-toggle-hide');
      toggleBtn.classList.add('collapsed');
      toggleBtn.textContent = '展开操作区';
    }

    toggleBtn.addEventListener('click', function (e) {
      e.preventDefault(); e.stopPropagation();
      const isHidden = primaryGroup.classList.contains('meditation-toggle-hide');
      if (isHidden) {
        primaryGroup.classList.remove('meditation-toggle-hide');
        if (secondaryGroup) secondaryGroup.classList.remove('meditation-toggle-hide');
        toggleBtn.classList.remove('collapsed');
        toggleBtn.textContent = '收起操作区';
        localStorage.setItem(PANEL_KEY, '0');
      } else {
        primaryGroup.classList.add('meditation-toggle-hide');
        if (secondaryGroup) secondaryGroup.classList.add('meditation-toggle-hide');
        toggleBtn.classList.add('collapsed');
        toggleBtn.textContent = '展开操作区';
        localStorage.setItem(PANEL_KEY, '1');
      }
    });
  }

  // ---- 左侧各区块独立折叠 ----
  function moveElements() { return false; } // 不再移动DOM

  function initSections() {
    const playerPanel = document.querySelector('#playerPanel');
    if (!playerPanel) { setTimeout(initSections, 500); return; }
    if (document.querySelector('.section-toggle-btn')) return;

    const sections = playerPanel.querySelectorAll('.panel-section');
    sections.forEach(function (section, i) {
      const title = section.querySelector('h3');
      if (!title) return;

      const contentElements = Array.from(section.children).filter(function (c) { return c.tagName !== 'H3'; });
      if (contentElements.length === 0) return;

      const btn = document.createElement('button');
      btn.className = 'section-toggle-btn';
      btn.textContent = '▲';
      btn.title = '收起/展开';
      title.appendChild(btn);

      const storageKey = SECTION_KEY_PREFIX + i;
      const wasCollapsed = localStorage.getItem(storageKey) === '1';
      if (wasCollapsed) {
        contentElements.forEach(function (c) { c.classList.add('section-content-hide'); });
        btn.textContent = '▼';
        // 如果"其他"是最后一个区块且已折叠，也隐藏轮回等
        if (i === sections.length - 1) {
          playerPanel.querySelectorAll('.player-panel-samsara-entry, .panel-server-credit, .player-panel-footer').forEach(function(el) {
            el.style.display = 'none';
          });
        }
      }

      btn.addEventListener('click', function (e) {
        e.preventDefault(); e.stopPropagation();
        const isHidden = contentElements[0].classList.contains('section-content-hide');
        if (isHidden) {
          contentElements.forEach(function (c) { c.classList.remove('section-content-hide'); });
          btn.textContent = '▲';
          localStorage.setItem(storageKey, '0');
          // 展开"其他"时也展开轮回、服务器、底部栏
          if (i === sections.length - 1) {
            playerPanel.querySelectorAll('.player-panel-samsara-entry, .panel-server-credit, .player-panel-footer').forEach(function(el) {
              el.style.display = '';
            });
          }
        } else {
          contentElements.forEach(function (c) { c.classList.add('section-content-hide'); });
          btn.textContent = '▼';
          localStorage.setItem(storageKey, '1');
          // 收起"其他"时也收起轮回、服务器、底部栏
          if (i === sections.length - 1) {
            playerPanel.querySelectorAll('.player-panel-samsara-entry, .panel-server-credit, .player-panel-footer').forEach(function(el) {
              el.style.display = 'none';
            });
          }
        }
      });
    });
  }

  // ---- 判断是否PC端 ----
  function isPC() {
    return window.innerWidth > 768;
  }

  // ---- 左侧面板整体贴边折叠（可拖动，仅PC端） ----
  function initPanelCollapse() {
    if (!isPC()) return; // 移动端不显示整体收起按钮
    const playerPanel = document.querySelector('#playerPanel');
    if (!playerPanel) { setTimeout(initPanelCollapse, 500); return; }
    if (document.querySelector('#player-panel-side-toggle')) return;

    // 创建侧边展开按钮
    const sideBtn = document.createElement('button');
    sideBtn.id = 'player-panel-side-toggle';
    sideBtn.textContent = '展开面板';
    document.body.appendChild(sideBtn);

    // 恢复上次位置
    const savedTop = localStorage.getItem('ling_panel_btn_top');
    if (savedTop) sideBtn.style.top = savedTop + 'px';
    else sideBtn.style.top = '50%';
    sideBtn.style.transform = 'none';

    // 恢复上次状态
    const wasCollapsed = localStorage.getItem(PANEL_KEY_LEFT) === '1';
    if (wasCollapsed) {
      playerPanel.classList.add('panel-collapsed');
      sideBtn.style.display = 'flex';
    }

    // 点击展开
    sideBtn.addEventListener('click', function (e) {
      e.preventDefault(); e.stopPropagation();
      playerPanel.classList.remove('panel-collapsed');
      document.body.classList.remove('panel-collapsed-active');
      sideBtn.style.display = 'none';
      localStorage.setItem(PANEL_KEY_LEFT, '0');
    });

    // 拖动功能
    let isDragging = false, startY = 0, startTop = 0;
    sideBtn.addEventListener('mousedown', function (e) {
      isDragging = true;
      startY = e.clientY;
      startTop = sideBtn.getBoundingClientRect().top;
      e.preventDefault();
    });
    document.addEventListener('mousemove', function (e) {
      if (!isDragging) return;
      let newTop = startTop + (e.clientY - startY);
      // 限制在视窗范围内，不脱离左侧边
      newTop = Math.max(0, Math.min(window.innerHeight - 60, newTop));
      sideBtn.style.top = newTop + 'px';
    });
    document.addEventListener('mouseup', function () {
      if (isDragging) {
        isDragging = false;
        localStorage.setItem('ling_panel_btn_top', Math.round(sideBtn.getBoundingClientRect().top));
      }
    });

    // 整体折叠按钮
    const firstTitle = playerPanel.querySelector('.panel-section h3');
    if (firstTitle) {
      const collapseAllBtn = document.createElement('button');
      collapseAllBtn.className = 'section-toggle-btn';
      collapseAllBtn.textContent = '◁';
      collapseAllBtn.title = '收起整个面板';
      collapseAllBtn.style.marginLeft = 'auto';
      firstTitle.insertBefore(collapseAllBtn, firstTitle.firstChild);

      collapseAllBtn.addEventListener('click', function (e) {
        e.preventDefault(); e.stopPropagation();
        playerPanel.classList.add('panel-collapsed');
        document.body.classList.add('panel-collapsed-active');
        sideBtn.style.display = 'flex';
        localStorage.setItem(PANEL_KEY_LEFT, '1');
      });
    }
  }

  // ---- MutationObserver 监听DOM变化并重新移动元素 ----
  function startObserver() {
    const playerPanel = document.querySelector('#playerPanel');
    if (!playerPanel) return;

    const observer = new MutationObserver(function () {
      moveElements();
    });
    observer.observe(playerPanel, { childList: true, subtree: true });
  }

  if (document.readyState === 'complete') { init(); initSections(); initPanelCollapse(); startObserver(); } else {
    window.addEventListener('load', function() { init(); initSections(); initPanelCollapse(); startObserver(); });
  }
  setTimeout(function() { init(); initSections(); initPanelCollapse(); startObserver(); }, 2000);
  setTimeout(moveElements, 3000);
  setTimeout(moveElements, 5000);
})();
