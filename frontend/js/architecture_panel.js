window.ArchitecturePanel = {

    async init() {
        const container = document.getElementById('architecture-container');
        if (!container) return;
        container.innerHTML = '<p class="arch-loading">Loading…</p>';
        try {
            const res = await fetch('/api/architecture');
            if (!res.ok) throw new Error(`HTTP ${res.status}`);
            const data = await res.json();
            container.innerHTML = '';
            container.appendChild(this._renderMeta(data.meta));
            container.appendChild(this._renderCrudMatrix(data.crud_matrix));
            container.appendChild(this._renderModelRouting(data.model_routing));
        } catch (e) {
            container.innerHTML = `<p class="arch-error">Failed to load architecture data: ${e.message}</p>`;
        }
    },

    _renderMeta(meta) {
        const div = document.createElement('div');
        div.className = 'arch-meta';
        div.innerHTML = `
            <div class="arch-meta-row">
                <a href="${meta.github}" target="_blank" rel="noopener" class="arch-github-link">
                    ⎔ ${meta.github}
                </a>
                <span class="arch-updated">Last updated: ${meta.last_updated}</span>
            </div>
            <details class="arch-notation">
                <summary>Notation key</summary>
                <dl class="notation-grid">
                    ${Object.entries(meta.notation).map(([sym, desc]) =>
                        `<dt><code>${sym}</code></dt><dd>${desc}</dd>`
                    ).join('')}
                </dl>
            </details>
        `;
        return div;
    },

    _renderCrudMatrix(matrix) {
        const section = document.createElement('section');
        section.className = 'arch-section';

        const h2 = document.createElement('h2');
        h2.textContent = 'CRUD Matrix';
        h2.className = 'arch-h2';
        section.appendChild(h2);

        const p = document.createElement('p');
        p.className = 'arch-note';
        p.textContent =
            'Rows are schema fields at field-level granularity. ' +
            'Columns are agents and human inputs in pipeline order. ' +
            'Human columns (grey headers) represent manual UI actions — ' +
            'no LLM call is made. Agent columns show the model and context ' +
            'window in the two annotation rows above the pipeline labels.';
        section.appendChild(p);

        const cols = matrix.columns;

        // Build table
        const wrap = document.createElement('div');
        wrap.className = 'arch-table-wrap';
        wrap.id = 'crud-table-wrap';
        const table = document.createElement('table');
        table.className = 'arch-table crud-table';

        // ── Header rows ──────────────────────────────────────────────────────
        const thead = document.createElement('thead');

        // Row 1: Model
        const rowModel = document.createElement('tr');
        rowModel.innerHTML = `<th class="field-col" rowspan="3">Field</th>
                              <th class="desc-col" rowspan="3">Description</th>`;
        cols.forEach(col => {
            const th = document.createElement('th');
            th.className = col.model === '—' ? 'col-human' : 'col-agent';
            th.textContent = col.model === '—' ? '—' : col.model;
            th.title = 'Model';
            rowModel.appendChild(th);
        });
        thead.appendChild(rowModel);

        // Row 2: num_ctx
        const rowCtx = document.createElement('tr');
        cols.forEach(col => {
            const th = document.createElement('th');
            th.className = col.model === '—' ? 'col-human' : 'col-agent';
            th.textContent = col.num_ctx;
            th.title = 'Context window (tokens) or API';
            rowCtx.appendChild(th);
        });
        thead.appendChild(rowCtx);

        // Row 3: Column labels
        const rowLabel = document.createElement('tr');
        cols.forEach(col => {
            const th = document.createElement('th');
            th.className = col.model === '—' ? 'col-human col-label' : 'col-agent col-label';
            th.innerHTML = col.label.replace(/\n/g, '<br>');
            rowLabel.appendChild(th);
        });
        thead.appendChild(rowLabel);

        table.appendChild(thead);

        // ── Body rows ────────────────────────────────────────────────────────
        const tbody = document.createElement('tbody');
        const colIds = cols.map(c => c.id);

        matrix.groups.forEach(group => {
            // Group header row
            const groupRow = document.createElement('tr');
            groupRow.className = 'group-header-row';
            const groupTh = document.createElement('td');
            groupTh.colSpan = 2 + cols.length;
            groupTh.textContent = group.label;
            groupRow.appendChild(groupTh);
            tbody.appendChild(groupRow);

            group.rows.forEach(row => {
                const tr = document.createElement('tr');

                // Field name
                const tdField = document.createElement('td');
                tdField.className = 'field-name';
                tdField.textContent = row.field;
                if (row.list_field) {
                    const badge = document.createElement('span');
                    badge.className = 'list-badge';
                    badge.title = 'List field — D (delete entry) is applicable';
                    badge.textContent = 'list';
                    tdField.appendChild(badge);
                }
                tr.appendChild(tdField);

                // Description
                const tdDesc = document.createElement('td');
                tdDesc.className = 'field-desc';
                tdDesc.textContent = row.desc || '';
                tr.appendChild(tdDesc);

                // CRUD cells
                colIds.forEach(id => {
                    const td = document.createElement('td');
                    td.className = 'crud-cell';
                    const val = (row.cells || {})[id] || '';
                    if (val) {
                        td.innerHTML = this._renderCrudValue(val);
                        td.title = this._crudTitle(val);
                    }
                    tr.appendChild(td);
                });

                tbody.appendChild(tr);
            });
        });

        table.appendChild(tbody);
        wrap.appendChild(table);
        section.appendChild(wrap);
        this._addStickyScrollbar(wrap);
        return section;
    },

    _renderCrudValue(val) {
        return val.split(',').map(v => {
            v = v.trim();
            const cls = { C: 'op-c', R: 'op-r', U: 'op-u', D: 'op-d' }[v] || 'op-other';
            return `<span class="crud-op ${cls}">${v}</span>`;
        }).join('');
    },

    _crudTitle(val) {
        const map = {
            C: 'Create — field first written/populated',
            R: 'Read — consumed as input',
            U: 'Update — overwritten with new content',
            D: 'Delete entry — list fields only',
        };
        return val.split(',').map(v => map[v.trim()] || v.trim()).join(' · ');
    },

    _renderModelRouting(routing) {
        const section = document.createElement('section');
        section.className = 'arch-section';

        const h2 = document.createElement('h2');
        h2.textContent = 'Model Routing';
        h2.className = 'arch-h2';
        section.appendChild(h2);

        const p = document.createElement('p');
        p.className = 'arch-note';
        p.textContent = routing.note;
        section.appendChild(p);

        const wrap = document.createElement('div');
        wrap.className = 'arch-table-wrap';
        const table = document.createElement('table');
        table.className = 'arch-table routing-table';

        const cols = routing.columns;

        // Header
        const thead = document.createElement('thead');
        const headerRow = document.createElement('tr');
        headerRow.innerHTML = '<th class="field-col">Agent</th>';
        cols.forEach(col => {
            const th = document.createElement('th');
            th.className = 'col-agent col-label';
            th.innerHTML = col.label.replace(/\n/g, '<br>');
            headerRow.appendChild(th);
        });
        thead.appendChild(headerRow);
        table.appendChild(thead);

        // Body
        const tbody = document.createElement('tbody');
        routing.rows.forEach(row => {
            const tr = document.createElement('tr');
            const tdAgent = document.createElement('td');
            tdAgent.className = 'field-name';
            tdAgent.textContent = row.agent;
            tr.appendChild(tdAgent);

            cols.forEach(col => {
                const td = document.createElement('td');
                const val = row[col.id] || '—';
                if (val === '—') {
                    td.className = 'routing-cell routing-empty';
                    td.textContent = '—';
                } else if (val.includes('abliterated') || val.includes('qwen')) {
                    td.className = 'routing-cell routing-local';
                    td.textContent = val;
                } else {
                    td.className = 'routing-cell routing-api';
                    td.textContent = val;
                }
                tr.appendChild(td);
            });

            tbody.appendChild(tr);
        });

        table.appendChild(tbody);
        wrap.appendChild(table);
        section.appendChild(wrap);
        this._addStickyScrollbar(wrap);
        return section;
    },

    _addStickyScrollbar(wrap) {
        const mirror = document.createElement('div');
        mirror.className = 'sticky-scrollbar';
        const inner = document.createElement('div');
        mirror.appendChild(inner);

        // Once the table is in the DOM, match the inner div width to the table's scroll width
        const syncWidth = () => { inner.style.width = wrap.scrollWidth + 'px'; };
        requestAnimationFrame(() => { syncWidth(); });

        let mirrorScrolling = false;
        let wrapScrolling   = false;

        mirror.addEventListener('scroll', () => {
            if (wrapScrolling) return;
            mirrorScrolling = true;
            wrap.scrollLeft = mirror.scrollLeft;
            mirrorScrolling = false;
        });
        wrap.addEventListener('scroll', () => {
            if (mirrorScrolling) return;
            wrapScrolling = true;
            mirror.scrollLeft = wrap.scrollLeft;
            wrapScrolling = false;
        });

        // Keep width in sync if the table ever changes size
        new ResizeObserver(syncWidth).observe(wrap);

        wrap.parentNode.insertBefore(mirror, wrap.nextSibling);
    }
};
