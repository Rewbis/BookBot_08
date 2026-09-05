// Writing Style section (Phase A): author sample → derived style guide → context.
window.StylePanel = {
    styleSample: "",
    styleGuide: "",

    init() {
        this.txtSample        = document.getElementById('style-sample-text');
        this.txtGuide         = document.getElementById('style-guide-text');
        this.guideRow         = document.getElementById('style-guide-row');
        this.lblStatus        = document.getElementById('style-status');
        this.lblTokens        = document.getElementById('style-sample-tokens');
        this.btnDerive        = document.getElementById('btn-derive-style');
        this.btnApproveSample = document.getElementById('btn-approve-style-sample');
        this.btnApproveGuide  = document.getElementById('btn-approve-style-guide');
        this.fileInput        = document.getElementById('style-file-input');

        this.txtSample.addEventListener('input', () => this.onSampleChanged());
        this.txtGuide.addEventListener('input',  () => { this.styleGuide = this.txtGuide.value; });
        this.fileInput.addEventListener('change', e => this.loadFile(e.target.files[0]));
        this.btnDerive.addEventListener('click',        () => this.deriveGuide());
        this.btnApproveSample.addEventListener('click', () => this.approveSample());
        this.btnApproveGuide.addEventListener('click',  () => this.approveGuide());
    },

    onSampleChanged() {
        this.styleSample = this.txtSample.value;
        const has = this.styleSample.trim().length > 0;
        this.btnDerive.disabled = !has;
        this.btnApproveSample.disabled = !has;
        this.btnApproveSample.textContent = 'Approve Sample → Context';
        if (has) {
            const words = this.styleSample.trim().split(/\s+/).length;
            this.lblTokens.textContent =
                `${words.toLocaleString()} words (~${Math.round(words * 1.3).toLocaleString()} tokens)`;
        } else {
            this.lblTokens.textContent = '';
        }
    },

    loadFile(file) {
        if (!file) return;
        const reader = new FileReader();
        reader.onload = () => {
            this.txtSample.value = reader.result;
            this.onSampleChanged();
            if (window.autoResize) window.autoResize(this.txtSample);
            this.lblStatus.textContent = `Loaded ${file.name}`;
        };
        reader.onerror = () => { this.lblStatus.textContent = 'Could not read file'; };
        reader.readAsText(file);
        this.fileInput.value = '';   // allow re-loading the same file
    },

    async deriveGuide() {
        if (!this.styleSample.trim()) return;
        this.btnDerive.disabled = true;
        this.lblStatus.textContent = 'Deriving…';
        try {
            const res = await fetch('/api/llm/derive-style-guide', {
                method: 'POST', headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    style_sample: this.styleSample,
                    project_title: document.getElementById('project-title')?.value || 'unknown',
                })
            });
            const data = await res.json();
            if (!res.ok) throw new Error(data.detail || 'derive failed');
            this.styleGuide = data.content;
            this.txtGuide.value = data.content;
            this.guideRow.style.display = '';
            this.btnApproveGuide.disabled = false;
            this.btnApproveGuide.textContent = 'Approve Guide → Context';
            if (window.autoResize) window.autoResize(this.txtGuide);
            this.lblStatus.textContent = 'Done ✓ — edit, then approve';
            window.dispatchEvent(new Event('llm:complete'));
        } catch (e) {
            console.error(e);
            this.lblStatus.textContent = 'Error: ' + e.message;
        } finally {
            this.btnDerive.disabled = false;
        }
    },

    approveSample() {
        window.ContextPanel.addElement('Writing Sample', this.styleSample, 'human', 'style_sample', 'A');
        this.btnApproveSample.disabled = true;
        this.btnApproveSample.textContent = 'Sample in context ✓';
    },

    approveGuide() {
        this.styleGuide = this.txtGuide.value;
        window.ContextPanel.addElement('Style Guide', this.styleGuide, 'llm', 'style_guide', 'A');
        this.btnApproveGuide.disabled = true;
        this.btnApproveGuide.textContent = 'Guide in context ✓';
    },

    // ── Snapshot support ──────────────────────────────────────────────────────

    exportForSnapshot() {
        return { style_sample: this.styleSample, style_guide: this.styleGuide };
    },

    restoreFromSnapshot(project) {
        this.styleSample = project.style_sample || '';
        this.styleGuide  = project.style_guide  || '';
        this.txtSample.value = this.styleSample;
        this.onSampleChanged();
        this.txtGuide.value = this.styleGuide;
        this.guideRow.style.display = this.styleGuide ? '' : 'none';
        this.btnApproveGuide.disabled = !this.styleGuide;
        this.btnApproveGuide.textContent = 'Approve Guide → Context';
        this.lblStatus.textContent = '';
    },
};
