window.ChapterCPanel = {
    expandedIds: new Set(),
    isGenerating: false,
    isBulkGenerating: false,

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
        return { context_elements, prior_chapter_summaries, preceding_chapter_tail, clues_due };
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

    getPassStatus(ch) {
        const passes = ['draft', 'enrich', 'critic', 'polish'];
        const draftMap = {
            draft: ch.draft_text,
            enrich: ch.enrich_draft,
            critic: ch.critic_output,
            polish: ch.polish_draft
        };
        return passes.map(p => ({
            name: p,
            done: !!(draftMap[p])
        }));
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
            `<span class="progress-pill ${p.done ? 'complete' : 'pending'}">${p.name}</span>`
        ).join('');

        // Top bar
        const topBar = document.createElement('div');
        topBar.className = 'top-bar';
        topBar.innerHTML = `
            <span class="chapter-number-badge">Ch ${ch.number}</span>
            <span style="flex:1; font-weight: bold; color: #ccc;">${ch.title}</span>
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

        const { context_elements, prior_chapter_summaries, preceding_chapter_tail, clues_due } =
            this.buildSharedContext(ch);

        const basePayload = {
            context_elements,
            prior_chapter_summaries,
            preceding_chapter_tail,
            clues_due,
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
            this.updateStatus('Writing draft...');
            let res = await fetch('/api/llm/chapter-draft', {
                method: 'POST', headers: {'Content-Type': 'application/json'},
                body: JSON.stringify(basePayload)
            });
            let data = await res.json();
            ch.draft_text = data.content;
            ch.phase_c_status = 'draft';
            this.renderAllChapters();

            // Pass 2: Enrich (dialogue + sensory layering + style + De-AI)
            this.updateStatus('Enriching draft...');
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
                this.updateStatus(`Critic pass ${i + 1} of ${rounds}...`);
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
                this.updateStatus(`Polish pass ${i + 1} of ${rounds}...`);
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

            // Auto-generate summary
            await this.generateSummary(chapterId);

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

        const { context_elements, prior_chapter_summaries, preceding_chapter_tail, clues_due } =
            this.buildSharedContext(ch);

        // full_text is the human-edited text once it exists — it must win over the
        // agents' own drafts, otherwise the editor pass silently discards hand edits.
        const currentDraft = ch.full_text || ch.polish_draft || ch.enrich_draft || '';

        const basePayload = {
            context_elements,
            prior_chapter_summaries,
            preceding_chapter_tail,
            clues_due,
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
            this.updateStatus('Re-running critic...');
            let res = await fetch('/api/llm/chapter-critic', {
                method: 'POST', headers: {'Content-Type': 'application/json'},
                body: JSON.stringify(basePayload)
            });
            let data = await res.json();
            ch.critic_output = data.content;

            // Polish
            this.updateStatus('Polishing...');
            res = await fetch('/api/llm/chapter-polish', {
                method: 'POST', headers: {'Content-Type': 'application/json'},
                body: JSON.stringify({...basePayload, critic_feedback: ch.critic_output})
            });
            data = await res.json();
            ch.polish_draft = data.content;
            ch.full_text = ch.polish_draft;

        } catch (e) {
            console.error('Re-run critic error:', e);
        } finally {
            this.isGenerating = false;
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
