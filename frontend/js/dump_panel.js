window.DumpPanel = {
    plantedClues: [],

    init() {
        document.getElementById('btn-parse-dump').addEventListener('click', () => this.parseDump());
    },

    getProjectTitle() {
        return document.getElementById('project-title').value || 'unknown';
    },

    async parseDump() {
        const dump = document.getElementById('creative-dump').value.trim();
        if (!dump) return;

        const btn = document.getElementById('btn-parse-dump');
        const status = document.getElementById('parse-status');
        btn.disabled = true;
        status.innerText = 'Parsing…';
        document.body.style.cursor = 'wait';

        try {
            const res = await fetch('/api/llm/parse-dump', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ dump_text: dump, project_title: this.getProjectTitle() })
            });
            if (!res.ok) throw new Error('Parse failed');
            const data = await res.json();

            document.getElementById('slot-role-text').value      = data.role_constraints || '';
            document.getElementById('slot-premise-text').value   = data.premise          || '';
            document.getElementById('slot-characters-text').value = data.characters      || '';
            document.getElementById('slot-world-text').value     = data.world_notes      || '';

            this.plantedClues = (data.planted_clues || []).map(c => ({
                ...c,
                id: c.id || ('clue_' + Date.now() + '_' + Math.random().toString(36).slice(2))
            }));
            this.renderClues();

            document.getElementById('parsed-slots').style.display = 'block';
            document.getElementById('parsed-slots').scrollIntoView({ behavior: 'smooth', block: 'start' });
            status.innerText = 'Structured ✓';
            window.dispatchEvent(new Event('llm:complete'));
        } catch (e) {
            console.error(e);
            status.innerText = 'Parse failed — check console';
        } finally {
            btn.disabled = false;
            document.body.style.cursor = 'default';
        }
    },

    approveSlot(slotKey) {
        const textareaIds = {
            role_constraints: 'slot-role-text',
            premise:          'slot-premise-text',
            characters:       'slot-characters-text',
            world_notes:      'slot-world-text',
        };
        const labels = {
            role_constraints: 'Role & Constraints',
            premise:          'Premise / Plot Bible',
            characters:       'Characters',
            world_notes:      'World Notes',
        };
        const content = document.getElementById(textareaIds[slotKey])?.value?.trim();
        if (!content) return;
        window.ContextPanel.addElement(labels[slotKey], content, 'llm', slotKey, 'A');
    },

    addClue(clue = null) {
        const newClue = clue || {
            id: 'clue_' + Date.now(),
            label: '',
            description: '',
            planted_in: '',
            pays_off_in: '',
            status: 'active'
        };
        if (!clue) this.plantedClues.push(newClue);
        this.renderClues();
    },

    approveClue(id) {
        const clue = this.plantedClues.find(c => c.id === id);
        if (!clue) return;
        const parts = [`Clue: ${clue.label || '(unnamed)'}`];
        if (clue.description) parts.push(clue.description);
        if (clue.planted_in)  parts.push(`Planted in: ${clue.planted_in}`);
        if (clue.pays_off_in) parts.push(`Pays off in: ${clue.pays_off_in}`);
        parts.push(`Status: ${clue.status}`);
        window.ContextPanel.addElement(
            `Clue: ${clue.label || '(unnamed)'}`, parts.join('\n'), 'human', 'planted_clue', 'A'
        );
    },

    // Apply {id, status, notes} updates from a continuity agent (plan-level or per-chapter).
    // Status is only ever active|blocked; notes are appended to the description once.
    applyClueUpdates(updates) {
        if (!Array.isArray(updates) || updates.length === 0) return;
        updates.forEach(upd => {
            const clue = this.plantedClues.find(c => c.id === upd.id)
                      || (upd.label ? this.plantedClues.find(c => c.label === upd.label) : null);
            if (!clue) return;
            if (upd.status === 'active' || upd.status === 'blocked') clue.status = upd.status;
            if (upd.notes && !(clue.description || '').includes(upd.notes)) {
                clue.description = `${clue.description || ''}\n\n[Continuity: ${upd.notes}]`.trim();
            }
        });
        this.renderClues();
    },

    removeClue(id) {
        this.plantedClues = this.plantedClues.filter(c => c.id !== id);
        this.renderClues();
    },

    updateClue(id, field, value) {
        const clue = this.plantedClues.find(c => c.id === id);
        if (clue) clue[field] = value;
    },

    renderClues() {
        const container = document.getElementById('planted-clues-list');
        if (!container) return;
        container.innerHTML = '';

        if (this.plantedClues.length === 0) {
            container.innerHTML = '<p class="empty-hint">No planted clues yet — parse a dump or add one manually.</p>';
            return;
        }

        this.plantedClues.forEach(clue => {
            const div = document.createElement('div');
            div.className = 'clue-item';
            const isBlocked = clue.status === 'blocked';
            div.innerHTML = `
                <div class="clue-top-row">
                    <input class="clue-label-input" type="text" value="${this._esc(clue.label)}"
                        placeholder="Clue name"
                        onchange="DumpPanel.updateClue('${clue.id}', 'label', this.value)">
                    <select class="clue-status ${isBlocked ? 'status-blocked' : 'status-active'}"
                        onchange="DumpPanel.updateClue('${clue.id}', 'status', this.value); this.className='clue-status ' + (this.value==='blocked' ? 'status-blocked' : 'status-active')">
                        <option value="active"  ${!isBlocked ? 'selected' : ''}>Active</option>
                        <option value="blocked" ${isBlocked  ? 'selected' : ''}>Blocked</option>
                    </select>
                    <button class="btn-success btn-sm" onclick="DumpPanel.approveClue('${clue.id}')">Approve → Context</button>
                    <button class="clue-remove" onclick="DumpPanel.removeClue('${clue.id}')">✕</button>
                </div>
                <textarea class="clue-desc" rows="2"
                    placeholder="What it is, how it appears…"
                    onchange="DumpPanel.updateClue('${clue.id}', 'description', this.value)">${this._esc(clue.description)}</textarea>
                <div class="clue-arc-row">
                    <input type="text" value="${this._esc(clue.planted_in)}"  placeholder="Planted in…"
                        onchange="DumpPanel.updateClue('${clue.id}', 'planted_in', this.value)">
                    <span class="clue-arrow">→</span>
                    <input type="text" value="${this._esc(clue.pays_off_in)}" placeholder="Pays off in…"
                        onchange="DumpPanel.updateClue('${clue.id}', 'pays_off_in', this.value)">
                </div>
            `;
            container.appendChild(div);
        });
    },

    exportForSnapshot() {
        return {
            creative_dump:    document.getElementById('creative-dump')?.value     || '',
            role_constraints: document.getElementById('slot-role-text')?.value    || '',
            premise:          document.getElementById('slot-premise-text')?.value || '',
            characters:       document.getElementById('slot-characters-text')?.value || '',
            world_notes:      document.getElementById('slot-world-text')?.value   || '',
            planted_clues:    this.plantedClues,
        };
    },

    loadFromSnapshot(data) {
        if (!data) return;
        if (data.creative_dump) {
            document.getElementById('creative-dump').value = data.creative_dump;
        }
        const slotMap = {
            role_constraints: 'slot-role-text',
            premise:          'slot-premise-text',
            characters:       'slot-characters-text',
            world_notes:      'slot-world-text',
        };
        let hasSlot = false;
        for (const [key, elId] of Object.entries(slotMap)) {
            if (data[key]) {
                document.getElementById(elId).value = data[key];
                hasSlot = true;
            }
        }
        this.plantedClues = (data.planted_clues || []).map(c => ({
            ...c,
            id: c.id || ('clue_' + Date.now() + '_' + Math.random().toString(36).slice(2))
        }));
        if (hasSlot || data.creative_dump || this.plantedClues.length > 0) {
            document.getElementById('parsed-slots').style.display = 'block';
        }
        this.renderClues();
    },

    _esc(str) {
        return (str || '').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');
    }
};
