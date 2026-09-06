window.ChapterCPanel = {
    expandedIds: new Set(),
    isGenerating: false,
    isBulkGenerating: false,
    // Which chapter + pass is running right now (drives the highlighted progress pill)
    generatingId: null,
    currentPass: null,

    init() {
        this.container = document.getElementById('chapter-c-cards-container');
        this.btnExpandCollapse = document.getElementById('btn-c-expand-collapse-all');
        this.btnBulkGenerate = document.getElementById('btn-c-bulk-generate');
        this.statusText = document.getElementById('phase-c-status');

        this.btnExpandCollapse.addEventListener('click', () => {
            const chapters = window.ChapterPanel.chapters;
            if (this.expandedIds.size > 0) {
                this.expandedIds.clear();
            } else {
                chapters.forEach(c => this.expandedIds.add(c.id));
            }
            this.renderAllChapters();
        });

        this.btnBulkGenerate.addEventListener('click', () => this.bulkGenerateAll());
    },

    getProjectTitle() {
        return document.getElementById('project-title').value || 'unknown';
    },

    getTargetWordsPerChapter() {
        const words = parseInt(document.getElementById('setup-words').value) || 50000;
        const chapters = parseInt(document.getElementById('setup-chapters').value) || 20;
        return Math.round(words / chapters);
    },

    // Does a clue's free-text "planted_in" / "pays_off_in" refer to this chapter?
    // Matches a bare number, "Ch 3", "Chapter 3", "ch.3", or the chapter title.
    clueRefersToChapter(ref, ch) {
        if (!ref) return false;
        const text = String(ref).toLowerCase();
        const nums = [...text.matchAll(/\b(?:ch(?:apter)?\.?\s*)?(\d+)\b/g)].map(m => parseInt(m[1], 10));
        if (nums.includes(ch.number)) return true;
        const title = (ch.title || '').toLowerCase().trim();
        return title.length > 3 && title !== `chapter ${ch.number}` && text.includes(title);
    },

    // Planted clues scheduled for this chapter, tagged plant / payoff.
    cluesDueFor(ch) {
        const clues = (window.DumpPanel && window.DumpPanel.plantedClues) || [];
        const due = [];
        clues.filter(c => c.status !== 'blocked').forEach(c => {
            if (this.clueRefersToChapter(c.planted_in, ch))
                due.push({ label: c.label, description: c.description, role: 'plant' });
            if (this.clueRefersToChapter(c.pays_off_in, ch))
                due.push({ label: c.label, description: c.description, role: 'payoff' });
        });
        return due;
    },

    buildSharedContext(ch) {
        const chapters = window.ChapterPanel.chapters;
        const context_elements = window.ContextPanel.exportElementsForLLM();

        const prior_chapter_summaries = chapters
            .filter(c => c.approved && c.number < ch.number)
            .map(c => ({ number: c.number, title: c.title, summary: c.summary || '' }));

        let preceding_chapter_tail = '';
        const prevCh = chapters.find(c => c.number === ch.number - 1);
        if (prevCh && prevCh.full_text) {
            const words = prevCh.full_text.split(' ');
            preceding_chapter_tail = words.slice(-500).join(' ');
        }

        const clues_due = this.cluesDueFor(ch);
        // Full profile list; the backend selects the stage active for this chapter.
        const voice_profiles = (window.VoicesPanel && window.VoicesPanel.profiles) || [];
        const prior_state = this.priorStateFor(ch);
        return { context_elements, prior_chapter_summaries, preceding_chapter_tail, clues_due, voice_profiles, prior_state };
    },

    // ── Per-chapter continuity ────────────────────────────────────────────────

    hasState(ch) {
        return !!(ch && ch.story_state && Object.keys(ch.story_state).length);
    },

    // Canon for this chapter = the state at the end of the nearest earlier chapter that has one.
    priorStateFor(ch) {
        const earlier = window.ChapterPanel.chapters
            .filter(c => c.number < ch.number && this.hasState(c))
            .sort((a, b) => b.number - a.number);
        return earlier.length ? earlier[0].story_state : {};
    },

    // After chapter N's state changes, every later chapter that was checked against the
    // old state is stale. Flag only — the human decides what to re-run.
    markDownstreamStale(ch) {
        window.ChapterPanel.chapters.forEach(c => {
            if (c.number > ch.number && (this.hasState(c) || c.continuity_verdict)) c.state_stale = true;
        });
    },

    async runContinuity(chapterId, { fromPipeline = false } = {}) {
        const ch = window.ChapterPanel.chapters.find(c => c.id === chapterId);
        if (!ch) return;
        if (!fromPipeline && this.isGenerating) return;
        const text = ch.full_text || ch.polish_draft || ch.enrich_draft || ch.draft_text || '';
        if (!text.trim()) return;

        const { context_elements, clues_due, prior_state } = this.buildSharedContext(ch);
        const wasGenerating = this.isGenerating;
        const prevId = this.generatingId, prevPass = this.currentPass;
        this.isGenerating = true;
        document.body.style.cursor = 'wait';
        this.setPass(ch, 'continuity', `Continuity check: chapter ${ch.number}…`);

        try {
            const res = await fetch('/api/llm/chapter-continuity', {
                method: 'POST', headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    context_elements,
                    chapter_number: ch.number,
                    chapter_title: ch.title,
                    chapter_text: text,
                    prior_state,
                    planted_clues: (window.DumpPanel && window.DumpPanel.plantedClues) || [],
                    clues_due,
                    project_title: this.getProjectTitle(),
                })
            });
            const data = await res.json();
            if (!res.ok) throw new Error(data.detail || 'continuity failed');

            ch.story_state = data.story_state || {};
            ch.continuity_report = JSON.stringify(data);
            ch.continuity_verdict = data.verdict || '';
            ch.state_stale = false;
            ch.state_computed_at = new Date().toISOString();
            if (window.DumpPanel) window.DumpPanel.applyClueUpdates(data.clue_updates);
            this.markDownstreamStale(ch);
        } catch (e) {
            console.error('Continuity error:', e);
            ch.continuity_report = JSON.stringify({ verdict: '', summary: 'Error: ' + e.message, issues: [], clue_updates: [] });
            ch.continuity_verdict = '';
        } finally {
            this.isGenerating = wasGenerating;
            if (wasGenerating) { this.generatingId = prevId; this.currentPass = prevPass; } else { this.clearPass(); }
            if (!wasGenerating) document.body.style.cursor = 'default';
            this.updateStatus('');
            this.renderAllChapters();
            this.notifyUsageUpdate();
        }
    },

    // Human edit of the state JSON in the card. Invalid JSON is rejected, not saved.
    updateStoryState(chapterId, textarea) {
        const ch = window.ChapterPanel.chapters.find(c => c.id === chapterId);
        if (!ch) return;
        const msg = textarea.parentElement.querySelector('.state-json-msg');
        try {
            const parsed = JSON.parse(textarea.value);
            if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) throw new Error('state must be a JSON object');
            ch.story_state = parsed;
            ch.state_computed_at = new Date().toISOString();
            this.markDownstreamStale(ch);
            if (msg) { msg.textContent = 'State saved — later chapters flagged stale.'; msg.classList.remove('err'); }
        } catch (e) {
            if (msg) { msg.textContent = 'Not saved — invalid JSON: ' + e.message; msg.classList.add('err'); }
        }
    },

    _parseReport(str) {
        if (!str) return null;
        try { return JSON.parse(str); } catch (_) { return null; }
    },

    _esc(str) {
        return (str || '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
    },

    renderAllChapters() {
        if (!this.container) return;
        this.container.innerHTML = '';

        const chapters = window.ChapterPanel.chapters;
        const approvedCount = chapters.filter(c => c.phase_c_status === 'approved').length;
        this.statusText.innerText = `${approvedCount} / ${chapters.length} chapters approved`;
        this.btnExpandCollapse.innerText = this.expandedIds.size > 0 ? 'Collapse All' : 'Expand All';

        chapters.forEach(ch => {
            const card = this.renderChapterCard(ch);
            this.container.appendChild(card);
        });
    },

    PASSES: ['draft', 'enrich', 'critic', 'polish', 'continuity'],

    getPassStatus(ch) {
        const draftMap = {
            draft: ch.draft_text,
            enrich: ch.enrich_draft,
            critic: ch.critic_output,
            polish: ch.polish_draft,
            continuity: ch.continuity_verdict && !ch.state_stale
        };
        const running = this.generatingId === ch.id ? this.currentPass : null;
        return this.PASSES.map(p => ({
            name: p,
            done: !!(draftMap[p]),
            active: p === running
        }));
    },

    // Mark the pass now running for a chapter, update the status line, and re-render
    // so the active pill lights up while the call is in flight.
    setPass(ch, pass, statusMsg) {
        this.generatingId = ch.id;
        this.currentPass = pass;
        this.updateStatus(statusMsg);
        this.renderAllChapters();
    },

    clearPass() {
        this.generatingId = null;
        this.currentPass = null;
    },

    countWords(text) {
        if (!text) return 0;
        return text.trim().split(/\s+/).filter(w => w.length > 0).length;
    },

    renderChapterCard(ch) {
        const div = document.createElement('div');
        div.className = 'chapter-c-card' + (ch.phase_c_status === 'approved' ? ' approved-chapter' : '');
        div.id = `chapter-c-card-${ch.id}`;

        const isExpanded = this.expandedIds.has(ch.id);
        const passes = this.getPassStatus(ch);

        let statusIcon = '⬜';
        if (ch.phase_c_status === 'approved') statusIcon = '✅';
        else if (ch.phase_c_status && ch.phase_c_status !== 'not_started') statusIcon = '⚙️';

        const latestDraft = ch.full_text || ch.polish_draft || ch.enrich_draft || ch.draft_text || '';
        const wordCount = this.countWords(latestDraft);

        const pillsHtml = passes.map(p =>
            `<span class="progress-pill ${p.done ? 'complete' : 'pending'}${p.active ? ' active' : ''}"
                   title="${p.active ? 'running now' : p.done ? 'done' : 'not yet run'}">${p.name}</span>`
        ).join('');

        // Top bar
        const topBar = document.createElement('div');
        topBar.className = 'top-bar';
        topBar.innerHTML = `
            <span class="chapter-number-badge">Ch ${ch.number}</span>
            <span style="flex:1; font-weight: bold; color: #ccc;">${ch.title}</span>
            ${ch.state_stale ? '<span class="cont-badge stale" title="Continuity state is stale">⏳</span>' : ''}
            <span style="font-size:1.1rem;">${statusIcon}</span>
            <div class="progress-pills">${pillsHtml}</div>
            <span class="word-count-badge">${wordCount} words</span>
            <button class="card-btn" onclick="ChapterCPanel.toggleExpand('${ch.id}')">
                ${isExpanded ? '▲' : '▼'}
            </button>
        `;
        div.appendChild(topBar);

        if (isExpanded) {
            const body = document.createElement('div');
            body.className = 'chapter-c-expanded';

            // Generation controls section
            const genSection = document.createElement('div');
            genSection.className = 'generation-section';

            const isApproved = ch.phase_c_status === 'approved';
            const hasDraft = !!latestDraft;

            genSection.innerHTML = `
                <div class="button-row" style="margin-bottom: 10px;">
                    <button class="btn-primary"
                        onclick="ChapterCPanel.generateChapter('${ch.id}')"
                        ${this.isGenerating ? 'disabled' : ''}>
                        ${hasDraft ? 'Regenerate Chapter' : 'Generate Chapter'}
                    </button>
                    <button class="btn-secondary"
                        onclick="ChapterCPanel.rerunCritic('${ch.id}')"
                        ${(!hasDraft || this.isGenerating) ? 'disabled' : ''}>
                        Re-run Critic
                    </button>
                    ${!isApproved ?
                        `<button class="btn-success"
                            onclick="ChapterCPanel.approveChapter('${ch.id}')"
                            ${(!hasDraft || this.isGenerating) ? 'disabled' : ''}>
                            Approve Chapter
                        </button>` :
                        `<button class="btn-secondary"
                            onclick="ChapterCPanel.unapproveChapter('${ch.id}')"
                            ${this.isGenerating ? 'disabled' : ''}>
                            Unapprove
                        </button>`
                    }
                </div>
            `;
            body.appendChild(genSection);

            // Final draft textarea
            const draftLabel = document.createElement('label');
            draftLabel.style.cssText = 'color: #ccc; font-size: 0.9rem;';
            draftLabel.innerText = 'Final Draft';
            body.appendChild(draftLabel);

            const draftArea = document.createElement('textarea');
            draftArea.rows = 20;
            draftArea.className = isApproved ? 'streaming-output skeleton-approved' : 'streaming-output';
            draftArea.readOnly = isApproved;
            draftArea.placeholder = 'Generated chapter text will appear here...';
            draftArea.value = latestDraft;
            draftArea.addEventListener('change', (e) => {
                ch.full_text = e.target.value;
                // Hand edit: the state computed from the old text no longer reflects this chapter.
                if (ch.continuity_verdict || this.hasState(ch)) ch.state_stale = true;
            });
            body.appendChild(draftArea);

            // Summary subsection
            const summaryDiv = document.createElement('div');
            summaryDiv.className = 'summary-subsection';
            summaryDiv.innerHTML = `
                <label style="color: #ccc; font-size: 0.9rem;">
                    Chapter Summary
                    <span style="font-size:0.75rem; color:#888;">
                        (used as context for subsequent chapters)
                    </span>
                </label>
                <textarea rows="4" class="streaming-output"
                    placeholder="Summary will be auto-generated on approval, or write your own..."
                    onchange="ChapterCPanel.updateSummary('${ch.id}', this.value)"
                >${ch.summary || ''}</textarea>
                <div class="button-row" style="margin-top: 6px;">
                    <button class="btn-secondary"
                        onclick="ChapterCPanel.generateSummary('${ch.id}')"
                        ${(!hasDraft || this.isGenerating) ? 'disabled' : ''}>
                        Regenerate Summary
                    </button>
                </div>
            `;
            body.appendChild(summaryDiv);

            // Continuity subsection: verdict, stale flag, report, editable story state
            const contDiv = document.createElement('div');
            contDiv.className = 'continuity-subsection';
            const report = this._parseReport(ch.continuity_report);
            const verdictBadge =
                ch.continuity_verdict === 'approve' ? '<span class="cont-badge ok">✅ consistent</span>' :
                ch.continuity_verdict === 'revise'  ? '<span class="cont-badge warn">⚠️ revise</span>' :
                                                      '<span class="cont-badge none">not checked</span>';
            const staleBadge = ch.state_stale
                ? '<span class="cont-badge stale" title="This chapter\'s text or an earlier chapter changed since continuity last ran">⏳ stale — re-run</span>'
                : '';
            const stateJson = this.hasState(ch) ? JSON.stringify(ch.story_state, null, 2) : '';
            contDiv.innerHTML = `
                <div class="button-row" style="align-items:center; gap:8px; flex-wrap:wrap;">
                    <label style="color:#ccc; font-size:0.9rem;">Continuity</label>
                    ${verdictBadge}${staleBadge}
                    <button class="btn-secondary btn-sm"
                        onclick="ChapterCPanel.runContinuity('${ch.id}')"
                        ${(!hasDraft || this.isGenerating) ? 'disabled' : ''}>
                        ${ch.continuity_verdict ? 'Re-run Continuity' : 'Run Continuity'}
                    </button>
                </div>
                <textarea rows="4" class="streaming-output" readonly
                    placeholder="Continuity report appears here after the chapter is generated or checked…">${this._esc(report ? window.formatContinuityReport(report) : '')}</textarea>
                <details class="state-details" style="${stateJson ? '' : 'display:none;'}">
                    <summary>Story state after this chapter
                        <span class="section-hint">— canon for the next chapter; edit if the agent got something wrong</span>
                    </summary>
                    <textarea rows="14" class="state-json" spellcheck="false"
                        onchange="ChapterCPanel.updateStoryState('${ch.id}', this)">${this._esc(stateJson)}</textarea>
                    <div class="section-hint state-json-msg"></div>
                </details>
            `;
            body.appendChild(contDiv);

            div.appendChild(body);
        }

        return div;
    },

    toggleExpand(id) {
        if (this.expandedIds.has(id)) {
            this.expandedIds.delete(id);
        } else {
            this.expandedIds.add(id);
        }
        this.renderAllChapters();
    },

    updateSummary(id, value) {
        const ch = window.ChapterPanel.chapters.find(c => c.id === id);
        if (ch) ch.summary = value;
    },

    async generateChapter(chapterId) {
        const chapters = window.ChapterPanel.chapters;
        const ch = chapters.find(c => c.id === chapterId);
        if (!ch || this.isGenerating) return;

        this.isGenerating = true;
        document.body.style.cursor = 'wait';
        ch.phase_c_status = 'actions';
        this.renderAllChapters();

        const { context_elements, prior_chapter_summaries, preceding_chapter_tail, clues_due, voice_profiles, prior_state } =
            this.buildSharedContext(ch);

        const basePayload = {
            context_elements,
            prior_chapter_summaries,
            preceding_chapter_tail,
            clues_due,
            voice_profiles,
            prior_state,
            chapter_number: ch.number,
            chapter_title: ch.title,
            chapter_skeleton: ch.skeleton || '',
            current_draft: '',
            critic_feedback: '',
            target_words_per_chapter: this.getTargetWordsPerChapter(),
            project_title: this.getProjectTitle()
        };

        try {
            // Pass 1: Draft (actions + sensory atmosphere + dialogue placeholders)
            this.setPass(ch, 'draft', 'Writing draft...');
            let res = await fetch('/api/llm/chapter-draft', {
                method: 'POST', headers: {'Content-Type': 'application/json'},
                body: JSON.stringify(basePayload)
            });
            let data = await res.json();
            ch.draft_text = data.content;
            ch.phase_c_status = 'draft';
            this.renderAllChapters();

            // Pass 2: Enrich (dialogue + sensory layering + style + De-AI)
            this.setPass(ch, 'enrich', 'Enriching draft...');
            res = await fetch('/api/llm/chapter-enrich', {
                method: 'POST', headers: {'Content-Type': 'application/json'},
                body: JSON.stringify({...basePayload, current_draft: ch.draft_text})
            });
            data = await res.json();
            ch.enrich_draft = data.content;
            ch.phase_c_status = 'enrich';
            this.renderAllChapters();

            // Summarise enrich draft (compact reference for downstream context)
            this.updateStatus('Summarising enriched draft...');
            try {
                const enrichSumRes = await fetch('/api/llm/chapter-summarise-enrich', {
                    method: 'POST', headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({
                        chapter_number: ch.number,
                        chapter_title: ch.title,
                        enrich_draft: ch.enrich_draft,
                        project_title: this.getProjectTitle()
                    })
                });
                const enrichSumData = await enrichSumRes.json();
                ch.enrich_draft_summary = enrichSumData.content;
            } catch (e) {
                console.warn('Enrich summary failed (non-fatal):', e);
            }

            // Critic + Polish (1 pass — re-run manually via Re-run Critic)
            let currentDraft = ch.enrich_draft;
            const rounds = 1;
            for (let i = 0; i < rounds; i++) {
                // Critic
                this.setPass(ch, 'critic', `Critic pass ${i + 1} of ${rounds}...`);
                res = await fetch('/api/llm/chapter-critic', {
                    method: 'POST', headers: {'Content-Type': 'application/json'},
                    body: JSON.stringify({
                        ...basePayload,
                        current_draft: currentDraft,
                        critic_feedback: ch.critic_output || ''
                    })
                });
                data = await res.json();
                ch.critic_output = data.content;
                ch.phase_c_status = 'critic';
                this.renderAllChapters();

                // Polish
                this.setPass(ch, 'polish', `Polish pass ${i + 1} of ${rounds}...`);
                res = await fetch('/api/llm/chapter-polish', {
                    method: 'POST', headers: {'Content-Type': 'application/json'},
                    body: JSON.stringify({
                        ...basePayload,
                        current_draft: currentDraft,
                        critic_feedback: ch.critic_output
                    })
                });
                data = await res.json();
                ch.polish_draft = data.content;
                currentDraft = ch.polish_draft;
                ch.phase_c_status = 'polish';
                this.renderAllChapters();
            }

            // Set final text
            ch.full_text = currentDraft;
            ch.phase_c_status = 'polish';

            // Auto-generate summary, then continuity (emits this chapter's story state)
            await this.generateSummary(chapterId);
            await this.runContinuity(chapterId, { fromPipeline: true });

            // Auto-scroll to next chapter
            const nextCh = window.ChapterPanel.chapters.find(c => c.number === ch.number + 1);
            if (nextCh) {
                this.expandedIds.add(nextCh.id);
                this.renderAllChapters();
                setTimeout(() => {
                    const el = document.getElementById(`chapter-c-card-${nextCh.id}`);
                    if (el) el.scrollIntoView({ behavior: 'smooth', block: 'start' });
                }, 100);
            }

        } catch (e) {
            console.error('Chapter generation error:', e);
            ch.phase_c_status = ch.phase_c_status || 'not_started';
        } finally {
            this.isGenerating = false;
            this.clearPass();
            document.body.style.cursor = 'default';
            this.updateStatus('');
            this.renderAllChapters();
            this.notifyUsageUpdate();
        }
    },

    async rerunCritic(chapterId) {
        const ch = window.ChapterPanel.chapters.find(c => c.id === chapterId);
        if (!ch || this.isGenerating) return;

        this.isGenerating = true;
        document.body.style.cursor = 'wait';

        const { context_elements, prior_chapter_summaries, preceding_chapter_tail, clues_due, voice_profiles, prior_state } =
            this.buildSharedContext(ch);

        // full_text is the human-edited text once it exists — it must win over the
        // agents' own drafts, otherwise the editor pass silently discards hand edits.
        const currentDraft = ch.full_text || ch.polish_draft || ch.enrich_draft || '';

        const basePayload = {
            context_elements,
            prior_chapter_summaries,
            preceding_chapter_tail,
            clues_due,
            voice_profiles,
            prior_state,
            chapter_number: ch.number,
            chapter_title: ch.title,
            chapter_skeleton: ch.skeleton || '',
            current_draft: currentDraft,
            critic_feedback: ch.critic_output || '',
            target_words_per_chapter: this.getTargetWordsPerChapter(),
            project_title: this.getProjectTitle()
        };

        try {
            // Critic
            this.setPass(ch, 'critic', 'Re-running critic...');
            let res = await fetch('/api/llm/chapter-critic', {
                method: 'POST', headers: {'Content-Type': 'application/json'},
                body: JSON.stringify(basePayload)
            });
            let data = await res.json();
            ch.critic_output = data.content;

            // Polish
            this.setPass(ch, 'polish', 'Polishing...');
            res = await fetch('/api/llm/chapter-polish', {
                method: 'POST', headers: {'Content-Type': 'application/json'},
                body: JSON.stringify({...basePayload, critic_feedback: ch.critic_output})
            });
            data = await res.json();
            ch.polish_draft = data.content;
            ch.full_text = ch.polish_draft;

            // Text changed: recompute this chapter's state (flags later chapters stale)
            await this.runContinuity(chapterId, { fromPipeline: true });

        } catch (e) {
            console.error('Re-run critic error:', e);
        } finally {
            this.isGenerating = false;
            this.clearPass();
            document.body.style.cursor = 'default';
            this.updateStatus('');
            this.renderAllChapters();
        }
    },

    async generateSummary(chapterId) {
        const ch = window.ChapterPanel.chapters.find(c => c.id === chapterId);
        if (!ch) return;

        const textToSummarise = ch.full_text || ch.polish_draft || ch.enrich_draft || '';
        if (!textToSummarise) return;

        try {
            const res = await fetch('/api/llm/chapter-summary', {
                method: 'POST', headers: {'Content-Type': 'application/json'},
                body: JSON.stringify({
                    context_elements: [],
                    prior_chapter_summaries: [],
                    preceding_chapter_tail: '',
                    chapter_number: ch.number,
                    chapter_title: ch.title,
                    chapter_skeleton: '',
                    current_draft: textToSummarise,
                    critic_feedback: '',
                    project_title: this.getProjectTitle()
                })
            });
            const data = await res.json();
            ch.summary = data.content;
        } catch (e) {
            console.error('Summary error:', e);
        }
        this.renderAllChapters();
    },

    approveChapter(chapterId) {
        const ch = window.ChapterPanel.chapters.find(c => c.id === chapterId);
        if (!ch) return;

        if (!ch.summary) {
            this.generateSummary(chapterId).then(() => {
                ch.approved = true;
                ch.phase_c_status = 'approved';
                this.renderAllChapters();
                this.scrollToNext(ch);
            });
        } else {
            ch.approved = true;
            ch.phase_c_status = 'approved';
            this.renderAllChapters();
            this.scrollToNext(ch);
        }
    },

    unapproveChapter(chapterId) {
        const ch = window.ChapterPanel.chapters.find(c => c.id === chapterId);
        if (!ch) return;
        ch.approved = false;
        ch.phase_c_status = 'polish';
        this.renderAllChapters();
    },

    scrollToNext(ch) {
        const nextCh = window.ChapterPanel.chapters.find(c => c.number === ch.number + 1);
        if (nextCh) {
            this.expandedIds.add(nextCh.id);
            this.renderAllChapters();
            setTimeout(() => {
                const el = document.getElementById(`chapter-c-card-${nextCh.id}`);
                if (el) el.scrollIntoView({ behavior: 'smooth', block: 'start' });
            }, 100);
        }
    },

    async bulkGenerateAll() {
        if (this.isBulkGenerating) return;
        if (!confirm('Bulk generate all unapproved chapters? This may take a long time.')) return;

        this.isBulkGenerating = true;
        this.btnBulkGenerate.disabled = true;

        const chapters = window.ChapterPanel.chapters;
        const toGenerate = chapters.filter(c => c.phase_c_status !== 'approved');

        for (let i = 0; i < toGenerate.length; i++) {
            const ch = toGenerate[i];
            this.btnBulkGenerate.innerText = `Generating ${i + 1} of ${toGenerate.length}...`;
            this.expandedIds.add(ch.id);
            await this.generateChapter(ch.id);
            ch.approved = true;
            ch.phase_c_status = 'approved';
            this.renderAllChapters();
        }

        this.isBulkGenerating = false;
        this.btnBulkGenerate.disabled = false;
        this.btnBulkGenerate.innerText = 'Bulk Generate All';
    },

    notifyUsageUpdate() {
        window.dispatchEvent(new Event('llm:complete'));
    },

    updateStatus(msg) {
        if (msg) {
            this.statusText.innerText = msg;
        } else {
            const chapters = window.ChapterPanel.chapters;
            const approvedCount = chapters.filter(c => c.phase_c_status === 'approved').length;
            this.statusText.innerText = `${approvedCount} / ${chapters.length} chapters approved`;
        }
    }
};
