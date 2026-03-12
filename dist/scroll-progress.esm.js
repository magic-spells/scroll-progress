function y(s, e) {
  let t = 0;
  return function(...n) {
    const i = Date.now();
    i - t >= e && (t = i, s.apply(this, n));
  };
}
function f(s, e, t) {
  return Math.max(e, Math.min(t, s));
}
const _ = window.matchMedia("(prefers-reduced-motion: reduce)"), r = {
  elements: /* @__PURE__ */ new Set(),
  lastScrollY: 0,
  velocity: 0,
  rafId: null,
  isListening: !1,
  smoothing: 0.15,
  friction: 0.8,
  attraction: 0.95,
  velocityThreshold: 0.01,
  maxVelocity: 100,
  register(s) {
    this.elements.add(s), this.isListening || this.start(), s._receiveVelocity(this.velocity), this.tick();
  },
  unregister(s) {
    this.elements.delete(s), this.elements.size === 0 && this.stop();
  },
  start() {
    this.isListening || (this.lastScrollY = window.scrollY, this._boundScroll = this.onScroll.bind(this), window.addEventListener("scroll", this._boundScroll, { passive: !0 }), this.isListening = !0, this.rafId = requestAnimationFrame(this.onRaf.bind(this)));
  },
  stop() {
    window.removeEventListener("scroll", this._boundScroll), this.isListening = !1, this.velocity = 0, this.rafId && cancelAnimationFrame(this.rafId), this.rafId = null;
  },
  onScroll() {
    const s = window.scrollY, e = s - this.lastScrollY;
    if (this.lastScrollY = s, _.matches) {
      this.velocity = 0, this.tick();
      return;
    }
    this.velocity += (e - this.velocity) * this.smoothing, this.velocity = f(this.velocity, -this.maxVelocity, this.maxVelocity), this.tick();
  },
  tick() {
    this.rafId || (this.rafId = requestAnimationFrame(this.onRaf.bind(this)));
  },
  onRaf() {
    this.rafId = null, _.matches ? this.velocity = 0 : (this.velocity *= this.friction, this.velocity *= this.attraction, Math.abs(this.velocity) < this.velocityThreshold && (this.velocity = 0));
    const s = window.innerHeight;
    let e = !1;
    for (const t of this.elements)
      t._intersectionObserver || t._updateVisibilityFallback(), !(!t._visible || t._paused) && (t._receiveVelocity(this.velocity), t._tickProgress(s), Math.abs(this.velocity) > 0 && (e = !0));
    (e || Math.abs(this.velocity) > 0) && (this.rafId = requestAnimationFrame(this.onRaf.bind(this)));
  }
};
class c extends HTMLElement {
  constructor() {
    super(), this._cache = null, this._visible = !1, this._paused = !1, this._lastProgress = -1, this._lastVelocity = 0, this._resizeHandler = null, this._resizeObserver = null, this._intersectionObserver = null, this._injectBaseStyles();
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
    this._buildCache(), this._setupObservers(), this._attachResizeListener(), this._updateVisibilityFallback(), this._tickProgress(window.innerHeight), r.register(this);
  }
  disconnectedCallback() {
    this._removeObservers(), this._removeResizeListener(), r.unregister(this);
  }
  attributeChangedCallback() {
    this._buildCache(), r.tick();
  }
  // public api
  getProgress() {
    return parseFloat(this.style.getPropertyValue("--scroll-progress") || 0);
  }
  getVelocity() {
    return parseFloat(this.style.getPropertyValue("--scroll-progress-velocity") || 0);
  }
  update() {
    this._buildCache(), this._updateVisibilityFallback(), r.tick();
  }
  pause() {
    this._paused = !0;
  }
  resume() {
    this._paused = !1, r.tick();
  }
  // internal methods
  _receiveVelocity(e) {
    if (!(e === 0 && this._lastVelocity !== 0)) {
      if (Math.abs(e - this._lastVelocity) <= 0.1)
        return;
    }
    this._lastVelocity = e, this.style.setProperty("--scroll-progress-velocity", String(e)), this.dispatchEvent(
      new CustomEvent("scroll-progress:velocity", {
        detail: { velocity: e },
        bubbles: !0
      })
    );
  }
  _tickProgress(e) {
    if (!this._cache) return;
    const t = this.getBoundingClientRect(), n = this._cache.startTop - t.top, i = f(this._cache.distance ? n / this._cache.distance : 0, 0, 1);
    Math.abs(i - this._lastProgress) > 1e-3 && (this._lastProgress = i, this.style.setProperty("--scroll-progress", String(i)), this.dispatchEvent(
      new CustomEvent("scroll-progress:update", {
        detail: { progress: i },
        bubbles: !0
      })
    ));
  }
  _buildCache() {
    const e = this.getAttribute("playhead-element-start") || "top", t = this.getAttribute("playhead-viewport-start") || "bottom", n = this.getAttribute("playhead-element-end") || "bottom", i = this.getAttribute("playhead-viewport-end") || "top", h = this.getBoundingClientRect(), a = window.innerHeight, d = (o, l) => o === "top" ? 0 : o === "center" ? l.height / 2 : l.height, u = (o, l) => o === "top" ? 0 : o === "center" ? l / 2 : l, p = d(e, h), g = d(n, h), v = u(t, a) - p, b = u(i, a) - g;
    this._cache = {
      startTop: v,
      endTop: b,
      distance: v - b
    };
  }
  _setupObservers() {
    "IntersectionObserver" in window && (this._intersectionObserver = new window.IntersectionObserver(
      (e) => {
        for (const t of e)
          t.target === this && (this._visible = t.isIntersecting, this._visible && r.tick());
      },
      { threshold: [0, 1e-3, 1] }
    ), this._intersectionObserver.observe(this)), "ResizeObserver" in window && (this._resizeObserver = new window.ResizeObserver((e) => {
      for (const t of e)
        t.target === this && (this._buildCache(), this._visible && r.tick());
    }), this._resizeObserver.observe(this));
  }
  _removeObservers() {
    this._intersectionObserver && (this._intersectionObserver.disconnect(), this._intersectionObserver = null), this._resizeObserver && (this._resizeObserver.disconnect(), this._resizeObserver = null);
  }
  _attachResizeListener() {
    this._resizeHandler = y(() => {
      this._buildCache(), this._visible && r.tick();
    }, 50), window.addEventListener("resize", this._resizeHandler);
  }
  _removeResizeListener() {
    this._resizeHandler && (window.removeEventListener("resize", this._resizeHandler), this._resizeHandler = null);
  }
  _updateVisibilityFallback() {
    const e = this.getBoundingClientRect();
    this._visible = e.bottom > 0 && e.top < window.innerHeight;
  }
  _injectBaseStyles() {
    if (c._styleInjected) return;
    const e = document.createElement("style");
    e.textContent = `
scroll-progress {
	display: block;
	--scroll-progress: 0;
	--scroll-progress-velocity: 0;
	will-change: transform;
	backface-visibility: hidden;
}`, document.head.appendChild(e), c._styleInjected = !0;
  }
}
c._styleInjected = !1;
window.customElements.get("scroll-progress") || window.customElements.define("scroll-progress", c);
export {
  c as ScrollProgress
};
