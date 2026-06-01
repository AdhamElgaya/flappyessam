const canvas = document.getElementById("game");
if (!canvas) {
  throw new Error("Canvas #game not found");
}
const ctx = canvas.getContext("2d");

const GH = 540;
const REF_GW = 960;
const BIRD_SPRITE_SRCS = ["essam-sprite.png", "essam.png"];

let GW = REF_GW;

const PHYS = {
  gravity: 0.11,
  flapVy: -4.2,
  maxFallVy: 3.2,
  pipeSpeed: 1.05,
  pipeGap: 175,
  pipeWidth: 50,
  pipeSpawn: 135,
  birdHeight: 50,
  groundH: 70,
  birdMargin: 14,
  rotFactor: 0.03,
};

let W = 0;
let H = 0;
let viewScale = 1;
let viewOffsetX = 0;
let viewOffsetY = 0;
let bird, pipes = [], score, best, frame, state;
let birdSprite = null;
let birdAspect = 0.75;

function resize() {
  const prevGW = GW;
  W = Math.max(1, window.innerWidth);
  H = Math.max(1, window.innerHeight);
  canvas.width = W;
  canvas.height = H;
  viewScale = H / GH;
  GW = W / viewScale;
  viewOffsetX = 0;
  viewOffsetY = 0;

  if (bird && prevGW > 0) {
    bird.x = (bird.x / prevGW) * GW;
  }
  if (pipes && pipes.length > 0 && prevGW > 0) {
    for (const p of pipes) {
      p.x = (p.x / prevGW) * GW;
    }
    pipes = pipes.filter((p) => p.x > -PHYS.pipeWidth && p.x < GW + PHYS.pipeWidth * 2);
    normalizePipes();
  }
}

function pipeColumnSpacing() {
  return Math.min(300, Math.max(PHYS.pipeWidth + 120, GW * 0.52));
}

function rightmostPipeX() {
  if (!pipes.length) return -Infinity;
  return Math.max(...pipes.map((p) => p.x));
}

function maybeSpawnPipe() {
  if (rightmostPipeX() >= GW - pipeColumnSpacing()) return;
  spawnPipe();
}

function normalizePipes() {
  if (pipes.length < 2) return;
  pipes.sort((a, b) => a.x - b.x);
  const minGap = pipeColumnSpacing();
  for (let i = 1; i < pipes.length; i++) {
    if (pipes[i].x - pipes[i - 1].x < minGap) {
      pipes[i].x = pipes[i - 1].x + minGap;
    }
  }
}

function withGameCamera(drawFn) {
  ctx.save();
  ctx.setTransform(viewScale, 0, 0, viewScale, 0, 0);
  ctx.beginPath();
  ctx.rect(0, 0, GW, GH);
  ctx.clip();
  drawFn();
  ctx.restore();
}

function loadBirdSprite() {
  const img = new Image();
  let index = 0;

  function tryNext() {
    if (index >= BIRD_SPRITE_SRCS.length) return;
    img.src = new URL(BIRD_SPRITE_SRCS[index], window.location.href).href;
    index += 1;
  }

  img.onload = () => {
    birdAspect = img.width / img.height;
    // Mobile perf: avoid per-pixel filters; just pre-scale once.
    const targetH = Math.max(48, Math.round(PHYS.birdHeight * 1.75));
    const targetW = Math.max(32, Math.round(targetH * birdAspect));
    const off = document.createElement("canvas");
    off.width = targetW;
    off.height = targetH;
    const octx = off.getContext("2d");
    octx.imageSmoothingEnabled = true;
    octx.drawImage(img, 0, 0, targetW, targetH);
    birdSprite = off;
  };

  img.onerror = tryNext;
  tryNext();
}

loadBirdSprite();

function birdWidth() {
  return PHYS.birdHeight * birdAspect;
}

function birdBounds() {
  const w = birdWidth();
  const h = PHYS.birdHeight;
  const margin = PHYS.birdMargin;
  return {
    bx: bird.x - w / 2 + margin,
    by: bird.y - h / 2 + margin,
    bw: w - margin * 2,
    bh: h - margin * 2,
    halfH: h / 2,
  };
}

function reset() {
  bird = {
    x: GW * 0.18,
    y: GH / 2,
    vy: 0,
    rot: 0,
  };
  pipes = [];
  score = 0;
  frame = 0;
  state = "ready";
}

function spawnPipe() {
  const minTop = 50;
  const maxTop = GH - PHYS.groundH - PHYS.pipeGap - minTop;
  const range = Math.max(40, maxTop - minTop);
  const topH = minTop + Math.random() * range;
  pipes.push({
    x: GW + PHYS.pipeWidth,
    top: topH,
    passed: false,
  });
}

function flap() {
  if (state === "ready") {
    state = "play";
  }
  if (state === "play") {
    bird.vy = PHYS.flapVy;
  }
  if (state === "over") {
    reset();
    state = "play";
    bird.vy = PHYS.flapVy;
  }
}

function update() {
  if (state !== "play") return;

  frame++;
  bird.vy += PHYS.gravity;
  if (bird.vy > PHYS.maxFallVy) bird.vy = PHYS.maxFallVy;
  bird.y += bird.vy;
  bird.rot = Math.min(Math.PI / 4, Math.max(-0.3, bird.vy * PHYS.rotFactor));

  maybeSpawnPipe();

  for (const p of pipes) {
    p.x -= PHYS.pipeSpeed;
    if (!p.passed && p.x + PHYS.pipeWidth < bird.x) {
      p.passed = true;
      score++;
    }
  }

  pipes = pipes.filter((p) => p.x + PHYS.pipeWidth > -10);

  const { bx, by, bw, bh, halfH } = birdBounds();

  if (bird.y + halfH >= GH - PHYS.groundH || bird.y - halfH <= 0) {
    gameOver();
    return;
  }

  for (const p of pipes) {
    const hitTop =
      bx + bw > p.x &&
      bx < p.x + PHYS.pipeWidth &&
      by < p.top;
    const hitBottom =
      bx + bw > p.x &&
      bx < p.x + PHYS.pipeWidth &&
      by + bh > p.top + PHYS.pipeGap;
    if (hitTop || hitBottom) {
      gameOver();
      return;
    }
  }
}

function gameOver() {
  state = "over";
  pipes = [];
  if (score > best) {
    best = score;
    try {
      localStorage.setItem("flappyBest", String(best));
    } catch (_) {}
  }
}

function drawSky() {
  const grad = ctx.createLinearGradient(0, 0, 0, GH - PHYS.groundH);
  grad.addColorStop(0, "#4ec0ca");
  grad.addColorStop(1, "#87ceeb");
  ctx.fillStyle = grad;
  ctx.fillRect(0, 0, GW, GH - PHYS.groundH);
}

function drawGround() {
  const y = GH - PHYS.groundH;
  const step = 24;
  const scroll = (frame * 1.1) % step;
  ctx.fillStyle = "#ded895";
  ctx.fillRect(0, y, GW, PHYS.groundH);
  ctx.fillStyle = "#73bf2e";
  ctx.fillRect(0, y, GW, 12);
  ctx.strokeStyle = "#5a9a24";
  ctx.lineWidth = 2;
  for (let x = -scroll; x < GW + step; x += step) {
    if (x + step < 0 || x > GW) continue;
    ctx.beginPath();
    ctx.moveTo(x, y + 12);
    ctx.lineTo(Math.min(x + step, GW), y + 12);
    ctx.stroke();
  }
}

function drawPipe(p) {
  const capH = 26;
  const capOver = 4;

  function pipeBody(x, y, w, h, isTop) {
    ctx.fillStyle = "#73bf2e";
    ctx.fillRect(x, y, w, h);
    ctx.strokeStyle = "#5a9a24";
    ctx.strokeRect(x + 2, y + 2, w - 4, h - 4);
    const capY = isTop ? y + h - capH : y;
    ctx.fillStyle = "#73bf2e";
    ctx.fillRect(x - capOver, capY, w + capOver * 2, capH);
    ctx.strokeRect(x - capOver + 2, capY + 2, w + capOver * 2 - 4, capH - 4);
  }

  pipeBody(p.x, 0, PHYS.pipeWidth, p.top, true);
  const bottomY = p.top + PHYS.pipeGap;
  pipeBody(p.x, bottomY, PHYS.pipeWidth, GH - PHYS.groundH - bottomY, false);
}

function drawBird() {
  ctx.save();
  ctx.translate(bird.x, bird.y);
  ctx.rotate(bird.rot);

  const h = PHYS.birdHeight;
  const w = birdWidth();

  if (birdSprite) {
    ctx.drawImage(birdSprite, -w / 2, -h / 2, w, h);
  } else {
    ctx.fillStyle = "#f7d308";
    ctx.beginPath();
    ctx.ellipse(0, 0, w / 2, h / 2, 0, 0, Math.PI * 2);
    ctx.fill();
  }

  ctx.restore();
}

function drawScore() {
  ctx.fillStyle = "#fff";
  ctx.strokeStyle = "#333";
  ctx.lineWidth = 4;
  ctx.font = "bold 56px monospace";
  ctx.textAlign = "center";
  const text = String(score);
  ctx.strokeText(text, GW / 2, 64);
  ctx.fillText(text, GW / 2, 64);
}

function drawOverlay(title, sub) {
  ctx.fillStyle = "rgba(0,0,0,0.35)";
  ctx.fillRect(0, 0, GW, GH - PHYS.groundH);

  ctx.textAlign = "center";
  ctx.fillStyle = "#fff";
  ctx.strokeStyle = "#e85d04";
  ctx.lineWidth = 5;
  ctx.font = "bold 36px monospace";
  ctx.strokeText(title, GW / 2, GH / 2 - 30);
  ctx.fillText(title, GW / 2, GH / 2 - 30);

  ctx.font = "16px monospace";
  ctx.strokeStyle = "#333";
  ctx.lineWidth = 3;
  ctx.strokeText(sub, GW / 2, GH / 2 + 20);
  ctx.fillText(sub, GW / 2, GH / 2 + 20);

  if (best > 0) {
    ctx.font = "14px monospace";
    ctx.fillStyle = "#fff";
    ctx.fillText(`Best: ${best}`, GW / 2, GH / 2 + 50);
  }
}

function drawHint() {
  ctx.font = "13px sans-serif";
  ctx.fillStyle = "rgba(255,255,255,0.55)";
  ctx.textAlign = "center";
  ctx.fillText("Tap/Click or Space to flap", GW / 2, GH - PHYS.groundH - 18);
}

function draw() {
  ctx.setTransform(1, 0, 0, 1, 0, 0);
  ctx.fillStyle = "#4ec0ca";
  ctx.fillRect(0, 0, W, H);

  withGameCamera(() => {
    drawSky();
    for (const p of pipes) drawPipe(p);
    drawGround();
    drawBird();
    if (state === "play" || state === "over") drawScore();
    drawHint();

    if (state === "ready") {
      drawOverlay("Flappy Essam", "Tap/click or press Space to start");
    } else if (state === "over") {
      drawOverlay("Game Over", "Tap/click or press Space to retry");
    }
  });
}

function loop() {
  update();
  draw();
  requestAnimationFrame(loop);
}

const FLAP_KEYS = new Set(["Space", "ArrowUp", "KeyW", "Enter"]);

function onFlapKey(e) {
  if (!FLAP_KEYS.has(e.code)) return;
  e.preventDefault();
  flap();
}

function onScreenTap(e) {
  e.preventDefault();
  flap();
}

canvas.addEventListener("pointerdown", onScreenTap);
canvas.addEventListener("touchstart", onScreenTap, { passive: false });
canvas.addEventListener("contextmenu", (e) => e.preventDefault());
document.addEventListener("keydown", onFlapKey);
window.addEventListener("resize", resize);

try {
  best = parseInt(localStorage.getItem("flappyBest") || "0", 10) || 0;
} catch (_) {
  best = 0;
}

resize();
reset();
loop();
