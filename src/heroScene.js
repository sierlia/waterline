import { clamp, dpr, easeInOutCubic, lerp, mapRange } from './utils.js';

const DEBRIS_DEFINITIONS = [
  {
    kind: 'bottle',
    x: 0.22,
    y: 0.06,
    size: 1.15,
    rotation: -0.48,
    hue: 205,
    reflectivity: 0.95,
    speed: 0.8,
  },
  {
    kind: 'can',
    x: 0.58,
    y: -0.02,
    size: 0.96,
    rotation: 0.28,
    hue: 214,
    reflectivity: 1,
    speed: 0.95,
  },
  {
    kind: 'bag',
    x: 0.77,
    y: -0.06,
    size: 1,
    rotation: -0.2,
    hue: 195,
    reflectivity: 0.78,
    speed: 1.1,
  },
  {
    kind: 'net',
    x: 0.44,
    y: 0.1,
    size: 0.92,
    rotation: 0.12,
    hue: 192,
    reflectivity: 0.56,
    speed: 1.25,
  },
  {
    kind: 'cap',
    x: 0.68,
    y: 0.11,
    size: 0.6,
    rotation: 0.08,
    hue: 215,
    reflectivity: 0.9,
    speed: 1.3,
  },
];

const canUseCanvas = () => {
  try {
    const canvas = document.createElement('canvas');
    return !!canvas.getContext('2d');
  } catch {
    return false;
  }
};

export class HeroScene {
  constructor({ canvas, hero, underwaterCopy, reducedMotion }) {
    this.canvas = canvas;
    this.hero = hero;
    this.underwaterCopy = underwaterCopy;
    this.reducedMotion = reducedMotion;
    this.ctx = canvas.getContext('2d');
    this.active = canUseCanvas() && !!this.ctx;
    this.time = 0;
    this.scrollTarget = 0;
    this.scrollCurrent = 0;
    this.viewport = { width: 0, height: 0, dpr: 1 };
    this.debris = [];
    this.raf = 0;

    if (!this.active) {
      document.documentElement.classList.add('no-canvas');
      return;
    }

    this.setupDebris();
    this.resize = this.resize.bind(this);
    this.tick = this.tick.bind(this);
    this.resize();
    window.addEventListener('resize', this.resize, { passive: true });
    this.raf = requestAnimationFrame(this.tick);
  }

  setupDebris() {
    const compact = window.innerWidth < 720;
    const maxDebris = compact ? 3 : window.innerWidth < 1024 ? 4 : 5;
    this.debris = DEBRIS_DEFINITIONS.slice(0, maxDebris).map((item, index) => ({
      ...item,
      phase: 1.3 + index * 0.73,
      drift: 18 + index * 8,
      tilt: (index % 2 === 0 ? 1 : -1) * (0.06 + index * 0.013),
    }));
  }

  resize() {
    this.viewport.width = window.innerWidth;
    this.viewport.height = window.innerHeight;
    this.viewport.dpr = dpr(window.innerWidth < 720 ? 1.5 : 2);
    this.canvas.width = Math.round(this.viewport.width * this.viewport.dpr);
    this.canvas.height = Math.round(this.viewport.height * this.viewport.dpr);
    this.canvas.style.width = `${this.viewport.width}px`;
    this.canvas.style.height = `${this.viewport.height}px`;
    this.ctx.setTransform(this.viewport.dpr, 0, 0, this.viewport.dpr, 0, 0);
    this.setupDebris();
  }

  setScrollProgress(progress) {
    this.scrollTarget = clamp(progress, 0, 1);
  }

  getState() {
    const progress = this.reducedMotion ? this.scrollTarget : lerp(this.scrollCurrent, this.scrollTarget, 0.08);
    this.scrollCurrent = progress;

    const bend = easeInOutCubic(progress);
    const waterlineBase = this.viewport.height * mapRange(this.viewport.width, 360, 1600, 0.56, 0.47);
    const waterlineY = waterlineBase + bend * this.viewport.height * 0.1;
    const amplitude = this.viewport.height * (this.reducedMotion ? 0.012 : 0.02 + bend * 0.05);
    const arch = this.viewport.height * bend * 0.18;
    const ripple = this.reducedMotion ? 0.4 : 1;

    return { progress, bend, waterlineY, amplitude, arch, ripple };
  }

  applyCssState(state) {
    const root = document.documentElement;
    root.style.setProperty('--waterline', `${state.waterlineY}px`);
    root.style.setProperty('--water-bend', `${state.arch}px`);
    root.style.setProperty('--water-offset', `${state.progress * 10}px`);
    root.style.setProperty('--water-intensity', `${1 + state.progress * 1.7}`);
    root.style.setProperty('--copy-shift-x', `${Math.sin(this.time * 0.7) * (5 + state.progress * 11)}px`);
    root.style.setProperty('--copy-shift-y', `${6 + Math.cos(this.time * 0.8) * (4 + state.progress * 14)}px`);
    root.style.setProperty('--copy-blur', `${state.progress * 0.4}px`);
    root.style.setProperty('--hero-progress', state.progress.toFixed(4));

    const turbulence = document.getElementById('underwater-turbulence');
    if (turbulence) {
      const xFreq = 0.006 + state.progress * 0.0035;
      const yFreq = 0.028 + state.progress * 0.013;
      turbulence.setAttribute('baseFrequency', `${xFreq.toFixed(4)} ${yFreq.toFixed(4)}`);
    }
  }

  sampleWaterY(x, state) {
    const normalized = x / this.viewport.width;
    const centerDistance = (normalized - 0.5) * 2;
    const arch = state.arch * centerDistance * centerDistance;
    const waveA = Math.sin(normalized * 8.5 + this.time * 1.4) * state.amplitude;
    const waveB = Math.sin(normalized * 17 - this.time * 1.1) * state.amplitude * 0.38;
    const waveC = Math.cos(normalized * 4.2 + this.time * 0.8) * state.amplitude * 0.5;
    return state.waterlineY + arch + (waveA + waveB + waveC) * state.ripple;
  }

  drawBackgroundGlow(state) {
    const { ctx } = this;
    const gradient = ctx.createLinearGradient(0, 0, 0, this.viewport.height);
    gradient.addColorStop(0, 'rgba(14, 28, 48, 0)');
    gradient.addColorStop(0.44, 'rgba(23, 44, 69, 0.08)');
    gradient.addColorStop(1, 'rgba(3, 9, 16, 0.55)');
    ctx.fillStyle = gradient;
    ctx.fillRect(0, 0, this.viewport.width, this.viewport.height);

    const haze = ctx.createRadialGradient(
      this.viewport.width * 0.45,
      state.waterlineY + state.arch * 0.15,
      0,
      this.viewport.width * 0.45,
      state.waterlineY + state.arch * 0.15,
      this.viewport.width * 0.42,
    );
    haze.addColorStop(0, 'rgba(162, 196, 225, 0.11)');
    haze.addColorStop(1, 'rgba(162, 196, 225, 0)');
    ctx.fillStyle = haze;
    ctx.fillRect(0, 0, this.viewport.width, this.viewport.height);
  }

  drawWater(state) {
    const { ctx } = this;
    const topY = [];

    ctx.save();
    ctx.beginPath();
    ctx.moveTo(0, this.viewport.height);

    for (let x = 0; x <= this.viewport.width + 8; x += 8) {
      const y = this.sampleWaterY(x, state);
      topY.push([x, y]);
      ctx.lineTo(x, y);
    }

    ctx.lineTo(this.viewport.width, this.viewport.height);
    ctx.closePath();

    const waterGradient = ctx.createLinearGradient(0, state.waterlineY - 40, 0, this.viewport.height);
    waterGradient.addColorStop(0, 'rgba(161, 193, 220, 0.14)');
    waterGradient.addColorStop(0.08, 'rgba(93, 126, 158, 0.2)');
    waterGradient.addColorStop(0.25, 'rgba(29, 54, 79, 0.78)');
    waterGradient.addColorStop(0.7, 'rgba(8, 18, 30, 0.97)');
    waterGradient.addColorStop(1, 'rgba(3, 7, 13, 1)');
    ctx.fillStyle = waterGradient;
    ctx.fill();
    ctx.restore();

    ctx.save();
    ctx.globalCompositeOperation = 'screen';
    ctx.strokeStyle = `rgba(223, 236, 255, ${0.18 + state.progress * 0.24})`;
    ctx.lineWidth = 1.35;
    ctx.beginPath();
    topY.forEach(([x, y], index) => {
      if (index === 0) ctx.moveTo(x, y);
      else ctx.lineTo(x, y);
    });
    ctx.stroke();
    ctx.restore();

    const lines = this.viewport.width < 720 ? 24 : 34;
    for (let index = 0; index < lines; index += 1) {
      const depth = index / lines;
      const y = state.waterlineY + depth * (this.viewport.height - state.waterlineY);
      const lineAmp = (1 - depth) * state.amplitude * 1.55 + 2;
      ctx.beginPath();
      for (let x = 0; x <= this.viewport.width + 8; x += 8) {
        const nx = x / this.viewport.width;
        const wave =
          Math.sin(nx * (8 + depth * 5) + this.time * (1.8 - depth * 0.6) + index * 0.22) * lineAmp +
          Math.sin(nx * (18 + depth * 2) - this.time * 0.8 + index * 0.35) * lineAmp * 0.34;
        const arc = state.arch * (nx - 0.5) * (nx - 0.5) * (1 - depth * 0.45);
        const yy = y + wave + arc + depth * depth * 12;
        if (x === 0) ctx.moveTo(x, yy);
        else ctx.lineTo(x, yy);
      }
      ctx.strokeStyle = `rgba(214, 233, 255, ${0.06 + (1 - depth) * 0.11})`;
      ctx.lineWidth = 1;
      ctx.stroke();
    }

    ctx.save();
    ctx.globalCompositeOperation = 'screen';
    const sheen = ctx.createLinearGradient(0, state.waterlineY - 14, 0, state.waterlineY + 70 + state.arch * 0.4);
    sheen.addColorStop(0, 'rgba(255,255,255,0.22)');
    sheen.addColorStop(0.14, 'rgba(227,241,255,0.1)');
    sheen.addColorStop(1, 'rgba(255,255,255,0)');
    ctx.fillStyle = sheen;
    ctx.fillRect(0, state.waterlineY - 14, this.viewport.width, 120 + state.arch * 0.4);
    ctx.restore();
  }

  drawReflectionShape(x, y, width, height, rotation, alpha = 0.2) {
    const { ctx } = this;
    ctx.save();
    ctx.translate(x, y);
    ctx.scale(1, -1);
    ctx.rotate(rotation * 0.9);
    ctx.globalAlpha = alpha;
    const gradient = ctx.createLinearGradient(0, -height * 0.6, 0, height * 0.7);
    gradient.addColorStop(0, 'rgba(255,255,255,0.35)');
    gradient.addColorStop(0.45, 'rgba(190, 221, 255, 0.11)');
    gradient.addColorStop(1, 'rgba(20, 35, 55, 0)');
    ctx.fillStyle = gradient;
    ctx.beginPath();
    ctx.roundRect(-width * 0.4, -height * 0.18, width * 0.8, height * 0.36, 80);
    ctx.fill();
    ctx.restore();
  }

  drawDebrisItem(item, state) {
    const { ctx } = this;
    const sizeBase = Math.min(this.viewport.width, this.viewport.height) * 0.11 * item.size;
    const x = item.x * this.viewport.width + Math.sin(this.time * item.speed + item.phase) * item.drift;
    const waterY = this.sampleWaterY(x, state);
    const bob = Math.sin(this.time * (1.1 + item.speed * 0.2) + item.phase) * (8 + state.progress * 12);
    const y = waterY + item.y * this.viewport.height + bob;
    const rotation = item.rotation + Math.sin(this.time * 0.45 + item.phase) * item.tilt + state.progress * item.tilt * 1.8;
    const lift = clamp(1 - (y - waterY) / 140, 0, 1);

    ctx.save();
    ctx.translate(x, y);
    ctx.rotate(rotation);
    ctx.shadowColor = 'rgba(0,0,0,0.28)';
    ctx.shadowBlur = 24;
    ctx.shadowOffsetY = 10;

    if (item.kind === 'bottle') this.drawBottle(sizeBase, item, lift);
    if (item.kind === 'can') this.drawCan(sizeBase, item, lift);
    if (item.kind === 'bag') this.drawBag(sizeBase, item, lift);
    if (item.kind === 'net') this.drawNet(sizeBase, item, lift);
    if (item.kind === 'cap') this.drawCap(sizeBase, item, lift);

    ctx.restore();

    const reflectionDepth = mapRange(y, waterY - 20, waterY + 160, 0.22, 0.04);
    this.drawReflectionShape(x, waterY + (waterY - y) + 18, sizeBase, sizeBase * 0.9, rotation, reflectionDepth);
  }

  drawBottle(size, item, lift) {
    const { ctx } = this;
    const bodyW = size * 0.88;
    const bodyH = size * 0.3;
    const neckW = bodyW * 0.22;
    const neckH = bodyH * 0.55;
    const glass = ctx.createLinearGradient(-bodyW / 2, -bodyH / 2, bodyW / 2, bodyH / 2);
    glass.addColorStop(0, `hsla(${item.hue}, 32%, 82%, 0.84)`);
    glass.addColorStop(0.48, 'rgba(28, 47, 72, 0.82)');
    glass.addColorStop(0.78, `hsla(${item.hue + 10}, 48%, 92%, 0.92)`);
    glass.addColorStop(1, 'rgba(175, 212, 246, 0.52)');
    ctx.fillStyle = glass;
    ctx.beginPath();
    ctx.roundRect(-bodyW / 2, -bodyH / 2, bodyW, bodyH, bodyH / 2.2);
    ctx.fill();
    ctx.fillRect(bodyW * 0.24, -neckH / 2, neckW, neckH);
    ctx.beginPath();
    ctx.roundRect(bodyW * 0.42, -neckH * 0.28, neckW * 0.55, neckH * 0.56, neckW * 0.22);
    ctx.fill();
    ctx.strokeStyle = `rgba(243, 250, 255, ${0.52 + lift * 0.18})`;
    ctx.lineWidth = 1.5;
    ctx.beginPath();
    ctx.moveTo(-bodyW * 0.18, -bodyH * 0.34);
    ctx.lineTo(bodyW * 0.23, bodyH * 0.3);
    ctx.stroke();
  }

  drawCan(size, item, lift) {
    const { ctx } = this;
    const width = size * 0.52;
    const height = size * 0.78;
    const metal = ctx.createLinearGradient(-width / 2, 0, width / 2, 0);
    metal.addColorStop(0, 'rgba(77, 94, 114, 0.9)');
    metal.addColorStop(0.2, 'rgba(214,225,234,0.95)');
    metal.addColorStop(0.45, `hsla(${item.hue}, 24%, 38%, 0.9)`);
    metal.addColorStop(0.72, 'rgba(239,245,251,0.94)');
    metal.addColorStop(1, 'rgba(75, 85, 100, 0.88)');
    ctx.fillStyle = metal;
    ctx.beginPath();
    ctx.roundRect(-width / 2, -height / 2, width, height, width / 2);
    ctx.fill();
    ctx.strokeStyle = `rgba(255,255,255,${0.3 + lift * 0.24})`;
    ctx.lineWidth = 1.2;
    ctx.beginPath();
    ctx.arc(0, -height * 0.37, width * 0.44, 0, Math.PI * 2);
    ctx.moveTo(-width * 0.45, height * 0.16);
    ctx.lineTo(width * 0.45, height * 0.16);
    ctx.stroke();
  }

  drawBag(size, item, lift) {
    const { ctx } = this;
    const width = size * 0.72;
    const height = size * 0.9;
    const fabric = ctx.createLinearGradient(-width / 2, -height / 2, width / 2, height / 2);
    fabric.addColorStop(0, 'rgba(188, 212, 227, 0.16)');
    fabric.addColorStop(0.4, `hsla(${item.hue}, 26%, 59%, 0.2)`);
    fabric.addColorStop(1, 'rgba(227, 239, 248, 0.1)');
    ctx.fillStyle = fabric;
    ctx.strokeStyle = `rgba(225,239,250,${0.2 + lift * 0.18})`;
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(-width * 0.36, -height * 0.28);
    ctx.bezierCurveTo(-width * 0.52, -height * 0.52, width * 0.24, -height * 0.56, width * 0.38, -height * 0.18);
    ctx.bezierCurveTo(width * 0.48, height * 0.08, width * 0.34, height * 0.44, -width * 0.1, height * 0.4);
    ctx.bezierCurveTo(-width * 0.42, height * 0.36, -width * 0.54, 0, -width * 0.36, -height * 0.28);
    ctx.closePath();
    ctx.fill();
    ctx.stroke();
  }

  drawNet(size, item, lift) {
    const { ctx } = this;
    const width = size * 0.84;
    const height = size * 0.52;
    ctx.strokeStyle = `rgba(173, 201, 218, ${0.22 + lift * 0.12})`;
    ctx.lineWidth = 1;
    for (let ix = -3; ix <= 3; ix += 1) {
      ctx.beginPath();
      ctx.moveTo((ix / 3) * width * 0.5, -height / 2);
      ctx.lineTo((ix / 3) * width * 0.45, height / 2);
      ctx.stroke();
    }
    for (let iy = -2; iy <= 2; iy += 1) {
      ctx.beginPath();
      ctx.moveTo(-width / 2, (iy / 2) * height * 0.5);
      ctx.lineTo(width / 2, (iy / 2) * height * 0.45);
      ctx.stroke();
    }
    ctx.fillStyle = 'rgba(170, 198, 214, 0.08)';
    ctx.fillRect(-width / 2, -height / 2, width, height);
  }

  drawCap(size, item, lift) {
    const { ctx } = this;
    const radius = size * 0.18;
    const cap = ctx.createRadialGradient(-radius * 0.3, -radius * 0.5, 0, 0, 0, radius * 1.5);
    cap.addColorStop(0, 'rgba(244,248,252,0.95)');
    cap.addColorStop(0.45, `hsla(${item.hue}, 26%, 46%, 0.94)`);
    cap.addColorStop(1, 'rgba(52, 66, 83, 0.92)');
    ctx.fillStyle = cap;
    ctx.beginPath();
    ctx.arc(0, 0, radius, 0, Math.PI * 2);
    ctx.fill();
    ctx.strokeStyle = `rgba(255,255,255,${0.24 + lift * 0.16})`;
    ctx.stroke();
  }

  drawParticles(state) {
    const { ctx } = this;
    const count = this.viewport.width < 720 ? 14 : 24;
    for (let index = 0; index < count; index += 1) {
      const nx = (index * 0.61803398875) % 1;
      const x = nx * this.viewport.width;
      const waterY = this.sampleWaterY(x, state);
      const y = waterY + 60 + ((index * 57) % 320) + Math.sin(this.time + index) * 12;
      const radius = 0.9 + (index % 4) * 0.55;
      ctx.fillStyle = `rgba(222, 232, 245, ${0.03 + (index % 5) * 0.012})`;
      ctx.beginPath();
      ctx.arc(x, y, radius, 0, Math.PI * 2);
      ctx.fill();
    }
  }

  tick(frame) {
    if (!this.active) return;
    this.time = frame * 0.001;
    const state = this.getState();
    this.applyCssState(state);

    this.ctx.clearRect(0, 0, this.viewport.width, this.viewport.height);
    this.drawBackgroundGlow(state);
    this.debris.forEach((item) => this.drawDebrisItem(item, state));
    this.drawWater(state);
    this.drawParticles(state);

    this.raf = requestAnimationFrame(this.tick);
  }

  destroy() {
    cancelAnimationFrame(this.raf);
    window.removeEventListener('resize', this.resize);
  }
}
