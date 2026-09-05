// Shared by the Phase A continuity agent and the per-chapter continuity in Phase C.
window.formatContinuityReport = function (data) {
    if (!data) return '';
    const verdict = data.verdict === 'approve' ? '✅ APPROVE'
                  : data.verdict === 'revise'  ? '⚠️ REVISE'
                  : '— NO VERDICT';
    let out = `VERDICT: ${verdict}\n\n${data.summary || ''}`;
    if (data.issues?.length) {
        out += `\n\nISSUES TO ADDRESS:\n${data.issues.map((i, n) => `${n + 1}. ${i}`).join('\n')}`;
    }
    if (data.clue_updates?.length) {
        out += `\n\nCLUE STATUS UPDATES:`;
        data.clue_updates.forEach(u => {
            out += `\n• [${String(u.status || '').toUpperCase()}] ${u.id}: ${u.notes || ''}`;
        });
    }
    return out;
};

window.LLMPanel = {
    plotterOutput: "",
    antagonistOutput: "",
    revisionOutput: "",
    continuityData: null,   // parsed JSON from continuity agent
    premiseSummary: "",
    currentRound: 1,
    isGenerating: false,

    init() {
        // Phase A — plotter loop
        this.btnPlot        = document.getElementById('btn-generate-plot');
        this.btnRegen       = document.getElementById('btn-regenerate');
        this.btnAccPlot     = document.getElementById('btn-accept-plotter');
        this.btnEditAccPlot = document.getElementById('btn-edit-accept-plotter');
        this.btnRunAntag    = document.getElementById('btn-run-antagonist');
        this.btnRunRev      = document.getElementById('btn-run-revision');
        this.btnRerunLoop   = document.getElementById('btn-rerun-loop');
        this.btnAccRev      = document.getElementById('btn-accept-revision');
        this.btnEditRev     = document.getElementById('btn-edit-revision');

        // Continuity agent
        this.btnRunCont     = document.getElementById('btn-run-continuity');
        this.btnApproveA    = document.getElementById('btn-approve-phase-a');
        this.btnPassBack    = document.getElementById('btn-pass-back-plotter');

        // Premise summariser
        this.btnSumPremise      = document.getElementById('btn-summarise-premise');
        this.lblSumStatus       = document.getElementById('premise-summary-status');
        this.btnEditPremSum     = document.getElementById('btn-edit-premise-summary');
        this.btnApprovePremSum  = document.getElementById('btn-approve-premise-summary');

        // Textareas
        this.txtPlotOut  = document.getElementById('plotter-output');
        this.txtAntagOut = document.getElementById('antagonist-output');
        this.txtRevOut   = document.getElementById('revision-output');
        this.txtContOut  = document.getElementById('continuity-output');
        this.txtSumOut   = document.getElementById('premise-summary-output');

        // Wiring
        this.btnPlot.addEventListener('click',        () => this.runPlotter());
        this.btnRegen.addEventListener('click',       () => this.runPlotter());
        this.btnAccPlot.addEventListener('click',     () => this.acceptPlotterOutput());
        this.btnEditAccPlot.addEventListener('click', () => this.editPlotterOutput());
        this.btnRunAntag.addEventListener('click',    () => this.runAntagonist());
        this.btnRunRev.addEventListener('click',      () => this.runRevision());
        this.btnRerunLoop.addEventListener('click',   () => this.runAntagonist());
        this.btnAccRev.addEventListener('click',      () => this.acceptRevision());
        this.btnEditRev.addEventListener('click',     () => this.editRevisionOutput());
        this.btnRunCont.addEventListener('click',     () => this.runContinuity());
        this.btnApproveA.addEventListener('click',    () => this.approvePlanToPhaseB());
        this.btnPassBack.addEventListener('click',    () => this.passBackToPlotter());
        this.btnSumPremise.addEventListener('click',     () => this.runSummarisePremise());
        this.btnEditPremSum.addEventListener('click',    () => this.editPremiseSummary());
        this.btnApprovePremSum.addEventListener('click', () => this.approvePremiseSummary());
    },

    // ── Generating state ───────────────────────────────────────────────────────

    setGenerating(on) {
        this.isGenerating = on;
        const allBtns = [
            this.btnPlot, this.btnRegen, this.btnAccPlot, this.btnEditAccPlot,
            this.btnRunAntag, this.btnRunRev, this.btnRerunLoop, this.btnAccRev,
            this.btnRunCont, this.btnApproveA, this.btnPassBack, this.btnSumPremise,
        ];
        allBtns.forEach(b => { if (b) b.disabled = on; });
        document.body.style.cursor = on ? 'wait' : 'default';
        if (!on) window.dispatchEvent(new Event('llm:complete'));
    },

    getProjectTitle() {
        return document.getElementById('project-title').value || 'unknown';
    },

    getContextElements() {
        return window.ContextPanel.exportElementsForLLM();
    },

    getPlantedClues() {
        return window.DumpPanel ? window.DumpPanel.plantedClues : [];
    },

    // ── Plotter ────────────────────────────────────────────────────────────────

    async runPlotter() {
        if (this.isGenerating) return;
        this.setGenerating(true);
        this.plotterOutput = "";
        try {
            const res = await fetch('/api/llm/plotter', {
                method: 'POST', headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    context_elements: this.getContextElements(),
                    system_prompt_override: null,
                    project_title: this.getProjectTitle(),
                })
            });
            const data = await res.json();
            this.plotterOutput = data.content;
            this.txtPlotOut.value = data.content;
            this.txtPlotOut.readOnly = true;
            this.btnAccPlot.disabled = false;
            this.btnEditAccPlot.disabled = false;
            this.btnRegen.disabled = false;
            // Reset downstream sections when re-plotting
            this._hideFrom('antagonist');
        } catch (e) {
            console.error(e);
            this.txtPlotOut.value = "Error generating plotter output.";
        } finally {
            this.setGenerating(false);
        }
    },

    acceptPlotterOutput() {
        const content = this.txtPlotOut.value;
        this.plotterOutput = content;
        this.txtPlotOut.readOnly = true;
        this.txtPlotOut.classList.add('accepted-output');
        this.btnAccPlot.disabled = true;
        this.btnEditAccPlot.disabled = true;
        window.ContextPanel.addElement('Plotter Output v1', content, 'llm', 'plot_overview', 'A');
        this._show('btn-run-antagonist');
    },

    editPlotterOutput() {
        this.txtPlotOut.readOnly = false;
        this.txtPlotOut.focus();
        this.btnAccPlot.innerText = "Confirm Accept";
        this.btnEditAccPlot.disabled = true;
    },

    editRevisionOutput() {
        this.txtRevOut.readOnly = false;
        this.txtRevOut.focus();
        this.btnAccRev.innerText = "Confirm Accept";
        this.btnEditRev.disabled = true;
    },

    // ── Antagonist ─────────────────────────────────────────────────────────────

    async runAntagonist() {
        if (this.isGenerating) return;
        this.setGenerating(true);
        this.antagonistOutput = "";
        this._show('antagonist-output');
        try {
            const res = await fetch('/api/llm/antagonist', {
                method: 'POST', headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    context_elements: this.getContextElements(),
                    plotter_output: this.plotterOutput,
                    system_prompt_override: null,
                    project_title: this.getProjectTitle(),
                })
            });
            const data = await res.json();
            this.antagonistOutput = data.content;
            this.txtAntagOut.value = data.content;
            this._show('btn-run-revision');
            this.btnRunRev.disabled = false;
        } catch (e) {
            console.error(e);
            this.txtAntagOut.value = "Error generating antagonist output.";
        } finally {
            this.setGenerating(false);
        }
    },

    // ── Plotter Revision ───────────────────────────────────────────────────────

    async runRevision(extraCritique = "") {
        if (this.isGenerating) return;
        this.setGenerating(true);
        this.revisionOutput = "";
        this._show('revision-output');
        const combinedCritique = extraCritique
            ? `${this.antagonistOutput}\n\n--- Continuity issues from previous pass ---\n${extraCritique}`
            : this.antagonistOutput;
        try {
            const res = await fetch('/api/llm/plotter-revision', {
                method: 'POST', headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    context_elements: this.getContextElements(),
                    plotter_output: this.plotterOutput,
                    antagonist_critique: combinedCritique,
                    system_prompt_override: null,
                    project_title: this.getProjectTitle(),
                })
            });
            const data = await res.json();
            this.revisionOutput = data.content;
            this.txtRevOut.value = data.content;
            this.currentRound++;
            this._show('btn-rerun-loop');
            this._show('btn-accept-revision');
            this._show('btn-edit-revision');
            this._show('btn-run-continuity');
            this.btnRerunLoop.disabled = false;
            this.btnAccRev.disabled = false;
            this.btnEditRev.disabled = false;
            this.btnRunCont.disabled = true;
        } catch (e) {
            console.error(e);
            this.txtRevOut.value = "Error generating revision output.";
        } finally {
            this.setGenerating(false);
        }
    },

    acceptRevision() {
        const content = this.txtRevOut.value;
        this.revisionOutput = content;
        this.txtRevOut.readOnly = true;
        this.txtRevOut.classList.add('accepted-output');
        this.btnAccRev.disabled = true;
        this.btnAccRev.innerText = "Accept Revision as Final";
        this._hide('btn-edit-revision');
        window.ContextPanel.addElement(
            `Plotter Output v${this.currentRound}`, content, 'llm', 'plot_overview', 'A'
        );
        this.btnRunCont.disabled = false;
    },

    // ── Continuity Agent ──────────────────────────────────────────────────────

    async runContinuity() {
        if (this.isGenerating) return;
        this.setGenerating(true);
        this.continuityData = null;
        this._show('continuity-output');
        this.txtContOut.value = "Running continuity check…";

        const prevIssues = this.continuityData?.issues?.join('\n') || "";

        try {
            const res = await fetch('/api/llm/continuity', {
                method: 'POST', headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    context_elements: this.getContextElements(),
                    plotter_revision_output: this.revisionOutput || this.plotterOutput,
                    planted_clues: this.getPlantedClues(),
                    continuity_issues: prevIssues,
                    project_title: this.getProjectTitle(),
                })
            });
            const data = await res.json();
            this.continuityData = data;

            if (window.DumpPanel) window.DumpPanel.applyClueUpdates(data.clue_updates);

            this.txtContOut.value = this._formatContinuityReport(data);
            this._show('phase-a-verdict');
            this.btnApproveA.disabled = false;
            this.btnPassBack.disabled = data.verdict === 'approve'; // grey out if already approved
        } catch (e) {
            console.error(e);
            this.txtContOut.value = "Error running continuity check — check console.";
        } finally {
            this.setGenerating(false);
        }
    },

    _formatContinuityReport(data) {
        return window.formatContinuityReport(data);
    },

    approvePlanToPhaseB() {
        // Persist final plan to context if not already there
        const finalPlan = this.revisionOutput || this.plotterOutput;
        if (finalPlan) {
            window.ContextPanel.addElement('Approved Plot Plan', finalPlan, 'llm', 'approved_plan', 'A');
        }
        this._show('premise-summary-controls');
        this.btnApproveA.disabled = true;
        this.txtContOut.classList.add('accepted-output');
        alert('Plan approved. Run "Summarise Premise" then move to Phase B.');
    },

    passBackToPlotter() {
        if (!this.continuityData?.issues?.length) return;
        const issueText = this.continuityData.issues.join('\n');
        this._hide('phase-a-verdict');
        this._hide('continuity-output');
        // Re-run revision with continuity issues appended as extra critique
        this.runRevision(issueText);
    },

    // ── Premise Summariser ────────────────────────────────────────────────────

    async runSummarisePremise() {
        if (this.isGenerating) return;
        this.setGenerating(true);
        this.lblSumStatus.innerText = 'Summarising…';
        this._show('premise-summary-output');
        try {
            const premise = document.getElementById('slot-premise-text')?.value || '';
            const res = await fetch('/api/llm/summarise-premise', {
                method: 'POST', headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    context_elements: this.getContextElements(),
                    premise,
                    project_title: this.getProjectTitle(),
                })
            });
            const data = await res.json();
            this.premiseSummary = data.content;
            this.txtSumOut.value = data.content;
            this.lblSumStatus.innerText = 'Done ✓ — approve below to add to context';
            this._show('premise-summary-action-row');
            this.btnEditPremSum.disabled = false;
            this.btnApprovePremSum.disabled = false;
        } catch (e) {
            console.error(e);
            this.lblSumStatus.innerText = 'Error — check console';
        } finally {
            this.setGenerating(false);
        }
    },

    editPremiseSummary() {
        this.txtSumOut.readOnly = false;
        this.txtSumOut.focus();
        this.btnEditPremSum.disabled = true;
    },

    approvePremiseSummary() {
        const content = this.txtSumOut.value;
        this.premiseSummary = content;
        this.txtSumOut.readOnly = true;
        this.btnApprovePremSum.disabled = true;
        this.btnEditPremSum.disabled = true;
        this._hide('premise-summary-action-row');
        window.ContextPanel.addElement('Premise Summary', content, 'llm', 'premise_summary', 'A');
    },

    // ── Snapshot support ──────────────────────────────────────────────────────

    exportForSnapshot() {
        return {
            plotter_output:          this.plotterOutput,
            antagonist_output:       this.antagonistOutput,
            plotter_revision_output: this.revisionOutput,
            continuity_output:       this.continuityData ? JSON.stringify(this.continuityData) : '',
            premise_summary:         this.premiseSummary,
        };
    },

    loadFromSnapshot(project) {
        if (project.plotter_output) {
            this.plotterOutput = project.plotter_output;
            this.txtPlotOut.value = project.plotter_output;
            this.txtPlotOut.classList.add('accepted-output');
            this.txtPlotOut.readOnly = true;
            this.btnRegen.disabled = false;
            this._show('btn-run-antagonist');
        }
        if (project.antagonist_output) {
            this.antagonistOutput = project.antagonist_output;
            this.txtAntagOut.value = project.antagonist_output;
            this._show('antagonist-output');
            this._show('btn-run-revision');
        }
        if (project.plotter_revision_output) {
            this.revisionOutput = project.plotter_revision_output;
            this.txtRevOut.value = project.plotter_revision_output;
            this.txtRevOut.classList.add('accepted-output');
            this.txtRevOut.readOnly = true;
            this._show('revision-output');
            this._show('btn-rerun-loop');
            this._show('btn-run-continuity');
        }
        if (project.continuity_output) {
            try {
                this.continuityData = JSON.parse(project.continuity_output);
                this.txtContOut.value = this._formatContinuityReport(this.continuityData);
                this._show('continuity-output');
                this._show('phase-a-verdict');
            } catch (_) { /* malformed — skip */ }
        }
        if (project.premise_summary) {
            this.premiseSummary = project.premise_summary;
            this.txtSumOut.value = project.premise_summary;
            this._show('premise-summary-controls');
            this._show('premise-summary-output');
        }
    },

    // ── Helpers ───────────────────────────────────────────────────────────────

    _show(id) {
        const el = document.getElementById(id);
        if (el) el.style.display = '';
    },

    _hide(id) {
        const el = document.getElementById(id);
        if (el) el.style.display = 'none';
    },

    _hideFrom(stage) {
        // Reset downstream UI when re-plotting
        const ids = {
            antagonist: [
                'antagonist-output', 'btn-run-revision', 'btn-rerun-loop',
                'btn-accept-revision', 'btn-edit-revision', 'revision-output', 'btn-run-continuity',
                'continuity-output', 'phase-a-verdict', 'premise-summary-controls',
                'premise-summary-output', 'premise-summary-action-row',
            ]
        };
        (ids[stage] || []).forEach(id => this._hide(id));
        this.antagonistOutput = "";
        this.revisionOutput = "";
        this.continuityData = null;
        this.premiseSummary = "";
        this.currentRound = 1;
    },
};
