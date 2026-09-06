window.ResearchPanel = {
    tavilyConfigured: false,

    async init() {
        // Check whether Tavily key is present
        try {
            const res = await fetch('/api/research/status');
            const data = await res.json();
            this.tavilyConfigured = data.tavily_configured;
        } catch (_) {
            this.tavilyConfigured = false;
        }

        this._updateStatus();

        document.getElementById('btn-research-go').addEventListener('click', () => this.run());
        document.getElementById('btn-research-approve-raw').addEventListener('click', () => this.approveRaw());
        document.getElementById('btn-research-approve-summary').addEventListener('click', () => this.approveSummary());
        document.getElementById('research-mode').addEventListener('change', () => this._updatePlaceholder());
        document.getElementById('btn-research-summarise-paste').addEventListener('click', () => this.summarisePasted());

        this._updatePlaceholder();
    },

    _updateStatus() {
        const dot = document.getElementById('research-status-dot');
        const lbl = document.getElementById('research-status-label');
        if (!dot || !lbl) return;
        if (this.tavilyConfigured) {
            dot.className = 'dot green';
            lbl.textContent = 'Tavily ready';
        } else {
            dot.className = 'dot red';
            lbl.textContent = 'No TAVILY_API_KEY';
        }
    },

    _updatePlaceholder() {
        const mode = document.getElementById('research-mode').value;
        const input = document.getElementById('research-input');
        input.placeholder = mode === 'url'
            ? 'https://en.wikipedia.org/wiki/...'
            : 'Victorian London street life';
    },

    async run() {
        if (!this.tavilyConfigured) {
            alert('Add TAVILY_API_KEY to .env and restart the server.');
            return;
        }
        const mode     = document.getElementById('research-mode').value;
        const query    = document.getElementById('research-input').value.trim();
        if (!query) return;

        const rawOut  = document.getElementById('research-raw-output');
        const sumOut  = document.getElementById('research-summary-output');
        const btn     = document.getElementById('btn-research-go');
        const sumRow  = document.getElementById('research-summary-row');

        btn.disabled = true;
        btn.textContent = 'Fetching…';
        rawOut.value = '';
        sumOut.value = '';
        sumRow.style.display = 'none';
        document.getElementById('research-approve-row').style.display = 'none';

        const title = document.getElementById('project-title')?.value || 'unknown';
        let rawText, sourceLabel;   // both branches assign before use

        try {
            if (mode === 'url') {
                const res  = await fetch('/api/research/extract', {
                    method: 'POST', headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ url: query, project_title: title }),
                });
                const data = await res.json();
                if (!res.ok) throw new Error(data.detail || `HTTP ${res.status}`);
                rawText = [
                    data.title ? `Title: ${data.title}` : '',
                    `URL: ${data.url}`,
                    '',
                    data.content,
                ].filter(Boolean).join('\n');
                sourceLabel = `URL: ${data.url}`;
            } else {
                const res  = await fetch('/api/research/search', {
                    method: 'POST', headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ query, max_results: 5, project_title: title }),
                });
                const data = await res.json();
                if (!res.ok) throw new Error(data.detail || `HTTP ${res.status}`);
                rawText = data.raw_text;
                sourceLabel = `Search: ${query}`;
            }

            rawOut.value = rawText;
            document.getElementById('research-approve-row').style.display = '';

            // Now summarise
            btn.textContent = 'Summarising…';
            sumRow.style.display = '';
            sumOut.value = 'Summarising…';

            const sumRes = await fetch('/api/research/summarise', {
                method: 'POST', headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    raw_content: rawText,
                    source_label: sourceLabel,
                    context_elements: window.ContextPanel.exportElementsForLLM(),
                    project_title: title,
                }),
            });
            const sumData = await sumRes.json();
            sumOut.value = sumData.content;

            // Store for approve buttons
            this._pendingRaw     = rawText;
            this._pendingRawLabel = sourceLabel + ' (raw)';
            this._pendingSummary  = sumData.content;
            this._pendingSumLabel = sourceLabel + ' (summary)';

        } catch (e) {
            console.error(e);
            rawOut.value = '';
            sumRow.style.display = 'none';
            // Show paste fallback — let user supply the content manually
            document.getElementById('research-paste-fallback').style.display = '';
            document.getElementById('research-paste-input').value = '';
            document.getElementById('research-paste-input').focus();
            // Store the URL as the source label for when they paste
            this._pendingPasteLabel = `URL: ${query} (pasted)`;
        } finally {
            btn.disabled = false;
            btn.textContent = 'Go';
        }
    },

    approveRaw() {
        if (!this._pendingRaw) return;
        window.ContextPanel.addElement(
            this._pendingRawLabel, this._pendingRaw, 'tavily', 'research', 'A'
        );
        document.getElementById('research-raw-output').classList.add('accepted-output');
        document.getElementById('btn-research-approve-raw').disabled = true;
    },

    approveSummary() {
        if (!this._pendingSummary) return;
        window.ContextPanel.addElement(
            this._pendingSumLabel, this._pendingSummary, 'tavily', 'research', 'A'
        );
        document.getElementById('research-summary-output').classList.add('accepted-output');
        document.getElementById('btn-research-approve-summary').disabled = true;
    },

    async summarisePasted() {
        const pasteInput = document.getElementById('research-paste-input');
        const rawText = pasteInput.value.trim();
        if (!rawText) return;

        const btn    = document.getElementById('btn-research-summarise-paste');
        const sumRow = document.getElementById('research-summary-row');
        const sumOut = document.getElementById('research-summary-output');
        const title  = document.getElementById('project-title')?.value || 'unknown';
        const sourceLabel = this._pendingPasteLabel || 'Pasted content';

        btn.disabled = true;
        btn.textContent = 'Summarising…';
        sumRow.style.display = '';
        sumOut.value = 'Summarising…';

        try {
            const res = await fetch('/api/research/summarise', {
                method: 'POST', headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    raw_content: rawText,
                    source_label: sourceLabel,
                    context_elements: window.ContextPanel.exportElementsForLLM(),
                    project_title: title,
                }),
            });
            const data = await res.json();
            sumOut.value = data.content;

            this._pendingRaw      = rawText;
            this._pendingRawLabel = sourceLabel + ' (raw)';
            this._pendingSummary  = data.content;
            this._pendingSumLabel = sourceLabel + ' (summary)';

            document.getElementById('research-raw-output').value = rawText;
            document.getElementById('research-approve-row').style.display = '';
            document.getElementById('research-paste-fallback').style.display = 'none';
        } catch (e) {
            console.error(e);
            sumOut.value = 'Error summarising — check console.';
        } finally {
            btn.disabled = false;
            btn.textContent = 'Summarise Pasted Content';
        }
    },
};
