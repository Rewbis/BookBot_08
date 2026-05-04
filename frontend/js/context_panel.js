window.ContextPanel = {
    contextElements: [],
    editingId: null,

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

    async addElement(label, content, source, element_type) {
        const id = 'el_' + Date.now() + '_' + Math.floor(Math.random()*1000);
        const element = {
            id, label, content, source, element_type,
            phase: 'A',
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
        this.contextElements.sort((a, b) => a.order - b.order).forEach(el => {
            const div = document.createElement('div');
            div.className = 'context-item' + (!el.enabled ? ' disabled-item' : '');
            div.draggable = true;
            div.dataset.id = el.id;

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
                    <div class="item-label">${el.label}</div>
                    <div class="item-preview">${el.content.substring(0, 80) + (el.content.length > 80 ? '...' : '')}</div>
                </div>
                <div class="token-badge">${el.token_count} tok</div>
                <button class="edit-btn" onclick="ContextPanel.editElement('${el.id}')">✏️</button>
            `;
            this.listEl.appendChild(div);
        });
        this.updateTokenTotal();
    },

    updateTokenTotal() {
        const total = this.contextElements.filter(e => e.enabled).reduce((sum, e) => sum + e.token_count, 0);
        this.tokenCountEl.innerText = total;
        
        let pct = (total / 32000) * 100;
        if (pct > 100) pct = 100;
        this.tokenBarEl.style.width = pct + '%';
        
        this.tokenBarEl.className = 'token-bar-fill';
        if (total < 20000) this.tokenBarEl.classList.add('green');
        else if (total < 28000) this.tokenBarEl.classList.add('amber');
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
