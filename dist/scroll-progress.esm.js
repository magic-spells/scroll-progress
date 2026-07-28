function v(i, e, t) {
  return Math.max(e, Math.min(t, i));
}
const w = 5e-4, f = 0.5, _ = 64, y = { top: 0, center: 0.5, bottom: 1 };
function u(i, e, t) {
  if (i === null || i === "") return e;
  const s = String(i).trim().toLowerCase(), r = y[s];
  if (typeof r == "number") return r;
  if (s.endsWith("%")) {
    const n = parseFloat(s);
    if (Number.isFinite(n)) return n / 100;
  }
  return console.warn(
    `<scroll-progress> ignoring invalid ${t}="${i}" — expected top, center, bottom, or a percentage`
  ), e;
}
const p = window.matchMedia("(prefers-reduced-motion: reduce)"), o = {
  currentHeight: window.visualViewport?.height || window.innerHeight,
  stableHeight: window.visualViewport?.height || window.innerHeight,
  probe: null,
  init() {
    if (this.probe || !window.CSS || !window.CSS.supports("height: 100svh")) return;
    const i = document.createElement("div"), e = document.createElement("div");
    i.setAttribute("aria-hidden", "true"), i.style.cssText = `
position: fixed;
top: 0;
left: 0;
width: 0;
height: 0;
overflow: hidden;
visibility: hidden;
pointer-events: none;
z-index: -1;`, e.style.height = "100svh", i.appendChild(e), document.documentElement.appendChild(i), this.probe = e, this.refresh();
  },
  refresh() {
    const i = window.visualViewport?.height || window.innerHeight, e = this.probe ? this.probe.getBoundingClientRect().height : 0;
    return this.currentHeight = i, this.stableHeight = e || i, this;
  }
}, l = {
  elements: /* @__PURE__ */ new Set(),
  lastScrollY: 0,
  velocity: 0,
  rafId: null,
  lastFrameTime: 0,
  isListening: !1,
  smoothing: 0.15,
  decay: 0.76,
  // friction (0.8) * attraction (0.95) combined
  velocityThreshold: 0.01,
  maxVelocity: 100,
  _boundRaf: null,
  _boundScroll: null,
  _boundResize: null,
  register(i) {
    this.elements.add(i), this.isListening || this.start(), i._receiveVelocity(this.velocity), this.tick();
  },
  unregister(i) {
    this.elements.delete(i), this.elements.size === 0 && this.stop();
  },
  start() {
    this.isListening || (o.init(), o.refresh(), this.lastScrollY = window.scrollY, this._boundRaf = this._boundRaf || this.onRaf.bind(this), this._boundScroll = this._boundScroll || this.onScroll.bind(this), this._boundResize = this._boundResize || this.onViewportResize.bind(this), window.addEventListener("scroll", this._boundScroll, { passive: !0 }), window.addEventListener("resize", this._boundResize, { passive: !0 }), window.visualViewport?.addEventListener("resize", this._boundResize, { passive: !0 }), this.isListening = !0, this.rafId = requestAnimationFrame(this._boundRaf));
  },
  stop() {
    window.removeEventListener("scroll", this._boundScroll), window.removeEventListener("resize", this._boundResize), window.visualViewport?.removeEventListener("resize", this._boundResize), this.isListening = !1, this.velocity = 0, this.lastFrameTime = 0, this.rafId && cancelAnimationFrame(this.rafId), this.rafId = null;
  },
  onScroll() {
    const i = window.scrollY, e = i - this.lastScrollY;
    if (this.lastScrollY = i, p.matches) {
      this.velocity = 0, this.tick();
      return;
    }
    this.velocity += (e - this.velocity) * this.smoothing, this.velocity = v(this.velocity, -this.maxVelocity, this.maxVelocity), this.tick();
  },
  onViewportResize() {
    const i = o.refresh();
    this.lastScrollY = window.scrollY;
    for (const e of this.elements) {
      const t = e.getBoundingClientRect();
      e._buildCache({ rect: t, stableHeight: i.stableHeight }), e._updateVisibilityFallback({
        rect: t,
        currentHeight: i.currentHeight
      });
    }
    this.tick();
  },
  tick() {
    this._boundRaf = this._boundRaf || this.onRaf.bind(this), this.rafId || (this.rafId = requestAnimationFrame(this._boundRaf));
  },
  onRaf(i) {
    this.rafId = null;
    const e = this.lastFrameTime > 0 ? Math.min(i - this.lastFrameTime, _) : 16;
    this.lastFrameTime = i, p.matches ? this.velocity = 0 : (this.velocity *= this.decay, Math.abs(this.velocity) < this.velocityThreshold && (this.velocity = 0));
    const t = this.velocity;
    let s = null, r = !1;
    for (const n of this.elements)
      n._intersectionObserver || (s ??= o.refresh().currentHeight, n._updateVisibilityFallback({
        currentHeight: s
      })), !(!n._visible || n._paused) && (n._receiveVelocity(t), n._tickProgress(e) && (r = !0));
    t !== 0 || r ? this.rafId = requestAnimationFrame(this._boundRaf) : this.lastFrameTime = 0;
  }
};
class b extends HTMLElement {
  // private fields
  #e = null;
  #r = null;
  #n = -1;
  #o = 0;
  #l = 0;
  #s = null;
  // null means never ticked — first tick snaps
  #t = !1;
  // one-shot: skip easing on the next tick
  #a = !1;
  #i = null;
  static #c = !1;
  // public fields (accessed by ScrollProgressManager)
  _visible = !1;
  _paused = !1;
  _intersectionObserver = null;
  constructor() {
    super(), this.#p();
  }
  static get observedAttributes() {
    return [
      "playhead-element-start",
      "playhead-viewport-start",
      "playhead-element-end",
      "playhead-viewport-end",
      "smoothing"
    ];
  }
  connectedCallback() {
    const e = this;
    o.init(), o.refresh(), e._buildCache(), e.#u(), e._updateVisibilityFallback(), e._tickProgress(), l.register(e);
  }
  disconnectedCallback() {
    const e = this;
    e.#b(), l.unregister(e);
  }
  // fires before connectedCallback for attributes present in markup, so both
  // branches have to survive being run on a not-yet-connected element
  attributeChangedCallback(e) {
    const t = this;
    if (e === "smoothing") {
      t.#d(), t.#t = !0, l.tick();
      return;
    }
    t.#h(), o.refresh(), t._buildCache(), l.tick();
  }
  // public api
  getProgress() {
    return parseFloat(this.style.getPropertyValue("--scroll-progress") || 0);
  }
  getVelocity() {
    return parseFloat(this.style.getPropertyValue("--scroll-progress-velocity") || 0);
  }
  update() {
    o.refresh(), this._buildCache(), this._updateVisibilityFallback(), l.tick();
  }
  pause() {
    this._paused = !0;
  }
  resume() {
    this._paused = !1, l.tick();
  }
  // manager-facing methods (called by ScrollProgressManager)
  _receiveVelocity(e) {
    const t = this;
    if (!(e === 0 && t.#o !== 0)) {
      if (Math.abs(e - t.#o) <= 0.1)
        return;
    }
    t.#o = e, t.style.setProperty("--scroll-progress-velocity", String(e)), t.dispatchEvent(
      new CustomEvent("scroll-progress:velocity", {
        detail: { velocity: e },
        bubbles: !0
      })
    );
  }
  // returns true while smoothed progress is still easing, which keeps the shared loop alive
  _tickProgress(e = 0) {
    const t = this;
    if (!t.#e) return !1;
    const s = t.getBoundingClientRect(), r = t.#e.startTop - s.top, n = v(t.#e.distance ? r / t.#e.distance : 0, 0, 1), c = t.#l, h = c <= 0 || p.matches || t.#t || t.#s === null;
    let a = n, d = !1;
    if (h)
      t.#t = !1;
    else {
      const g = n - t.#s;
      Math.abs(g) > w && (a = t.#s + g * (1 - Math.exp(-e / c)), d = !0);
    }
    const m = t.#a && !d;
    return t.#a = d, t.#s = a, a !== t.#n && (m || Math.abs(a - t.#n) > 1e-3) && (t.#n = a, t.style.setProperty("--scroll-progress", String(a)), t.dispatchEvent(
      new CustomEvent("scroll-progress:update", {
        detail: { progress: a },
        bubbles: !0
      })
    )), d;
  }
  _buildCache({ rect: e = this.getBoundingClientRect(), stableHeight: t = o.stableHeight } = {}) {
    const s = this;
    s.#r || s.#h();
    const r = s.#r, n = r.vs * t - r.es * e.height, c = r.ve * t - r.ee * e.height, h = s.#e;
    s.#e = { startTop: n, endTop: c, distance: n - c }, (!h || Math.abs(n - h.startTop) > f || Math.abs(c - h.endTop) > f) && (s.#t = !0);
  }
  _updateVisibilityFallback({
    rect: e = this.getBoundingClientRect(),
    currentHeight: t = o.currentHeight
  } = {}) {
    const s = this, r = e.bottom > 0 && e.top < t;
    r && !s._visible && (s.#t = !0), s._visible = r;
  }
  // private methods (internal only)
  // defaults match the keyword defaults: element top / viewport bottom → element bottom / viewport top
  #h() {
    const e = this;
    e.#r = {
      es: u(e.getAttribute("playhead-element-start"), 0, "playhead-element-start"),
      vs: u(e.getAttribute("playhead-viewport-start"), 1, "playhead-viewport-start"),
      ee: u(e.getAttribute("playhead-element-end"), 1, "playhead-element-end"),
      ve: u(e.getAttribute("playhead-viewport-end"), 0, "playhead-viewport-end")
    };
  }
  // smoothing is an ms time constant — absent, zero or unparseable all mean off
  #d() {
    const e = this, t = parseFloat(e.getAttribute("smoothing"));
    e.#l = Number.isFinite(t) && t > 0 ? t : 0;
  }
  #u() {
    const e = this;
    "IntersectionObserver" in window && (e._intersectionObserver = new window.IntersectionObserver(
      (t) => {
        for (const s of t)
          if (s.target === e) {
            const r = s.isIntersecting;
            r && !e._visible && (e.#t = !0), e._visible = r, r && l.tick();
          }
      },
      { threshold: [0, 1e-3, 1] }
    ), e._intersectionObserver.observe(e)), "ResizeObserver" in window && (e.#i = new window.ResizeObserver((t) => {
      for (const s of t)
        s.target === e && (e._buildCache(), e._visible && l.tick());
    }), e.#i.observe(e));
  }
  #b() {
    const e = this;
    e._intersectionObserver && (e._intersectionObserver.disconnect(), e._intersectionObserver = null), e.#i && (e.#i.disconnect(), e.#i = null);
  }
  #p() {
    if (b.#c) return;
    const e = document.createElement("style");
    e.textContent = `
scroll-progress {
	display: block;
	--scroll-progress: 0;
	--scroll-progress-velocity: 0;
	will-change: transform;
	backface-visibility: hidden;
}`, document.head.appendChild(e), b.#c = !0;
  }
}
window.customElements.get("scroll-progress") || window.customElements.define("scroll-progress", b);
export {
  b as ScrollProgress
};
