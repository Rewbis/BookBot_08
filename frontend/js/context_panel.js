window.ContextPanel = {
    contextElements: [],
    editingId: null,
    deletedStack: [],
    undoTimeout: null,

    init() {
        this.listEl = document.getElementById('context-element-list');
        this.tokenCountEl = document.getElementById('token-total-count');
        this.tokenBarEl = document.getElementById('token-bar-fill');
        
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

    async addElement(label, content, source, element_type, phase="A") {
        const id = 'el_' + Date.now() + '_' + Math.floor(Math.random()*1000);
        const element = {
            id, label, content, source, element_type,
            phase: phase,
            order: this.contextElements.length,
            enabled: true,
            token_count: 0,
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

            div.innerHTML = `
                <span class="drag-handle">⠿</span>
                <input type="checkbox" ${el.enabled ? 'checked' : ''} onchange="ContextPanel.toggleElement('${el.id}')">
                <div class="item-content">
                    <div class="item-label">
                        ${el.label}
                        <span class="source-badge ${el.source}">${el.source}</span>
                    </div>
                    <div class="item-preview">${el.content.substring(0, 80) + (el.content.length > 80 ? '...' : '')}</div>
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
        const total = this.contextElements.filter(e => e.enabled).reduce((sum, e) => sum + e.token_count, 0);
        this.tokenCountEl.innerText = total;
        
        const CTX_LIMIT = 16000;
        let pct = (total / CTX_LIMIT) * 100;
        if (pct > 100) pct = 100;
        this.tokenBarEl.style.width = pct + '%';

        this.tokenBarEl.className = 'token-bar-fill';
        if (total < 10000) this.tokenBarEl.classList.add('green');
        else if (total < 14000) this.tokenBarEl.classList.add('amber');
        else this.tokenBarEl.classList.add('red');
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
