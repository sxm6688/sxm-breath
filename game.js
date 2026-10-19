/* =========================================================
   SXM — 呼吸之间
   Hold to inhale. Release to exhale. Follow the ring.
   ========================================================= */

(() => {
  const $ = (selector, scope = document) => scope.querySelector(selector);
  const $$ = (selector, scope = document) => [...scope.querySelectorAll(selector)];
  const reducedMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;

  const game = $("[data-game]");
  const landing = $(".landing");
  const siteHead = $(".site-head");
  const stage = $("[data-stage]");
  const canvas = $("[data-canvas]");
  const ctx = canvas.getContext("2d");

  const phaseEl = $("[data-phase]");
  const countEl = $("[data-phase-count]");
  const instructionEl = $("[data-instruction]");
  const cycleEl = $("[data-cycle]");
  const cycleSmallEl = $("[data-cycle-small]");
  const progressEl = $("[data-progress]");
  const resonanceEl = $("[data-resonance]");
  const resonanceBar = $("[data-resonance-bar]");
  const hintHold = $("[data-hint-hold]");
  const hintRelease = $("[data-hint-release]");
  const lightEl = $("[data-light]");
  const lightDotsEl = $("[data-light-dots]");
  const comboEl = $("[data-combo]");

  const result = $("[data-result]");
  const resultScore = $("[data-result-score]");
  const resultTime = $("[data-result-time]");
  const resultLede = $("[data-result-lede]");
  const resultLight = $("[data-result-light]");
  const resultCombo = $("[data-result-combo]");
  const sparkPath = $("[data-spark-path]");
  const toast = $("[data-toast]");

  const soundButtons = $$("[data-sound]");
  const soundLink = $("[data-sound-link]");
  let lastFocused = null;
  const PUBLIC_URL = "https://sxm6688.github.io/sxm-breath/";

  /* ---------------------------------------------------------
     Sound
     --------------------------------------------------------- */

  let audio = null;
  let soundOn = false;
  let toastTimer = 0;

  function showToast(message) {
    window.clearTimeout(toastTimer);
    toast.textContent = message;
    toast.classList.add("is-visible");
    toastTimer = window.setTimeout(() => toast.classList.remove("is-visible"), 3000);
  }

  function getShareUrl() {
    const isLocal =
      window.location.protocol === "file:" ||
      /^(localhost|127\.0\.0\.1)$/.test(window.location.hostname);
    return isLocal ? PUBLIC_URL : window.location.href.split("#")[0];
  }

  async function shareGame() {
    const url = getShareUrl();
    const text = state.finished
      ? `我在 SXM「呼吸之间」拾起了 ${state.light} 个光点，最高连击 ×${state.maxCombo}。来试试：`
      : "SXM「呼吸之间」——一场 33 秒的拾光小游戏。按住吸气，松开呼气，让圆环经过光点。";

    const prefersNativeShare =
      navigator.maxTouchPoints > 0 || /Android|iPhone|iPad|iPod/i.test(navigator.userAgent);

    if (navigator.share && prefersNativeShare) {
      try {
        await navigator.share({ title: "SXM · 呼吸之间", text, url });
        return;
      } catch (error) {
        if (error.name === "AbortError") return;
      }
    }

    try {
      await navigator.clipboard.writeText(`${text} ${url}`);
      showToast("链接已复制，可以发给朋友了");
    } catch (error) {
      showToast(`分享链接：${url}`);
    }
  }

  $$("[data-share]").forEach((button) => {
    button.addEventListener("click", shareGame);
  });

  function buildAudio() {
    const AudioContextClass = window.AudioContext || window.webkitAudioContext;
    if (!AudioContextClass) throw new Error("AudioContext unavailable");

    const context = new AudioContextClass();
    const master = context.createGain();
    master.gain.value = 0;
    master.connect(context.destination);

    const filter = context.createBiquadFilter();
    filter.type = "lowpass";
    filter.frequency.value = 660;
    filter.Q.value = 0.45;
    filter.connect(master);

    const delay = context.createDelay(1.4);
    delay.delayTime.value = 0.62;
    const feedback = context.createGain();
    feedback.gain.value = 0.24;
    const wet = context.createGain();
    wet.gain.value = 0.17;
    delay.connect(feedback);
    feedback.connect(delay);
    delay.connect(wet);
    wet.connect(master);

    [110, 164.81, 220, 329.63].forEach((frequency, index) => {
      const osc = context.createOscillator();
      const gain = context.createGain();
      osc.type = "sine";
      osc.frequency.value = frequency;
      osc.detune.value = index % 2 === 0 ? -3 : 4;
      gain.gain.value = [0.055, 0.031, 0.021, 0.01][index];
      osc.connect(gain);
      gain.connect(filter);
      gain.connect(delay);
      osc.start();
    });

    const noiseBuffer = context.createBuffer(1, context.sampleRate * 3, context.sampleRate);
    const noiseData = noiseBuffer.getChannelData(0);
    for (let i = 0; i < noiseData.length; i += 1) {
      noiseData[i] = (Math.random() * 2 - 1) * 0.3;
    }
    const noise = context.createBufferSource();
    noise.buffer = noiseBuffer;
    noise.loop = true;
    const noiseFilter = context.createBiquadFilter();
    noiseFilter.type = "bandpass";
    noiseFilter.frequency.value = 520;
    noiseFilter.Q.value = 0.8;
    const noiseGain = context.createGain();
    noiseGain.gain.value = 0.014;
    noise.connect(noiseFilter);
    noiseFilter.connect(noiseGain);
    noiseGain.connect(master);
    noise.start();

    return { context, master };
  }

  function updateSoundUI(on) {
    soundButtons.forEach((button) => {
      button.setAttribute("aria-pressed", String(on));
      button.setAttribute("aria-label", on ? "关闭空间声音" : "打开空间声音");
      const label = $(".sound-label", button);
      if (label) label.textContent = on ? "静音" : "声音";
    });

    if (soundLink) {
      soundLink.firstChild.textContent = on ? "空间声音 · 已开启 " : "先听一段空间声音 ";
    }
  }

  function setSound(on) {
    const previous = soundOn;
    soundOn = on;
    updateSoundUI(on);

    try {
      if (!audio) audio = buildAudio();
      audio.context.resume().catch(() => {});
      const now = audio.context.currentTime;
      audio.master.gain.cancelScheduledValues(now);
      audio.master.gain.setValueAtTime(Math.max(audio.master.gain.value, 0.0001), now);
      audio.master.gain.exponentialRampToValueAtTime(on ? 0.5 : 0.0001, now + (on ? 2.2 : 0.9));
      if (on) chime(261.63, 1.2, 0.035);
    } catch (error) {
      soundOn = previous;
      updateSoundUI(previous);
      showToast("当前环境暂时无法播放空间声音");
    }
  }

  function chime(frequency, duration = 0.9, volume = 0.045) {
    if (!audio || !soundOn) return;
    const { context, master } = audio;
    const now = context.currentTime;

    [1, 2.01].forEach((ratio, index) => {
      const osc = context.createOscillator();
      const gain = context.createGain();
      osc.type = "sine";
      osc.frequency.value = frequency * ratio;
      gain.gain.setValueAtTime(0.0001, now);
      gain.gain.exponentialRampToValueAtTime(index === 0 ? volume : volume * 0.28, now + 0.06);
      gain.gain.exponentialRampToValueAtTime(0.0001, now + duration);
      osc.connect(gain);
      gain.connect(master);
      osc.start(now);
      osc.stop(now + duration + 0.1);
    });
  }

  function finishTone() {
    if (!audio || !soundOn) return;
    [261.63, 392, 523.25].forEach((frequency, index) => {
      window.setTimeout(() => chime(frequency, 2.4, 0.038), index * 240);
    });
  }

  soundButtons.forEach((button) => {
    button.addEventListener("click", () => setSound(!soundOn));
  });

  if (soundLink) {
    soundLink.addEventListener("click", () => setSound(!soundOn));
  }

  /* ---------------------------------------------------------
     Game constants
     --------------------------------------------------------- */

  const CYCLES = 3;
  const MIN_SCALE = 0.55;
  const MAX_SCALE = 1;
  const HOLD_RATE = (MAX_SCALE - MIN_SCALE) / 4;
  const RELEASE_RATE = (MAX_SCALE - MIN_SCALE) / 5;
  const PHASES = [
    {
      key: "inhale",
      label: "吸气",
      instruction: "按住，让圆环经过光点。",
      duration: 4,
      from: MIN_SCALE,
      to: MAX_SCALE,
      hold: true,
      tone: 523.25,
    },
    {
      key: "hold",
      label: "停留",
      instruction: "保持住，让光停留一会儿。",
      duration: 1,
      from: MAX_SCALE,
      to: MAX_SCALE,
      hold: true,
      tone: 659.25,
    },
    {
      key: "exhale",
      label: "呼气",
      instruction: "松开，让身体和光一起慢下来。",
      duration: 5,
      from: MAX_SCALE,
      to: MIN_SCALE,
      hold: false,
      tone: 392,
    },
    {
      key: "rest",
      label: "停留",
      instruction: "停在这里，什么也不做。",
      duration: 1,
      from: MIN_SCALE,
      to: MIN_SCALE,
      hold: false,
      tone: 329.63,
    },
  ];
  const CYCLE_DURATION = PHASES.reduce((sum, phase) => sum + phase.duration, 0);
  const TOTAL_DURATION = CYCLE_DURATION * CYCLES;
  const TOTAL_LIGHTS = 18;
  const TOTAL_SPAWNS = 21;
  const LIGHT_GOAL = 12;

  const state = {
    open: false,
    started: false,
    running: false,
    finished: false,
    hold: false,
    cycle: 1,
    phaseIndex: 0,
    phaseTime: 0,
    target: MIN_SCALE,
    player: MIN_SCALE,
    resonance: 0,
    alignSum: 0,
    alignTime: 0,
    samples: [],
    sampleClock: 0,
    elapsed: 0,
    sparkClock: 0,
    light: 0,
    noise: 0,
    combo: 0,
    maxCombo: 0,
    lastLightAt: -10,
    spawnClock: 0.8,
    spawned: 0,
    raf: 0,
    lastTs: 0,
    activePointer: null,
  };

  const particles = [];
  const dust = [];
  const motes = [];
  const flashes = [];
  const floaters = [];
  const readyMotes = Array.from({ length: 7 }, (_, index) => ({
    angle: (index / 7) * Math.PI * 2 + 0.35,
    radiusNorm: 0.66 + (index % 3) * 0.12,
    spin: index % 2 === 0 ? 0.07 : -0.05,
  }));
  const lightDots = [];

  for (let i = 0; i < TOTAL_LIGHTS; i += 1) {
    const dot = document.createElement("span");
    lightDotsEl.appendChild(dot);
    lightDots.push(dot);
  }

  let comboTimeout = 0;

  let W = 1;
  let H = 1;
  let CX = 1;
  let CY = 1;
  let RADIUS = 160;
  let DPR = 1;

  const clamp = (value, min, max) => Math.min(Math.max(value, min), max);
  const easeInOut = (t) => (t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2);
  const pad = (value) => String(value).padStart(2, "0");

  /* ---------------------------------------------------------
     Canvas
     --------------------------------------------------------- */

  function resizeCanvas() {
    const rect = stage.getBoundingClientRect();
    DPR = Math.min(window.devicePixelRatio || 1, 2);
    W = Math.max(rect.width, 1);
    H = Math.max(rect.height, 1);
    canvas.width = Math.round(W * DPR);
    canvas.height = Math.round(H * DPR);
    ctx.setTransform(DPR, 0, 0, DPR, 0, 0);
    CX = W < 720 ? W * 0.5 : W * 0.54;
    CY = H * (W < 720 ? 0.55 : 0.52);
    RADIUS = clamp(Math.min(W, H) * 0.31, 112, 250);
  }

  function initDust() {
    dust.length = 0;
    const count = reducedMotion ? 26 : 58;
    for (let i = 0; i < count; i += 1) {
      dust.push({
        x: Math.random(),
        y: Math.random(),
        size: Math.random() * 1.4 + 0.4,
        speed: Math.random() * 0.000012 + 0.000004,
        alpha: Math.random() * 0.28 + 0.06,
      });
    }
  }

  initDust();

  function emitBurst(radius, amount = 16, tone = "lime") {
    if (reducedMotion) amount = Math.ceil(amount / 2);
    for (let i = 0; i < amount; i += 1) {
      particles.push({
        angle: Math.random() * Math.PI * 2,
        radius: radius * (0.96 + Math.random() * 0.08),
        vr: (Math.random() * 16 + 4) * (Math.random() > 0.5 ? 1 : -0.35),
        va: (Math.random() - 0.5) * 0.34,
        size: Math.random() * 2.4 + 0.8,
        life: Math.random() * 1.1 + 0.55,
        maxLife: 1.65,
        tone,
      });
    }
    if (particles.length > 220) particles.splice(0, particles.length - 220);
  }

  function updateParticles(dt) {
    for (let i = particles.length - 1; i >= 0; i -= 1) {
      const particle = particles[i];
      particle.radius += particle.vr * dt;
      particle.angle += particle.va * dt;
      particle.life -= dt;
      if (particle.life <= 0) particles.splice(i, 1);
    }
  }

  function spawnMote() {
    const index = state.spawned + 1;
    const type = index % 6 === 0 && index <= 18 ? "noise" : "light";
    motes.push({
      angle: Math.random() * Math.PI * 2,
      radiusNorm: 0.59 + Math.random() * 0.39,
      life: 2.95,
      maxLife: 2.95,
      spin: (Math.random() - 0.5) * 0.16,
      seed: Math.random() * 10,
      type,
    });
    state.spawned = index;
  }

  function emitMoteBurst(mote) {
    const amount = reducedMotion ? 4 : mote.type === "light" ? 12 : 7;
    for (let i = 0; i < amount; i += 1) {
      particles.push({
        angle: mote.angle + (Math.random() - 0.5) * 0.32,
        radius: mote.radiusNorm * RADIUS,
        vr: (Math.random() - 0.5) * 58,
        va: (Math.random() - 0.5) * 0.45,
        size: Math.random() * 2 + 0.7,
        life: Math.random() * 0.65 + 0.35,
        maxLife: 1,
        tone: mote.type === "noise" ? "clay" : "lime",
      });
    }
  }

  function updateComboMessage() {
    if (state.combo >= 2) {
      window.clearTimeout(comboTimeout);
      comboEl.textContent = `连击 ×${state.combo}`;
      comboEl.classList.add("is-active");
      comboEl.classList.remove("is-noise");
    } else {
      comboEl.classList.remove("is-active");
    }
  }

  function flashNoiseMessage() {
    window.clearTimeout(comboTimeout);
    comboEl.textContent = "杂念 · 放下";
    comboEl.classList.add("is-active", "is-noise");
    comboTimeout = window.setTimeout(() => {
      comboEl.classList.remove("is-active", "is-noise");
    }, 1400);
  }

  function collectMote(mote) {
    const index = motes.indexOf(mote);
    if (index === -1) return;
    motes.splice(index, 1);
    flashes.push({
      angle: mote.angle,
      radiusNorm: mote.radiusNorm,
      life: 0.7,
      maxLife: 0.7,
      type: mote.type,
    });
    floaters.push({
      x: Math.cos(mote.angle) * mote.radiusNorm * RADIUS,
      y: Math.sin(mote.angle) * mote.radiusNorm * RADIUS,
      life: 0.9,
      maxLife: 0.9,
      text: mote.type === "noise" ? "杂念" : "+1",
      type: mote.type,
    });
    emitMoteBurst(mote);

    if (mote.type === "noise") {
      state.noise += 1;
      state.combo = 0;
      flashNoiseMessage();
      chime(174.61, 0.75, 0.028);
      return;
    }

    state.light = Math.min(TOTAL_LIGHTS, state.light + 1);
    const continuous = state.elapsed - state.lastLightAt <= 2.6;
    state.combo = continuous ? state.combo + 1 : 1;
    state.lastLightAt = state.elapsed;
    state.maxCombo = Math.max(state.maxCombo, state.combo);
    lightEl.textContent = pad(state.light);
    const dot = lightDots[state.light - 1];
    if (dot) dot.classList.add("is-lit");
    updateComboMessage();
    chime(783.99 + Math.min(state.combo, 8) * 42, 0.55, 0.03);
  }

  function updateMotes(dt) {
    for (let i = motes.length - 1; i >= 0; i -= 1) {
      const mote = motes[i];
      mote.life -= dt;
      mote.angle += mote.spin * dt;
      if (mote.life <= 0) {
        motes.splice(i, 1);
        continue;
      }
      if (state.player >= mote.radiusNorm - 0.004) collectMote(mote);
    }

    for (let i = flashes.length - 1; i >= 0; i -= 1) {
      flashes[i].life -= dt;
      if (flashes[i].life <= 0) flashes.splice(i, 1);
    }

    for (let i = floaters.length - 1; i >= 0; i -= 1) {
      floaters[i].life -= dt;
      if (floaters[i].life <= 0) floaters.splice(i, 1);
    }
  }

  function drawGuideRing(radius, alpha, dashed = false) {
    ctx.beginPath();
    if (dashed) ctx.setLineDash([2, 8]);
    ctx.arc(0, 0, radius, 0, Math.PI * 2);
    ctx.strokeStyle = `rgba(242, 239, 231, ${alpha})`;
    ctx.lineWidth = 1;
    ctx.stroke();
    ctx.setLineDash([]);
  }

  function drawTicks(radius) {
    for (let i = 0; i < 72; i += 1) {
      const angle = (i / 72) * Math.PI * 2 - Math.PI / 2;
      const major = i % 6 === 0;
      const inner = radius - (major ? 9 : 4);
      const outer = radius;
      ctx.beginPath();
      ctx.moveTo(Math.cos(angle) * inner, Math.sin(angle) * inner);
      ctx.lineTo(Math.cos(angle) * outer, Math.sin(angle) * outer);
      ctx.strokeStyle = major ? "rgba(242, 239, 231, 0.26)" : "rgba(242, 239, 231, 0.1)";
      ctx.lineWidth = 1;
      ctx.stroke();
    }
  }

  function render(timestamp) {
    ctx.clearRect(0, 0, W, H);

    const time = timestamp || performance.now();
    const ready = !state.started;
    const readyScale = MIN_SCALE + 0.018 * (0.5 + 0.5 * Math.sin(time * 0.0011));
    const targetNorm = ready ? readyScale : state.target;
    const playerNorm = ready ? readyScale : state.player;
    const diff = Math.abs(state.player - state.target);
    const align = ready ? 0.65 : clamp(1 - diff / 0.18, 0, 1);

    const progress = state.started
      ? clamp(((state.cycle - 1) * CYCLE_DURATION + currentCycleElapsed()) / TOTAL_DURATION, 0, 1)
      : 0;

    ctx.save();
    ctx.translate(CX, CY);

    // Ambient dust
    dust.forEach((dot) => {
      const x = (dot.x - 0.5) * W + CX;
      const y = ((dot.y - (time * dot.speed) % 1 + 1) % 1) * H;
      ctx.beginPath();
      ctx.arc(x - CX, y - CY, dot.size, 0, Math.PI * 2);
      ctx.fillStyle = `rgba(242, 239, 231, ${dot.alpha})`;
      ctx.fill();
    });

    // Guide rings
    drawGuideRing(RADIUS * 0.55, 0.055);
    drawGuideRing(RADIUS * 0.78, 0.045, true);
    drawGuideRing(RADIUS, 0.08);
    drawTicks(RADIUS * 1.12);

    // Overall progress arc
    ctx.beginPath();
    ctx.arc(0, 0, RADIUS * 1.19, -Math.PI / 2, -Math.PI / 2 + Math.PI * 2 * progress);
    ctx.strokeStyle = "rgba(88, 238, 242, 0.55)";
    ctx.lineWidth = 1.2;
    ctx.lineCap = "round";
    ctx.stroke();

    // Target ring
    const targetRadius = RADIUS * targetNorm;
    ctx.save();
    ctx.beginPath();
    ctx.setLineDash([2, 7]);
    ctx.arc(0, 0, targetRadius + 10, 0, Math.PI * 2);
    ctx.strokeStyle = "rgba(88, 238, 242, 0.22)";
    ctx.lineWidth = 1;
    ctx.stroke();
    ctx.setLineDash([]);

    ctx.beginPath();
    ctx.arc(0, 0, targetRadius, 0, Math.PI * 2);
    ctx.strokeStyle = `rgba(88, 238, 242, ${0.38 + align * 0.58})`;
    ctx.lineWidth = 1.4;
    ctx.shadowBlur = align > 0.65 ? 18 : 5;
    ctx.shadowColor = "rgba(88, 238, 242, 0.65)";
    ctx.stroke();
    ctx.restore();

    // Target ring markers
    for (let i = 0; i < 8; i += 1) {
      const angle = (i / 8) * Math.PI * 2 - Math.PI / 2;
      ctx.beginPath();
      ctx.arc(Math.cos(angle) * targetRadius, Math.sin(angle) * targetRadius, 1.6, 0, Math.PI * 2);
      ctx.fillStyle = `rgba(88, 238, 242, ${0.34 + align * 0.5})`;
      ctx.fill();
    }

    // Player light field
    const playerRadius = RADIUS * playerNorm;
    const glow = ctx.createRadialGradient(0, 0, 0, 0, 0, playerRadius * 1.34);
    glow.addColorStop(0, `rgba(235, 255, 255, ${0.26 + align * 0.2})`);
    glow.addColorStop(0.42, "rgba(88, 238, 242, 0.13)");
    glow.addColorStop(0.75, "rgba(88, 238, 242, 0.04)");
    glow.addColorStop(1, "rgba(88, 238, 242, 0)");
    ctx.beginPath();
    ctx.arc(0, 0, playerRadius * 1.34, 0, Math.PI * 2);
    ctx.fillStyle = glow;
    ctx.fill();

    // Player orb
    const orb = ctx.createRadialGradient(0, 0, 0, 0, 0, playerRadius);
    orb.addColorStop(0, "rgba(251, 255, 233, 0.99)");
    orb.addColorStop(0.18, "rgba(185, 252, 255, 0.92)");
    orb.addColorStop(0.53, "rgba(88, 238, 242, 0.42)");
    orb.addColorStop(0.84, "rgba(88, 238, 242, 0.08)");
    orb.addColorStop(1, "rgba(88, 238, 242, 0)");
    ctx.beginPath();
    ctx.arc(0, 0, playerRadius, 0, Math.PI * 2);
    ctx.fillStyle = orb;
    ctx.fill();

    // Orb rim
    ctx.save();
    ctx.beginPath();
    ctx.arc(0, 0, playerRadius, 0, Math.PI * 2);
    ctx.strokeStyle = `rgba(185, 252, 255, ${0.34 + align * 0.5})`;
    ctx.lineWidth = 1.15;
    ctx.shadowBlur = 20 + align * 18;
    ctx.shadowColor = "rgba(88, 238, 242, 0.55)";
    ctx.stroke();
    ctx.restore();

    // Center dot
    ctx.beginPath();
    ctx.arc(0, 0, 3.1, 0, Math.PI * 2);
    ctx.fillStyle = "rgba(88, 238, 242, 0.95)";
    ctx.shadowBlur = 12;
    ctx.shadowColor = "rgba(88, 238, 242, 0.9)";
    ctx.fill();
    ctx.shadowBlur = 0;

    // Collectible light motes
    if (ready) {
      readyMotes.forEach((mote, index) => {
        const angle = mote.angle + time * 0.00006 * (index % 2 === 0 ? 1 : -1);
        const radius = RADIUS * mote.radiusNorm;
        const x = Math.cos(angle) * radius;
        const y = Math.sin(angle) * radius;
        const pulse = 1 + Math.sin(time * 0.0025 + index) * 0.18;
        ctx.save();
        ctx.translate(x, y);
        ctx.beginPath();
        ctx.arc(0, 0, 2.1 * pulse, 0, Math.PI * 2);
        ctx.fillStyle = "rgba(185, 252, 255, 0.62)";
        ctx.fill();
        ctx.beginPath();
        ctx.arc(0, 0, 6.5 * pulse, 0, Math.PI * 2);
        ctx.strokeStyle = "rgba(88, 238, 242, 0.2)";
        ctx.lineWidth = 1;
        ctx.stroke();
        ctx.restore();
      });
    }

    motes.forEach((mote) => {
      const alpha = clamp(mote.life / 0.55, 0, 1);
      const radius = RADIUS * mote.radiusNorm;
      const x = Math.cos(mote.angle) * radius;
      const y = Math.sin(mote.angle) * radius;
      const pulse = 1 + Math.sin(time * 0.004 + mote.seed) * 0.13;

      ctx.save();
      ctx.translate(x, y);
      ctx.globalAlpha = alpha;

      if (mote.type === "light") {
        const halo = ctx.createRadialGradient(0, 0, 0, 0, 0, 15 * pulse);
        halo.addColorStop(0, "rgba(235, 255, 255, 0.55)");
        halo.addColorStop(0.42, "rgba(88, 238, 242, 0.24)");
        halo.addColorStop(1, "rgba(88, 238, 242, 0)");
        ctx.beginPath();
        ctx.arc(0, 0, 15 * pulse, 0, Math.PI * 2);
        ctx.fillStyle = halo;
        ctx.fill();
        ctx.beginPath();
        ctx.arc(0, 0, 2.5, 0, Math.PI * 2);
        ctx.fillStyle = "rgba(247, 255, 224, 0.94)";
        ctx.fill();
        ctx.beginPath();
        ctx.arc(0, 0, 6 * pulse, 0, Math.PI * 2);
        ctx.strokeStyle = "rgba(88, 238, 242, 0.52)";
        ctx.lineWidth = 1;
        ctx.stroke();
      } else {
        ctx.save();
        ctx.rotate(Math.PI / 4);
        ctx.fillStyle = "rgba(201, 152, 121, 0.92)";
        ctx.fillRect(-2.2, -2.2, 4.4, 4.4);
        ctx.restore();
        ctx.beginPath();
        ctx.arc(0, 0, 7.5 * pulse, 0, Math.PI * 2);
        ctx.strokeStyle = "rgba(201, 152, 121, 0.34)";
        ctx.lineWidth = 1;
        ctx.stroke();
      }
      ctx.restore();
    });

    // Collection ripples
    flashes.forEach((flash) => {
      const progress = 1 - flash.life / flash.maxLife;
      const radius = RADIUS * flash.radiusNorm;
      const x = Math.cos(flash.angle) * radius;
      const y = Math.sin(flash.angle) * radius;
      ctx.beginPath();
      ctx.arc(x, y, 4 + progress * 26, 0, Math.PI * 2);
      ctx.strokeStyle =
        flash.type === "noise"
          ? `rgba(201, 152, 121, ${(1 - progress) * 0.55})`
          : `rgba(88, 238, 242, ${(1 - progress) * 0.62})`;
      ctx.lineWidth = 1;
      ctx.stroke();
    });

    floaters.forEach((floater) => {
      const alpha = clamp(floater.life / floater.maxLife, 0, 1);
      ctx.save();
      ctx.globalAlpha = alpha;
      ctx.font = '500 11px "Noto Sans SC", "PingFang SC", sans-serif';
      ctx.textAlign = "center";
      ctx.textBaseline = "middle";
      ctx.fillStyle =
        floater.type === "noise" ? "rgba(201, 152, 121, 0.9)" : "rgba(185, 252, 255, 0.92)";
      ctx.fillText(floater.text, floater.x, floater.y - (1 - alpha) * 20);
      ctx.restore();
    });

    // Particles
    particles.forEach((particle) => {
      const alpha = clamp(particle.life / particle.maxLife, 0, 1);
      const x = Math.cos(particle.angle) * particle.radius;
      const y = Math.sin(particle.angle) * particle.radius;
      ctx.beginPath();
      ctx.arc(x, y, particle.size * alpha, 0, Math.PI * 2);
      ctx.fillStyle =
        particle.tone === "cream"
          ? `rgba(242, 239, 231, ${alpha * 0.62})`
          : particle.tone === "clay"
            ? `rgba(201, 152, 121, ${alpha * 0.6})`
          : `rgba(88, 238, 242, ${alpha * 0.72})`;
      ctx.fill();
    });

    ctx.restore();
  }

  /* ---------------------------------------------------------
     Core game
     --------------------------------------------------------- */

  function currentCycleElapsed() {
    let elapsed = 0;
    for (let i = 0; i < state.phaseIndex; i += 1) elapsed += PHASES[i].duration;
    return elapsed + state.phaseTime;
  }

  function animatePhaseLabel() {
    phaseEl.classList.add("is-changing");
    window.setTimeout(() => phaseEl.classList.remove("is-changing"), 80);
  }

  function updatePhaseUI(phase, announce = false) {
    phaseEl.textContent = phase.label;
    instructionEl.textContent = phase.instruction;
    countEl.textContent = phase.duration.toFixed(1);
    const holding = phase.hold;
    hintHold.classList.toggle("is-active", state.started && holding);
    hintRelease.classList.toggle("is-active", state.started && !holding);
    animatePhaseLabel();
    if (announce && soundOn) chime(phase.tone, 0.9, 0.036);
    emitBurst(RADIUS * state.target, phase.key === "inhale" ? 22 : 14, phase.key === "inhale" ? "lime" : "cream");
  }

  function enterPhase(index, announce = true) {
    state.phaseIndex = index;
    state.phaseTime = 0;
    const phase = PHASES[index];
    state.target = phase.from;
    updatePhaseUI(phase, announce);
  }

  function updateCycleUI() {
    const cycleLabel = `${pad(state.cycle)} / ${pad(CYCLES)}`;
    cycleEl.textContent = cycleLabel;
    cycleSmallEl.textContent = cycleLabel;
  }

  function startSession() {
    if (state.started || state.finished) return;
    state.started = true;
    state.running = true;
    state.hold = true;
    state.cycle = 1;
    state.player = MIN_SCALE;
    state.target = MIN_SCALE;
    state.phaseIndex = 0;
    state.phaseTime = 0;
    state.resonance = 0;
    state.alignSum = 0;
    state.alignTime = 0;
    state.samples = [];
    state.sampleClock = 0;
    state.elapsed = 0;
    state.sparkClock = 0;
    state.light = 0;
    state.noise = 0;
    state.combo = 0;
    state.maxCombo = 0;
    state.lastLightAt = -10;
    state.spawnClock = 0.7;
    state.spawned = 0;
    motes.length = 0;
    flashes.length = 0;
    floaters.length = 0;
    lightEl.textContent = "00";
    lightDots.forEach((dot) => dot.classList.remove("is-lit"));
    comboEl.classList.remove("is-active", "is-noise");
    updateCycleUI();
    enterPhase(0, true);
    if (soundOn) chime(261.63, 1.1, 0.04);
  }

  function update(dt) {
    const phase = PHASES[state.phaseIndex];
    state.phaseTime += dt;
    state.elapsed += dt;

    const t = clamp(state.phaseTime / phase.duration, 0, 1);
    state.target = phase.from + (phase.to - phase.from) * t;

    if (state.hold) {
      state.player = Math.min(MAX_SCALE, state.player + HOLD_RATE * dt);
    } else {
      state.player = Math.max(MIN_SCALE, state.player - RELEASE_RATE * dt);
    }

    const diff = Math.abs(state.player - state.target);
    const align = clamp(1 - diff / 0.18, 0, 1);
    state.resonance += (align - state.resonance) * Math.min(1, dt * 2.2);
    state.alignSum += align * dt;
    state.alignTime += dt;
    state.sampleClock += dt;
    state.sparkClock += dt;

    if (state.sampleClock >= 0.22) {
      state.samples.push(align);
      state.sampleClock = 0;
    }

    if (state.hold && align > 0.86 && state.sparkClock > 0.11) {
      emitBurst(RADIUS * state.target, 2, "lime");
      state.sparkClock = 0;
    }

    state.spawnClock -= dt;
    if (state.spawned < TOTAL_SPAWNS && state.spawnClock <= 0) {
      spawnMote();
      state.spawnClock += 1.5;
    }
    updateMotes(dt);

    const remaining = Math.max(0, phase.duration - state.phaseTime);
    countEl.textContent = remaining.toFixed(1);

    const resonanceValue = Math.round(state.resonance * 100);
    if (resonanceEl.firstChild) resonanceEl.firstChild.nodeValue = String(resonanceValue);
    resonanceBar.style.width = `${resonanceValue}%`;

    const progress = clamp(
      ((state.cycle - 1) * CYCLE_DURATION + currentCycleElapsed()) / TOTAL_DURATION,
      0,
      1
    );
    progressEl.style.width = `${progress * 100}%`;

    if (state.phaseTime >= phase.duration) {
      if (state.phaseIndex < PHASES.length - 1) {
        state.phaseTime = 0;
        enterPhase(state.phaseIndex + 1, true);
      } else if (state.cycle < CYCLES) {
        state.cycle += 1;
        state.phaseTime = 0;
        updateCycleUI();
        enterPhase(0, true);
        emitBurst(RADIUS * state.target, 34, "lime");
      } else {
        finishSession();
      }
    }
  }

  function finishSession() {
    state.running = false;
    state.finished = true;
    state.phaseTime = 0;
    state.hold = false;
    hintHold.classList.remove("is-active");
    hintRelease.classList.remove("is-active");
    comboEl.classList.remove("is-active", "is-noise");
    progressEl.style.width = "100%";

    const average = state.alignTime > 0 ? state.alignSum / state.alignTime : 0;
    const score = clamp(Math.round(average * 100), 0, 99);
    resultScore.textContent = String(score);
    resultTime.textContent = String(Math.max(1, Math.round(state.elapsed)));
    resultLight.textContent = String(state.light);
    resultCombo.textContent = String(state.maxCombo);
    const noiseNote = state.noise ? ` 也放下了 ${state.noise} 个杂念。` : "";

    if (state.light >= LIGHT_GOAL && score >= 80) {
      resultLede.textContent = `你拾起了 ${state.light} 个光点，也跟上了三次呼吸。把这份明亮的节奏带回今天。${noiseNote}`;
    } else if (state.light >= LIGHT_GOAL) {
      resultLede.textContent = `你拾起了 ${state.light} 个光点。哪怕节奏偶尔走远，你仍然回来了。${noiseNote}`;
    } else {
      resultLede.textContent = `你拾起了 ${state.light} 个光点。光不需要一次拾完，回来就好。${noiseNote}`;
    }

    buildSparkline();
    result.classList.add("is-visible");
    result.setAttribute("aria-hidden", "false");
    finishTone();
    emitBurst(RADIUS * state.target, 46, "lime");
  }

  function buildSparkline() {
    const values = state.samples.length > 2 ? state.samples.slice() : [0, 0.2, 0.4, 0.35, 0.6, 0.55, 0.7];
    const desired = Math.min(40, values.length);
    const picked = [];
    for (let i = 0; i < desired; i += 1) {
      const index = Math.round((i / Math.max(desired - 1, 1)) * (values.length - 1));
      picked.push(values[index]);
    }
    const points = picked.map((value, index) => {
      const x = (index / Math.max(picked.length - 1, 1)) * 500;
      const y = 64 - clamp(value, 0, 1) * 52;
      return `${x.toFixed(1)},${y.toFixed(1)}`;
    });
    sparkPath.setAttribute("d", `M${points.join(" L")}`);
    sparkPath.style.strokeDasharray = "900";
    sparkPath.style.strokeDashoffset = "900";
  }

  function resetGame() {
    state.started = false;
    state.running = false;
    state.finished = false;
    state.hold = false;
    state.cycle = 1;
    state.phaseIndex = 0;
    state.phaseTime = 0;
    state.target = MIN_SCALE;
    state.player = MIN_SCALE;
    state.resonance = 0;
    state.alignSum = 0;
    state.alignTime = 0;
    state.samples = [];
    state.sampleClock = 0;
    state.elapsed = 0;
    state.sparkClock = 0;
    state.light = 0;
    state.noise = 0;
    state.combo = 0;
    state.maxCombo = 0;
    state.lastLightAt = -10;
    state.spawnClock = 0.7;
    state.spawned = 0;
    state.activePointer = null;
    particles.length = 0;
    motes.length = 0;
    flashes.length = 0;
    floaters.length = 0;
    window.clearTimeout(comboTimeout);
    phaseEl.textContent = "准备好了吗";
    countEl.textContent = "按住开始";
    instructionEl.textContent = "按住任意处，开始第一次吸气。让圆环经过光点。";
    hintHold.classList.remove("is-active");
    hintRelease.classList.remove("is-active");
    lightEl.textContent = "00";
    lightDots.forEach((dot) => dot.classList.remove("is-lit"));
    comboEl.classList.remove("is-active", "is-noise");
    resultLight.textContent = "00";
    resultCombo.textContent = "0";
    cycleEl.textContent = `01 / ${pad(CYCLES)}`;
    cycleSmallEl.textContent = `01 / ${pad(CYCLES)}`;
    progressEl.style.width = "0%";
    resonanceBar.style.width = "0%";
    if (resonanceEl.firstChild) resonanceEl.firstChild.nodeValue = "00";
    result.classList.remove("is-visible");
    result.setAttribute("aria-hidden", "true");
    sparkPath.setAttribute("d", "");
  }

  /* ---------------------------------------------------------
     Open / close
     --------------------------------------------------------- */

  function openGame() {
    if (state.open) return;
    lastFocused = document.activeElement;
    resetGame();
    game.classList.add("is-open");
    game.setAttribute("aria-hidden", "false");
    [landing, siteHead].forEach((element) => element?.setAttribute("inert", ""));
    document.body.classList.add("is-locked");
    state.open = true;
    state.lastTs = 0;
    window.setTimeout(() => {
      resizeCanvas();
      stage.focus({ preventScroll: true });
    }, 50);
    cancelAnimationFrame(state.raf);
    state.raf = requestAnimationFrame(loop);
  }

  function closeGame() {
    if (!state.open) return;
    state.open = false;
    state.running = false;
    state.hold = false;
    cancelAnimationFrame(state.raf);
    game.classList.remove("is-open");
    game.setAttribute("aria-hidden", "true");
    [landing, siteHead].forEach((element) => element?.removeAttribute("inert"));
    document.body.classList.remove("is-locked");
    if (lastFocused && typeof lastFocused.focus === "function") {
      lastFocused.focus({ preventScroll: true });
    }
  }

  function loop(timestamp) {
    if (!state.open) return;
    if (!state.lastTs) state.lastTs = timestamp;
    const dt = Math.min((timestamp - state.lastTs) / 1000, 0.05);
    state.lastTs = timestamp;

    if (state.running) update(dt);
    updateParticles(dt);
    render(timestamp);
    state.raf = requestAnimationFrame(loop);
  }

  /* ---------------------------------------------------------
     Input
     --------------------------------------------------------- */

  function startHolding() {
    if (!state.open || state.finished) return;
    if (!state.started) startSession();
    state.hold = true;
  }

  function stopHolding() {
    state.hold = false;
  }

  $$("[data-open-game]").forEach((button) => {
    button.addEventListener("click", openGame);
  });

  $$("[data-close-game]").forEach((button) => {
    button.addEventListener("click", closeGame);
  });

  $("[data-replay]").addEventListener("click", () => {
    resetGame();
    stage.focus({ preventScroll: true });
  });

  stage.addEventListener("pointerdown", (event) => {
    if (!state.open) return;
    event.preventDefault();
    state.activePointer = event.pointerId;
    try {
      if (stage.setPointerCapture) stage.setPointerCapture(event.pointerId);
    } catch (error) {
      // Synthetic pointer events may not be capturable; the global pointerup still releases.
    }
    startHolding();
  });

  stage.addEventListener("contextmenu", (event) => {
    event.preventDefault();
  });

  window.addEventListener("pointerup", (event) => {
    if (state.activePointer !== null && event.pointerId !== state.activePointer) return;
    state.activePointer = null;
    stopHolding();
  });

  window.addEventListener("pointercancel", () => {
    state.activePointer = null;
    stopHolding();
  });

  document.addEventListener("keydown", (event) => {
    if (event.code === "Escape" && state.open) {
      closeGame();
      return;
    }

    if (!state.open || state.finished) return;
    if (event.code !== "Space" || event.repeat) return;
    const tag = document.activeElement?.tagName;
    if (tag === "BUTTON" || tag === "A" || tag === "INPUT" || tag === "TEXTAREA") return;
    event.preventDefault();
    startHolding();
  });

  document.addEventListener("keyup", (event) => {
    if (event.code === "Space") stopHolding();
  });

  window.addEventListener("resize", () => {
    if (state.open) resizeCanvas();
  });

  document.addEventListener("visibilitychange", () => {
    if (document.hidden) stopHolding();
  });
})();
