(() => {
  const reduce = matchMedia("(prefers-reduced-motion: reduce)").matches;
  const clamp = (v, a = 0, b = 1) => Math.min(b, Math.max(a, v));
  const ease = t => 1 - Math.pow(1 - t, 3);
  const rand = (a, b) => a + Math.random() * (b - a);
  const mobile = () => innerWidth < 900;

  /* ---------- mobile nav ---------- */
  const nav = document.getElementById("nav");
  const toggle = document.querySelector(".nav-toggle");
  toggle.addEventListener("click", () => {
    const open = toggle.getAttribute("aria-expanded") !== "true";
    toggle.setAttribute("aria-expanded", open);
    nav.classList.toggle("is-open", open);
    toggle.textContent = open ? "Close" : "Menu";
  });
  nav.addEventListener("click", e => {
    if (e.target.closest("a") && toggle.getAttribute("aria-expanded") === "true") toggle.click();
  });

  /* ======================================================================
     Mist engine — a fine aerosol, a soft haze that lingers, and a few
     droplets that land and glisten. Drawn additively so it reads as light.
     ====================================================================== */
  function sprite(size, stops) {
    const c = document.createElement("canvas");
    c.width = c.height = size;
    const g = c.getContext("2d");
    const gr = g.createRadialGradient(size / 2, size / 2, 0, size / 2, size / 2, size / 2);
    stops.forEach(([o, col]) => gr.addColorStop(o, col));
    g.fillStyle = gr;
    g.fillRect(0, 0, size, size);
    return c;
  }
  // neutral, near-transparent: real atomiser mist is a veil, not glitter
  const SPR_HAZE = sprite(128, [[0, "rgba(255,255,255,.32)"], [0.45, "rgba(255,255,255,.12)"], [1, "rgba(255,255,255,0)"]]);
  const SPR_DROP = (() => {
    const s = 32, c = document.createElement("canvas");
    c.width = c.height = s;
    const g = c.getContext("2d");
    const body = g.createRadialGradient(s * 0.5, s * 0.55, 0, s * 0.5, s * 0.5, s * 0.5);
    body.addColorStop(0, "rgba(255,255,255,.08)");
    body.addColorStop(0.75, "rgba(255,255,255,.22)");
    body.addColorStop(1, "rgba(255,255,255,0)");
    g.fillStyle = body; g.fillRect(0, 0, s, s);
    const hi = g.createRadialGradient(s * 0.36, s * 0.34, 0, s * 0.36, s * 0.34, s * 0.13);
    hi.addColorStop(0, "rgba(255,255,255,1)");
    hi.addColorStop(1, "rgba(255,255,255,0)");
    g.fillStyle = hi; g.fillRect(0, 0, s, s);
    return c;
  })();

  class Mist {
    constructor(canvas, { settle = null } = {}) {
      this.c = canvas;
      this.g = canvas.getContext("2d");
      this.p = [];
      this.beads = []; // droplets resting on the food
      this.settle = settle; // fn(x, y) -> true if a droplet lands here
      this.running = false;
      this.dpr = 1;
      this.size();
    }
    size() {
      this.dpr = Math.min(2, devicePixelRatio || 1);
      this.c.width = Math.max(1, this.c.clientWidth * this.dpr);
      this.c.height = Math.max(1, this.c.clientHeight * this.dpr);
    }
    // fire from (x, y) toward (tx, ty), all in CSS px of the canvas — one short spritz
    // force: a spray the visitor asked for always plays, even with reduced motion
    spray(x, y, tx, ty, amount = 1, force = false) {
      if (reduce && !force) return;
      const d = this.dpr;
      x *= d; y *= d; tx *= d; ty *= d;
      const dist = Math.hypot(tx - x, ty - y);
      const ang = Math.atan2(ty - y, tx - x);
      const shot = (n, k, mk) => {
        for (let i = 0; i < n; i++) {
          const a = ang + rand(-1, 1) * rand(0, k.spread || 0.3);
          const v = dist * (1 - k.drag) * rand(k.min, k.max);
          this.p.push(Object.assign({ x, y, vx: Math.cos(a) * v, vy: Math.sin(a) * v, life: 1, delay: Math.floor(rand(0, 22)) }, k, mk()));
        }
      };
      const n = (mobile() ? 0.6 : 1) * amount;
      // fine aerosol: the bulk of the cone, fades as it slows
      // drawn as short motion streaks, the way a fast aerosol actually photographs
      shot(2400 * n, { kind: 0, drag: 0.955, min: 0.3, max: 1.1, decay: 0.012, spread: 0.3 }, () => ({ s: rand(0.35, 0.9) * d, decay: rand(0.01, 0.02), delay: Math.floor(rand(0, 14)) }));
      // haze: a thin veil that drifts and lingers over the plate
      shot(46 * n, { kind: 1, drag: 0.96, min: 0.25, max: 1, decay: 0.007, spread: 0.26 }, () => ({ s: rand(16, 34) * d, grow: rand(0.6, 1.3) * d, delay: Math.floor(rand(2, 20)) }));
      // droplets: carry all the way and land
      shot(60 * n, { kind: 2, drag: 0.95, min: 0.75, max: 1.12, decay: 0.004, spread: 0.28 }, () => ({ s: rand(1.4, 2.6) * d }));
      if (!this.running) this.tick();
    }
    draw() {
      const g = this.g;
      g.clearRect(0, 0, this.c.width, this.c.height);
      const t = performance.now() / 1000;
      // 1. the veil
      g.globalCompositeOperation = "source-over";
      for (const p of this.p) {
        if (p.delay > 0 || p.kind !== 1) continue;
        g.globalAlpha = Math.max(0, p.life) * 0.28;
        g.drawImage(SPR_HAZE, p.x - p.s, p.y - p.s, p.s * 2, p.s * 2);
      }
      // 2. droplets resting on the food: tiny specular points, not white dots
      g.globalCompositeOperation = "lighter";
      for (const b of this.beads) {
        const tw = 0.7 + 0.3 * Math.sin(t * b.f + b.ph);
        g.globalAlpha = b.a * Math.min(1, b.life * 3) * tw;
        g.drawImage(SPR_DROP, b.x - b.s / 2, b.y - b.s / 2, b.s, b.s);
      }
      // 3. aerosol in flight: motion streaks that shorten to points as they slow
      g.lineCap = "round";
      g.strokeStyle = "#fff";
      for (const p of this.p) {
        if (p.delay > 0 || p.kind !== 0) continue;
        const a = Math.max(0, p.life);
        const sp = Math.hypot(p.vx, p.vy);
        g.globalAlpha = a * (sp > 1 ? 0.28 : 0.18);
        g.lineWidth = p.s;
        g.beginPath();
        g.moveTo(p.x - p.vx * 1.8, p.y - p.vy * 1.8);
        g.lineTo(p.x + 0.01, p.y);
        g.stroke();
      }
      for (const p of this.p) {
        if (p.delay > 0 || p.kind !== 2) continue;
        g.globalAlpha = Math.max(0, p.life) * 0.6;
        g.drawImage(SPR_DROP, p.x - p.s / 2, p.y - p.s / 2, p.s, p.s);
      }
      g.globalAlpha = 1;
      g.globalCompositeOperation = "source-over";
    }
    tick() {
      this.running = true;
      const d = this.dpr;
      for (const p of this.p) {
        if (p.delay > 0) { p.delay--; continue; }
        p.x += p.vx; p.y += p.vy;
        p.vx *= p.drag; p.vy = p.vy * p.drag + 0.025 * d;
        if (p.kind === 1) { p.s += p.grow; p.vy -= 0.03 * d; }
        p.life -= p.decay;
        // a droplet that has stopped either rests on the food or evaporates
        if (p.kind === 2 && Math.hypot(p.vx, p.vy) < 0.35 * d) {
          if (this.settle && this.settle(p.x / d, p.y / d) && this.beads.length < 160)
            this.beads.push({ x: p.x, y: p.y, s: p.s * rand(1.1, 1.7), a: rand(0.35, 0.7), f: rand(1.5, 4), ph: rand(0, 6), life: 1 });
          p.life = 0;
        }
      }
      for (const b of this.beads) b.life -= this.settle ? 0.0012 : 0.0028; // on the plate the glisten lingers ~14 s
      this.p = this.p.filter(p => p.life > 0);
      this.beads = this.beads.filter(b => b.life > 0);
      this.draw();
      if (this.p.length || this.beads.length) requestAnimationFrame(() => this.tick());
      else this.running = false;
    }
  }

  // Where a bottle's pump nozzle is right now (CSS px of `canvas`) and which way it points.
  // Read from two invisible markers on the pump, so tilt, scale and scroll are all accounted for.
  function nozzleOf(fig, canvas) {
    const mid = el => { const r = fig.querySelector(el).getBoundingClientRect(); return [r.left + r.width / 2, r.top + r.height / 2]; };
    const c = canvas.getBoundingClientRect();
    const [nx, ny] = mid(".nozzle"), [ax, ay] = mid(".nozzle-aim");
    const len = Math.hypot(ax - nx, ay - ny) || 1;
    return { x: nx - c.left, y: ny - c.top, ux: (ax - nx) / len, uy: (ay - ny) / len };
  }
  // A capped bottle can't spray: lift the cap, spritz from the pump, put the cap back on.
  const CAP_OFF_MS = 280;
  function uncapAndSpray(fig, fire, hold = 900) {
    clearTimeout(fig._fire); clearTimeout(fig._close);
    const wait = fig.classList.contains("is-open") ? 0 : CAP_OFF_MS;
    fig.classList.add("is-open");
    fig._fire = setTimeout(fire, wait);
    fig._close = setTimeout(() => fig.classList.remove("is-open"), wait + hold);
  }
  function recap(fig) { clearTimeout(fig._fire); clearTimeout(fig._close); fig.classList.remove("is-open"); }

  /* ---------- fit the giant print type to the stage width ---------- */
  const lines = [...document.querySelectorAll(".mega-line")];
  const perPx = el => el.getBoundingClientRect().width / parseFloat(getComputedStyle(el).fontSize);
  function fitType() {
    const mega = document.querySelector(".mega");
    const gut = parseFloat(getComputedStyle(lines[0]).left) || 16;
    const w = mega.clientWidth - 2 * gut;
    const maxH = innerHeight * (mobile() ? 0.13 : 0.19);
    lines.forEach(line => line.querySelectorAll("span").forEach(s => {
      s.style.setProperty("--fs", Math.min(w / perPx(s), maxH / 0.84) + "px");
    }));
    // ALWAYS EXTRA. sits on the plain wall above his head, inside the frame's top band
    const ex = document.querySelector(".extra-type span");
    const frame = document.querySelector(".extra-frame");
    const section = document.querySelector(".extra");
    const fs = Math.min((section.clientWidth - (mobile() ? 32 : 120)) / perPx(ex), innerHeight * (mobile() ? 0.09 : 0.14));
    ex.style.fontSize = fs + "px";
    ex.parentElement.style.top = Math.max(8, frame.offsetTop + frame.clientHeight * 0.185 - fs * 0.84) + "px";
  }

  /* ---------- sticky stage: the bottle comes down the page ---------- */
  const stage = document.querySelector(".stage");
  const bottle = document.getElementById("bottle");
  const panels = [...document.querySelectorAll(".panel")];
  const leaves = [...document.querySelectorAll(".leaf")];
  const heroMist = new Mist(document.getElementById("mist"));
  let scene = -1;
  const sceneBtns = [...document.querySelectorAll("[data-go]")];
  // jump straight to a scene: land a little into its segment so the line is already up
  sceneBtns.forEach(b => b.addEventListener("click", () => {
    const total = stage.offsetHeight - innerHeight;
    scrollTo({ top: stage.offsetTop + total * ((+b.dataset.go + 0.3) / 4), behavior: reduce ? "auto" : "smooth" });
  }));
  let keys = [];            // bottle pose per scene: { y, h, x, r }
  const cur = { y: 0, h: 0, x: 0, r: -14 };
  let target = { ...cur };

  // Work out, for each scene, where the bottle can stand without covering that scene's line.
  function measure() {
    const H = innerHeight, W = innerWidth, mob = mobile();
    const header = document.querySelector(".top").getBoundingClientRect().bottom;
    const panelH = Math.max(...panels.map(p => p.offsetHeight));
    const panelTop = mob ? H - H * 0.025 - panelH : H;
    const typeTop = header + (mob ? 6 : 14);
    const typeBottom = mob ? H - panelTop + 14 : H * 0.05;
    stage.style.setProperty("--type-top", typeTop + "px");
    stage.style.setProperty("--type-bottom", typeBottom + "px");

    const maxH = (mob ? W * 0.62 : W * 0.3) * (1183 / 993);
    const fit = (top, bottom, scale = 1) => {
      const h = Math.min(bottom - top, maxH, H * 0.62) * scale;
      return { y: bottom - h, h };
    };
    const pad = 2 * (parseFloat(getComputedStyle(lines[0]).paddingTop) || 0);
    keys = lines.map((line, i) => {
      const first = line.querySelector("span").offsetHeight;
      const lineH = line.offsetHeight - pad;      // the type itself, without the mask padding
      if (line.dataset.zone === "bottom") {
        // scene 0: up top, tilted, its base just dipping into the first line
        const lineTop = H - typeBottom - lineH;
        return { ...fit(header + (mob ? 10 : 16), lineTop + first * 0.14), x: mob ? 0 : W * 0.035, r: -14 };
      }
      const top = typeTop + lineH + (mob ? 8 : 16);
      const bottom = mob ? panelTop - 10 : H * 0.95;
      const k = fit(top, bottom, i === 3 ? 0.84 : 1);
      return { ...k, x: 0, r: i === 1 ? -5 : 0 };
    });

    // note leaves gather round the bottle's scene-2 pose
    const k = keys[2], bw = k.h * (993 / 1183), cx = W / 2 + k.x;
    const size = mob ? 108 : Math.max(150, Math.min(190, W * 0.12));
    stage.style.setProperty("--leaf-size", size + "px");
    const floor = (mob ? panelTop : H) - size - 8;
    // top note high on the right, heart on the left, base low on the right
    const gap = mob ? 0.2 : 0.6;
    const spots = [
      [cx + bw * gap, k.y],
      [cx - bw * gap - size, k.y + k.h * 0.18],
      [cx + bw * gap, k.y + k.h * 0.5],
    ];
    // keep the left leaf clear of the copy panel on desktop/tablet
    if (!mob) spots[1][0] = Math.max(spots[1][0], panels[2].getBoundingClientRect().right + 12);
    leaves.forEach((l, i) => {
      const [lx, ly] = spots[i];
      l.style.setProperty("--lx", clamp(lx, 8, W - size - (mob ? 8 : 96)).toFixed(0) + "px");
      l.style.setProperty("--ly", clamp(ly, header, floor).toFixed(0) + "px");
    });
  }

  function setScene(n) {
    if (n === scene) return;
    const prev = scene;
    scene = n;
    stage.dataset.scene = n;
    lines.forEach((l, i) => {
      l.classList.toggle("is-on", i === n);
      l.classList.toggle("is-off", i !== n && i === prev);
      if (i !== n && i !== prev) l.classList.remove("is-off");
    });
    panels.forEach((p, i) => p.classList.toggle("is-on", i === n));
    sceneBtns.forEach((b, i) => i === n ? b.setAttribute("aria-current", "step") : b.removeAttribute("aria-current"));
    if (prev !== -1) recap(bottle);
    if (n === 2) setTimeout(() => heroSpray(1), 350);
  }

  // Spray only once the bottle has come to rest in this scene, from wherever its nozzle actually is;
  // if the visitor scrolls on (or keeps the bottle moving) the spritz is simply skipped.
  let sprayWait = 0;
  function heroSpray(reach) {
    if (reduce) return;
    const want = scene, t0 = performance.now();
    cancelAnimationFrame(sprayWait);
    const settle = () => {
      if (scene !== want) return;
      if (animating) {
        if (performance.now() - t0 < 1500) sprayWait = requestAnimationFrame(settle);
        return;
      }
      uncapAndSpray(bottle, () => {
        if (scene !== want || animating) return;
        const n = nozzleOf(bottle, heroMist.c), far = Math.min(innerWidth * 0.3, 380) * reach;
        heroMist.spray(n.x, n.y, n.x + n.ux * far, n.y + n.uy * far, reach);
      });
    };
    settle();
  }

  const mix = (a, b, t) => a + (b - a) * t;
  function onScroll() {
    if (!keys.length) return;
    const r = stage.getBoundingClientRect();
    const p = clamp(-r.top / (stage.offsetHeight - innerHeight));
    const seg = p * 4;
    const i = Math.min(3, Math.floor(seg));
    const t = seg - i;
    // the line swaps halfway through the bottle's move
    setScene(Math.min(3, Math.floor(seg + 0.2)));

    const a = keys[i], b = keys[Math.min(3, i + 1)];
    const drift = innerHeight * 0.035; // it keeps sinking a little while a scene holds
    if (i < 3 && t > 0.6) {
      const m = ease((t - 0.6) / 0.4);
      target = { y: mix(a.y + drift, b.y, m), h: mix(a.h, b.h, m), x: mix(a.x, b.x, m), r: mix(a.r, b.r, m) };
    } else {
      const d = Math.min(t, 0.6) / 0.6;
      target = { y: a.y + drift * d, h: a.h, x: a.x, r: a.r + Math.sin(p * 18) * 1.5 };
    }
    if (!animating) requestAnimationFrame(follow);

    const film = document.getElementById("film").getBoundingClientRect();
    const foot = document.querySelector(".foot").getBoundingClientRect();
    document.body.classList.toggle("chrome-light", (film.top < 40 && film.bottom > 40) || foot.top < 40);

    const ex = document.querySelector(".extra").getBoundingClientRect();
    const ep = clamp(1 - (ex.top + ex.height) / (innerHeight + ex.height));
    document.querySelector(".extra-type").style.setProperty("--ex", ((0.5 - ep) * 8).toFixed(2) + "vw");
  }

  // ease the bottle toward its scroll position so it glides instead of stepping
  let animating = false, first = true;
  function follow() {
    animating = true;
    const k = first || reduce ? 1 : 0.16;
    first = false;
    let moving = false;
    for (const key of ["y", "h", "x", "r"]) {
      cur[key] += (target[key] - cur[key]) * k;
      if (Math.abs(target[key] - cur[key]) > 0.1) moving = true;
    }
    bottle.style.setProperty("--by", cur.y.toFixed(1) + "px");
    bottle.style.setProperty("--bh", cur.h.toFixed(1) + "px");
    bottle.style.setProperty("--bx", cur.x.toFixed(1) + "px");
    bottle.style.setProperty("--br", cur.r.toFixed(2) + "deg");
    if (moving) requestAnimationFrame(follow); else animating = false;
  }

  /* ---------- the plate: spray the salmon bowl ---------- */
  const ps = document.getElementById("plate-stage");
  const pBottle = document.getElementById("plate-bottle");
  const count = document.getElementById("plate-count");
  // droplets only rest on the bowl, not the tablecloth
  const plateMist = new Mist(document.getElementById("plate-mist"), {
    settle: (x, y) => {
      const w = ps.clientWidth, h = ps.clientHeight;
      const nx = (x / w - 0.5) / 0.4, ny = (y / h - 0.58) / 0.2; // the broth and noodles
      return nx * nx + ny * ny < 1;
    },
  });
  let sprays = 0;
// a different line for every spray up to 20 — the more you spray, the more of a cilantro person you are
  const SPRAY_LINES = [
    "칙. 향이 올라와요",
    "두 번째. 이게 정량이에요",
    "세 번째. 초록 향이 진해져요",
    "네 번째. 옆자리가 슬쩍 쳐다봐요",
    "다섯 번째. 고수 한 줌 넣은 셈이에요",
    "여섯 번째. 국물에서 초록 향이 나요",
    "일곱 번째. 이제 좀 고수답네요",
    "여덟 번째. 사장님, 고수 더 안 주셔도 돼요",
    "아홉 번째. 세 잎으론 못 돌아가요",
    "열 번째. 고수파 인증 완료",
    "11번째. 이제 옆자리 고수까지 옮겨 올 필요 없어요",
    "12번째. 한 숟갈마다 고수 향이 따라와요",
    "13번째. 쌀국수가 아니라 고수국이에요",
    "14번째. 손끝에서도 고수 향이 나요",
    "15번째. 향채(香菜) 장인 등극",
    "16번째. 오늘은 “고수 더 주세요” 안 해도 돼요",
    "17번째. 이쯤 되면 고수가 주인공이에요",
    "18번째. 50 mL가 살짝 걱정돼요",
    "19번째. 진짜 마지막 한 번만 더",
    "20번째. NEVER ENOUGH. 당신이 Mr. Extra예요",
  ];
  const countText = n => SPRAY_LINES[n - 1] || `${n}번째. 아직도 모자라죠? 역시 고수파`;

  let busy = false;
  const sprayBtn = document.getElementById("spray-btn");
  const resetBtn = document.getElementById("plate-reset");
  resetBtn.addEventListener("click", () => {
    sprays = 0;
    plateMist.p = []; plateMist.beads = []; plateMist.draw();
    recap(pBottle);
    count.textContent = "";
    sprayBtn.textContent = "칙, 뿌리기";
    resetBtn.hidden = true;
    sprayBtn.focus();
  });
  sprayBtn.addEventListener("click", () => {
    if (busy) return;
    busy = true;
    sprays++;
    ps.classList.add("is-spraying");
    const fire = () => {
      // out of the pump's nozzle, carried as far as the bowl
      const n = nozzleOf(pBottle, plateMist.c);
      const reach = Math.hypot(ps.clientWidth * 0.5 - n.x, ps.clientHeight * 0.56 - n.y);
      plateMist.spray(n.x, n.y, n.x + n.ux * reach, n.y + n.uy * reach, 1.2, true);
      ps.classList.remove("is-fresh"); void ps.offsetWidth; ps.classList.add("is-fresh");
      sprayBtn.textContent = "한 번 더, 칙";
      resetBtn.hidden = false;
      count.textContent = countText(sprays);
    };
    // the bottle slides in, the cap comes off, then the spritz
    setTimeout(() => uncapAndSpray(pBottle, fire, 700), 170);
    clearTimeout(ps._hide);
    ps._hide = setTimeout(() => ps.classList.remove("is-spraying"), 1400);
    setTimeout(() => { busy = false; }, 450); // a quick double-tap still counts
  });

  /* ---------- film: autoplay muted in view, sound on request ---------- */
  const video = document.getElementById("film-video");
  const soundBtn = document.getElementById("film-sound");
  if (!reduce && "IntersectionObserver" in window) {
    new IntersectionObserver(([e]) => { e.isIntersecting ? video.play().catch(() => {}) : video.pause(); }, { threshold: 0.35 }).observe(video);
  } else {
    video.controls = true;
  }
  soundBtn.addEventListener("click", () => {
    const on = video.muted;
    video.muted = !on;
    if (on) { video.currentTime = 0; video.play().catch(() => {}); }
    soundBtn.setAttribute("aria-pressed", String(on));
    soundBtn.textContent = on ? "소리 끄기" : "소리 켜기";
  });

  /* ---------- boot ---------- */
  function resize() { fitType(); measure(); heroMist.size(); plateMist.size(); onScroll(); }
  addEventListener("resize", resize);
  addEventListener("scroll", () => requestAnimationFrame(onScroll), { passive: true });
  resize();
  (document.fonts ? document.fonts.ready : Promise.resolve()).then(() => {
    resize();
    setTimeout(() => heroSpray(0.8), 1000);
  });
  addEventListener("load", resize);
  if (document.fonts) document.fonts.addEventListener("loadingdone", resize);
})();
