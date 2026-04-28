// ==UserScript==
// @name         灵界储物助手
// @namespace    https://github.com/yourname/lingjie-inventory-helper
// @version      4.0
// @description  手机版储物出售工具 - 修复刷新后关闭背包
// @author       You
// @run-at       document-end
// @match        https://ling.muge.info/*
// @grant        none
// ==/UserScript==

(function() {
    'use strict';

    var oldPanel = document.getElementById('lh-ns-panel');
    if (oldPanel) oldPanel.remove();
    var oldBtn = document.getElementById('lh-ns-floatbtn');
    if (oldBtn) oldBtn.remove();
    var oldStyle = document.getElementById('lh-namespace-style');
    if (oldStyle) oldStyle.remove();

    var NS = 'lh-ns';
    var _sellItemFn = null;
    var _lastInventoryBtn = null; // ✅ 记住打开背包时用的按钮

    // ========== CSS ==========
    var styleEl = document.createElement('style');
    styleEl.id = 'lh-namespace-style';
    styleEl.textContent = [
        '#'+NS+'-panel{all:initial;position:fixed;top:5%;left:50%;transform:translateX(-50%);width:96vw;max-width:500px;max-height:85vh;background:#1a1a2e;border:2px solid #c9983a;border-radius:16px;z-index:2147483647;display:none;flex-direction:column;font-family:-apple-system,Arial,sans-serif;font-size:15px;color:#ddd;line-height:1.4;overflow:hidden;box-shadow:0 8px 40px rgba(0,0,0,0.8);-webkit-tap-highlight-color:transparent;user-select:none;-webkit-user-select:none;box-sizing:border-box}',
        '#'+NS+'-panel *,#'+NS+'-panel *::before,#'+NS+'-panel *::after{all:unset;box-sizing:border-box;font-family:inherit;font-size:inherit;color:inherit;line-height:1.4}',
        '#'+NS+'-panel .'+NS+'-titlebar{display:flex;align-items:center;justify-content:space-between;padding:14px 18px;flex-shrink:0;background:rgba(201,153,58,0.12);border-bottom:1px solid rgba(201,153,58,0.25);touch-action:none;cursor:grab}',
        '#'+NS+'-panel .'+NS+'-title{font-weight:bold;font-size:17px;color:#c9983a;pointer-events:none;letter-spacing:1px}',
        '#'+NS+'-panel .'+NS+'-close-btn{display:flex;align-items:center;justify-content:center;width:40px;height:40px;background:rgba(255,255,255,0.05);border:1px solid rgba(255,255,255,0.1);color:#ccc;font-size:20px;cursor:pointer;border-radius:8px;flex-shrink:0;pointer-events:auto;z-index:1}',
        '#'+NS+'-panel .'+NS+'-close-btn:active{background:rgba(255,80,80,0.3);border-color:#e05050;color:#e05050}',
        '#'+NS+'-panel .'+NS+'-content{flex:1;overflow-y:auto;padding:14px;-webkit-overflow-scrolling:touch;overscroll-behavior:contain;display:block}',
        '#'+NS+'-panel .'+NS+'-search-wrap{display:flex;gap:6px;margin-bottom:12px}',
        '#'+NS+'-panel .'+NS+'-search-input{flex:1;padding:12px;background:rgba(0,0,0,0.4);border:1px solid rgba(201,153,58,0.3);border-radius:10px;color:#fff;font-size:15px;outline:none;display:block;-webkit-appearance:none;min-width:0}',
        '#'+NS+'-panel .'+NS+'-search-input::placeholder{color:rgba(255,255,255,0.3)}',
        '#'+NS+'-panel .'+NS+'-search-input:focus{border-color:#c9983a}',
        '#'+NS+'-panel .'+NS+'-search-btn{padding:12px 18px;background:rgba(201,153,58,0.15);border:1px solid #c9983a;border-radius:10px;color:#c9983a;font-size:15px;font-weight:bold;cursor:pointer;white-space:nowrap;flex-shrink:0;display:flex;align-items:center}',
        '#'+NS+'-panel .'+NS+'-search-btn:active{background:rgba(201,153,58,0.3)}',
        '#'+NS+'-panel .'+NS+'-refresh-btn{padding:12px 12px;background:rgba(61,171,151,0.15);border:1px solid rgba(61,171,151,0.5);border-radius:10px;color:#3dab97;font-size:20px;cursor:pointer;white-space:nowrap;flex-shrink:0;display:flex;align-items:center;justify-content:center}',
        '#'+NS+'-panel .'+NS+'-refresh-btn:active{background:rgba(61,171,151,0.3)}',
        '#'+NS+'-panel .'+NS+'-stats{display:block;font-size:13px;color:#999;margin-bottom:10px;padding:10px 12px;background:rgba(255,255,255,0.03);border-radius:10px}',
        '#'+NS+'-panel .'+NS+'-stats b{color:#fff;font-weight:bold}',
        '#'+NS+'-panel .'+NS+'-text-green{color:#4ade80}',
        '#'+NS+'-panel .'+NS+'-text-red{color:#e05050}',
        '#'+NS+'-panel .'+NS+'-text-warn{color:#e0a040}',
        '#'+NS+'-panel .'+NS+'-item{display:flex;align-items:center;justify-content:space-between;padding:12px;margin-bottom:6px;background:rgba(255,255,255,0.03);border:1px solid rgba(255,255,255,0.08);border-radius:10px}',
        '#'+NS+'-panel .'+NS+'-item--sellable:active{background:rgba(255,255,255,0.08)}',
        '#'+NS+'-panel .'+NS+'-item--unsellable{opacity:0.7}',
        '#'+NS+'-panel .'+NS+'-item-info{flex:1;min-width:0;margin-right:10px;display:block}',
        '#'+NS+'-panel .'+NS+'-item-name{font-weight:bold;font-size:15px;margin-bottom:3px;word-break:break-all;display:block}',
        '#'+NS+'-panel .'+NS+'-item-meta{font-size:12px;color:#888;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;display:block}',
        '#'+NS+'-panel .'+NS+'-tag{display:inline-block;font-size:10px;margin-left:4px;padding:2px 6px;border-radius:3px;vertical-align:middle;line-height:1.2;font-weight:normal}',
        '#'+NS+'-panel .'+NS+'-tag--equipped{color:#4ade80;border:1px solid #4ade80}',
        '#'+NS+'-panel .'+NS+'-tag--incarnation{color:#a78bfa;border:1px solid #a78bfa}',
        '#'+NS+'-panel .'+NS+'-tag--locked{color:#e0a040;border:1px solid #e0a040}',
        '#'+NS+'-panel .'+NS+'-tag--natal{color:#c792ea;border:1px solid #c792ea}',
        '#'+NS+'-panel .'+NS+'-tag--bound{color:#ff8a65;border:1px solid #ff8a65}',
        '#'+NS+'-panel .'+NS+'-sell-btn{padding:10px 18px;border-radius:8px;font-size:14px;font-weight:bold;border:2px solid transparent;color:#fff;white-space:nowrap;flex-shrink:0;cursor:pointer;display:flex;align-items:center;justify-content:center;text-align:center;min-width:64px;transition:all 0.15s}',
        '#'+NS+'-panel .'+NS+'-sell-btn:active{transform:scale(0.94)}',
        '#'+NS+'-panel .'+NS+'-sell-btn--sell{background:#166534;border-color:#4ade80;box-shadow:0 0 8px rgba(74,222,128,0.3)}',
        '#'+NS+'-panel .'+NS+'-sell-btn--low{background:#9a3412;border-color:#f97316;box-shadow:0 0 8px rgba(249,115,22,0.3)}',
        '#'+NS+'-panel .'+NS+'-sell-btn--no{background:#7f1d1d;border-color:#ef4444;opacity:0.6}',
        '#'+NS+'-panel .'+NS+'-empty{text-align:center;color:#999;padding:40px 20px;display:block}',
        '#'+NS+'-panel .'+NS+'-notfound{text-align:center;color:#999;padding:30px;display:block}',
        '#'+NS+'-panel .'+NS+'-btn{display:inline-flex;align-items:center;justify-content:center;padding:10px 20px;border-radius:10px;font-size:14px;font-weight:bold;cursor:pointer;border:1px solid #c9983a;background:rgba(201,153,58,0.15);color:#c9983a;margin:4px}',
        '#'+NS+'-panel .'+NS+'-btn:active{background:rgba(201,153,58,0.3)}',
        '#'+NS+'-panel .'+NS+'-btn--full{width:100%;margin:6px 0}',
        '#'+NS+'-floatbtn{all:initial;position:fixed;bottom:30px;right:16px;z-index:2147483646;width:54px;height:54px;border-radius:50%;background:linear-gradient(135deg,#c9983a,#e0b84c);display:flex;align-items:center;justify-content:center;cursor:pointer;box-shadow:0 4px 20px rgba(201,153,58,0.5);font-size:28px;line-height:1;transition:transform 0.15s;-webkit-tap-highlight-color:transparent;box-sizing:border-box}',
    ].join('\n');
    document.head.appendChild(styleEl);

    // ========== 背包操作 ==========
    function openInventory() {
        console.log('[储物助手] 打开背包...');
        _lastInventoryBtn = null;

        var selectors = [
            '[onclick*="inventory"]', '[onclick*="bag"]', '[onclick*="storage"]',
            '[onclick*="openInventory"]', '[onclick*="openBag"]', '[onclick*="showInventory"]',
            '.inventory-btn', '.bag-btn', '.storage-btn',
            '#inventory-btn', '#bag-btn', '[data-action="inventory"]', '[data-action="bag"]',
        ];

        for (var i = 0; i < selectors.length; i++) {
            var btn = document.querySelector(selectors[i]);
            if (btn && btn.offsetParent !== null) {
                console.log('[储物助手] 找到背包按钮:', selectors[i]);
                _lastInventoryBtn = btn; // ✅ 记住按钮
                btn.click();
                return true;
            }
        }

        var funcNames = ['openInventory', 'openBag', 'showInventory', 'toggleInventory', 'openStorage'];
        for (var j = 0; j < funcNames.length; j++) {
            if (typeof window[funcNames[j]] === 'function') {
                console.log('[储物助手] 调用:', funcNames[j]);
                window[funcNames[j]]();
                return true;
            }
        }

        return false;
    }

    // ✅ 关闭背包：优先用记住的按钮 toggle，其次找关闭按钮，最后 ESC
    function closeInventory() {
        console.log('[储物助手] 关闭背包...');

        // 方式1：再次点击打开背包的按钮（toggle 关闭）
        if (_lastInventoryBtn && _lastInventoryBtn.offsetParent !== null) {
            console.log('[储物助手] 再次点击背包按钮关闭');
            _lastInventoryBtn.click();
            _lastInventoryBtn = null;
            return;
        }

        // 方式2：查找关闭按钮
        var closeSelectors = [
            '.inventory-panel .close-btn', '.bag-panel .close-btn',
            '.modal-overlay .close-btn', '[onclick*="closeInventory"]',
            '[onclick*="closeBag"]', '.modal-close',
            '.inventory-panel .close', '.bag-panel .close',
        ];

        for (var i = 0; i < closeSelectors.length; i++) {
            var btn = document.querySelector(closeSelectors[i]);
            if (btn && btn.offsetParent !== null) {
                console.log('[储物助手] 找到关闭按钮:', closeSelectors[i]);
                btn.click();
                return;
            }
        }

        // 方式3：查找模态框遮罩并点击
        var overlay = document.querySelector('.modal-overlay');
        if (overlay && overlay.offsetParent !== null) {
            console.log('[储物助手] 点击遮罩关闭');
            overlay.click();
            return;
        }

        // 方式4：ESC
        console.log('[储物助手] 发送 ESC 关闭');
        try {
            var esc = new KeyboardEvent('keydown', { key:'Escape', keyCode:27, bubbles:true });
            document.dispatchEvent(esc);
        } catch(e) {}
    }

    // ========== 捕获 sellItem ==========
    function captureSellFunction() {
        var names = ['sellItem','sell','doSell','onSellItem','sellInventoryItem'];
        for (var i=0;i<names.length;i++) {
            if (typeof window[names[i]]==='function') { _sellItemFn=window[names[i]]; return; }
        }
        var globals=['gameState','GameState','game','Game','app','App','store','$store'];
        for (var j=0;j<globals.length;j++) {
            var obj=window[globals[j]];
            if (obj) {
                if (typeof obj.sellItem==='function') { _sellItemFn=obj.sellItem.bind(obj); return; }
                if (typeof obj.sell==='function') { _sellItemFn=obj.sell.bind(obj); return; }
            }
        }
    }

    // ========== 数据 ==========
    function getInventoryData() {
        try {
            if (window._inventoryCache&&Array.isArray(window._inventoryCache)&&window._inventoryCache.length>0) return window._inventoryCache;
            if (typeof gameState!=='undefined'&&gameState.inventory&&Array.isArray(gameState.inventory)&&gameState.inventory.length>0) return gameState.inventory;
            if (typeof player!=='undefined'&&player.inventory) { var inv=player.inventory.items||player.inventory; if (Array.isArray(inv)&&inv.length>0) return inv; }
            if (typeof ItemManager!=='undefined'&&typeof ItemManager.getAllItems==='function') { var items=ItemManager.getAllItems(); if (Array.isArray(items)&&items.length>0) return items; }
            try { var c=localStorage.getItem('inventory_cache'); if(c){ var d=JSON.parse(c); if(Array.isArray(d)&&d.length>0) return d; } } catch(e){}
            return [];
        } catch(e) { return []; }
    }

    function saveCache(items) {
        if (items&&items.length>0) { window._inventoryCache=items; try{localStorage.setItem('inventory_cache',JSON.stringify(items));}catch(e){} }
    }

    // ✅ 刷新流程：打开背包 → 等数据 → 关闭背包 → 刷新列表
    function manualRefresh() {
        console.log('[储物助手] ===== 开始刷新 =====');
        openInventory();
        setTimeout(function() {
            var data = getInventoryData();
            if (data && data.length > 0) saveCache(data);
            closeInventory(); // ✅ 关闭背包
            render();
            var btn = document.getElementById(NS+'-refresh-btn');
            if (btn) { btn.textContent='🔄'; btn.style.opacity='1'; }
            console.log('[储物助手] ===== 刷新完成 =====');
        }, 2500);
    }

    function hideAfterSell() {
        panel.style.display = 'none';
    }

    // ========== 工具函数 ==========
    function canSell(item) {
        if (!item) return false;
        if (item.type==='currency') return false;
        if (item.isEquipped||item.isIncarnationEquipped) return false;
        if (item.isLocked) return false;
        if (item.isNatal||item.isBound) return false;
        if (item.tradeCooldown&&item.tradeCooldown>Date.now()) return false;
        return true;
    }

    function matchItem(item, query) {
        if (!query) return true;
        var q=query.toLowerCase();
        return (item.name||'').toLowerCase().indexOf(q)>=0||(item.type||'').toLowerCase().indexOf(q)>=0;
    }

    function esc(s) { return String(s||'').replace(/</g,'&lt;').replace(/>/g,'&gt;'); }

    function fmtNum(n) {
        if (n>=10000000) return (n/10000000).toFixed(1)+'千万';
        if (n>=10000) return (n/10000).toFixed(1)+'万';
        return (n||0).toLocaleString();
    }

    function getRarityColor(r) { return ['','#aaa','#4ade80','#60a5fa','#c084fc','#fbbf24'][r]||'#aaa'; }

    function getUnsellableReason(item) {
        if (item.type==='currency') return '灵石';
        if (item.isEquipped) return '装备中';
        if (item.isIncarnationEquipped) return '化身';
        if (item.isLocked) return '锁定';
        if (item.isNatal) return '本命';
        if (item.isBound) return '绑定';
        return '不可售';
    }

    // ========== 拖拽 ==========
    var dragInfo={active:false,sx:0,sy:0,sl:0,st:0,el:null};
    function getTouchPos(e){var t=e.touches&&e.touches[0];return t?{x:t.clientX,y:t.clientY}:{x:e.clientX,y:e.clientY};}
    function onDragStart(e){
        if(e.target.tagName==='BUTTON'||e.target.tagName==='INPUT'||e.target.tagName==='SELECT')return;
        var p=document.getElementById(NS+'-panel');if(!p)return;
        var pos=getTouchPos(e),rect=p.getBoundingClientRect();
        dragInfo.active=true;dragInfo.sx=pos.x;dragInfo.sy=pos.y;dragInfo.sl=rect.left;dragInfo.st=rect.top;dragInfo.el=p;
        p.style.transition='none';e.preventDefault();
    }
    function onDragMove(e){
        if(!dragInfo.active)return;
        var pos=getTouchPos(e),dx=pos.x-dragInfo.sx,dy=pos.y-dragInfo.sy;
        var l=Math.max(0,Math.min(dragInfo.sl+dx,window.innerWidth-dragInfo.el.offsetWidth));
        var t=Math.max(0,Math.min(dragInfo.st+dy,window.innerHeight-dragInfo.el.offsetHeight));
        dragInfo.el.style.left=l+'px';dragInfo.el.style.top=t+'px';dragInfo.el.style.transform='none';e.preventDefault();
    }
    function onDragEnd(){dragInfo.active=false;if(dragInfo.el)dragInfo.el.style.transition='';dragInfo.el=null;}

    // ========== DOM ==========
    function h(tag,cls,attrs,children){
        var el=document.createElement(tag);
        if(cls)el.className=NS+'-'+cls;
        if(attrs)Object.keys(attrs).forEach(function(k){
            if(k==='style'&&typeof attrs[k]==='object')Object.keys(attrs[k]).forEach(function(s){el.style[s]=attrs[k][s];});
            else if(k.startsWith('on'))el.addEventListener(k.slice(2).toLowerCase(),attrs[k]);
            else el.setAttribute(k,attrs[k]);
        });
        if(children){if(typeof children==='string')el.textContent=children;else if(Array.isArray(children))children.forEach(function(c){if(c)el.appendChild(c);});else el.appendChild(children);}
        return el;
    }

    // ========== 界面 ==========
    var panel=h('div','panel',{id:NS+'-panel'});
    var closeBtn=h('button','close-btn',{},'✕');
    closeBtn.addEventListener('click',function(e){e.stopPropagation();e.preventDefault();panel.style.display='none';});
    closeBtn.addEventListener('touchend',function(e){e.stopPropagation();e.preventDefault();panel.style.display='none';});
    var titleBar=h('div','titlebar',{},[h('span','title',{},'📦 储物助手'),closeBtn]);
    titleBar.addEventListener('touchstart',onDragStart,{passive:false});titleBar.addEventListener('mousedown',onDragStart);
    document.addEventListener('touchmove',onDragMove,{passive:false});document.addEventListener('mousemove',onDragMove);
    document.addEventListener('touchend',onDragEnd);document.addEventListener('mouseup',onDragEnd);
    panel.appendChild(titleBar);
    var contentArea=h('div','content');panel.appendChild(contentArea);
    var floatBtn=h('div','floatbtn',{id:NS+'-floatbtn'},'📦');
    floatBtn.addEventListener('touchstart',function(){this.style.transform='scale(0.85)';});
    floatBtn.addEventListener('touchend',function(){this.style.transform='scale(1)';});
    floatBtn.addEventListener('click',function(){
        if(panel.style.display==='none'||panel.style.display===''){panel.style.display='flex';render();}
        else{panel.style.display='none';}
    });

    // ========== 渲染 ==========
    function render(){
        var data=getInventoryData(),query=panel._query||'';
        contentArea.innerHTML='';
        contentArea.appendChild(h('div','search-wrap',{},[
            h('input','search-input',{type:'search',placeholder:'搜索物品...',value:query,id:NS+'-search-input'}),
            h('button','search-btn',{id:NS+'-search-btn',title:'搜索'},'搜索'),
            h('button','refresh-btn',{id:NS+'-refresh-btn',title:'自动打开背包获取最新数据'},'🔄')
        ]));
        if(!data||data.length===0){
            var empty=h('div','empty');
            empty.innerHTML='<div style="font-size:48px;margin-bottom:12px;">📭</div><div style="font-size:15px;">暂无背包数据</div><div style="font-size:12px;color:#777;margin:8px 0;">点击 🔄 自动打开背包获取</div>';
            empty.appendChild(h('button','btn btn--full',{onclick:function(){manualRefresh();}},'🔄 刷新数据'));
            contentArea.appendChild(empty);
        }else{
            var results=data.filter(function(item){return matchItem(item,query);});
            results.sort(function(a,b){return (canSell(a)?0:1)-(canSell(b)?0:1);});
            var sc=0,sg=0,uc=0;
            results.forEach(function(item){if(canSell(item)){sc+=item.quantity||1;sg+=(item.sellPrice||1)*(item.quantity||1);}else{uc+=item.quantity||1;}});
            var statsDiv=h('div','stats');statsDiv.innerHTML='共 <b>'+results.length+'</b> 种'+(sc>0?' <span class="'+NS+'-text-green">可售 <b>'+sc+'</b>件 ≈ <b>'+fmtNum(sg)+'</b>灵石</span>':'')+(uc>0?' <span class="'+NS+'-text-red">不可售 '+uc+'件</span>':'');
            contentArea.appendChild(statsDiv);
            if(results.length===0)contentArea.appendChild(h('div','notfound',{},'未找到匹配的物品'));
            if(!_sellItemFn)captureSellFunction();
            if(!_sellItemFn&&typeof sellItem==='function')_sellItemFn=sellItem;
            results.forEach(function(item,i){
                var sellable=canSell(item),rColor=getRarityColor(item.rarity),price=item.sellPrice||1,reason=sellable?'':getUnsellableReason(item);
                var tagHtml='';
                if(item.isEquipped)tagHtml+='<span class="'+NS+'-tag '+NS+'-tag--equipped">装备中</span>';
                if(item.isIncarnationEquipped)tagHtml+='<span class="'+NS+'-tag '+NS+'-tag--incarnation">化身</span>';
                if(item.isLocked)tagHtml+='<span class="'+NS+'-tag '+NS+'-tag--locked">锁定</span>';
                if(item.isNatal)tagHtml+='<span class="'+NS+'-tag '+NS+'-tag--natal">本命</span>';
                if(item.isBound)tagHtml+='<span class="'+NS+'-tag '+NS+'-tag--bound">绑定</span>';
                var btnCls,btnText;
                if(sellable){btnCls=((item.sellPrice||0)<=0)?'sell-btn--low':'sell-btn--sell';btnText=((item.sellPrice||0)<=0)?'出售(1灵石)':'出售';}
                else{btnCls='sell-btn--no';btnText=reason;}
                var itemRow=h('div','item'+(sellable?' item--sellable':' item--unsellable'));
                itemRow.addEventListener('click',function(idx){return function(e){if(e.target.classList.contains(NS+'-sell-btn'))return;sellItem(idx);};}(i));
                var itemInfo=h('div','item-info');
                var nameDiv=h('div','item-name',{style:{color:rColor}});
                nameDiv.innerHTML=esc(item.name)+' <span style="font-size:12px;color:#888;font-weight:normal;">×'+(item.quantity||1)+'</span>'+tagHtml;
                itemInfo.appendChild(nameDiv);
                var metaDiv=h('div','item-meta');
                metaDiv.innerHTML=fmtNum(price)+'灵石 · '+(item.type||'物品')+(item.rarity?' · '+['','普通','优良','稀有','史诗','传说'][item.rarity]:'')+(item.wearRate>0?' <span style="color:#e0a040;">破损</span>':'');
                itemInfo.appendChild(metaDiv);
                var sellBtn=h('button','sell-btn '+btnCls,{style:{cursor:sellable?'pointer':'default'}},btnText);
                sellBtn.addEventListener('click',function(idx){return function(e){e.stopPropagation();e.preventDefault();sellItem(idx);};}(i));
                itemRow.appendChild(itemInfo);itemRow.appendChild(sellBtn);contentArea.appendChild(itemRow);
            });
        }
        var si=document.getElementById(NS+'-search-input');
        if(si){si.addEventListener('keydown',function(e){if(e.key==='Enter'){e.preventDefault();panel._query=this.value||'';render();}});setTimeout(function(){si.focus();},100);}
        var sb=document.getElementById(NS+'-search-btn');
        if(sb)sb.addEventListener('click',function(){var i=document.getElementById(NS+'-search-input');panel._query=i?i.value||'':'';render();});
        var rb=document.getElementById(NS+'-refresh-btn');
        if(rb)rb.addEventListener('click',function(){rb.textContent='⏳';rb.style.opacity='0.6';manualRefresh();});
        panel._results=results;
    }

    // ========== 出售 ==========
    function sellItem(index){
        var results=panel._results;if(!results||index<0||index>=results.length)return;
        var item=results[index];if(!item||!canSell(item))return;
        var price=item.sellPrice||1;
        if(item.rarity>=5&&['weapon','armor','accessory','ring'].indexOf(item.type)>=0)if(!confirm('⚠ 出售传说装备\n\n'+item.name+'\n'+fmtNum(price)+' 灵石\n\n确定？'))return;
        doSell(item,price);
    }

    function doSell(item,price){
        var sold=false;
        if(_sellItemFn)try{_sellItemFn(item.id,price,item.name,item.quantity||1,item.wearRate||0);sold=true;}catch(e){}
        if(!sold&&typeof sellItem==='function')try{sellItem(item.id,price,item.name,item.quantity||1,item.wearRate||0);sold=true;}catch(e){}
        if(!sold){alert('⚠ 未找到出售函数\n\n请先打开游戏储物面板，再点 🔄 刷新。');return;}
        hideAfterSell();
    }

    // ========== 启动 ==========
    function init(){
        document.body.appendChild(panel);document.body.appendChild(floatBtn);
        captureSellFunction();
        var d=getInventoryData();if(d&&d.length>0)saveCache(d);
        panel._query='';panel.style.display='none';
        console.log('✅ 储物助手 v4.0 | 刷新后自动关闭背包');
    }
    if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',init);else init();
})();