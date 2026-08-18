// ==UserScript==
// @name         操作区折叠
// @namespace    https://ling.muge.info/
// @version      1.7.9
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

  const style = document.createElement('style');
  style.textContent = `
    .game-page #meditation-toggle-wrap {
      display: flex; align-items: center; gap: 8px;
      width: 100%; flex: 0 0 auto; box-sizing: border-box;
      padding: 4px 8px;
    }
    @media (min-width: 769px) {
      .game-page #meditation-toggle-wrap {
        padding: 0;
      }
    }
    .game-page #meditation-toggle-btn {
      display: flex; align-items: center; justify-content: center;
      flex: 1; height: 24px;
      background: rgba(138, 94, 30, 0.06);
      border: 1px solid rgba(138, 94, 30, 0.15);
      border-radius: 5px;
      color: rgb(138, 94, 30); font-size: 11px; font-weight: 500;
      font-family: inherit; letter-spacing: 0.5px;
      cursor: pointer; user-select: none; -webkit-tap-highlight-color: transparent;
      transition: background 0.2s;
    }
    .game-page #meditation-toggle-btn:active { background: rgba(138, 94, 30, 0.12); }
    .game-page #actionBarBody.meditation-toggle-hide,
    .game-page #meditationBar.meditation-toggle-hide { display: none !important; }

    .game-page #meditation-info {
      display: none; align-items: center; gap: 6px;
      font-size: 11px; color: rgb(138, 94, 30);
      font-family: inherit; white-space: nowrap;
    }
    .game-page #meditation-info.visible { display: flex; }
    .game-page #meditation-info .med-stop-btn {
      background: rgba(138, 94, 30, 0.1);
      border: 1px solid rgba(138, 94, 30, 0.2);
      border-radius: 3px;
      color: rgb(138, 94, 30); font-size: 10px;
      padding: 2px 8px; cursor: pointer;
    }
    .game-page #meditation-info .med-stop-btn:active { background: rgba(138, 94, 30, 0.2); }

    .game-page .section-toggle-btn {
      display: inline-flex; align-items: center; justify-content: center;
      width: 20px; height: 20px;
      background: rgba(138, 94, 30, 0.06);
      border: 1px solid rgba(138, 94, 30, 0.15);
      border-radius: 3px;
      color: rgb(138, 94, 30); font-size: 9px;
      cursor: pointer; margin-left: 6px; vertical-align: middle;
      transition: background 0.2s; flex-shrink: 0;
    }
    .game-page .section-toggle-btn:active { background: rgba(138, 94, 30, 0.12); }
    .game-page .section-content-hide { display: none !important; }

    .game-page #player-panel-side-toggle {
      position: fixed; left: 0; top: 50%;
      width: 24px; height: 60px;
      background: rgba(138, 94, 30, 0.15);
      border: 1px solid rgba(138, 94, 30, 0.25);
      border-left: none; border-radius: 0 5px 5px 0;
      color: rgb(138, 94, 30); font-size: 10px;
      writing-mode: vertical-rl; cursor: grab; z-index: 100;
      display: none; align-items: center; justify-content: center;
    }
    .game-page #player-panel-side-toggle:active { cursor: grabbing; background: rgba(138, 94, 30, 0.3); }
    .game-page #playerPanel.panel-collapsed {
      position: fixed; left: -240px; top: 0; height: 100vh; width: 240px;
      transition: left 0.3s ease; z-index: 99; overflow: visible;
      margin: 0; padding: 0;
    }
    .game-page #playerPanel.panel-collapsed .panel-section,
    .game-page #playerPanel.panel-collapsed .player-panel-samsara-entry,
    .game-page #playerPanel.panel-collapsed .panel-server-credit,
    .game-page #playerPanel.panel-collapsed .player-panel-footer { display: none !important; }
    .game-page #playerPanel:not(.panel-collapsed) { transition: left 0.3s ease; }
    .game-page .main-panel { transition: margin-left 0.3s ease; }
    .game-page.panel-collapsed-active .main-panel { margin-left: 0 !important; }

    /* 移动端隐藏游戏内置收起按钮 */
    @media (max-width: 768px) {
      .game-page #actionBarCollapseToggle { display: none !important; }
    }
  `;
  document.head.appendChild(style);

  function isMeditating() {
    const meditateBtn = document.querySelector('#meditateBtn');
    return meditateBtn && meditateBtn.classList.contains('meditating');
  }

  let isActionCollapsed = false;

  function init() {
    const actionBarBody = document.querySelector('#actionBarBody');
    const actionBar = document.querySelector('.action-bar');
    if (!actionBarBody || !actionBar) { setTimeout(init, 500); return; }
    if (document.querySelector('#meditation-toggle-wrap')) return;

    const meditationBar = document.querySelector('#meditationBar');

    const wrap = document.createElement('div');
    wrap.id = 'meditation-toggle-wrap';
    actionBar.insertBefore(wrap, actionBarBody);

    const toggleBtn = document.createElement('button');
    toggleBtn.id = 'meditation-toggle-btn';
    toggleBtn.textContent = '收起操作区';
    wrap.appendChild(toggleBtn);

    const medInfo = document.createElement('div');
    medInfo.id = 'meditation-info';
    medInfo.innerHTML = '<span id="med-spirit-percent">识 ---%</span><button class="med-stop-btn" id="med-stop-btn">收功</button>';
    wrap.appendChild(medInfo);

    medInfo.querySelector('#med-stop-btn').addEventListener('click', function (e) {
      e.preventDefault(); e.stopPropagation();
      if (typeof handleStopMeditate === 'function') handleStopMeditate();
    });

    function updateMeditationState() {
      const percentEl = document.querySelector('#med-spirit-percent');
      if (!percentEl) return;
      if (isActionCollapsed && isMeditating()) {
        const spiritEl = document.querySelector('.med-stat--spirit');
        if (spiritEl) {
          const text = spiritEl.textContent;
          const match = text.match(/(\d+)%/);
          if (match) percentEl.textContent = '识 ' + match[1] + '%';
        }
        medInfo.classList.add('visible');
      } else {
        medInfo.classList.remove('visible');
      }
    }
    setInterval(updateMeditationState, 2000);

    const wasCollapsed = localStorage.getItem(PANEL_KEY) === '1';
    if (wasCollapsed) {
      if (actionBarBody) actionBarBody.classList.add('meditation-toggle-hide');
      if (meditationBar) meditationBar.classList.add('meditation-toggle-hide');
      toggleBtn.textContent = '展开操作区';
      isActionCollapsed = true;
      updateMeditationState();
    }

    toggleBtn.onclick = function (e) {
      e.preventDefault(); e.stopPropagation();
      const isHidden = actionBarBody && actionBarBody.classList.contains('meditation-toggle-hide');
      if (isHidden) {
        if (actionBarBody) actionBarBody.classList.remove('meditation-toggle-hide');
        if (meditationBar) meditationBar.classList.remove('meditation-toggle-hide');
        toggleBtn.textContent = '收起操作区';
        isActionCollapsed = false;
        medInfo.classList.remove('visible');
        localStorage.setItem(PANEL_KEY, '0');
      } else {
        if (actionBarBody) actionBarBody.classList.add('meditation-toggle-hide');
        if (meditationBar) meditationBar.classList.add('meditation-toggle-hide');
        toggleBtn.textContent = '展开操作区';
        isActionCollapsed = true;
        localStorage.setItem(PANEL_KEY, '1');
        updateMeditationState();
      }
    };
  }

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
          if (i === sections.length - 1) {
            playerPanel.querySelectorAll('.player-panel-samsara-entry, .panel-server-credit, .player-panel-footer').forEach(function(el) {
              el.style.display = '';
            });
          }
        } else {
          contentElements.forEach(function (c) { c.classList.add('section-content-hide'); });
          btn.textContent = '▼';
          localStorage.setItem(storageKey, '1');
          if (i === sections.length - 1) {
            playerPanel.querySelectorAll('.player-panel-samsara-entry, .panel-server-credit, .player-panel-footer').forEach(function(el) {
              el.style.display = 'none';
            });
          }
        }
      });
    });
  }

  function isPC() {
    return window.innerWidth > 768;
  }

  function initPanelCollapse() {
    if (!isPC()) return;
    const playerPanel = document.querySelector('#playerPanel');
    if (!playerPanel) { setTimeout(initPanelCollapse, 500); return; }
    if (document.querySelector('#player-panel-side-toggle')) return;

    const sideBtn = document.createElement('button');
    sideBtn.id = 'player-panel-side-toggle';
    sideBtn.textContent = '展开面板';
    document.body.appendChild(sideBtn);

    const savedTop = localStorage.getItem('ling_panel_btn_top');
    if (savedTop) sideBtn.style.top = savedTop + 'px';
    else sideBtn.style.top = '50%';
    sideBtn.style.transform = 'none';

    const gamePage = document.querySelector('.game-page');
    const wasCollapsed = localStorage.getItem(PANEL_KEY_LEFT) === '1';
    if (wasCollapsed) {
      playerPanel.classList.add('panel-collapsed');
      sideBtn.style.display = 'flex';
    }

    sideBtn.addEventListener('click', function (e) {
      e.preventDefault(); e.stopPropagation();
      playerPanel.classList.remove('panel-collapsed');
      if (gamePage) gamePage.classList.remove('panel-collapsed-active');
      sideBtn.style.display = 'none';
      localStorage.setItem(PANEL_KEY_LEFT, '0');
    });

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
      newTop = Math.max(0, Math.min(window.innerHeight - 60, newTop));
      sideBtn.style.top = newTop + 'px';
    });
    document.addEventListener('mouseup', function () {
      if (isDragging) {
        isDragging = false;
        localStorage.setItem('ling_panel_btn_top', Math.round(sideBtn.getBoundingClientRect().top));
      }
    });

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
        if (gamePage) gamePage.classList.add('panel-collapsed-active');
        sideBtn.style.display = 'flex';
        localStorage.setItem(PANEL_KEY_LEFT, '1');
      });
    }
  }

  if (document.readyState === 'complete') { init(); initSections(); initPanelCollapse(); } else {
    window.addEventListener('load', function() { init(); initSections(); initPanelCollapse(); });
  }
  setTimeout(function() { init(); initSections(); initPanelCollapse(); }, 2000);
})();
