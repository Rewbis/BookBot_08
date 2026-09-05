// Defined at top level so mobile inline handlers can always reach it
const MOBILE_BREAKPOINT = 1024;
window._isMobile = () => window.innerWidth <= MOBILE_BREAKPOINT;

// Apply the correct layout mode. Mobile = all sections visible as one long page;
// desktop = one active tab. Called on load and whenever the viewport crosses the breakpoint.
window._applyLayoutMode = function() {
    const sections = document.querySelectorAll('.tab-content');
    if (window._isMobile()) {
        sections.forEach(el => el.style.removeProperty('display'));
        if (window.ChapterCPanel) window.ChapterCPanel.renderAllChapters();
        if (window.ArchitecturePanel) window.ArchitecturePanel.init();
    } else {
        const active = document.querySelector('.tab-btn.active');
        const activeId = active ? active.dataset.tab : 'tab-a';
        sections.forEach(el => { el.style.display = el.id === activeId ? 'block' : 'none'; });
    }
};

window._gotoTab = function(tabId) {
    if (window._isMobile()) {
        // Mobile: all sections visible, just scroll to the right one
        const el = document.getElementById(tabId);
        if (el) el.scrollIntoView({ behavior: 'smooth', block: 'start' });
        const sel = document.getElementById('mobile-tab-select');
        if (sel) sel.value = tabId;
    } else {
        // Desktop: normal tab switching
        document.querySelectorAll('.tab-btn').forEach(x => {
            x.classList.toggle('active', x.dataset.tab === tabId);
        });
        document.querySelectorAll('.tab-content').forEach(x => {
            x.style.display = x.id === tabId ? 'block' : 'none';
        });
        const sel = document.getElementById('mobile-tab-select');
        if (sel) sel.value = tabId;
        if (tabId === 'tab-c' && window.ChapterCPanel) window.ChapterCPanel.renderAllChapters();
        if (tabId === 'tab-arch' && window.ArchitecturePanel) window.ArchitecturePanel.init();
    }
};
window._switchTab = function(t) {
    if (!t || t.classList.contains('disabled')) return;
    window._gotoTab(t.dataset.tab);
};

document.addEventListener('DOMContentLoaded', async () => {
    // 1. Initialize modules — fail loud: a broken init should stop here, not surface
    //    later as an unrelated TypeError.
    window.ContextPanel.init();
    window.DumpPanel.init();
    window.LLMPanel.init();
    window.ChapterPanel.init();
    window.ChapterCPanel.init();
    window.ResearchPanel.init();

    // 2. Bind top-level buttons
    // New/Load/Save use inline onclick in index.html (required for mobile) — do not also bind here.
    document.getElementById('btn-cancel-load').addEventListener('click', () => {
        document.getElementById('load-modal').style.display = 'none';
    });
    window.addEventListener('beforeunload', (e) => {
        if (window.ContextPanel.contextElements.length > 0) {
            e.preventDefault();
            e.returnValue = '';
        }
    });

    // 3. Setup tabs
    const tabs = document.querySelectorAll('.tab-btn');
    const contents = document.querySelectorAll('.tab-content');
    tabs.forEach(t => t.addEventListener('click', () => window._switchTab(t)));


    // 3b. Resizable panel divider
    (function () {
        const container = document.querySelector('.container');
        const divider   = document.getElementById('resize-divider');
        let dragging = false;

        const clamp = pct => Math.min(Math.max(pct, 18), 65);

        const apply = pct => {
            container.style.setProperty('--left-width', pct + '%');
            localStorage.setItem('bb8-panel-split', pct);
        };

        // Restore saved split
        const saved = localStorage.getItem('bb8-panel-split');
        if (saved) apply(parseFloat(saved));

        const startDrag = e => {
            dragging = true;
            divider.classList.add('is-dragging');
            document.body.style.cursor     = 'col-resize';
            document.body.style.userSelect = 'none';
            e.preventDefault();
        };
        const moveDrag = e => {
            if (!dragging) return;
            const clientX = e.touches ? e.touches[0].clientX : e.clientX;
            const rect = container.getBoundingClientRect();
            apply(clamp((clientX - rect.left) / rect.width * 100));
        };
        const endDrag = () => {
            if (!dragging) return;
            dragging = false;
            divider.classList.remove('is-dragging');
            document.body.style.cursor     = '';
            document.body.style.userSelect = '';
        };

        divider.addEventListener('mousedown',  startDrag);
        divider.addEventListener('touchstart', startDrag, { passive: false });
        document.addEventListener('mousemove',  moveDrag);
        document.addEventListener('touchmove',  moveDrag, { passive: false });
        document.addEventListener('mouseup',    endDrag);
        document.addEventListener('touchend',   endDrag);
    })();

    // 3c. Position fixed tooltip on hover (escapes overflow-y:auto scroll container)
    document.querySelectorAll('.info-tooltip').forEach(el => {
        const tip = el.querySelector('.tooltip-text');
        if (!tip) return;
        el.addEventListener('mouseenter', () => {
            const r = el.getBoundingClientRect();
            tip.style.left   = Math.max(4, r.left + r.width / 2 - 125) + 'px';
            tip.style.top    = '';
            tip.style.bottom = (window.innerHeight - r.top + 8) + 'px';
        });
    });

    // 3d. Auto-resize all .streaming-output textareas
    window.autoResize = function(el) {
        el.style.height = 'auto';
        el.style.height = el.scrollHeight + 'px';
    };
    function resizeAllOutputs() {
        document.querySelectorAll('.streaming-output').forEach(window.autoResize);
    }
    document.querySelectorAll('.streaming-output').forEach(el => {
        el.addEventListener('input', () => window.autoResize(el));
    });
    window.addEventListener('llm:complete', resizeAllOutputs);
    // Also resize after snapshot load (called from snapshot.js)
    window._resizeAllOutputs = resizeAllOutputs;

    // 4. Usage tracker
    async function refreshUsage() {
        try {
            const res = await fetch('/api/tokens/usage');
            const d = await res.json();
            document.getElementById('claude-in').innerText   = d.claude.input_tokens.toLocaleString();
            document.getElementById('claude-out').innerText  = d.claude.output_tokens.toLocaleString();
            document.getElementById('claude-cost').innerText = '$' + d.claude.cost_usd.toFixed(6);
            document.getElementById('local-in').innerText    = d.local.input_tokens.toLocaleString();
            document.getElementById('local-out').innerText   = d.local.output_tokens.toLocaleString();
            document.getElementById('total-cost').innerText  = '$' + d.total_cost_usd.toFixed(6);
        } catch (e) { /* backend not up yet */ }
    }
    document.getElementById('btn-reset-usage').addEventListener('click', async () => {
        await fetch('/api/tokens/usage/reset', { method: 'POST' });
        refreshUsage();
    });
    window.addEventListener('llm:complete', refreshUsage);
    refreshUsage();

    // 5. Check Ollama Status
    async function checkOllama() {
        try {
            const res = await fetch('/api/llm/health');
            if (res.ok) {
                document.getElementById('ollama-status-dot').className = 'dot green';
            } else {
                document.getElementById('ollama-status-dot').className = 'dot red';
            }
        } catch (e) {
            document.getElementById('ollama-status-dot').className = 'dot red';
        }
    }
    
    await checkOllama();
    setInterval(checkOllama, 30000);

    // 5. Fetch LLM Config
    try {
        const configRes = await fetch('/api/llm/config');
        const config = await configRes.json();
        window.currentModelName = config.model_name;
    } catch (e) {
        console.error("Failed to fetch LLM config", e);
    }

    // 6. Initial New Project
    try {
        const res = await fetch('/api/project/new', { method: 'POST' });
        const project = await res.json();
        window.Snapshot.repopulateUI(project);
    } catch (e) {
        console.error("Failed to init project", e);
    }

    // 7. Apply layout mode now, and re-apply if the viewport crosses the breakpoint
    //    (rotation, window resize) so sections don't end up hidden or double-stacked.
    window._applyLayoutMode();
    let wasMobile = window._isMobile();
    window.addEventListener('resize', () => {
        const nowMobile = window._isMobile();
        if (nowMobile !== wasMobile) {
            wasMobile = nowMobile;
            window._applyLayoutMode();
        }
    });
});
