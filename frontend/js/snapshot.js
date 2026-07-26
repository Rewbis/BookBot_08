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
        const llmData  = window.LLMPanel  ? window.LLMPanel.exportForSnapshot()  : {};
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
            ...llmData
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
                files.forEach(f => {
                    const btn = document.createElement('button');
                    btn.className = 'full-width-btn mb-1';
                    btn.innerText = `${f.filename} (${new Date(f.modified_date).toLocaleString()})`;
                    btn.onclick = () => this.loadSpecificProject(f.filename);
                    listEl.appendChild(btn);
                });
            }
            document.getElementById('load-modal').style.display = 'flex';
        } catch (e) {
            console.error(e);
            alert("Error listing projects.");
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
        if (window.LLMPanel)  window.LLMPanel.loadFromSnapshot(project);

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
