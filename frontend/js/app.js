// Defined at top level so mobile inline handlers can always reach it
window._gotoTab = function(tabId) {
    if (window.innerWidth <= 1024) {
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
    // 1. Initialize modules
    const safeInit = (name, fn) => { try { fn(); } catch(e) { console.error(`${name} init failed:`, e); } };
    safeInit('ContextPanel', () => window.ContextPanel.init());
    safeInit('DumpPanel',    () => window.DumpPanel.init());
    safeInit('LLMPanel',     () => window.LLMPanel.init());
    safeInit('ChapterPanel', () => window.ChapterPanel.init());
    safeInit('ChapterCPanel',() => window.ChapterCPanel.init());
    safeInit('ResearchPanel',() => window.ResearchPanel.init());

    // 2. Bind top-level buttons
    document.getElementById('btn-new-project').addEventListener('click', () => window.Snapshot.newProject());
    document.getElementById('btn-save-project').addEventListener('click', () => window.Snapshot.saveProject());
    document.getElementById('btn-load-project').addEventListener('click', () => window.Snapshot.loadProject());
    
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

    // 7. On mobile: show all sections as one long page
    const isMobile = window.innerWidth <= 1024;
    if (isMobile) {
        document.querySelectorAll('.tab-content').forEach(el => {
            el.style.removeProperty('display');
        });
        if (window.ChapterCPanel) window.ChapterCPanel.renderAllChapters();
        if (window.ArchitecturePanel) window.ArchitecturePanel.init();
    }
});
