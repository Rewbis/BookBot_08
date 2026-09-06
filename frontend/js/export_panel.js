// Phase D: publishing metadata, blurb + illustration prompts, manuscript export.
window.ExportPanel = {
    author: "",
    tagline: "",
    blurb: "",
    coverPrompt: "",
    coverEnabled: true,
    lastExport: null,
    lastValidation: null,
    busy: false,

    init() {
        this.el = {
            author:      document.getElementById('export-author'),
            tagline:     document.getElementById('export-tagline'),
            blurb:       document.getElementById('export-blurb'),
            titleOpts:   document.getElementById('export-title-options'),
            cover:       document.getElementById('export-cover-prompt'),
            coverOn:     document.getElementById('export-cover-enabled'),
            chapters:    document.getElementById('export-chapters'),
            summary:     document.getElementById('export-summary'),
            includeAll:  document.getElementById('export-include-unapproved'),
            result:      document.getElementById('export-result'),
            status:      document.getElementById('export-status'),
        };
        if (!this.el.author) return;   // tab markup missing — nothing to wire
        this.el.author.addEventListener('input',  () => { this.author  = this.el.author.value; });
        this.el.tagline.addEventListener('input', () => { this.tagline = this.el.tagline.value; });
        this.el.blurb.addEventListener('input',   () => { this.blurb   = this.el.blurb.value; });
        this.el.cover.addEventListener('input',   () => { this.coverPrompt = this.el.cover.value; });
        if (this.el.coverOn) this.el.coverOn.addEventListener('change', () => { this.coverEnabled = this.el.coverOn.checked; this.render(); });
        this.el.includeAll.addEventListener('change', () => this.render());
        document.getElementById('btn-export-blurb').addEventListener('click',  () => this.generateBlurb());
        document.getElementById('btn-export-cover').addEventListener('click',  () => this.generateCoverPrompt());
        document.getElementById('btn-export-all-illos').addEventListener('click', () => this.generateAllIllustrations());
        document.querySelectorAll('[data-export-format]').forEach(b =>
            b.addEventListener('click', () => this.exportAs(b.dataset.exportFormat)));
    },

    // ── helpers ───────────────────────────────────────────────────────────────
    getProjectTitle() { return document.getElementById('project-title')?.value || 'Untitled'; },
    chapters() { return (window.ChapterPanel && window.ChapterPanel.chapters) || []; },
    chapterText(ch) { return (ch.full_text || ch.polish_draft || ch.enrich_draft || ch.draft_text || '').trim(); },
    isApproved(ch) { return !!ch.approved || ch.phase_c_status === 'approved'; },
    illustrationOn(ch) { return ch.illustration_enabled !== false; },   // default on for older snapshots
    wordCount(t) { return t ? t.trim().split(/\s+/).filter(Boolean).length : 0; },
    openingWords(t, n = 1200) { return (t || '').split(/\s+/).slice(0, n).join(' '); },
    styleNotes() { return document.getElementById('slot-role-text')?.value || ''; },
    setStatus(msg, isError = false) {
        if (!this.el.status) return;
        this.el.status.textContent = msg || '';
        this.el.status.classList.toggle('err', !!isError);
    },
    _esc(s) { return (s || '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;'); },

    // ── render ────────────────────────────────────────────────────────────────
    render() {
        if (!this.el || !this.el.chapters) return;
        const chapters = this.chapters().slice().sort((a, b) => a.number - b.number);
        const includeAll = this.el.includeAll.checked;
        let included = 0, words = 0, approved = 0;
        const rows = chapters.map(ch => {
            const text = this.chapterText(ch);
            const ok = this.isApproved(ch);
            const w = this.wordCount(text);
            const willExport = !!text && (ok || includeAll);
            if (ok) approved++;
            if (willExport) { included++; words += w; }
            const state = !text ? '<span class="cont-badge none">no text</span>'
                        : ok    ? '<span class="cont-badge ok">✅ approved</span>'
                        :         '<span class="cont-badge warn">⚠ not approved</span>';
            const on = this.illustrationOn(ch);
            const toggle = `<label class="illo-toggle" title="Untick to leave this chapter un-illustrated">
                <input type="checkbox" ${on ? 'checked' : ''} onchange="ExportPanel.setIllustrationEnabled('${ch.id}', this.checked)"> illustrate</label>`;
            const illo = !on
                ? toggle + '<span class="section-hint">no illustration for this chapter</span>'
                : toggle + (ch.illustration_prompt
                ? `<textarea class="illo-prompt" rows="3" onchange="ExportPanel.setIllustration('${ch.id}', this.value)">${this._esc(ch.illustration_prompt)}</textarea>
                   <div class="button-row" style="gap:6px;">
                     <button class="btn-secondary btn-sm" onclick="ExportPanel.copyText(this, ExportPanel.findChapter('${ch.id}').illustration_prompt)">Copy</button>
                     <button class="btn-secondary btn-sm" onclick="ExportPanel.generateIllustration('${ch.id}')" ${this.busy ? 'disabled' : ''}>Regenerate</button>
                   </div>`
                : `<button class="btn-secondary btn-sm" onclick="ExportPanel.generateIllustration('${ch.id}')" ${(!text || this.busy) ? 'disabled' : ''}>Generate illustration prompt</button>`);
            return `<tr class="${willExport ? '' : 'export-skip'}">
                <td class="export-num">${ch.number}</td>
                <td class="export-title">${this._esc(ch.title)}</td>
                <td>${state}</td>
                <td class="export-words">${w.toLocaleString()}</td>
                <td class="export-illo">${illo}</td>
            </tr>`;
        }).join('');
        this.el.chapters.innerHTML = rows || '<tr><td colspan="5" class="empty-hint">No chapters yet.</td></tr>';
        this.el.summary.textContent =
            `${approved} / ${chapters.length} approved · ${included} chapter${included === 1 ? '' : 's'} will export · ${words.toLocaleString()} words`;
        document.querySelectorAll('[data-export-format]').forEach(b => { b.disabled = this.busy || included === 0; });
        if (!this.el.author.value && this.author) this.el.author.value = this.author;
        if (this.el.coverOn) this.el.coverOn.checked = this.coverEnabled;
        const coverBtn = document.getElementById('btn-export-cover');
        if (coverBtn) coverBtn.disabled = this.busy || !this.coverEnabled;
        this.el.cover.disabled = !this.coverEnabled;
        this.el.cover.placeholder = this.coverEnabled ? 'Cover illustration prompt…' : 'Cover illustration disabled';
        if (window._resizeAllOutputs) window._resizeAllOutputs();
    },

    findChapter(id) { return this.chapters().find(c => c.id === id); },
    setIllustration(id, value) { const ch = this.findChapter(id); if (ch) ch.illustration_prompt = value; },
    setIllustrationEnabled(id, on) { const ch = this.findChapter(id); if (ch) { ch.illustration_enabled = !!on; this.render(); } },

    async copyText(btn, text) {
        try { await navigator.clipboard.writeText(text || ''); btn.textContent = 'Copied ✓'; setTimeout(() => { btn.textContent = 'Copy'; }, 1500); }
        catch (_) { window.prompt('Copy this prompt:', text || ''); }
    },

    // ── agents ────────────────────────────────────────────────────────────────
    async generateBlurb() {
        if (this.busy) return;
        this.busy = true; this.setStatus('Writing blurb…'); this.render();
        try {
            const chapter_summaries = this.chapters().filter(c => c.summary)
                .map(c => ({ number: c.number, title: c.title, summary: c.summary }));
            const res = await fetch('/api/llm/blurb', {
                method: 'POST', headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    context_elements: window.ContextPanel.exportElementsForLLM(),
                    title: this.getProjectTitle(),
                    premise_summary: (window.LLMPanel && window.LLMPanel.premiseSummary) || '',
                    chapter_summaries,
                    project_title: this.getProjectTitle(),
                })
            });
            const data = await res.json();
            if (!res.ok) throw new Error(data.detail || 'blurb failed');
            this.tagline = data.tagline || ''; this.el.tagline.value = this.tagline;
            this.blurb = data.blurb || '';     this.el.blurb.value = this.blurb;
            this.el.titleOpts.textContent = (data.title_options || []).length
                ? 'Alternative titles: ' + data.title_options.join(' · ') : '';
            if (window.autoResize) window.autoResize(this.el.blurb);
            this.setStatus('Blurb ready — edit freely');
            window.dispatchEvent(new Event('llm:complete'));
        } catch (e) { console.error(e); this.setStatus('Error: ' + e.message, true); }
        finally { this.busy = false; this.render(); }
    },

    async _visualise(payload) {
        const res = await fetch('/api/llm/visualiser', {
            method: 'POST', headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ ...payload, style_notes: this.styleNotes(), project_title: this.getProjectTitle() })
        });
        const data = await res.json();
        if (!res.ok) throw new Error(data.detail || 'visualiser failed');
        return data.prompt || '';
    },

    async generateCoverPrompt() {
        if (this.busy || !this.coverEnabled) return;
        this.busy = true; this.setStatus('Composing cover prompt…'); this.render();
        try {
            this.coverPrompt = await this._visualise({
                target: 'cover', title: this.getProjectTitle(), blurb: this.blurb,
                summary: (window.LLMPanel && window.LLMPanel.premiseSummary) || '',
            });
            this.el.cover.value = this.coverPrompt;
            if (window.autoResize) window.autoResize(this.el.cover);
            this.setStatus('Cover prompt ready');
            window.dispatchEvent(new Event('llm:complete'));
        } catch (e) { console.error(e); this.setStatus('Error: ' + e.message, true); }
        finally { this.busy = false; this.render(); }
    },

    async generateIllustration(id, { quiet = false } = {}) {
        const ch = this.findChapter(id);
        if (!ch) return;
        const text = this.chapterText(ch);
        if (!text) return;
        if (!quiet) { if (this.busy) return; this.busy = true; this.setStatus(`Illustration prompt: chapter ${ch.number}…`); this.render(); }
        try {
            ch.illustration_prompt = await this._visualise({
                target: 'chapter', chapter_number: ch.number, chapter_title: ch.title,
                chapter_text: this.openingWords(text), summary: ch.summary || '',
            });
            if (!quiet) this.setStatus(`Chapter ${ch.number} prompt ready`);
        } catch (e) { console.error(e); if (!quiet) this.setStatus('Error: ' + e.message, true); }
        finally { if (!quiet) { this.busy = false; this.render(); } }
    },

    async generateAllIllustrations() {
        if (this.busy) return;
        const targets = this.chapters().filter(c => this.illustrationOn(c) && this.chapterText(c) && !c.illustration_prompt);
        if (!targets.length) { this.setStatus('Every illustrated chapter with text already has a prompt'); return; }
        this.busy = true; this.render();
        try {
            for (let i = 0; i < targets.length; i++) {
                this.setStatus(`Illustration prompts: ${i + 1} of ${targets.length}…`);
                await this.generateIllustration(targets[i].id, { quiet: true });
                this.render();
            }
            this.setStatus(`${targets.length} illustration prompt${targets.length === 1 ? '' : 's'} ready`);
            window.dispatchEvent(new Event('llm:complete'));
        } finally { this.busy = false; this.render(); }
    },

    // ── export ────────────────────────────────────────────────────────────────
    async exportAs(format) {
        if (this.busy) return;
        this.busy = true; this.setStatus(`Building ${format.toUpperCase()}…`); this.render();
        try {
            const project = window.Snapshot.collectProject();
            const res = await fetch('/api/export/manuscript', {
                method: 'POST', headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    project, format, author: this.author,
                    include_unapproved: this.el.includeAll.checked,
                })
            });
            const data = await res.json();
            if (!res.ok) throw new Error(data.detail || 'export failed');
            this.lastExport = data;
            this.lastValidation = null;
            const warn = (data.warnings || []).map(w => `<li>${this._esc(w)}</li>`).join('');
            this.el.result.innerHTML = `
                <div class="export-done">✓ ${data.chapters_included} chapter${data.chapters_included === 1 ? '' : 's'}, ${data.words.toLocaleString()} words</div>
                <div class="button-row" style="gap:8px; flex-wrap:wrap;">
                    <a class="export-link" href="${data.url}" download>⬇ ${this._esc(data.filename)}</a>
                    <a class="export-link secondary" href="${data.companion_url}" download>⬇ companion (blurb + prompts)</a>
                    <a class="export-link secondary" href="${data.context_url}" download>⬇ context artefacts (.md)</a>
                    ${format === 'epub' ? `<button class="btn-secondary" onclick="ExportPanel.validateLast()">Validate with epubcheck</button>` : ''}
                </div>
                <div class="section-hint">Saved under projects/${this._esc(data.slug)}/export/ — private, not in git.</div>
                ${warn ? `<ul class="export-warnings">${warn}</ul>` : ''}
                <div id="export-validation"></div>`;
            this.setStatus('');
        } catch (e) { console.error(e); this.setStatus('Error: ' + e.message, true); }
        finally { this.busy = false; this.render(); }
    },

    async validateLast() {
        if (!this.lastExport || this.busy) return;
        const box = document.getElementById('export-validation');
        if (box) box.innerHTML = '<span class="section-hint">Running epubcheck…</span>';
        try {
            const res = await fetch('/api/export/validate', {
                method: 'POST', headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ slug: this.lastExport.slug, filename: this.lastExport.filename }),
            });
            const data = await res.json();
            if (!res.ok) throw new Error(data.detail || 'validation failed');
            this.lastValidation = data;
            if (!box) return;
            if (!data.available) {
                box.innerHTML = `<div class="export-warnings">epubcheck unavailable: ${this._esc(data.reason || '')}</div>`;
                return;
            }
            const msgs = (data.messages || []).map(m =>
                `<li><b>${this._esc(m.level)}</b> ${this._esc(m.id || '')} ${this._esc(m.location || '')}<br>${this._esc(m.message || '')}</li>`).join('');
            box.innerHTML = data.valid
                ? `<div class="export-done">✓ epubcheck ${this._esc(data.version || '')}: valid EPUB — ${data.warnings} warning${data.warnings === 1 ? '' : 's'}</div>`
                  + (msgs ? `<ul class="export-warnings">${msgs}</ul>` : '')
                : `<div class="export-invalid">✗ epubcheck: ${data.errors} error${data.errors === 1 ? '' : 's'}, ${data.warnings} warning${data.warnings === 1 ? '' : 's'}</div><ul class="export-warnings">${msgs}</ul>`;
        } catch (e) {
            console.error(e);
            if (box) box.innerHTML = `<div class="export-invalid">Validation error: ${this._esc(e.message)}</div>`;
        }
    },

    // ── snapshot ──────────────────────────────────────────────────────────────
    exportForSnapshot() {
        return { author: this.author, tagline: this.tagline, blurb: this.blurb, cover_prompt: this.coverPrompt,
                 cover_illustration_enabled: this.coverEnabled };
    },

    restoreFromSnapshot(project) {
        this.author = project.author || ''; this.tagline = project.tagline || '';
        this.blurb = project.blurb || '';   this.coverPrompt = project.cover_prompt || '';
        this.coverEnabled = project.cover_illustration_enabled !== false;
        if (!this.el || !this.el.author) return;
        this.el.author.value = this.author; this.el.tagline.value = this.tagline;
        this.el.blurb.value = this.blurb;   this.el.cover.value = this.coverPrompt;
        this.el.titleOpts.textContent = ''; this.el.result.innerHTML = '';
        this.setStatus('');
        this.render();
    },
};
