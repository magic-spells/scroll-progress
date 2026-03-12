function y(t, e) {
  let i = 0;
  return function(...s) {
    const c = Date.now();
    c - i >= e && (i = c, t.apply(this, s));
  };
}
function w(t, e, i) {
  return Math.max(e, Math.min(i, t));
}
const f = window.matchMedia("(prefers-reduced-motion: reduce)"), n = {
  currentHeight: window.visualViewport?.height || window.innerHeight,
  stableHeight: window.visualViewport?.height || window.innerHeight,
  probe: null,
  init() {
    if (this.probe || !window.CSS || !window.CSS.supports("height: 100svh")) return;
    const t = document.createElement("div"), e = document.createElement("div");
    t.setAttribute("aria-hidden", "true"), t.style.cssText = `
position: fixed;
top: 0;
left: 0;
width: 0;
height: 0;
overflow: hidden;
visibility: hidden;
pointer-events: none;
z-index: -1;`, e.style.height = "100svh", t.appendChild(e), document.documentElement.appendChild(t), this.probe = e, this.refresh();
  },
  refresh() {
    const t = window.visualViewport?.height || window.innerHeight, e = this.probe ? this.probe.getBoundingClientRect().height : 0;
    return this.currentHeight = t, this.stableHeight = e || t, this;
  }
}, r = {
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
  register(t) {
    this.elements.add(t), this.isListening || this.start(), t._receiveVelocity(this.velocity), this.tick();
  },
  unregister(t) {
    this.elements.delete(t), this.elements.size === 0 && this.stop();
  },
  start() {
    this.isListening || (n.init(), n.refresh(), this.lastScrollY = window.scrollY, this._boundScroll = this.onScroll.bind(this), this._boundViewportResize = this.onViewportResize.bind(this), window.addEventListener("scroll", this._boundScroll, { passive: !0 }), window.addEventListener("resize", this._boundViewportResize, { passive: !0 }), window.visualViewport?.addEventListener("resize", this._boundViewportResize, { passive: !0 }), this.isListening = !0, this.rafId = requestAnimationFrame(this.onRaf.bind(this)));
  },
  stop() {
    window.removeEventListener("scroll", this._boundScroll), window.removeEventListener("resize", this._boundViewportResize), window.visualViewport?.removeEventListener("resize", this._boundViewportResize), this.isListening = !1, this.velocity = 0, this.rafId && cancelAnimationFrame(this.rafId), this.rafId = null;
  },
  onScroll() {
    const t = window.scrollY, e = t - this.lastScrollY;
    if (this.lastScrollY = t, f.matches) {
      this.velocity = 0, this.tick();
      return;
    }
    this.velocity += (e - this.velocity) * this.smoothing, this.velocity = w(this.velocity, -this.maxVelocity, this.maxVelocity), this.tick();
  },
  onViewportResize() {
    n.refresh(), this.lastScrollY = window.scrollY;
    for (const t of this.elements)
      t._buildCache(), t._updateVisibilityFallback();
    this.tick();
  },
  tick() {
    this.rafId || (this.rafId = requestAnimationFrame(this.onRaf.bind(this)));
  },
  onRaf() {
    this.rafId = null, f.matches ? this.velocity = 0 : (this.velocity *= this.friction, this.velocity *= this.attraction, Math.abs(this.velocity) < this.velocityThreshold && (this.velocity = 0));
    let t = !1;
    for (const e of this.elements)
      e._intersectionObserver || e._updateVisibilityFallback(), !(!e._visible || e._paused) && (e._receiveVelocity(this.velocity), e._tickProgress(), Math.abs(this.velocity) > 0 && (t = !0));
    (t || Math.abs(this.velocity) > 0) && (this.rafId = requestAnimationFrame(this.onRaf.bind(this)));
  }
};
class h extends HTMLElement {
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
    n.init(), this._buildCache(), this._setupObservers(), this._attachResizeListener(), this._updateVisibilityFallback(), this._tickProgress(), r.register(this);
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
  _tickProgress() {
    if (!this._cache) return;
    const e = this.getBoundingClientRect(), i = this._cache.startTop - e.top, s = w(this._cache.distance ? i / this._cache.distance : 0, 0, 1);
    Math.abs(s - this._lastProgress) > 1e-3 && (this._lastProgress = s, this.style.setProperty("--scroll-progress", String(s)), this.dispatchEvent(
      new CustomEvent("scroll-progress:update", {
        detail: { progress: s },
        bubbles: !0
      })
    ));
  }
  _buildCache() {
    const e = this.getAttribute("playhead-element-start") || "top", i = this.getAttribute("playhead-viewport-start") || "bottom", s = this.getAttribute("playhead-element-end") || "bottom", c = this.getAttribute("playhead-viewport-end") || "top", a = this.getBoundingClientRect(), d = n.refresh().stableHeight, u = (o, l) => o === "top" ? 0 : o === "center" ? l.height / 2 : l.height, b = (o, l) => o === "top" ? 0 : o === "center" ? l / 2 : l, _ = u(e, a), g = u(s, a), p = b(i, d) - _, v = b(c, d) - g;
    this._cache = {
      startTop: p,
      endTop: v,
      distance: p - v
    };
  }
  _setupObservers() {
    "IntersectionObserver" in window && (this._intersectionObserver = new window.IntersectionObserver(
      (e) => {
        for (const i of e)
          i.target === this && (this._visible = i.isIntersecting, this._visible && r.tick());
      },
      { threshold: [0, 1e-3, 1] }
    ), this._intersectionObserver.observe(this)), "ResizeObserver" in window && (this._resizeObserver = new window.ResizeObserver((e) => {
      for (const i of e)
        i.target === this && (this._buildCache(), this._visible && r.tick());
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
    const e = n.refresh().currentHeight, i = this.getBoundingClientRect();
    this._visible = i.bottom > 0 && i.top < e;
  }
  _injectBaseStyles() {
    if (h._styleInjected) return;
    const e = document.createElement("style");
    e.textContent = `
scroll-progress {
	display: block;
	--scroll-progress: 0;
	--scroll-progress-velocity: 0;
	will-change: transform;
	backface-visibility: hidden;
}`, document.head.appendChild(e), h._styleInjected = !0;
  }
}
h._styleInjected = !1;
window.customElements.get("scroll-progress") || window.customElements.define("scroll-progress", h);
export {
  h as ScrollProgress
};
