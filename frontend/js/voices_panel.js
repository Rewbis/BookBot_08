// Character Voices (Phase A): per-character voice profiles, optionally staged by chapter range.
// Phase C sends the full list; the backend picks the stage active for each chapter.
window.VoicesPanel = {
    profiles: [],
    STAGE_LABELS: ['all', 'child', 'youth', 'adult', 'elderly', 'custom'],

    init() {
        this.listEl    = document.getElementById('voices-list');
        this.lblStatus = document.getElementById('voices-status');
        this.btnGen    = document.getElementById('btn-generate-voices');
        this.btnAdd    = document.getElementById('btn-add-voice');
        this.btnGen.addEventListener('click', () => this.generate());
        this.btnAdd.addEventListener('click', () => this.addProfile());
        this.render();
    },

    _id(prefix) { return prefix + '_' + Date.now() + '_' + Math.random().toString(36).slice(2, 7); },

    getTargetChapters() {
        return parseInt(document.getElementById('setup-chapters')?.value, 10) || 20;
    },

    async generate() {
        const characters = document.getElementById('slot-characters-text')?.value.trim() || '';
        if (!characters) {
            this.lblStatus.textContent = 'Fill the Characters slot first (parse a dump or type it).';
            return;
        }
        if (this.profiles.length && !confirm('Replace the existing voice profiles?')) return;

        this.btnGen.disabled = true;
        this.lblStatus.textContent = 'Generating…';
        try {
            const res = await fetch('/api/llm/generate-voices', {
                method: 'POST', headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    characters,
                    premise:          document.getElementById('slot-premise-text')?.value || '',
                    role_constraints: document.getElementById('slot-role-text')?.value || '',
                    target_chapter_count: this.getTargetChapters(),
                    project_title: document.getElementById('project-title')?.value || 'unknown',
                })
            });
            const data = await res.json();
            if (!res.ok) throw new Error(data.detail || 'generate failed');
            this.profiles = (data.voice_profiles || []).map(p => this._normaliseProfile(p));
            this.render();
            this.lblStatus.textContent = `Done ✓ — ${this.profiles.length} character${this.profiles.length === 1 ? '' : 's'}; edit freely`;
            window.dispatchEvent(new Event('llm:complete'));
        } catch (e) {
            console.error(e);
            this.lblStatus.textContent = 'Error: ' + e.message;
        } finally {
            this.btnGen.disabled = false;
        }
    },

    _normaliseProfile(p) {
        const stages = (p.stages || []).map(s => ({
            label:        String(s.label || 'all'),
            from_chapter: parseInt(s.from_chapter, 10) || 1,
            to_chapter:   parseInt(s.to_chapter, 10) || 0,
            voice:        String(s.voice || ''),
        }));
        return {
            id:     p.id || this._id('voice'),
            name:   String(p.name || ''),
            stages: stages.length ? stages : [{ label: 'all', from_chapter: 1, to_chapter: 0, voice: '' }],
        };
    },

    addProfile() {
        this.profiles.push(this._normaliseProfile({ name: '', stages: [] }));
        this.render();
    },

    removeProfile(id) {
        this.profiles = this.profiles.filter(p => p.id !== id);
        this.render();
    },

    updateProfile(id, field, value) {
        const p = this.profiles.find(x => x.id === id);
        if (p) p[field] = value;
    },

    addStage(id) {
        const p = this.profiles.find(x => x.id === id);
        if (!p) return;
        const last = p.stages[p.stages.length - 1];
        const from = last ? (last.to_chapter || last.from_chapter) + 1 : 1;
        p.stages.push({ label: 'custom', from_chapter: from, to_chapter: 0, voice: '' });
        this.render();
    },

    removeStage(id, idx) {
        const p = this.profiles.find(x => x.id === id);
        if (!p || p.stages.length <= 1) return;
        p.stages.splice(idx, 1);
        this.render();
    },

    updateStage(id, idx, field, value) {
        const p = this.profiles.find(x => x.id === id);
        if (!p || !p.stages[idx]) return;
        if (field === 'from_chapter' || field === 'to_chapter') {
            p.stages[idx][field] = parseInt(value, 10) || (field === 'from_chapter' ? 1 : 0);
        } else {
            p.stages[idx][field] = value;
        }
    },

    render() {
        if (!this.listEl) return;
        this.listEl.innerHTML = '';
        if (this.profiles.length === 0) {
            this.listEl.innerHTML = '<p class="empty-hint">No voice profiles yet — generate from the Characters slot or add one manually.</p>';
            return;
        }
        const maxCh = this.getTargetChapters();
        this.profiles.forEach(p => {
            const card = document.createElement('div');
            card.className = 'voice-card';
            const stagesHtml = p.stages.map((s, i) => {
                const known = this.STAGE_LABELS.includes(s.label);
                const opts = this.STAGE_LABELS.map(l =>
                    `<option value="${l}" ${l === s.label || (!known && l === 'custom') ? 'selected' : ''}>${l}</option>`
                ).join('');
                return `
                <div class="voice-stage">
                    <div class="voice-stage-row">
                        <select class="voice-stage-label" onchange="VoicesPanel.updateStage('${p.id}', ${i}, 'label', this.value)">${opts}</select>
                        <span class="voice-range">Ch</span>
                        <input type="number" min="1" max="${maxCh + 50}" value="${s.from_chapter}" class="voice-num"
                            onchange="VoicesPanel.updateStage('${p.id}', ${i}, 'from_chapter', this.value)">
                        <span class="voice-range">→</span>
                        <input type="number" min="0" max="${maxCh + 50}" value="${s.to_chapter}" class="voice-num" title="0 = to the end"
                            onchange="VoicesPanel.updateStage('${p.id}', ${i}, 'to_chapter', this.value)">
                        <span class="voice-range-hint">(0 = end)</span>
                        <button class="clue-remove" title="Remove stage" onclick="VoicesPanel.removeStage('${p.id}', ${i})" ${p.stages.length <= 1 ? 'disabled' : ''}>✕</button>
                    </div>
                    <textarea class="voice-text streaming-output" rows="4" placeholder="Diction, rhythm, tics, what they never say, example lines…"
                        onchange="VoicesPanel.updateStage('${p.id}', ${i}, 'voice', this.value)">${this._esc(s.voice)}</textarea>
                </div>`;
            }).join('');

            card.innerHTML = `
                <div class="clue-top-row">
                    <input class="clue-label-input" type="text" value="${this._esc(p.name)}" placeholder="Character name"
                        onchange="VoicesPanel.updateProfile('${p.id}', 'name', this.value)">
                    <button class="btn-secondary btn-sm" onclick="VoicesPanel.addStage('${p.id}')">+ Stage</button>
                    <button class="clue-remove" title="Remove character" onclick="VoicesPanel.removeProfile('${p.id}')">✕</button>
                </div>
                ${stagesHtml}
            `;
            this.listEl.appendChild(card);
        });
        if (window._resizeAllOutputs) window._resizeAllOutputs();
    },

    // ── Snapshot support ──────────────────────────────────────────────────────

    exportForSnapshot() {
        return { voice_profiles: this.profiles };
    },

    restoreFromSnapshot(project) {
        this.profiles = (project.voice_profiles || []).map(p => this._normaliseProfile(p));
        this.render();
        if (this.lblStatus) this.lblStatus.textContent = '';
    },

    _esc(str) {
        return (str || '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
    },
};
