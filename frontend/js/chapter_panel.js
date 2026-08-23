window.ChapterPanel = {
    chapters: [],
    expandedIds: new Set(),
    deletedChaptersStack: [],
    undoTimeout: null,
    isGenerating: false,

    init() {
        this.container = document.getElementById('chapter-cards-container');
        this.btnExpandCollapse = document.getElementById('btn-expand-collapse-all');
        this.statusText = document.getElementById('phase-b-status');
        this.setupChaptersInput = document.getElementById('setup-chapters');

        this.btnExpandCollapse.addEventListener('click', () => {
            if (this.expandedIds.size > 0) {
                this.expandedIds.clear();
            } else {
                this.chapters.forEach(c => this.expandedIds.add(c.id));
            }
            this.renderAllChapters();
        });

        this.setupChaptersInput.addEventListener('input', () => {
            const val = parseInt(this.setupChaptersInput.value) || 20;
            const isEmptyOrPlaceholders = this.chapters.length === 0 || this.chapters.every(c => c.title === `Chapter ${c.number}` && !c.intention && !c.skeleton);
            if (isEmptyOrPlaceholders) {
                this.autoPopulate(val, true);
            }
        });

        // Only auto-populate if there are no chapters. Wait, loadChapters might have been called first.
        // It's safer to not auto-populate on init unless we are definitely in a new project state.
        // The spec says: "Auto-populate chapters on init IF chapters array is empty... using count from #setup-chapters"
        if (this.chapters.length === 0) {
            const count = parseInt(this.setupChaptersInput.value) || 20;
            this.autoPopulate(count, true);
        }
    },

    createChapter(number) {
        return {
            id: crypto.randomUUID(),
            number: number,
            title: `Chapter ${number}`,
            intention: "",
            scene_notes: "",
            skeleton: "",
            summary: "",
            full_text: "",
            order: number,
            status: "empty",
            approved: false
        };
    },

    autoPopulate(count, silent=false) {
        if (!silent && this.chapters.some(c => c.intention || c.skeleton || c.title !== `Chapter ${c.number}`)) {
            if (!confirm("This will clear existing chapters. Are you sure?")) return;
        }
        this.chapters = [];
        for (let i = 1; i <= count; i++) {
            this.chapters.push(this.createChapter(i));
        }
        this.expandedIds.clear();
        if (this.chapters.length > 0) {
            this.expandedIds.add(this.chapters[0].id);
        }
        this.renderAllChapters();
    },

    recalculateNumbers() {
        this.chapters.forEach((c, i) => {
            c.number = i + 1;
            c.order = i + 1;
        });
    },

    renderAllChapters() {
        this.container.innerHTML = '';
        
        // Render undo container if needed
        const now = Date.now();
        const validUndoItems = this.deletedChaptersStack.filter(item => now - item.timestamp < 30000);
        if (validUndoItems.length > 0) {
            const undoDiv = document.createElement('div');
            undoDiv.id = 'undo-delete-container';
            undoDiv.innerHTML = `
                <span>Chapter deleted.</span>
                <button class="btn-secondary" onclick="ChapterPanel.undoDelete()">Undo</button>
            `;
            this.container.appendChild(undoDiv);
        }

        const approvedCount = this.chapters.filter(c => c.approved).length;
        this.statusText.innerText = `${approvedCount} / ${this.chapters.length} chapters approved`;
        
        this.btnExpandCollapse.innerText = this.expandedIds.size > 0 ? "Collapse All" : "Expand All";

        this.chapters.forEach((ch, idx) => {
            const card = this.renderChapterCard(ch, idx);
            this.container.appendChild(card);
        });
        if (window._resizeAllOutputs) window._resizeAllOutputs();
    },

    renderChapterCard(ch, index) {
        const div = document.createElement('div');
        div.className = 'chapter-card' + (ch.approved ? ' approved-chapter' : '');
        div.id = `chapter-card-${ch.id}`;
        
        const isExpanded = this.expandedIds.has(ch.id);
        
        let statusIcon = '🔲';
        if (ch.approved) statusIcon = '✅';
        else if (ch.status === 'drafted' || ch.skeleton) statusIcon = '✏️';

        const topBar = document.createElement('div');
        topBar.className = 'top-bar';
        
        topBar.innerHTML = `
            <span class="chapter-badge">Ch ${ch.number}</span>
            <input type="text" class="editable-title" value="${ch.title}" style="flex: 1;" onchange="ChapterPanel.updateField('${ch.id}', 'title', this.value)">
            <span class="chapter-status">${statusIcon}</span>
            <button class="card-btn" title="Toggle Expand" onclick="ChapterPanel.toggleExpand('${ch.id}')">${isExpanded ? '▲' : '▼'}</button>
            <button class="card-btn" title="Move Up" onclick="ChapterPanel.moveChapter('${ch.id}', -1)">↑</button>
            <button class="card-btn" title="Move Down" onclick="ChapterPanel.moveChapter('${ch.id}', 1)">↓</button>
            <button class="card-btn" style="font-size: 0.8rem;" onclick="ChapterPanel.addChapter(${index})">+ Above</button>
            <button class="card-btn" style="font-size: 0.8rem;" onclick="ChapterPanel.addChapter(${index + 1})">+ Below</button>
            <button class="card-btn" style="color: #e63946;" onclick="ChapterPanel.deleteChapter('${ch.id}')">❌</button>
        `;
        
        div.appendChild(topBar);

        if (isExpanded) {
            const expDiv = document.createElement('div');
            expDiv.className = 'chapter-expanded-content';
            
            expDiv.innerHTML = `
                <label style="color: #ccc; font-size: 0.9rem;">Intention</label>
                <textarea rows="2" placeholder="What happens in this chapter?" onchange="ChapterPanel.updateField('${ch.id}', 'intention', this.value)">${ch.intention}</textarea>
                
                <label style="color: #ccc; font-size: 0.9rem;">Scene / Notes</label>
                <textarea rows="3" placeholder="Beats, dialogue ideas, devices..." onchange="ChapterPanel.updateField('${ch.id}', 'scene_notes', this.value)">${ch.scene_notes}</textarea>
                
                <div class="button-row" style="margin: 10px 0;">
                    <button class="btn-secondary" onclick="ChapterPanel.generatePlan('${ch.id}')" ${this.isGenerating ? 'disabled' : ''}>Generate Chapter Plan</button>
                    <button class="btn-primary" onclick="ChapterPanel.generateSkeleton('${ch.id}')" ${this.isGenerating ? 'disabled' : ''}>Generate Skeleton</button>
                    ${!ch.approved ?
                        `<button class="btn-success" onclick="ChapterPanel.approveChapter('${ch.id}')" ${(!ch.skeleton || this.isGenerating) ? 'disabled' : ''}>Approve & Add to Context</button>` :
                        `<button class="btn-secondary" onclick="ChapterPanel.unapproveChapter('${ch.id}')" ${this.isGenerating ? 'disabled' : ''}>Unapprove</button>`
                    }
                </div>
                
                <textarea rows="8" class="skeleton-textarea streaming-output ${ch.approved ? 'skeleton-approved' : ''}"
                    ${ch.approved ? 'readonly' : ''}
                    placeholder="Skeleton will appear here after generation..."
                    onchange="ChapterPanel.updateField('${ch.id}', 'skeleton', this.value)">${ch.skeleton}</textarea>
            `;
            div.appendChild(expDiv);
        }
        
        return div;
    },

    updateField(id, field, value) {
        const ch = this.chapters.find(c => c.id === id);
        if (ch) ch[field] = value;
    },

    toggleExpand(id) {
        if (this.expandedIds.has(id)) {
            this.expandedIds.delete(id);
        } else {
            this.expandedIds.add(id);
        }
        this.renderAllChapters();
    },

    async generatePlan(chapterId) {
        const ch = this.chapters.find(c => c.id === chapterId);
        if (!ch) return;

        this.isGenerating = true;
        this.renderAllChapters();
        document.body.style.cursor = 'wait';

        try {
            const context_elements = window.ContextPanel.exportElementsForLLM();
            const prior_skeletons = this.chapters
                .filter(c => c.approved && c.number < ch.number)
                .map(c => ({ number: c.number, skeleton: c.skeleton }));

            const res = await fetch('/api/llm/chapter-plan', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    context_elements,
                    prior_skeletons,
                    chapter_number: ch.number,
                    chapter_title: ch.title === `Chapter ${ch.number}` ? '' : ch.title,
                    intention: ch.intention,
                    scene_notes: ch.scene_notes,
                    project_title: document.getElementById('project-title')?.value || 'unknown',
                })
            });

            if (!res.ok) throw new Error("Chapter plan failed");
            const plan = await res.json();

            if (plan.title)       ch.title      = plan.title;
            if (plan.intention)   ch.intention  = plan.intention;
            if (plan.scene_notes) ch.scene_notes = plan.scene_notes;
            if (plan.skeleton)    { ch.skeleton = plan.skeleton; ch.status = "drafted"; }

        } catch (e) {
            console.error(e);
            alert("Error generating chapter plan — check console.");
        } finally {
            this.isGenerating = false;
            document.body.style.cursor = 'default';
            this.renderAllChapters();
        }
    },

    async generateSkeleton(chapterId) {
        const ch = this.chapters.find(c => c.id === chapterId);
        if (!ch) return;

        this.isGenerating = true;
        this.renderAllChapters(); // update disabled buttons
        document.body.style.cursor = 'wait';

        try {
            const context_elements = window.ContextPanel.exportElementsForLLM();
            const prior_skeletons = this.chapters
                .filter(c => c.approved && c.number < ch.number)
                .map(c => ({ number: c.number, skeleton: c.skeleton }));

            const res = await fetch('/api/llm/outliner', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    context_elements,
                    prior_skeletons,
                    chapter_number: ch.number,
                    chapter_title: ch.title,
                    intention: ch.intention,
                    scene_notes: ch.scene_notes
                })
            });

            if (!res.ok) throw new Error("Outliner failed");
            const data = await res.json();
            
            ch.skeleton = data.content;
            ch.status = "drafted";
            
            // Auto-expand next chapter
            const nextCh = this.chapters.find(c => c.number === ch.number + 1);
            if (nextCh) {
                this.expandedIds.add(nextCh.id);
            }
            
        } catch (e) {
            console.error(e);
            ch.skeleton = "Error generating skeleton.";
        } finally {
            this.isGenerating = false;
            document.body.style.cursor = 'default';
            this.renderAllChapters();
            
            // Scroll to next chapter if it exists
            const nextCh = this.chapters.find(c => c.number === ch.number + 1);
            if (nextCh) {
                setTimeout(() => {
                    const el = document.getElementById(`chapter-card-${nextCh.id}`);
                    if (el) el.scrollIntoView({ behavior: 'smooth', block: 'center' });
                }, 100);
            }
        }
    },

    approveChapter(chapterId) {
        const ch = this.chapters.find(c => c.id === chapterId);
        if (!ch) return;
        
        ch.approved = true;
        ch.status = "approved";
        
        window.ContextPanel.addElement(
            `Ch ${ch.number} Skeleton: ${ch.title}`,
            ch.skeleton,
            "llm",
            "chapter_skeleton",
            "B"
        );
        
        this.renderAllChapters();
    },

    unapproveChapter(chapterId) {
        const ch = this.chapters.find(c => c.id === chapterId);
        if (!ch) return;
        
        ch.approved = false;
        ch.status = "drafted";
        
        this.renderAllChapters();
    },

    moveChapter(id, direction) {
        const idx = this.chapters.findIndex(c => c.id === id);
        if (idx < 0) return;
        
        if (direction === -1 && idx > 0) {
            [this.chapters[idx-1], this.chapters[idx]] = [this.chapters[idx], this.chapters[idx-1]];
        } else if (direction === 1 && idx < this.chapters.length - 1) {
            [this.chapters[idx+1], this.chapters[idx]] = [this.chapters[idx], this.chapters[idx+1]];
        }
        
        this.recalculateNumbers();
        this.renderAllChapters();
    },

    addChapter(index) {
        const newChap = this.createChapter(0);
        this.chapters.splice(index, 0, newChap);
        this.recalculateNumbers();
        this.renderAllChapters();
    },

    deleteChapter(id) {
        if (!confirm("Delete this chapter?")) return;
        
        const idx = this.chapters.findIndex(c => c.id === id);
        if (idx < 0) return;
        
        const deletedCh = this.chapters.splice(idx, 1)[0];
        this.recalculateNumbers();
        
        const deleteItem = { element: deletedCh, originalIndex: idx, timestamp: Date.now() };
        this.deletedChaptersStack.push(deleteItem);
        if (this.deletedChaptersStack.length > 10) this.deletedChaptersStack.shift();
        
        clearTimeout(this.undoTimeout);
        this.undoTimeout = setTimeout(() => {
            const now = Date.now();
            this.deletedChaptersStack = this.deletedChaptersStack.filter(item => now - item.timestamp < 30000);
            this.renderAllChapters();
        }, 30000);
        
        this.renderAllChapters();
    },

    undoDelete() {
        if (this.deletedChaptersStack.length === 0) return;
        
        const lastDeleted = this.deletedChaptersStack.pop();
        this.chapters.splice(lastDeleted.originalIndex, 0, lastDeleted.element);
        this.recalculateNumbers();
        
        if (this.deletedChaptersStack.length === 0) {
            clearTimeout(this.undoTimeout);
        }
        this.renderAllChapters();
    },

    loadChapters(chaptersData) {
        this.chapters = chaptersData || [];
        this.expandedIds.clear();
        
        if (this.chapters.length === 0 && this.setupChaptersInput) {
            const count = parseInt(this.setupChaptersInput.value) || 20;
            this.autoPopulate(count, true);
        } else {
            if (this.chapters.length > 0) {
                const firstUnapproved = this.chapters.find(c => !c.approved);
                if (firstUnapproved) {
                    this.expandedIds.add(firstUnapproved.id);
                } else {
                    this.expandedIds.add(this.chapters[0].id);
                }
            }
            this.renderAllChapters();
        }
    }
};
