/**
 * Glass Media Card
 * ------------------------------------------------------------------------
 * An iOS/Control-Center-inspired media player card for Home Assistant.
 *
 * Built as a from-scratch replacement for a Crow-style card, but scoped
 * down to one entity (no multi-device switcher) and extended with:
 *   - Independent volume routing (control a receiver, not the source)
 *   - A persistent volume slider + optional mute button (always visible,
 *     not hidden behind an expand tap)
 *   - The entity's own name/area shown as a subtitle (e.g. "Family Room")
 *   - A one-tap remote button that jumps straight to an Apple TV style
 *     remote touchpad (via a `remote.*` entity) - only shown when a
 *     remote_entity is configured, so plain speakers never show it
 *   - A visual (UI) config editor
 *
 * Install:
 *   1. Copy this file to <config>/www/glass-media-card.js
 *   2. Settings > Dashboards > Resources > Add Resource
 *        URL:  /local/glass-media-card.js
 *        Type: JavaScript Module
 *   3. Add the card through the dashboard UI ("Glass Media Card"), or via YAML:
 *
 *   type: custom:glass-media-card
 *   entity: media_player.living_room_apple_tv
 *   volume_entity: media_player.denon_avr        # optional, defaults to `entity`
 *   remote_entity: remote.living_room_apple_tv   # optional, hides remote button if omitted
 *   name: Living Room                            # optional, overrides friendly_name
 *   accent_color: '#0A84FF'                      # optional, iOS blue by default
 *   show_mute_button: true                       # optional, defaults to true
 *
 * Remote commands are sent via remote.send_command. Different remote
 * integrations expose different command names - check
 * Developer Tools > Actions > remote.send_command in your own instance
 * and adjust REMOTE_COMMANDS below if a button doesn't do what you expect.
 */

const CARD_VERSION = '1.1.0';

const SUPPORT_PAUSE = 1;
const SUPPORT_SEEK = 2;
const SUPPORT_VOLUME_SET = 4;
const SUPPORT_VOLUME_MUTE = 8;
const SUPPORT_PREVIOUS_TRACK = 16;
const SUPPORT_NEXT_TRACK = 32;
const SUPPORT_PLAY = 16384;

const REMOTE_COMMANDS = {
  up: 'up',
  down: 'down',
  left: 'left',
  right: 'right',
  select: 'select',
  back: 'menu',
  home: 'home',
};

const ICONS = {
  play: '<svg viewBox="0 0 24 24"><path fill="currentColor" d="M8 5v14l11-7z"/></svg>',
  pause: '<svg viewBox="0 0 24 24"><path fill="currentColor" d="M6 5h4v14H6zm8 0h4v14h-4z"/></svg>',
  prev: '<svg viewBox="0 0 24 24"><path fill="currentColor" d="M6 6h2v12H6zm3.5 6 8.5 6V6z"/></svg>',
  next: '<svg viewBox="0 0 24 24"><path fill="currentColor" d="M16 6h2v12h-2zM6 18l8.5-6L6 6z"/></svg>',
  volume: '<svg viewBox="0 0 24 24"><path fill="currentColor" d="M3 10v4h4l5 5V5L7 10H3zm13.5 2A4.5 4.5 0 0 0 14 7.97v8.05A4.5 4.5 0 0 0 16.5 12z"/></svg>',
  muted: '<svg viewBox="0 0 24 24"><path fill="currentColor" d="M16.5 12A4.5 4.5 0 0 0 14 7.97v2.21l2.45 2.45c.03-.2.05-.42.05-.63zM19 12c0 .94-.2 1.82-.54 2.64l1.51 1.51A8.93 8.93 0 0 0 21 12c0-4.28-2.99-7.86-7-8.77v2.06c2.89.86 5 3.54 5 6.71zM4.27 3 3 4.27 7.73 9H3v6h4l5 5v-6.73l4.25 4.25c-.67.52-1.42.93-2.25 1.18v2.06a8.99 8.99 0 0 0 3.69-1.81L19.73 21 21 19.73l-9-9L4.27 3zM12 4 9.91 6.09 12 8.18V4z"/></svg>',
  chevronDown: '<svg viewBox="0 0 24 24"><path fill="currentColor" d="M7 10l5 5 5-5z"/></svg>',
  chevronUp: '<svg viewBox="0 0 24 24"><path fill="currentColor" d="M7 14l5-5 5 5z"/></svg>',
  remote: '<svg viewBox="0 0 24 24"><path fill="currentColor" d="M8 2a3 3 0 0 0-3 3v14a3 3 0 0 0 3 3h8a3 3 0 0 0 3-3V5a3 3 0 0 0-3-3H8zm4 3.5a1.5 1.5 0 1 1 0 3 1.5 1.5 0 0 1 0-3zM9 12h6v2H9v-2zm0 3.5h6V17H9v-1.5z"/></svg>',
  power: '<svg viewBox="0 0 24 24"><path fill="currentColor" d="M13 3h-2v10h2V3zm4.83 2.17-1.42 1.42A6.92 6.92 0 0 1 19 12a7 7 0 1 1-11.83-5.03L5.76 5.17A9 9 0 1 0 18.24 5.17z"/></svg>',
};

function fmtTime(sec) {
  if (!Number.isFinite(sec) || sec < 0) return '0:00';
  const m = Math.floor(sec / 60);
  const s = Math.floor(sec % 60).toString().padStart(2, '0');
  return `${m}:${s}`;
}

function supports(stateObj, bit) {
  const f = stateObj?.attributes?.supported_features || 0;
  return (f & bit) === bit;
}

class GlassMediaCard extends HTMLElement {
  static getConfigElement() {
    return document.createElement('glass-media-card-editor');
  }

  static getStubConfig(hass) {
    const mp = hass ? Object.keys(hass.states).find((e) => e.startsWith('media_player.')) : '';
    return { entity: mp || '', accent_color: '#0A84FF' };
  }

  setConfig(config) {
    if (!config || !config.entity) {
      throw new Error('Glass Media Card: "entity" is required (a media_player entity).');
    }
    this._config = {
      accent_color: '#0A84FF',
      show_mute_button: true,
      ...config,
    };
    this._built = false;
    this._expanded = false;
    this._panel = 'media';
    if (this._hass) this._build();
  }

  set hass(hass) {
    const prevHass = this._hass;
    this._hass = hass;
    if (!this._built && this._config) this._build();
    if (this._built) this._update(prevHass);
  }

  get hass() {
    return this._hass;
  }

  getCardSize() {
    return this._expanded ? 7 : 3;
  }

  connectedCallback() {
    if (this._built) this._startTickerIfNeeded();
  }

  disconnectedCallback() {
    this._stopTicker();
  }

  // ---------------------------------------------------------------- build

  _build() {
    const accent = this._config.accent_color || '#0A84FF';
    this.style.setProperty('--gm-accent', accent);

    this.attachShadow({ mode: 'open' });
    this.shadowRoot.innerHTML = `
      <style>${STYLE}</style>
      <div class="card" part="card">
        <div class="scrim"></div>

        <!-- Compact row -->
        <div class="compact" tabindex="0" role="button" aria-label="Expand media card">
          <div class="art art-sm"></div>
          <div class="meta">
            <div class="title"></div>
            <div class="subtitle"></div>
          </div>
          <div class="mini-controls">
            <button class="icon-btn prev" aria-label="Previous">${ICONS.prev}</button>
            <button class="icon-btn play primary" aria-label="Play/Pause">${ICONS.play}</button>
            <button class="icon-btn next" aria-label="Next">${ICONS.next}</button>
            <button class="icon-btn remote-mini" aria-label="Open remote control">${ICONS.remote}</button>
          </div>
        </div>

        <!-- Expanded -->
        <div class="expanded">
          <button class="collapse-btn icon-btn" aria-label="Collapse">${ICONS.chevronUp}</button>

          <div class="hero">
            <div class="art art-lg"></div>
            <div class="hero-title"></div>
            <div class="hero-subtitle"></div>
          </div>

          <div class="segmented">
            <button class="seg-btn active" data-panel="media">Now Playing</button>
            <button class="seg-btn remote-tab" data-panel="remote">Remote</button>
          </div>

          <div class="panel panel-media">
            <div class="progress-row">
              <div class="progress-track">
                <div class="progress-fill"></div>
                <div class="progress-thumb"></div>
              </div>
              <div class="time-row">
                <span class="time-elapsed">0:00</span>
                <span class="time-remaining">0:00</span>
              </div>
            </div>

            <div class="transport-row">
              <button class="icon-btn prev lg" aria-label="Previous">${ICONS.prev}</button>
              <button class="icon-btn play lg primary" aria-label="Play/Pause">${ICONS.play}</button>
              <button class="icon-btn next lg" aria-label="Next">${ICONS.next}</button>
            </div>
          </div>

          <div class="panel panel-remote">
            <div class="touchpad">
              <button class="pad-btn pad-up" data-cmd="up" aria-label="Up">${ICONS.chevronUp}</button>
              <button class="pad-btn pad-left" data-cmd="left" aria-label="Left" style="transform:rotate(90deg)">${ICONS.chevronUp}</button>
              <button class="pad-btn pad-select" data-cmd="select" aria-label="Select"></button>
              <button class="pad-btn pad-right" data-cmd="right" aria-label="Right" style="transform:rotate(-90deg)">${ICONS.chevronUp}</button>
              <button class="pad-btn pad-down" data-cmd="down" aria-label="Down" style="transform:rotate(180deg)">${ICONS.chevronUp}</button>
            </div>
            <div class="remote-row">
              <button class="icon-btn remote-back" data-cmd="back" aria-label="Back">Back</button>
              <button class="icon-btn remote-home" data-cmd="home" aria-label="Home">${ICONS.remote}</button>
              <button class="icon-btn remote-power" aria-label="Power">${ICONS.power}</button>
            </div>
          </div>
        </div>

        <!-- Persistent volume row: always visible, independent of compact/expanded state -->
        <div class="volume-row">
          <button class="icon-btn mute-btn" aria-label="Mute">${ICONS.volume}</button>
          <div class="volume-track">
            <div class="volume-fill"></div>
            <div class="volume-thumb"></div>
          </div>
          <span class="volume-label"></span>
        </div>
      </div>
    `;

    const $ = (sel) => this.shadowRoot.querySelector(sel);
    this._el = {
      card: $('.card'),
      compact: $('.compact'),
      artSm: $('.art-sm'),
      title: $('.title'),
      subtitle: $('.subtitle'),
      miniPlay: $('.mini-controls .play'),
      miniPrev: $('.mini-controls .prev'),
      miniNext: $('.mini-controls .next'),
      miniRemote: $('.mini-controls .remote-mini'),
      expanded: $('.expanded'),
      collapseBtn: $('.collapse-btn'),
      artLg: $('.art-lg'),
      heroTitle: $('.hero-title'),
      heroSubtitle: $('.hero-subtitle'),
      segMedia: $('.seg-btn[data-panel="media"]'),
      segRemote: $('.seg-btn[data-panel="remote"]'),
      panelMedia: $('.panel-media'),
      panelRemote: $('.panel-remote'),
      progressTrack: $('.progress-track'),
      progressFill: $('.progress-fill'),
      progressThumb: $('.progress-thumb'),
      timeElapsed: $('.time-elapsed'),
      timeRemaining: $('.time-remaining'),
      play: $('.transport-row .play'),
      prev: $('.transport-row .prev'),
      next: $('.transport-row .next'),
      muteBtn: $('.mute-btn'),
      volumeTrack: $('.volume-track'),
      volumeFill: $('.volume-fill'),
      volumeThumb: $('.volume-thumb'),
      volumeLabel: $('.volume-label'),
      remotePower: $('.remote-power'),
    };

    this._bindEvents();
    this._built = true;
    this._update(null);
  }

  // --------------------------------------------------------------- events

  _bindEvents() {
    const e = this._el;

    e.compact.addEventListener('click', (ev) => {
      if (ev.target.closest('.mini-controls')) return;
      this._setExpanded(true);
    });
    e.compact.addEventListener('keydown', (ev) => {
      if (ev.key === 'Enter' || ev.key === ' ') { ev.preventDefault(); this._setExpanded(true); }
    });
    e.collapseBtn.addEventListener('click', () => this._setExpanded(false));

    e.artLg.addEventListener('click', () => this._openMoreInfo());
    e.artSm.addEventListener('click', (ev) => { ev.stopPropagation(); this._openMoreInfo(); });

    [e.miniPlay, e.play].forEach((b) => b.addEventListener('click', (ev) => {
      ev.stopPropagation();
      this._callService('media_player', 'media_play_pause', this._config.entity);
    }));
    [e.miniPrev, e.prev].forEach((b) => b.addEventListener('click', (ev) => {
      ev.stopPropagation();
      this._callService('media_player', 'media_previous_track', this._config.entity);
    }));
    [e.miniNext, e.next].forEach((b) => b.addEventListener('click', (ev) => {
      ev.stopPropagation();
      this._callService('media_player', 'media_next_track', this._config.entity);
    }));

    e.miniRemote.addEventListener('click', (ev) => {
      ev.stopPropagation();
      this._setExpanded(true);
      this._setPanel('remote');
    });

    e.segMedia.addEventListener('click', () => this._setPanel('media'));
    e.segRemote.addEventListener('click', () => this._setPanel('remote'));

    e.muteBtn.addEventListener('click', () => {
      const volEntity = this._volumeEntityId();
      const st = this._hass.states[volEntity];
      if (!st || !supports(st, SUPPORT_VOLUME_MUTE)) return;
      const muted = !!st.attributes.is_volume_muted;
      this._callService('media_player', 'volume_mute', volEntity, { is_volume_muted: !muted });
    });

    this._bindSlider(e.volumeTrack, e.volumeFill, e.volumeThumb, (ratio) => {
      const volEntity = this._volumeEntityId();
      const st = this._hass.states[volEntity];
      if (st && supports(st, SUPPORT_VOLUME_SET)) {
        this._callService('media_player', 'volume_set', volEntity, { volume_level: ratio });
      }
    });

    this._bindSlider(e.progressTrack, e.progressFill, e.progressThumb, (ratio) => {
      const st = this._hass.states[this._config.entity];
      if (!st || !supports(st, SUPPORT_SEEK)) return;
      const duration = st.attributes.media_duration || 0;
      this._callService('media_player', 'media_seek', this._config.entity, { seek_position: ratio * duration });
    });

    this.shadowRoot.querySelectorAll('[data-cmd]').forEach((btn) => {
      btn.addEventListener('click', () => {
        const remoteEntity = this._config.remote_entity;
        if (!remoteEntity) return;
        const cmd = REMOTE_COMMANDS[btn.dataset.cmd];
        this._callService('remote', 'send_command', remoteEntity, { command: cmd });
      });
    });

    e.remotePower.addEventListener('click', () => {
      const remoteEntity = this._config.remote_entity;
      if (!remoteEntity) return;
      const st = this._hass.states[remoteEntity];
      const isOn = st && st.state === 'on';
      this._callService('remote', isOn ? 'turn_off' : 'turn_on', remoteEntity);
    });
  }

  /** Generic pointer-driven slider: track + fill + thumb, calls onChange(ratio 0..1) while dragging (throttled) and on release. */
  _bindSlider(track, fill, thumb, onChange) {
    let dragging = false;
    let lastSent = 0;

    const ratioFromEvent = (ev) => {
      const rect = track.getBoundingClientRect();
      const x = (ev.touches ? ev.touches[0].clientX : ev.clientX) - rect.left;
      return Math.min(1, Math.max(0, x / rect.width));
    };

    const paint = (ratio) => {
      fill.style.width = `${ratio * 100}%`;
      thumb.style.left = `${ratio * 100}%`;
    };

    const move = (ev) => {
      if (!dragging) return;
      const ratio = ratioFromEvent(ev);
      paint(ratio);
      const now = Date.now();
      if (now - lastSent > 180) {
        lastSent = now;
        onChange(ratio);
      }
      track.dataset.pendingRatio = ratio;
    };

    const end = () => {
      if (!dragging) return;
      dragging = false;
      track.classList.remove('dragging');
      if (track.dataset.pendingRatio !== undefined) {
        onChange(parseFloat(track.dataset.pendingRatio));
        delete track.dataset.pendingRatio;
      }
      window.removeEventListener('pointermove', move);
      window.removeEventListener('pointerup', end);
    };

    track.addEventListener('pointerdown', (ev) => {
      ev.stopPropagation();
      dragging = true;
      track.classList.add('dragging');
      paint(ratioFromEvent(ev));
      window.addEventListener('pointermove', move);
      window.addEventListener('pointerup', end);
    });
  }

  _openMoreInfo() {
    const ev = new Event('hass-more-info', { bubbles: true, composed: true });
    ev.detail = { entityId: this._config.entity };
    this.dispatchEvent(ev);
  }

  _callService(domain, service, entityId, data = {}) {
    if (!this._hass || !entityId) return;
    this._hass.callService(domain, service, { entity_id: entityId, ...data });
  }

  _volumeEntityId() {
    return this._config.volume_entity || this._config.entity;
  }

  _setExpanded(val) {
    this._expanded = val;
    this._el.card.classList.toggle('is-expanded', val);
    if (val) this._startTickerIfNeeded(); else this._stopTicker();
    this.dispatchEvent(new CustomEvent('card-resize', { bubbles: true, composed: true }));
  }

  _setPanel(panel) {
    if (panel === 'remote' && !this._config.remote_entity) return;
    this._panel = panel;
    this._el.segMedia.classList.toggle('active', panel === 'media');
    this._el.segRemote.classList.toggle('active', panel === 'remote');
    this._el.panelMedia.classList.toggle('active', panel === 'media');
    this._el.panelRemote.classList.toggle('active', panel === 'remote');
  }

  // -------------------------------------------------------------- update

  _update(prevHass) {
    if (!this._hass) return;
    const entity = this._config.entity;
    const st = this._hass.states[entity];
    const e = this._el;

    e.expanded.querySelector('.remote-tab').style.display = this._config.remote_entity ? '' : 'none';
    e.miniRemote.style.display = this._config.remote_entity ? '' : 'none';
    e.muteBtn.style.display = this._config.show_mute_button === false ? 'none' : '';
    if (!this._config.remote_entity && this._panel === 'remote') this._setPanel('media');

    if (!st) {
      e.title.textContent = 'Unavailable';
      e.heroTitle.textContent = entity;
      e.subtitle.textContent = '';
      e.heroSubtitle.textContent = 'Entity not found';
      return;
    }

    const name = this._config.name || st.attributes.friendly_name || entity;
    const title = st.attributes.media_title || this._capitalize(st.state) || name;
    const subtitle = name;
    const picture = st.attributes.entity_picture || '';
    const playing = st.state === 'playing';

    e.title.textContent = title;
    e.subtitle.textContent = subtitle;
    e.heroTitle.textContent = title;
    e.heroSubtitle.textContent = subtitle;

    const safePicture = picture ? picture.replace(/"/g, '%22') : '';
    const bgStyle = safePicture ? `background-image:url("${safePicture}")` : '';
    e.artSm.setAttribute('style', bgStyle);
    e.artLg.setAttribute('style', bgStyle);

    const canPlayPause = supports(st, SUPPORT_PAUSE) || supports(st, SUPPORT_PLAY);
    [e.miniPlay, e.play].forEach((b) => {
      b.innerHTML = playing ? ICONS.pause : ICONS.play;
      b.disabled = !canPlayPause;
    });
    const canPrev = supports(st, SUPPORT_PREVIOUS_TRACK);
    const canNext = supports(st, SUPPORT_NEXT_TRACK);
    [e.miniPrev, e.prev].forEach((b) => (b.disabled = !canPrev));
    [e.miniNext, e.next].forEach((b) => (b.disabled = !canNext));

    // Progress
    const duration = st.attributes.media_duration || 0;
    const position = this._currentPosition(st);
    const ratio = duration > 0 ? Math.min(1, position / duration) : 0;
    if (!e.progressTrack.classList.contains('dragging')) {
      e.progressFill.style.width = `${ratio * 100}%`;
      e.progressThumb.style.left = `${ratio * 100}%`;
    }
    e.timeElapsed.textContent = fmtTime(position);
    e.timeRemaining.textContent = `-${fmtTime(Math.max(0, duration - position))}`;
    e.progressTrack.classList.toggle('disabled', !supports(st, SUPPORT_SEEK) || !duration);

    // Volume (independent entity)
    const volEntity = this._volumeEntityId();
    const volSt = this._hass.states[volEntity];
    const volLevel = volSt?.attributes?.volume_level ?? 0;
    const muted = !!volSt?.attributes?.is_volume_muted;
    if (!e.volumeTrack.classList.contains('dragging')) {
      e.volumeFill.style.width = `${(muted ? 0 : volLevel) * 100}%`;
      e.volumeThumb.style.left = `${(muted ? 0 : volLevel) * 100}%`;
    }
    e.muteBtn.innerHTML = muted ? ICONS.muted : ICONS.volume;
    e.volumeTrack.classList.toggle('disabled', !volSt || !supports(volSt, SUPPORT_VOLUME_SET));
    e.volumeLabel.textContent = volEntity !== entity
      ? (volSt?.attributes?.friendly_name || volEntity)
      : '';

    // Remote power state
    if (this._config.remote_entity) {
      const remoteSt = this._hass.states[this._config.remote_entity];
      e.remotePower.classList.toggle('is-on', remoteSt?.state === 'on');
    }

    this._startTickerIfNeeded();
  }

  _capitalize(s) {
    return s ? s.charAt(0).toUpperCase() + s.slice(1) : '';
  }

  _currentPosition(st) {
    const base = st.attributes.media_position || 0;
    const updatedAt = st.attributes.media_position_updated_at
      ? new Date(st.attributes.media_position_updated_at).getTime()
      : null;
    if (st.state === 'playing' && updatedAt) {
      const elapsed = (Date.now() - updatedAt) / 1000;
      return base + Math.max(0, elapsed);
    }
    return base;
  }

  _startTickerIfNeeded() {
    if (this._ticker) return;
    if (!this._expanded) return;
    const st = this._hass?.states?.[this._config.entity];
    if (!st || st.state !== 'playing') return;
    this._ticker = setInterval(() => {
      if (!this._el.progressTrack.classList.contains('dragging')) this._update(null);
    }, 1000);
  }

  _stopTicker() {
    if (this._ticker) {
      clearInterval(this._ticker);
      this._ticker = null;
    }
  }
}

const STYLE = `
  :host { display:block; --gm-accent: #0A84FF; }
  * { box-sizing:border-box; }
  .card {
    position:relative;
    overflow:hidden;
    border-radius:20px;
    background: linear-gradient(165deg, rgba(32,32,34,.88), rgba(14,14,16,.92));
    color:#fff;
    font-family:-apple-system,BlinkMacSystemFont,"SF Pro Text","SF Pro Display","Segoe UI",Roboto,sans-serif;
    -webkit-font-smoothing:antialiased;
  }
  button { font-family:inherit; }
  .icon-btn {
    -webkit-tap-highlight-color:transparent;
    border:none; background:rgba(255,255,255,.08); color:#fff;
    width:36px; height:36px; border-radius:50%;
    display:flex; align-items:center; justify-content:center;
    cursor:pointer; transition:transform .15s ease, box-shadow .15s ease, background .15s ease;
  }
  .icon-btn svg { width:18px; height:18px; }
  .icon-btn:disabled { opacity:.3; cursor:default; }
  .icon-btn:not(:disabled):active { transform:scale(.9); box-shadow:0 0 16px 2px var(--gm-accent); background:rgba(255,255,255,.16); }
  .icon-btn.primary { background: var(--gm-accent); }
  .icon-btn:focus-visible { outline:2px solid var(--gm-accent); outline-offset:2px; }
  .icon-btn.lg { width:56px; height:56px; }
  .icon-btn.lg svg { width:24px; height:24px; }

  /* Compact row */
  .compact { display:flex; align-items:center; gap:12px; padding:12px; cursor:pointer; }
  .expanded .compact { display:none; }
  .art { background-size:cover; background-position:center; background-color:rgba(255,255,255,.06); flex-shrink:0; }
  .art-sm { width:48px; height:48px; border-radius:12px; cursor:pointer; }
  .meta { min-width:0; flex:1; }
  .title { font-size:14px; font-weight:600; white-space:nowrap; overflow:hidden; text-overflow:ellipsis; }
  .subtitle { font-size:12px; color:rgba(235,235,245,.6); white-space:nowrap; overflow:hidden; text-overflow:ellipsis; }
  .mini-controls { display:flex; align-items:center; gap:6px; flex-shrink:0; }
  .mini-controls .remote-mini { margin-left:6px; background:rgba(255,255,255,.05); }

  /* Expanded */
  .expanded { display:none; padding:16px; position:relative; }
  .card.is-expanded .expanded { display:block; }
  .card.is-expanded .compact { display:none; }
  .collapse-btn { position:absolute; top:12px; right:12px; z-index:2; }
  .hero { display:flex; flex-direction:column; align-items:center; text-align:center; padding-top:8px; }
  .art-lg { width:120px; height:120px; border-radius:18px; box-shadow:0 12px 30px rgba(0,0,0,.5); cursor:pointer; margin-bottom:14px; }
  .hero-title { font-size:17px; font-weight:700; max-width:100%; overflow:hidden; text-overflow:ellipsis; white-space:nowrap; }
  .hero-subtitle { font-size:13px; color:rgba(235,235,245,.6); margin-top:2px; }

  .segmented {
    display:flex; background:rgba(255,255,255,.08); border-radius:10px; padding:3px; margin:18px 0 14px;
  }
  .seg-btn {
    flex:1; border:none; background:transparent; color:rgba(255,255,255,.7); font-size:12px; font-weight:600;
    padding:7px 0; border-radius:8px; cursor:pointer; transition:background .2s ease, color .2s ease;
  }
  .seg-btn.active { background:rgba(255,255,255,.18); color:#fff; }

  .panel { display:none; }
  .panel.active { display:block; }

  .progress-row { padding:4px 2px 10px; }
  .progress-track, .volume-track {
    position:relative; height:4px; border-radius:2px; background:rgba(255,255,255,.18); cursor:pointer; touch-action:none;
  }
  .progress-track.disabled, .volume-track.disabled { opacity:.4; pointer-events:none; }
  .progress-fill, .volume-fill { position:absolute; left:0; top:0; bottom:0; border-radius:2px; background:var(--gm-accent); width:0%; }
  .progress-thumb, .volume-thumb {
    position:absolute; top:50%; width:13px; height:13px; border-radius:50%; background:#fff;
    transform:translate(-50%,-50%); left:0%; box-shadow:0 1px 4px rgba(0,0,0,.4);
    transition:box-shadow .15s ease;
  }
  .progress-track.dragging .progress-thumb, .volume-track.dragging .volume-thumb {
    box-shadow:0 0 0 8px color-mix(in srgb, var(--gm-accent) 30%, transparent);
  }
  .time-row { display:flex; justify-content:space-between; font-size:11px; color:rgba(235,235,245,.6); margin-top:6px; font-variant-numeric:tabular-nums; }

  .transport-row { display:flex; align-items:center; justify-content:center; gap:28px; margin:6px 0 22px; }

  .volume-row {
    display:flex; align-items:center; gap:10px;
    padding:12px 16px 14px;
    border-top:1px solid rgba(255,255,255,.08);
  }
  .volume-row .volume-track { flex:1; }
  .volume-label { font-size:10px; color:rgba(235,235,245,.45); max-width:80px; overflow:hidden; text-overflow:ellipsis; white-space:nowrap; }

  /* Remote */
  .touchpad {
    display:grid; grid-template-columns:56px 56px 56px; grid-template-rows:56px 56px 56px;
    justify-content:center; gap:6px; margin:8px auto 18px;
  }
  .pad-btn {
    border:none; background:rgba(255,255,255,.08); color:#fff; border-radius:16px;
    display:flex; align-items:center; justify-content:center; cursor:pointer;
    transition:transform .12s ease, box-shadow .12s ease, background .12s ease;
  }
  .pad-btn svg { width:20px; height:20px; }
  .pad-btn:active { transform:scale(.92); box-shadow:0 0 16px 2px var(--gm-accent); background:rgba(255,255,255,.18); }
  .pad-up { grid-column:2; grid-row:1; }
  .pad-left { grid-column:1; grid-row:2; }
  .pad-select { grid-column:2; grid-row:2; background:var(--gm-accent); }
  .pad-right { grid-column:3; grid-row:2; }
  .pad-down { grid-column:2; grid-row:3; }

  .remote-row { display:flex; align-items:center; justify-content:center; gap:16px; }
  .remote-back { width:auto; padding:0 16px; border-radius:18px; font-size:12px; font-weight:600; }
  .remote-power.is-on { background:var(--gm-accent); }

  @media (prefers-reduced-motion: reduce) {
    .icon-btn, .pad-btn, .seg-btn, .progress-thumb, .volume-thumb { transition:none; }
  }
`;

customElements.define('glass-media-card', GlassMediaCard);

// --------------------------------------------------------------------------
// Visual config editor
// --------------------------------------------------------------------------

class GlassMediaCardEditor extends HTMLElement {
  setConfig(config) {
    this._config = { ...config };
    this._render();
  }

  set hass(hass) {
    this._hass = hass;
    this.shadowRoot?.querySelectorAll('[data-picker]').forEach((p) => { p.hass = hass; });
  }

  _updateConfig(patch) {
    this._config = { ...this._config, ...patch };
    this.dispatchEvent(new CustomEvent('config-changed', { detail: { config: this._config }, bubbles: true, composed: true }));
  }

  _render() {
    if (!this.shadowRoot) this.attachShadow({ mode: 'open' });
    const cfg = this._config || {};
    const hasPicker = !!customElements.get('ha-entity-picker');

    this.shadowRoot.innerHTML = `
      <style>
        .row { margin-bottom:14px; }
        label { display:block; font-size:12px; font-weight:600; color:var(--secondary-text-color,#888); margin-bottom:4px; }
        input[type="text"] { width:100%; padding:8px; border-radius:8px; border:1px solid var(--divider-color,#444); background:var(--card-background-color,transparent); color:var(--primary-text-color,inherit); font-size:14px; }
        .color-row { display:flex; align-items:center; gap:10px; }
        input[type="color"] { width:44px; height:32px; border:none; background:none; padding:0; cursor:pointer; }
        .hint { font-size:11px; color:var(--secondary-text-color,#888); margin-top:3px; }
        .checkbox-label { display:flex; align-items:center; gap:8px; font-size:14px; cursor:pointer; }
        .checkbox-label input { width:16px; height:16px; cursor:pointer; }
      </style>
      <div class="editor">
        <div class="row" id="row-entity">
          <label>Media Player Entity (required)</label>
        </div>
        <div class="row">
          <label>Name (optional override)</label>
          <input type="text" id="name" value="${cfg.name || ''}" placeholder="Uses friendly name if blank">
        </div>
        <div class="row" id="row-volume">
          <label>Volume Entity (optional)</label>
        </div>
        <div class="row hint" style="margin-top:-8px;">Leave blank to use the media player above. Point this at a receiver/soundbar to control that device's volume instead.</div>
        <div class="row" id="row-remote">
          <label>Remote Entity (optional)</label>
        </div>
        <div class="row hint" style="margin-top:-8px;">Leave blank to hide the Remote tab. Needs a <code>remote.*</code> entity (e.g. the Apple TV integration's remote).</div>
        <div class="row">
          <label>Accent Color</label>
          <div class="color-row">
            <input type="color" id="accent" value="${cfg.accent_color || '#0A84FF'}">
            <span id="accent-hex">${cfg.accent_color || '#0A84FF'}</span>
          </div>
        </div>
        <div class="row">
          <label class="checkbox-label">
            <input type="checkbox" id="show-mute" ${cfg.show_mute_button === false ? '' : 'checked'}>
            Show mute button
          </label>
        </div>
      </div>
    `;

    const nameInput = this.shadowRoot.getElementById('name');
    nameInput.addEventListener('change', () => this._updateConfig({ name: nameInput.value }));

    const accentInput = this.shadowRoot.getElementById('accent');
    const accentHex = this.shadowRoot.getElementById('accent-hex');
    accentInput.addEventListener('input', () => {
      accentHex.textContent = accentInput.value;
      this._updateConfig({ accent_color: accentInput.value });
    });

    const muteCheckbox = this.shadowRoot.getElementById('show-mute');
    muteCheckbox.addEventListener('change', () => this._updateConfig({ show_mute_button: muteCheckbox.checked }));

    this._mountPicker('row-entity', 'entity', ['media_player'], true);
    this._mountPicker('row-volume', 'volume_entity', ['media_player'], false);
    this._mountPicker('row-remote', 'remote_entity', ['remote'], false);

    if (!hasPicker) {
      // Fallback: plain text inputs referencing entity IDs directly.
      ['entity', 'volume_entity', 'remote_entity'].forEach((key) => {
        const row = this.shadowRoot.getElementById(`row-${key === 'entity' ? 'entity' : key.replace('_entity', '')}`);
        const input = document.createElement('input');
        input.type = 'text';
        input.value = cfg[key] || '';
        input.placeholder = key;
        input.addEventListener('change', () => this._updateConfig({ [key]: input.value }));
        row.appendChild(input);
      });
    }
  }

  _mountPicker(rowId, key, domains, required) {
    if (!customElements.get('ha-entity-picker')) return;
    const row = this.shadowRoot.getElementById(rowId);
    const picker = document.createElement('ha-entity-picker');
    picker.hass = this._hass;
    picker.includeDomains = domains;
    picker.value = this._config[key] || '';
    picker.required = !!required;
    picker.setAttribute('data-picker', '');
    picker.addEventListener('value-changed', (ev) => {
      ev.stopPropagation();
      this._updateConfig({ [key]: ev.detail.value });
    });
    row.appendChild(picker);
  }
}

customElements.define('glass-media-card-editor', GlassMediaCardEditor);

window.customCards = window.customCards || [];
window.customCards.push({
  type: 'glass-media-card',
  name: 'Glass Media Card',
  description: 'iOS-inspired glass media card with a persistent volume slider, independent volume routing, and a one-tap Apple TV remote pad.',
  preview: true,
});

console.info(
  `%c GLASS-MEDIA-CARD %c v${CARD_VERSION} `,
  'color: white; background: #0A84FF; font-weight: 700; border-radius: 3px 0 0 3px; padding: 2px 4px;',
  'color: #0A84FF; background: white; font-weight: 700; border-radius: 0 3px 3px 0; padding: 2px 4px;'
);
