window.Snapshot = {
    async saveProject() {
        const title = document.getElementById('project-title').value;

        // Suggest filename
        let filename = "";
        try {
            const res = await fetch('/api/project/suggest-filename?title=' + encodeURIComponent(title));
            const data = await res.json();
            filename = data.filename;
        } catch (e) {
            filename = "bookbot_untitled.json";
        }

        const finalName = prompt("Save project as:", filename);
        if (!finalName) return;

        const dumpData = window.DumpPanel ? window.DumpPanel.exportForSnapshot() : {};
        const llmData   = window.LLMPanel   ? window.LLMPanel.exportForSnapshot()   : {};
        const styleData = window.StylePanel ? window.StylePanel.exportForSnapshot() : {};
        const projectData = {
            id: window.currentProjectId || "",
            title: title,
            target_word_count: parseInt(document.getElementById('setup-words').value) || 50000,
            target_chapter_count: parseInt(document.getElementById('setup-chapters').value) || 20,
            phase: "A",
            context_elements: window.ContextPanel.contextElements,
            chapters: window.ChapterPanel.chapters || [],
            model_name: window.currentModelName || "claude-sonnet-5",
            created_at: window.currentProjectCreatedAt || new Date().toISOString(),
            updated_at: new Date().toISOString(),
            ...dumpData,
            ...llmData,
            ...styleData
        };

        try {
            const res = await fetch('/api/project/save', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ project: projectData, custom_filename: finalName })
            });
            const data = await res.json();
            alert(`Saved to projects/${data.filename}`);
        } catch (e) {
            console.error(e);
            alert("Error saving project.");
        }
    },

    async loadProject() {
        try {
            const res = await fetch('/api/project/list');
            const files = await res.json();

            const listEl = document.getElementById('load-project-list');
            listEl.innerHTML = '';

            if (files.length === 0) {
                listEl.innerHTML = '<p>No saved projects found.</p>';
            } else {
                // Group by base name (strip trailing _YYYYMMDD_HHMM before .json)
                const groups = {};
                const datePattern = /_\d{8}_\d{4}(\.json)$/;
                files.forEach(f => {
                    const base = f.filename.replace(datePattern, '').replace(/\.json$/, '');
                    if (!groups[base]) groups[base] = [];
                    groups[base].push(f);
                });

                // Sort each group newest-first
                Object.values(groups).forEach(g => g.sort((a, b) => new Date(b.modified_date) - new Date(a.modified_date)));

                const groupNames = Object.keys(groups).sort();
                groupNames.forEach(base => {
                    const saves = groups[base];
                    const label = base.replace(/^bookbot_/, '').replace(/_/g, ' ');

                    const groupDiv = document.createElement('div');
                    groupDiv.className = 'load-group';

                    const header = document.createElement('button');
                    header.className = 'load-group-header';
                    header.innerHTML = `<span class="load-group-label">${label}</span><span class="load-group-meta">${saves.length} save${saves.length > 1 ? 's' : ''}</span><span class="load-group-arrow">▶</span>`;

                    const body = document.createElement('div');
                    body.className = 'load-group-body';
                    body.style.display = 'none';

                    saves.forEach(f => {
                        const btn = document.createElement('button');
                        btn.className = 'load-save-btn';
                        btn.title = f.filename;
                        // Date is the primary label; filename shown muted so two saves
                        // with identical timestamps (e.g. a renamed file) stay distinguishable.
                        const dateSpan = document.createElement('span');
                        dateSpan.textContent = new Date(f.modified_date).toLocaleString();
                        const fileSpan = document.createElement('span');
                        fileSpan.className = 'load-save-filename';
                        fileSpan.textContent = f.filename;
                        btn.appendChild(dateSpan);
                        btn.appendChild(fileSpan);
                        btn.onclick = () => this.loadSpecificProject(f.filename);
                        body.appendChild(btn);
                    });

                    header.addEventListener('click', () => {
                        const open = body.style.display !== 'none';
                        body.style.display = open ? 'none' : 'block';
                        header.querySelector('.load-group-arrow').textContent = open ? '▶' : '▼';
                    });

                    // Auto-expand if only one group
                    if (groupNames.length === 1) {
                        body.style.display = 'block';
                        header.querySelector('.load-group-arrow').textContent = '▼';
                    }

                    groupDiv.appendChild(header);
                    groupDiv.appendChild(body);
                    listEl.appendChild(groupDiv);
                });
            }
            document.getElementById('load-modal').style.display = 'flex';
        } catch (e) {
            console.error(e);
            const listEl = document.getElementById('load-project-list');
            if (listEl) listEl.innerHTML = `<p style="color:#e63946;">Error: ${e.message}</p>`;
            document.getElementById('load-modal').style.display = 'flex';
        }
    },

    async loadSpecificProject(filename) {
        try {
            const res = await fetch('/api/project/load', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ filepath: `projects/${filename}` })
            });
            const project = await res.json();
            this.repopulateUI(project);
            document.getElementById('load-modal').style.display = 'none';
        } catch (e) {
            console.error(e);
            alert("Error loading project.");
        }
    },

    repopulateUI(project) {
        window.currentProjectId = project.id;
        window.currentProjectCreatedAt = project.created_at;

        document.getElementById('project-title').value = project.title;
        document.getElementById('setup-words').value = project.target_word_count || 50000;
        document.getElementById('setup-chapters').value = project.target_chapter_count || 20;

        if (window.DumpPanel) window.DumpPanel.loadFromSnapshot(project);
        if (window.LLMPanel)   window.LLMPanel.loadFromSnapshot(project);
        if (window.StylePanel) window.StylePanel.restoreFromSnapshot(project);

        window.ContextPanel.contextElements = project.context_elements || [];
        window.ContextPanel.renderContextPanel();

        if (window.ChapterPanel) {
            window.ChapterPanel.loadChapters(project.chapters);
        }
        setTimeout(() => { if (window._resizeAllOutputs) window._resizeAllOutputs(); }, 50);
    },

    async newProject() {
        if (!confirm("Start new project? Unsaved changes will be lost.")) return;

        try {
            const res = await fetch('/api/project/new', { method: 'POST' });
            const project = await res.json();
            this.repopulateUI(project);
        } catch (e) {
            console.error(e);
            alert("Error creating new project.");
        }
    }
};
