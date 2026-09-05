window.ContextPanel = {
    contextElements: [],
    editingId: null,
    deletedStack: [],
    undoTimeout: null,

    // Filled from GET /api/llm/config by app.js; these are safe fallbacks.
    budget: { warnTokens: 120000, contextWindow: 1000000, inputCostPerMtok: 2.0 },

    init() {
        this.listEl        = document.getElementById('context-element-list');
        this.tokenCountEl  = document.getElementById('token-total-count');
        this.tokenBarEl    = document.getElementById('token-bar-fill');
        this.warnLimitEl   = document.getElementById('token-warn-limit');
        this.costEl        = document.getElementById('token-cost-estimate');
        this.budgetEl      = document.getElementById('context-budget');

        document.getElementById('btn-add-element').addEventListener('click', () => {
            const label = prompt("Enter label for new element:");
            if (label) {
                this.addElement(label, "", "human", "custom");
            }
        });

        document.getElementById('btn-confirm-edit').addEventListener('click', () => {
            this.saveEdit();
        });

        document.getElementById('btn-cancel-edit').addEventListener('click', () => {
            document.getElementById('edit-modal').style.display = 'none';
        });
    },

    setBudget(cfg) {
        if (!cfg) return;
        if (cfg.context_warn_tokens) this.budget.warnTokens      = cfg.context_warn_tokens;
        if (cfg.context_window)      this.budget.contextWindow   = cfg.context_window;
        if (cfg.input_cost_per_mtok) this.budget.inputCostPerMtok = cfg.input_cost_per_mtok;
        this.updateTokenTotal();
    },

    async addElement(label, content, source, element_type, phase = "A", source_ref = "") {
        const id = 'el_' + Date.now() + '_' + Math.floor(Math.random() * 1000);
        const element = {
            id, label, content, source, element_type,
            phase: phase,
            order: this.contextElements.length,
            enabled: true,
            token_count: 0,
            compressed: false,
            content_full: "",
            source_ref: source_ref || "",
            created_at: new Date().toISOString(),
            updated_at: new Date().toISOString()
        };

        element.token_count = await this.fetchTokenCount(content);
        this.contextElements.push(element);
        this.renderContextPanel();
    },

    async fetchTokenCount(text) {
        if (!text) return 0;
        try {
            const res = await fetch('/api/tokens/count', {
                method: 'POST',
                headers: {'Content-Type': 'application/json'},
                body: JSON.stringify({text})
            });
            const data = await res.json();
            return data.token_count;
        } catch (e) {
            console.error(e);
            return 0;
        }
    },

    toggleElement(id) {
        const el = this.contextElements.find(e => e.id === id);
        if (el) {
            el.enabled = !el.enabled;
            this.renderContextPanel();
        }
    },

    deleteElement(id) {
        if (!confirm("Delete this element?")) return;
        const index = this.contextElements.findIndex(e => e.id === id);
        if (index === -1) return;

        const deletedEl = this.contextElements.splice(index, 1)[0];

        // Add to stack with timestamp
        const deleteItem = { element: deletedEl, originalIndex: index, timestamp: Date.now() };
        this.deletedStack.push(deleteItem);
        if (this.deletedStack.length > 10) this.deletedStack.shift();

        clearTimeout(this.undoTimeout);
        this.undoTimeout = setTimeout(() => {
            // Remove items older than 30s
            const now = Date.now();
            this.deletedStack = this.deletedStack.filter(item => now - item.timestamp < 30000);
            this.renderContextPanel();
        }, 30000);

        this.renderContextPanel();
    },

    undoDelete() {
        if (this.deletedStack.length === 0) return;
        const lastDeleted = this.deletedStack.pop();
        this.contextElements.splice(lastDeleted.originalIndex, 0, lastDeleted.element);

        this.contextElements.forEach((el, idx) => el.order = idx);

        if (this.deletedStack.length === 0) {
            clearTimeout(this.undoTimeout);
        }
        this.renderContextPanel();
    },

    editElement(id) {
        const el = this.contextElements.find(e => e.id === id);
        if (el) {
            this.editingId = id;
            document.getElementById('edit-element-textarea').value = el.content;
            document.getElementById('edit-modal').style.display = 'flex';
        }
    },

    async saveEdit() {
        if (!this.editingId) return;
        const el = this.contextElements.find(e => e.id === this.editingId);
        if (el) {
            el.content = document.getElementById('edit-element-textarea').value;
            el.token_count = await this.fetchTokenCount(el.content);
            el.updated_at = new Date().toISOString();
            // A hand edit replaces whichever version was showing; drop the stored original.
            el.compressed = false;
            el.content_full = "";
            this.renderContextPanel();
        }
        document.getElementById('edit-modal').style.display = 'none';
        this.editingId = null;
    },

    reorderElements(draggedId, targetId) {
        const draggedIndex = this.contextElements.findIndex(e => e.id === draggedId);
        const targetIndex = this.contextElements.findIndex(e => e.id === targetId);
        if (draggedIndex === -1 || targetIndex === -1) return;

        const [draggedEl] = this.contextElements.splice(draggedIndex, 1);
        this.contextElements.splice(targetIndex, 0, draggedEl);

        this.contextElements.forEach((el, idx) => el.order = idx);
        this.renderContextPanel();
    },

    // ── Context budget / compression ──────────────────────────────────────────

    // The compressed alternative for an element, or null if none exists yet.
    // Skeleton -> that chapter's prose summary (or enrich summary) once Phase C has run.
    // Full premise -> premise summary once it has been generated.
    compressedAlternative(el) {
        if (el.element_type === 'chapter_skeleton') {
            const chapters = (window.ChapterPanel && window.ChapterPanel.chapters) || [];
            let ch = el.source_ref ? chapters.find(c => c.id === el.source_ref) : null;
            if (!ch) {
                // Elements from older snapshots have no source_ref: fall back to the label.
                const m = /^Ch\s+(\d+)\s+Skeleton/i.exec(el.label || '');
                if (m) ch = chapters.find(c => c.number === parseInt(m[1], 10));
            }
            if (!ch) return null;
            const alt = ch.summary || ch.enrich_draft_summary || '';
            return alt.trim() ? alt : null;
        }
        if (el.element_type === 'premise') {
            const alt = (window.LLMPanel && window.LLMPanel.premiseSummary) || '';
            return alt.trim() ? alt : null;
        }
        return null;
    },

    estimateTokens(text) {
        if (!text) return 0;
        return Math.round(text.trim().split(/\s+/).length * 1.3);
    },

    async toggleCompressed(id) {
        const el = this.contextElements.find(e => e.id === id);
        if (!el) return;
        if (el.compressed) {
            el.content = el.content_full || el.content;
            el.content_full = "";
            el.compressed = false;
        } else {
            const alt = this.compressedAlternative(el);
            if (!alt) return;
            el.content_full = el.content;
            el.content = alt;
            el.compressed = true;
        }
        el.updated_at = new Date().toISOString();
        el.token_count = await this.fetchTokenCount(el.content);
        this.renderContextPanel();
    },

    renderBudgetPanel(total) {
        if (!this.budgetEl) return;
        const warn = this.budget.warnTokens;
        const showAt = warn * 0.8;
        if (total < showAt) {
            this.budgetEl.style.display = 'none';
            this.budgetEl.innerHTML = '';
            return;
        }

        const over = total >= warn;
        const rows = [];
        this.contextElements.filter(e => e.enabled).sort((a, b) => a.order - b.order).forEach(el => {
            if (el.compressed) {
                rows.push({ el, saving: 0, compressed: true });
                return;
            }
            const alt = this.compressedAlternative(el);
            if (!alt) return;
            const saving = el.token_count - this.estimateTokens(alt);
            if (saving > 0) rows.push({ el, saving, compressed: false });
        });

        let html = `<div class="budget-title">${over ? '⚠' : '◔'} Context ${over ? 'over' : 'approaching'} budget — `
                 + `${total.toLocaleString()} of ${warn.toLocaleString()} tok</div>`;
        html += `<div class="budget-hint">Swap stale full versions for their summaries. `
              + `Beyond saving tokens, long coherent context and out-of-date material both measurably degrade output.</div>`;

        if (rows.length === 0) {
            html += `<div class="budget-empty">Nothing compressible yet — summaries appear once chapters have prose or the premise has been summarised. Consider disabling elements no longer needed.</div>`;
        } else {
            rows.forEach(({ el, saving, compressed }) => {
                html += `<label class="budget-row">
                    <input type="checkbox" ${compressed ? 'checked' : ''} onchange="ContextPanel.toggleCompressed('${el.id}')">
                    <span class="budget-label">${el.label}</span>
                    <span class="budget-effect">${compressed ? 'compressed' : '−' + saving.toLocaleString() + ' tok'}</span>
                </label>`;
            });
        }
        this.budgetEl.innerHTML = html;
        this.budgetEl.style.display = '';
        this.budgetEl.classList.toggle('over', over);
    },

    // ── Rendering ─────────────────────────────────────────────────────────────

    renderContextPanel() {
        this.listEl.innerHTML = '';

        const now = Date.now();
        const validUndoItems = this.deletedStack.filter(item => now - item.timestamp < 30000);
        if (validUndoItems.length > 0) {
            const undoDiv = document.createElement('div');
            undoDiv.id = 'undo-delete-container';
            undoDiv.innerHTML = `
                <span>Element deleted.</span>
                <button class="btn-secondary" onclick="ContextPanel.undoDelete()">Undo</button>
            `;
            this.listEl.appendChild(undoDiv);
        }

        this.contextElements.sort((a, b) => a.order - b.order).forEach(el => {
            const div = document.createElement('div');
            div.className = 'context-item' + (!el.enabled ? ' disabled-item' : '');
            div.draggable = true;
            div.dataset.id = el.id;
            div.dataset.phase = el.phase || 'A';

            // Drag events
            div.addEventListener('dragstart', (e) => {
                e.dataTransfer.setData('text/plain', el.id);
                div.classList.add('dragging');
            });
            div.addEventListener('dragend', () => div.classList.remove('dragging'));
            div.addEventListener('dragover', (e) => {
                e.preventDefault();
                div.classList.add('drag-over');
            });
            div.addEventListener('dragleave', () => div.classList.remove('drag-over'));
            div.addEventListener('drop', (e) => {
                e.preventDefault();
                div.classList.remove('drag-over');
                const draggedId = e.dataTransfer.getData('text/plain');
                if (draggedId !== el.id) {
                    this.reorderElements(draggedId, el.id);
                }
            });

            const content = el.content || '';
            div.innerHTML = `
                <span class="drag-handle">⠿</span>
                <input type="checkbox" ${el.enabled ? 'checked' : ''} onchange="ContextPanel.toggleElement('${el.id}')">
                <div class="item-content">
                    <div class="item-label">
                        ${el.label}
                        <span class="source-badge ${el.source}">${el.source}</span>
                        ${el.compressed ? '<span class="compressed-badge" title="Showing the compressed version; untick in the budget panel to restore">compressed</span>' : ''}
                    </div>
                    <div class="item-preview">${content.substring(0, 80) + (content.length > 80 ? '...' : '')}</div>
                </div>
                <div class="token-badge">${el.token_count} tok</div>
                <button class="edit-btn" onclick="ContextPanel.editElement('${el.id}')">✏️</button>
                <button class="edit-btn" style="color: #e63946; font-size: 0.9rem;" onclick="ContextPanel.deleteElement('${el.id}')">❌</button>
            `;
            this.listEl.appendChild(div);
        });
        this.updateTokenTotal();
    },

    updateTokenTotal() {
        const total = this.contextElements.filter(e => e.enabled).reduce((sum, e) => sum + (e.token_count || 0), 0);
        const warn = this.budget.warnTokens;

        this.tokenCountEl.innerText = total.toLocaleString();
        if (this.warnLimitEl) this.warnLimitEl.innerText = warn.toLocaleString();
        if (this.costEl) {
            const usd = total / 1_000_000 * this.budget.inputCostPerMtok;
            this.costEl.innerText = total > 0 ? `≈ $${usd.toFixed(3)} input / call` : '';
        }

        let pct = (total / warn) * 100;
        if (pct > 100) pct = 100;
        this.tokenBarEl.style.width = pct + '%';

        this.tokenBarEl.className = 'token-bar-fill';
        if (total < warn * 0.5)      this.tokenBarEl.classList.add('green');
        else if (total < warn)       this.tokenBarEl.classList.add('amber');
        else                         this.tokenBarEl.classList.add('red');

        this.renderBudgetPanel(total);
    },

    getEnabledElements() {
        return this.contextElements.filter(e => e.enabled).sort((a, b) => a.order - b.order);
    },

    exportElementsForLLM() {
        return this.getEnabledElements().map(e => ({
            label: e.label,
            content: e.content
        }));
    }
};
