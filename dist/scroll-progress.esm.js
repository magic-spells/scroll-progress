function g(i, e, t) {
  return Math.max(e, Math.min(t, i));
}
const p = window.matchMedia("(prefers-reduced-motion: reduce)"), r = {
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
}, n = {
  elements: /* @__PURE__ */ new Set(),
  lastScrollY: 0,
  velocity: 0,
  rafId: null,
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
    this.isListening || (r.init(), r.refresh(), this.lastScrollY = window.scrollY, this._boundRaf = this._boundRaf || this.onRaf.bind(this), this._boundScroll = this._boundScroll || this.onScroll.bind(this), this._boundResize = this._boundResize || this.onViewportResize.bind(this), window.addEventListener("scroll", this._boundScroll, { passive: !0 }), window.addEventListener("resize", this._boundResize, { passive: !0 }), window.visualViewport?.addEventListener("resize", this._boundResize, { passive: !0 }), this.isListening = !0, this.rafId = requestAnimationFrame(this._boundRaf));
  },
  stop() {
    window.removeEventListener("scroll", this._boundScroll), window.removeEventListener("resize", this._boundResize), window.visualViewport?.removeEventListener("resize", this._boundResize), this.isListening = !1, this.velocity = 0, this.rafId && cancelAnimationFrame(this.rafId), this.rafId = null;
  },
  onScroll() {
    const i = window.scrollY, e = i - this.lastScrollY;
    if (this.lastScrollY = i, p.matches) {
      this.velocity = 0, this.tick();
      return;
    }
    this.velocity += (e - this.velocity) * this.smoothing, this.velocity = g(this.velocity, -this.maxVelocity, this.maxVelocity), this.tick();
  },
  onViewportResize() {
    const i = r.refresh();
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
    this.rafId || (this.rafId = requestAnimationFrame(this._boundRaf));
  },
  onRaf() {
    this.rafId = null, p.matches ? this.velocity = 0 : (this.velocity *= this.decay, Math.abs(this.velocity) < this.velocityThreshold && (this.velocity = 0));
    const i = this.velocity;
    let e = null;
    for (const t of this.elements)
      t._intersectionObserver || (e ??= r.refresh().currentHeight, t._updateVisibilityFallback({
        currentHeight: e
      })), !(!t._visible || t._paused) && (t._receiveVelocity(i), t._tickProgress());
    i !== 0 && (this.rafId = requestAnimationFrame(this._boundRaf));
  }
};
class h extends HTMLElement {
  // private fields
  #e = null;
  #s = -1;
  #i = 0;
  #t = null;
  static #r = !1;
  // public fields (accessed by ScrollProgressManager)
  _visible = !1;
  _paused = !1;
  _intersectionObserver = null;
  constructor() {
    super(), this.#l();
  }
  static get observedAttributes() {
    return [
      "playhead-element-start",
      "playhead-viewport-start",
      "playhead-element-end",
      "playhead-viewport-end"
    ];
  }
  connectedCallback() {
    const e = this;
    r.init(), r.refresh(), e._buildCache(), e.#n(), e._updateVisibilityFallback(), e._tickProgress(), n.register(e);
  }
  disconnectedCallback() {
    const e = this;
    e.#o(), n.unregister(e);
  }
  attributeChangedCallback() {
    r.refresh(), this._buildCache(), n.tick();
  }
  // public api
  getProgress() {
    return parseFloat(this.style.getPropertyValue("--scroll-progress") || 0);
  }
  getVelocity() {
    return parseFloat(this.style.getPropertyValue("--scroll-progress-velocity") || 0);
  }
  update() {
    r.refresh(), this._buildCache(), this._updateVisibilityFallback(), n.tick();
  }
  pause() {
    this._paused = !0;
  }
  resume() {
    this._paused = !1, n.tick();
  }
  // manager-facing methods (called by ScrollProgressManager)
  _receiveVelocity(e) {
    const t = this;
    if (!(e === 0 && t.#i !== 0)) {
      if (Math.abs(e - t.#i) <= 0.1)
        return;
    }
    t.#i = e, t.style.setProperty("--scroll-progress-velocity", String(e)), t.dispatchEvent(
      new CustomEvent("scroll-progress:velocity", {
        detail: { velocity: e },
        bubbles: !0
      })
    );
  }
  _tickProgress() {
    const e = this;
    if (!e.#e) return;
    const t = e.getBoundingClientRect(), s = e.#e.startTop - t.top, o = g(e.#e.distance ? s / e.#e.distance : 0, 0, 1);
    Math.abs(o - e.#s) > 1e-3 && (e.#s = o, e.style.setProperty("--scroll-progress", String(o)), e.dispatchEvent(
      new CustomEvent("scroll-progress:update", {
        detail: { progress: o },
        bubbles: !0
      })
    ));
  }
  _buildCache({ rect: e = this.getBoundingClientRect(), stableHeight: t = r.stableHeight } = {}) {
    const s = this, o = s.getAttribute("playhead-element-start") || "top", f = s.getAttribute("playhead-viewport-start") || "bottom", v = s.getAttribute("playhead-element-end") || "bottom", w = s.getAttribute("playhead-viewport-end") || "top", a = (l, c) => l === "top" ? 0 : l === "center" ? c.height / 2 : c.height, d = (l, c) => l === "top" ? 0 : l === "center" ? c / 2 : c, _ = a(o, e), m = a(v, e), u = d(f, t) - _, b = d(w, t) - m;
    s.#e = { startTop: u, endTop: b, distance: u - b };
  }
  _updateVisibilityFallback({
    rect: e = this.getBoundingClientRect(),
    currentHeight: t = r.currentHeight
  } = {}) {
    const s = this;
    s._visible = e.bottom > 0 && e.top < t;
  }
  // private methods (internal only)
  #n() {
    const e = this;
    "IntersectionObserver" in window && (e._intersectionObserver = new window.IntersectionObserver(
      (t) => {
        for (const s of t)
          s.target === e && (e._visible = s.isIntersecting, e._visible && n.tick());
      },
      { threshold: [0, 1e-3, 1] }
    ), e._intersectionObserver.observe(e)), "ResizeObserver" in window && (e.#t = new window.ResizeObserver((t) => {
      for (const s of t)
        s.target === e && (e._buildCache(), e._visible && n.tick());
    }), e.#t.observe(e));
  }
  #o() {
    const e = this;
    e._intersectionObserver && (e._intersectionObserver.disconnect(), e._intersectionObserver = null), e.#t && (e.#t.disconnect(), e.#t = null);
  }
  #l() {
    if (h.#r) return;
    const e = document.createElement("style");
    e.textContent = `
scroll-progress {
	display: block;
	--scroll-progress: 0;
	--scroll-progress-velocity: 0;
	will-change: transform;
	backface-visibility: hidden;
}`, document.head.appendChild(e), h.#r = !0;
  }
}
window.customElements.get("scroll-progress") || window.customElements.define("scroll-progress", h);
export {
  h as ScrollProgress
};
