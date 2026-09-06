// Notification chime when the agents finish and it's the human's turn.
//
// Instead of hooking every agent, wrap fetch() and count in-flight LLM POSTs
// (/api/llm/*, /api/research/*). When the count returns to zero and stays there
// for DEBOUNCE_MS, the pipeline is idle → chime once. Sequential calls inside a
// chapter run (or a whole bulk run) have sub-millisecond gaps, so one chime
// fires at the end of the run, not after every pass.
window.Notify = {
    KEY: 'bb8-notify-sound',
    DEBOUNCE_MS: 1500,
    enabled: false,
    inflight: 0,
    timer: null,
    ctx: null,
    _origTitle: null,

    init() {
        try { this.enabled = localStorage.getItem(this.KEY) === '1'; } catch (_) { /* storage blocked */ }
        this.renderButton();
        this.wrapFetch();
        document.addEventListener('visibilitychange', () => { if (!document.hidden) this.clearTitle(); });
    },

    // Only generation calls count — not health/config/usage polls, token counts, or the provider switch.
    isLLMRequest(input, init) {
        const url = typeof input === 'string' ? input : (input && input.url) || '';
        const method = ((init && init.method) || (input && input.method) || 'GET').toUpperCase();
        if (method !== 'POST') return false;
        const path = url.replace(/^https?:\/\/[^/]+/, '');
        return /^\/api\/(llm|research)\//.test(path) && !/\/provider$/.test(path);
    },

    wrapFetch() {
        if (window.__bb8FetchWrapped) return;
        window.__bb8FetchWrapped = true;
        const orig = window.fetch.bind(window);
        const self = this;
        window.fetch = function (input, init) {
            const track = self.isLLMRequest(input, init);
            if (track) self.begin();
            const p = orig(input, init);
            if (track) p.then(() => self.end(), () => self.end());
            return p;
        };
    },

    begin() {
        this.inflight++;
        clearTimeout(this.timer);
        this.timer = null;
    },

    end() {
        this.inflight = Math.max(0, this.inflight - 1);
        if (this.inflight === 0) {
            clearTimeout(this.timer);
            this.timer = setTimeout(() => this.ready(), this.DEBOUNCE_MS);
        }
    },

    ready() {
        this.timer = null;
        if (!this.enabled) return;
        this.chime();
        if (document.hidden) {
            if (!this._origTitle) this._origTitle = document.title;
            document.title = '🔔 Ready — ' + this._origTitle;
        }
    },

    clearTitle() {
        if (this._origTitle) {
            document.title = this._origTitle;
            this._origTitle = null;
        }
    },

    audio() {
        if (!this.ctx) {
            const AC = window.AudioContext || window.webkitAudioContext;
            if (!AC) return null;
            this.ctx = new AC();
        }
        if (this.ctx.state === 'suspended') this.ctx.resume();
        return this.ctx;
    },

    // Two rising sine tones, ~0.6 s total. No asset files needed.
    chime() {
        const ctx = this.audio();
        if (!ctx) return;
        const t0 = ctx.currentTime;
        [[659.25, 0], [880, 0.16]].forEach(([freq, dt]) => {
            const osc = ctx.createOscillator();
            const gain = ctx.createGain();
            osc.type = 'sine';
            osc.frequency.value = freq;
            gain.gain.setValueAtTime(0.0001, t0 + dt);
            gain.gain.exponentialRampToValueAtTime(0.25, t0 + dt + 0.02);
            gain.gain.exponentialRampToValueAtTime(0.0001, t0 + dt + 0.45);
            osc.connect(gain).connect(ctx.destination);
            osc.start(t0 + dt);
            osc.stop(t0 + dt + 0.5);
        });
    },

    toggle(btn) {
        this.enabled = !this.enabled;
        try { localStorage.setItem(this.KEY, this.enabled ? '1' : '0'); } catch (_) { /* storage blocked */ }
        this.renderButton(btn);
        if (this.enabled) this.chime();   // the click is the user gesture that unlocks audio
    },

    renderButton(btn) {
        const b = btn || document.getElementById('btn-notify-toggle');
        if (!b) return;
        b.textContent = this.enabled ? '🔔' : '🔕';
        b.title = this.enabled
            ? "Sound on — chimes when the agents finish and it's your turn"
            : 'Sound off — click to chime when the agents finish';
        b.classList.toggle('active', this.enabled);
    },
};
