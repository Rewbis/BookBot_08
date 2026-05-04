document.addEventListener('DOMContentLoaded', async () => {
    // 1. Initialize modules
    window.ContextPanel.init();
    window.LLMPanel.init();

    // 2. Bind top-level buttons
    document.getElementById('btn-new-project').addEventListener('click', () => window.Snapshot.newProject());
    document.getElementById('btn-save-project').addEventListener('click', () => window.Snapshot.saveProject());
    document.getElementById('btn-load-project').addEventListener('click', () => window.Snapshot.loadProject());
    
    document.getElementById('btn-cancel-load').addEventListener('click', () => {
        document.getElementById('load-modal').style.display = 'none';
    });

    document.getElementById('btn-add-plot-point').addEventListener('click', () => {
        const text = prompt("Enter plot point:");
        if (text) {
            window.ContextPanel.addElement("Plot Point", text, "human", "plot_point");
        }
    });

    // 3. Setup tabs
    const tabs = document.querySelectorAll('.tab-btn');
    const contents = document.querySelectorAll('.tab-content');
    tabs.forEach(t => {
        t.addEventListener('click', () => {
            if (t.classList.contains('disabled')) return;
            tabs.forEach(x => x.classList.remove('active'));
            contents.forEach(x => x.style.display = 'none');
            
            t.classList.add('active');
            document.getElementById(t.dataset.tab).style.display = 'block';
        });
    });

    // 4. Check Ollama Status
    async function checkOllama() {
        try {
            const res = await fetch('/api/llm/health');
            if (res.ok) {
                document.getElementById('ollama-status-dot').className = 'dot green';
            } else {
                document.getElementById('ollama-status-dot').className = 'dot red';
            }
        } catch (e) {
            document.getElementById('ollama-status-dot').className = 'dot red';
        }
    }
    
    await checkOllama();
    setInterval(checkOllama, 30000);

    // 5. Initial New Project
    try {
        const res = await fetch('/api/project/new', { method: 'POST' });
        const project = await res.json();
        window.Snapshot.repopulateUI(project);
    } catch (e) {
        console.error("Failed to init project", e);
    }
});
