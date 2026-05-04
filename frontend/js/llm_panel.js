window.LLMPanel = {
    plotterOutput: "",
    antagonistOutput: "",
    revisionOutput: "",
    currentRound: 1,
    isGenerating: false,

    init() {
        this.btnPlot = document.getElementById('btn-generate-plot');
        this.btnRegen = document.getElementById('btn-regenerate');
        this.btnAccPlot = document.getElementById('btn-accept-plotter');
        this.btnEditAccPlot = document.getElementById('btn-edit-accept-plotter');
        
        this.btnRunAntag = document.getElementById('btn-run-antagonist');
        this.btnRunRev = document.getElementById('btn-run-revision');
        this.btnRerunLoop = document.getElementById('btn-rerun-loop');
        this.btnAccRev = document.getElementById('btn-accept-revision');

        this.txtPlotOut = document.getElementById('plotter-output');
        this.txtAntagOut = document.getElementById('antagonist-output');
        this.txtRevOut = document.getElementById('revision-output');

        this.btnPlot.addEventListener('click', () => this.runPlotter());
        this.btnRegen.addEventListener('click', () => this.runPlotter());
        this.btnAccPlot.addEventListener('click', () => this.acceptOutput('plotter'));
        this.btnEditAccPlot.addEventListener('click', () => {
            this.txtPlotOut.readOnly = false;
            this.txtPlotOut.focus();
            this.btnAccPlot.innerText = "Confirm Accept";
            this.btnEditAccPlot.disabled = true;
        });

        this.btnRunAntag.addEventListener('click', () => this.runAntagonist());
        this.btnRunRev.addEventListener('click', () => this.runRevision());
        this.btnRerunLoop.addEventListener('click', () => this.runAntagonist());
        this.btnAccRev.addEventListener('click', () => this.acceptOutput('revision'));
    },

    showGeneratingState(isGen) {
        this.isGenerating = isGen;
        const btns = [this.btnPlot, this.btnRegen, this.btnAccPlot, this.btnEditAccPlot,
                      this.btnRunAntag, this.btnRunRev, this.btnRerunLoop, this.btnAccRev];
        btns.forEach(b => {
            if (b && !b.hasAttribute('data-always-disabled')) {
                b.disabled = isGen;
            }
        });
        
        if (isGen) {
            document.body.style.cursor = 'wait';
        } else {
            document.body.style.cursor = 'default';
            // Need to emit event
            window.dispatchEvent(new Event('llm:complete'));
        }
    },

    async runPlotter() {
        if (this.isGenerating) return;
        this.showGeneratingState(true);
        this.plotterOutput = "";
        
        const context_elements = window.ContextPanel.exportElementsForLLM();
        const sys_override = document.getElementById('system-prompt').value;
        
        try {
            const res = await fetch('/api/llm/plotter', {
                method: 'POST',
                headers: {'Content-Type': 'application/json'},
                body: JSON.stringify({
                    context_elements: context_elements,
                    system_prompt_override: sys_override || null
                })
            });
            const data = await res.json();
            this.plotterOutput = data.content;
            this.txtPlotOut.value = data.content;
            
            this.btnAccPlot.disabled = false;
            this.btnEditAccPlot.disabled = false;
            this.btnRegen.disabled = false;
            this.txtPlotOut.readOnly = true;
            this.btnAccPlot.innerText = "Accept Output";
        } catch (e) {
            console.error(e);
            this.txtPlotOut.value = "Error generating plotter output.";
        } finally {
            this.showGeneratingState(false);
            this.btnAccPlot.disabled = false;
            this.btnEditAccPlot.disabled = false;
            this.btnRegen.disabled = false;
        }
    },

    async runAntagonist() {
        if (this.isGenerating) return;
        this.showGeneratingState(true);
        this.antagonistOutput = "";
        
        this.txtAntagOut.style.display = 'block';
        const context_elements = window.ContextPanel.exportElementsForLLM();
        const sys_override = document.getElementById('system-prompt').value;
        
        try {
            const res = await fetch('/api/llm/antagonist', {
                method: 'POST',
                headers: {'Content-Type': 'application/json'},
                body: JSON.stringify({
                    context_elements: context_elements,
                    plotter_output: this.plotterOutput,
                    system_prompt_override: sys_override || null
                })
            });
            const data = await res.json();
            this.antagonistOutput = data.content;
            this.txtAntagOut.value = data.content;
            
            this.btnRunRev.style.display = 'inline-block';
            this.btnRunRev.disabled = false;
        } catch (e) {
            console.error(e);
            this.txtAntagOut.value = "Error generating antagonist output.";
        } finally {
            this.showGeneratingState(false);
        }
    },

    async runRevision() {
        if (this.isGenerating) return;
        this.showGeneratingState(true);
        this.revisionOutput = "";
        
        this.txtRevOut.style.display = 'block';
        const context_elements = window.ContextPanel.exportElementsForLLM();
        const sys_override = document.getElementById('system-prompt').value;
        
        try {
            const res = await fetch('/api/llm/plotter-revision', {
                method: 'POST',
                headers: {'Content-Type': 'application/json'},
                body: JSON.stringify({
                    context_elements: context_elements,
                    plotter_output: this.plotterOutput,
                    antagonist_critique: this.antagonistOutput,
                    system_prompt_override: sys_override || null
                })
            });
            const data = await res.json();
            this.revisionOutput = data.content;
            this.txtRevOut.value = data.content;
            
            this.currentRound++;
            this.btnRerunLoop.style.display = 'inline-block';
            this.btnAccRev.style.display = 'inline-block';
            this.btnRerunLoop.disabled = false;
            this.btnAccRev.disabled = false;
        } catch (e) {
            console.error(e);
            this.txtRevOut.value = "Error generating revision output.";
        } finally {
            this.showGeneratingState(false);
        }
    },

    acceptOutput(outputType) {
        let label = "";
        let content = "";
        if (outputType === 'plotter') {
            label = "Plotter Output v1";
            content = this.txtPlotOut.value; // Read from textarea in case it was edited
            this.plotterOutput = content;
            this.btnRunAntag.style.display = 'inline-block';
            this.btnAccPlot.disabled = true;
            this.btnEditAccPlot.disabled = true;
            this.txtPlotOut.readOnly = true;
            this.txtPlotOut.classList.add('accepted-output');
        } else if (outputType === 'revision') {
            label = `Plotter Output v${this.currentRound}`;
            content = this.txtRevOut.value;
            this.revisionOutput = content;
            this.btnAccRev.disabled = true;
            this.txtRevOut.readOnly = true;
            this.txtRevOut.classList.add('accepted-output');
        }
        
        if (content) {
            window.ContextPanel.addElement(label, content, "llm", "plot_overview");
        }
    }
};
