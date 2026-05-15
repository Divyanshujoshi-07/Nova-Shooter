// =====================================================
//  game.js — NOVA BLASTER
//  Full arcade space shooter: Canvas 2D API
//  Features: waves, power-ups, explosions, boss every 5 waves
// =====================================================

const canvas  = document.getElementById('gameCanvas');
const ctx     = canvas.getContext('2d');

// ── DOM refs ──────────────────────────────────────
const hud          = document.getElementById('hud');
const hudScore     = document.getElementById('hud-score');
const hudWave      = document.getElementById('hud-wave');
const hudLives     = document.getElementById('hud-lives');
const screenTitle  = document.getElementById('screen-title');
const screenWave   = document.getElementById('screen-wave');
const screenPause  = document.getElementById('screen-pause');
const screenGO     = document.getElementById('screen-gameover');
const bannerWaveNum = document.getElementById('banner-wave-num');
const goScore      = document.getElementById('go-score');
const goWave       = document.getElementById('go-wave');
const goHiscore    = document.getElementById('go-hiscore');
const titleHiscore = document.getElementById('title-hiscore');
const touchControls = document.getElementById('touch-controls');

document.getElementById('btn-start').addEventListener('click', startGame);
document.getElementById('btn-resume').addEventListener('click', resumeGame);
document.getElementById('btn-restart').addEventListener('click', startGame);

// ── Constants ─────────────────────────────────────
const COLORS = {
  cyan:   '#00f5ff',
  pink:   '#ff2d78',
  yellow: '#f5e642',
  green:  '#39ff6e',
  purple: '#bf5fff',
  orange: '#ff8c2d',
  white:  '#ffffff',
};

// ── State ──────────────────────────────────────────
let W, H;
let gameState = 'title'; // title | playing | paused | gameover | wavebanner
let score = 0, wave = 1, lives = 3;
let hiScore = parseInt(localStorage.getItem('nova_hiscore') || '0');
titleHiscore.textContent = hiScore;

let player, bullets, enemies, particles, powerups, bossHP, bossMaxHP;
let keys     = {};
let touchState = { left: false, right: false, fire: false };
let fireTimer  = 0;
const FIRE_RATE = 12; // frames between shots (lower = faster)
let frameCount = 0;
let animId;

// ── Resize ─────────────────────────────────────────
function resize() {
  W = canvas.width  = window.innerWidth;
  H = canvas.height = window.innerHeight;
}
window.addEventListener('resize', () => { resize(); });
resize();

// ── Input ──────────────────────────────────────────
window.addEventListener('keydown', e => {
  keys[e.code] = true;
  if (e.code === 'KeyP' && gameState === 'playing') pauseGame();
  else if (e.code === 'KeyP' && gameState === 'paused')  resumeGame();
  if (['Space','ArrowUp','ArrowDown','ArrowLeft','ArrowRight'].includes(e.code))
    e.preventDefault();
});
window.addEventListener('keyup',   e => keys[e.code] = false);

// Touch buttons
function holdBtn(id, flagFn) {
  const btn = document.getElementById(id);
  btn.addEventListener('touchstart', e => { e.preventDefault(); flagFn(true);  }, { passive: false });
  btn.addEventListener('touchend',   e => { e.preventDefault(); flagFn(false); }, { passive: false });
  btn.addEventListener('mousedown',  () => flagFn(true));
  btn.addEventListener('mouseup',    () => flagFn(false));
  btn.addEventListener('mouseleave', () => flagFn(false));
}
holdBtn('t-left',  v => touchState.left  = v);
holdBtn('t-right', v => touchState.right = v);
holdBtn('t-fire',  v => touchState.fire  = v);

// Show touch controls on touch device
window.addEventListener('touchstart', () => {
  if (gameState === 'playing') touchControls.classList.remove('hidden');
}, { once: true });

// ── Game init ──────────────────────────────────────
function startGame() {
  hideAllScreens();
  score = 0; wave = 1; lives = 3; frameCount = 0;
  hud.classList.remove('hidden');
  initEntities();
  showWaveBanner(() => {
    gameState = 'playing';
    if (animId) cancelAnimationFrame(animId);
    loop();
  });
}

function initEntities() {
  const cx = W / 2;
  player = {
    x: cx, y: H - 90,
    w: 36, h: 42,
    speed: 5.5,
    shield: false,
    shieldTimer: 0,
    rapidFire: false,
    rapidTimer: 0,
    invincible: false,
    invTimer: 0,
    color: COLORS.cyan,
  };
  bullets   = [];
  enemies   = [];
  particles = [];
  powerups  = [];
  bossHP    = 0; bossMaxHP = 0;
  spawnWave();
  updateHUD();
}

// ── Wave / Enemy spawning ──────────────────────────
function spawnWave() {
  enemies = [];
  const isBossWave = wave % 5 === 0;

  if (isBossWave) {
    spawnBoss();
  } else {
    const rows = Math.min(2 + Math.floor(wave / 2), 5);
    const cols = Math.min(6 + wave, 11);
    const gapX = Math.min(60, (W - 80) / cols);
    const gapY = 48;
    const startX = (W - gapX * (cols - 1)) / 2;
    const startY = 90;

    for (let r = 0; r < rows; r++) {
      for (let c = 0; c < cols; c++) {
        const tier = r < 1 ? 'elite' : r < 2 ? 'medium' : 'basic';
        enemies.push(createEnemy(
          startX + c * gapX,
          startY + r * gapY,
          tier
        ));
      }
    }
  }
}

function createEnemy(x, y, tier) {
  const defs = {
    basic: { hp: 1, score: 10,  speed: 0.6, color: COLORS.green,  size: 22, shoot: false },
    medium:{ hp: 2, score: 25,  speed: 0.9, color: COLORS.purple, size: 24, shoot: true  },
    elite: { hp: 3, score: 50,  speed: 1.2, color: COLORS.orange, size: 26, shoot: true  },
  };
  const d = defs[tier];
  return {
    x, y, tier,
    hp: d.hp, maxHp: d.hp,
    score: d.score,
    speed: d.speed + (wave - 1) * 0.07,
    color: d.color,
    size: d.size,
    shoot: d.shoot,
    shootTimer: Math.random() * 120 + 60,
    dir: 1,   // horizontal drift direction (shared by group, set below)
    drift: 0,
    angle: 0,
  };
}

function spawnBoss() {
  const hp = 20 + wave * 5;
  bossHP = bossMaxHP = hp;
  enemies.push({
    x: W / 2, y: 110,
    tier: 'boss',
    hp, maxHp: hp,
    score: 500 + wave * 50,
    speed: 1.2 + wave * 0.08,
    color: COLORS.pink,
    size: 55,
    shoot: true,
    shootTimer: 40,
    dir: 1,
    angle: 0,
    phase: 0,
  });
}

// ── Game loop ──────────────────────────────────────
function loop() {
  if (gameState !== 'playing') return;
  frameCount++;
  update();
  draw();
  animId = requestAnimationFrame(loop);
}

// ── Update ─────────────────────────────────────────
function update() {
  updatePlayer();
  updateBullets();
  updateEnemies();
  updateParticles();
  updatePowerups();
  checkCollisions();

  // All enemies cleared → next wave
  if (enemies.length === 0 && gameState === 'playing') {
    wave++;
    updateHUD();
    gameState = 'wavebanner';
    showWaveBanner(() => {
      spawnWave();
      gameState = 'playing';
      loop(); // restart the loop — it stopped while the banner was showing
    });
  }
}

function updatePlayer() {
  const left  = keys['ArrowLeft']  || keys['KeyA'] || touchState.left;
  const right = keys['ArrowRight'] || keys['KeyD'] || touchState.right;
  const fire  = keys['Space']      || keys['KeyZ']  || touchState.fire;

  if (left  && player.x > player.w / 2)       player.x -= player.speed;
  if (right && player.x < W - player.w / 2)   player.x += player.speed;

  // Shooting
  const rate = player.rapidFire ? FIRE_RATE / 2.5 : FIRE_RATE;
  if (fire) {
    if (fireTimer <= 0) {
      bullets.push({ x: player.x, y: player.y - player.h / 2, vy: -11, owner: 'player', color: COLORS.cyan, size: 4 });
      if (player.rapidFire) {
        bullets.push({ x: player.x - 12, y: player.y - 20, vy: -10.5, owner: 'player', color: COLORS.cyan, size: 3 });
        bullets.push({ x: player.x + 12, y: player.y - 20, vy: -10.5, owner: 'player', color: COLORS.cyan, size: 3 });
      }
      fireTimer = rate;
    }
  }
  if (fireTimer > 0) fireTimer--;

  // Power-up timers
  if (player.shieldTimer  > 0) { player.shieldTimer--;  if (!player.shieldTimer)  player.shield    = false; }
  if (player.rapidTimer   > 0) { player.rapidTimer--;   if (!player.rapidTimer)   player.rapidFire = false; }
  if (player.invTimer     > 0) { player.invTimer--;     if (!player.invTimer)     player.invincible = false; }
}

function updateBullets() {
  for (let i = bullets.length - 1; i >= 0; i--) {
    const b = bullets[i];
    b.x += (b.vx || 0);
    b.y += b.vy;
    if (b.y < -10 || b.y > H + 10 || b.x < -10 || b.x > W + 10)
      bullets.splice(i, 1);
  }
}

function updateEnemies() {
  // Shared horizontal drift
  let groupSpeed = 0;
  let touchEdge  = false;
  for (const e of enemies) {
    if (e.tier === 'boss') continue;
    if (e.x < 30 || e.x > W - 30) { touchEdge = true; break; }
  }
  if (touchEdge) {
    enemies.forEach(e => { if (e.tier !== 'boss') e.dir *= -1; });
  }

  for (const e of enemies) {
    if (e.tier === 'boss') {
      updateBoss(e);
    } else {
      e.x += e.speed * e.dir;
      e.y += 0.15 * (1 + wave * 0.04); // slowly descend
      e.angle += 0.04;

      // Enemy shoots
      if (e.shoot) {
        e.shootTimer--;
        if (e.shootTimer <= 0) {
          bullets.push({ x: e.x, y: e.y + e.size, vy: 4 + wave * 0.15, owner: 'enemy', color: e.color, size: 4 });
          e.shootTimer = 90 - wave * 2 + Math.random() * 60;
        }
      }

      // Enemy reached player row → game over
      if (e.y + e.size > H - 60) {
        triggerDeath();
      }
    }
  }
}

function updateBoss(b) {
  b.phase = Math.floor(frameCount / 120) % 3;
  switch (b.phase) {
    case 0: b.x += Math.sin(frameCount * 0.03) * 2.5; break;
    case 1: b.x += b.speed * b.dir * 0.7; if (b.x < 80 || b.x > W-80) b.dir *= -1; break;
    case 2: b.x += Math.cos(frameCount * 0.05) * 3; break;
  }
  b.angle += 0.015;

  // Boss multi-shot
  b.shootTimer--;
  if (b.shootTimer <= 0) {
    const spread = 5;
    for (let a = -spread; a <= spread; a += spread) {
      const rad = (a * Math.PI) / 180;
      bullets.push({ x: b.x, y: b.y + b.size, vx: Math.sin(rad) * 4, vy: 5 + wave * 0.1, owner: 'enemy', color: COLORS.pink, size: 5 });
    }
    b.shootTimer = 35;
  }
}

function updateParticles() {
  for (let i = particles.length - 1; i >= 0; i--) {
    const p = particles[i];
    p.x  += p.vx;
    p.y  += p.vy;
    p.vy += p.gravity || 0;
    p.life--;
    p.alpha = p.life / p.maxLife;
    if (p.life <= 0) particles.splice(i, 1);
  }
}

function updatePowerups() {
  for (let i = powerups.length - 1; i >= 0; i--) {
    const p = powerups[i];
    p.y   += 1.5;
    p.angle += 0.04;
    if (p.y > H + 20) powerups.splice(i, 1);
  }
}

// ── Collision detection ────────────────────────────
function checkCollisions() {
  // Player bullets → enemies
  for (let bi = bullets.length - 1; bi >= 0; bi--) {
    const b = bullets[bi];
    if (b.owner !== 'player') continue;

    for (let ei = enemies.length - 1; ei >= 0; ei--) {
      const e = enemies[ei];
      if (dist(b.x, b.y, e.x, e.y) < e.size + 5) {
        // Hit
        bullets.splice(bi, 1);
        e.hp--;
        spawnHitSpark(e.x, e.y, e.color);

        if (e.hp <= 0) {
          score += e.score;
          hudScore.textContent = score;
          spawnExplosion(e.x, e.y, e.color, e.tier === 'boss' ? 'large' : 'medium');
          if (Math.random() < (e.tier === 'boss' ? 0.8 : 0.15)) spawnPowerup(e.x, e.y);
          enemies.splice(ei, 1);
          if (e.tier === 'boss') bossHP = 0;
        } else if (e.tier === 'boss') {
          bossHP = e.hp;
        }
        break;
      }
    }
  }

  // Enemy bullets → player
  if (!player.invincible && !player.shield) {
    for (let bi = bullets.length - 1; bi >= 0; bi--) {
      const b = bullets[bi];
      if (b.owner !== 'enemy') continue;
      if (dist(b.x, b.y, player.x, player.y) < player.w * 0.5) {
        bullets.splice(bi, 1);
        triggerDeath();
        return;
      }
    }
  } else if (player.shield) {
    for (let bi = bullets.length - 1; bi >= 0; bi--) {
      const b = bullets[bi];
      if (b.owner !== 'enemy') continue;
      if (dist(b.x, b.y, player.x, player.y) < player.w * 0.75) {
        bullets.splice(bi, 1);
        spawnHitSpark(player.x, player.y, COLORS.cyan);
      }
    }
  }

  // Enemies touching player
  if (!player.invincible) {
    for (const e of enemies) {
      if (dist(e.x, e.y, player.x, player.y) < e.size + player.w * 0.4) {
        triggerDeath();
        return;
      }
    }
  }

  // Power-up collection
  for (let i = powerups.length - 1; i >= 0; i--) {
    const p = powerups[i];
    if (dist(p.x, p.y, player.x, player.y) < 28) {
      applyPowerup(p.type);
      powerups.splice(i, 1);
    }
  }
}

function triggerDeath() {
  spawnExplosion(player.x, player.y, COLORS.cyan, 'large');
  lives--;
  updateHUD();
  if (lives <= 0) {
    gameOver();
    return;
  }
  player.invincible = true;
  player.invTimer   = 160;
  player.x = W / 2;
  player.y = H - 90;
}

// ── Power-ups ──────────────────────────────────────
function spawnPowerup(x, y) {
  const types = ['shield', 'rapid', 'score', 'life'];
  const type  = types[Math.floor(Math.random() * types.length)];
  powerups.push({ x, y, type, angle: 0 });
}

function applyPowerup(type) {
  const cfg = {
    shield: () => { player.shield = true;    player.shieldTimer  = 300; },
    rapid:  () => { player.rapidFire = true; player.rapidTimer   = 400; },
    score:  () => { score += 200; hudScore.textContent = score; },
    life:   () => { if (lives < 5) { lives++; updateHUD(); } },
  };
  cfg[type]?.();
  spawnTextPopup(player.x, player.y - 40, {
    shield: 'SHIELD!', rapid: 'RAPID!', score: '+200', life: 'LIFE UP!'
  }[type], COLORS.yellow);
}

// ── Particles ──────────────────────────────────────
function spawnExplosion(x, y, color, size = 'medium') {
  const count = size === 'large' ? 40 : size === 'medium' ? 20 : 8;
  for (let i = 0; i < count; i++) {
    const angle = Math.random() * Math.PI * 2;
    const spd   = Math.random() * (size === 'large' ? 7 : 4) + 1;
    particles.push({
      x, y,
      vx: Math.cos(angle) * spd,
      vy: Math.sin(angle) * spd,
      gravity: 0.05,
      color,
      size: Math.random() * (size === 'large' ? 5 : 3) + 1,
      life: Math.random() * 40 + 20,
      maxLife: 60,
      alpha: 1,
      type: 'dot',
    });
  }
  // Ring flash
  particles.push({ x, y, vx:0, vy:0, color, size: size === 'large' ? 60 : 30, life:12, maxLife:12, alpha:1, type:'ring', gravity:0 });
}

function spawnHitSpark(x, y, color) {
  for (let i = 0; i < 5; i++) {
    const angle = Math.random() * Math.PI * 2;
    particles.push({
      x, y,
      vx: Math.cos(angle) * (Math.random() * 3 + 1),
      vy: Math.sin(angle) * (Math.random() * 3 + 1),
      gravity: 0,
      color,
      size: Math.random() * 2 + 1,
      life: 15, maxLife: 15, alpha: 1, type: 'dot',
    });
  }
}

function spawnTextPopup(x, y, text, color) {
  particles.push({ x, y, vx: 0, vy: -1.2, gravity: 0, color, text, life: 50, maxLife: 50, alpha: 1, type: 'text' });
}

// ── Draw ───────────────────────────────────────────
function draw() {
  ctx.clearRect(0, 0, W, H);
  drawStarfield();
  drawPlayer();
  drawBullets();
  drawEnemies();
  drawParticles();
  drawPowerups();
  if (bossMaxHP > 0 && enemies.some(e => e.tier === 'boss')) drawBossBar();
}

// Starfield (simple)
const stars = Array.from({ length: 120 }, () => ({
  x: Math.random(), y: Math.random(),
  size: Math.random() * 1.8 + 0.2,
  speed: Math.random() * 0.3 + 0.05,
  alpha: Math.random() * 0.6 + 0.2,
}));

function drawStarfield() {
  for (const s of stars) {
    s.y += s.speed * 0.002;
    if (s.y > 1) s.y = 0;
    ctx.globalAlpha = s.alpha;
    ctx.fillStyle = '#ffffff';
    ctx.beginPath();
    ctx.arc(s.x * W, s.y * H, s.size, 0, Math.PI * 2);
    ctx.fill();
  }
  ctx.globalAlpha = 1;
}

function drawPlayer() {
  const { x, y, w, h } = player;

  // Invincibility flicker
  if (player.invincible && frameCount % 6 < 3) return;

  ctx.save();
  ctx.translate(x, y);

  // Shield bubble
  if (player.shield) {
    const t = frameCount * 0.05;
    const g = ctx.createRadialGradient(0, 0, w * 0.3, 0, 0, w + 12);
    g.addColorStop(0, 'rgba(0,245,255,0)');
    g.addColorStop(0.7, `rgba(0,245,255,${0.08 + Math.sin(t)*0.04})`);
    g.addColorStop(1, `rgba(0,245,255,${0.35 + Math.sin(t)*0.1})`);
    ctx.beginPath();
    ctx.arc(0, 0, w + 12, 0, Math.PI * 2);
    ctx.fillStyle = g;
    ctx.fill();
    ctx.strokeStyle = `rgba(0,245,255,${0.6 + Math.sin(t)*0.3})`;
    ctx.lineWidth = 1.5;
    ctx.stroke();
  }

  // Ship body
  ctx.shadowBlur  = 18;
  ctx.shadowColor = player.color;
  ctx.fillStyle   = player.color;

  // Fuselage
  ctx.beginPath();
  ctx.moveTo(0, -h / 2);
  ctx.lineTo(w * 0.3, h * 0.1);
  ctx.lineTo(w * 0.18, h * 0.5);
  ctx.lineTo(-w * 0.18, h * 0.5);
  ctx.lineTo(-w * 0.3, h * 0.1);
  ctx.closePath();
  ctx.fill();

  // Wings
  ctx.fillStyle = player.rapidFire ? COLORS.yellow : COLORS.cyan;
  ctx.beginPath();
  ctx.moveTo(-w * 0.3, h * 0.1);
  ctx.lineTo(-w * 0.7, h * 0.5);
  ctx.lineTo(-w * 0.18, h * 0.4);
  ctx.closePath();
  ctx.fill();
  ctx.beginPath();
  ctx.moveTo( w * 0.3, h * 0.1);
  ctx.lineTo( w * 0.7, h * 0.5);
  ctx.lineTo( w * 0.18, h * 0.4);
  ctx.closePath();
  ctx.fill();

  // Engine glow (flicker)
  const flame = 8 + Math.random() * 5;
  const fg = ctx.createLinearGradient(0, h * 0.4, 0, h * 0.5 + flame);
  fg.addColorStop(0, COLORS.cyan);
  fg.addColorStop(1, 'rgba(0,245,255,0)');
  ctx.fillStyle = fg;
  ctx.beginPath();
  ctx.ellipse(0, h * 0.48, 6, flame, 0, 0, Math.PI * 2);
  ctx.fill();

  ctx.shadowBlur = 0;
  ctx.restore();
}

function drawBullets() {
  for (const b of bullets) {
    ctx.save();
    ctx.shadowBlur  = 12;
    ctx.shadowColor = b.color;

    if (b.owner === 'player') {
      // Elongated laser bolt
      const g = ctx.createLinearGradient(b.x, b.y - 14, b.x, b.y + 4);
      g.addColorStop(0, 'rgba(0,245,255,0)');
      g.addColorStop(0.3, b.color);
      g.addColorStop(1, b.color);
      ctx.fillStyle = g;
      ctx.beginPath();
      ctx.ellipse(b.x, b.y - 6, b.size * 0.7, 10, 0, 0, Math.PI * 2);
      ctx.fill();
    } else {
      ctx.fillStyle = b.color;
      ctx.beginPath();
      ctx.arc(b.x, b.y, b.size, 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.restore();
  }
}

function drawEnemies() {
  for (const e of enemies) {
    ctx.save();
    ctx.translate(e.x, e.y);
    ctx.shadowBlur  = 20;
    ctx.shadowColor = e.color;

    if (e.tier === 'boss') {
      drawBossShape(e);
    } else {
      drawEnemyShape(e);
    }

    // HP bar for multi-hp enemies
    if (e.maxHp > 1) {
      const bw = e.size * 2;
      const bh = 4;
      const bx = -e.size;
      const by = e.size + 6;
      ctx.globalAlpha = 0.5;
      ctx.fillStyle = '#333';
      ctx.fillRect(bx, by, bw, bh);
      ctx.globalAlpha = 1;
      ctx.fillStyle = e.color;
      ctx.fillRect(bx, by, bw * (e.hp / e.maxHp), bh);
    }

    ctx.shadowBlur = 0;
    ctx.restore();
  }
}

function drawEnemyShape(e) {
  const s = e.size;
  ctx.rotate(e.angle);
  if (e.tier === 'medium') {
    // Diamond
    ctx.fillStyle = e.color;
    ctx.beginPath();
    ctx.moveTo(0, -s); ctx.lineTo(s * 0.7, 0);
    ctx.lineTo(0, s);  ctx.lineTo(-s * 0.7, 0);
    ctx.closePath(); ctx.fill();
    // Inner glow
    ctx.fillStyle = 'rgba(255,255,255,0.15)';
    ctx.beginPath();
    ctx.arc(0, 0, s * 0.4, 0, Math.PI * 2);
    ctx.fill();
  } else if (e.tier === 'elite') {
    // Hexagon
    ctx.fillStyle = e.color;
    ctx.beginPath();
    for (let i = 0; i < 6; i++) {
      const a = (i / 6) * Math.PI * 2 - Math.PI / 6;
      i === 0 ? ctx.moveTo(Math.cos(a)*s, Math.sin(a)*s) : ctx.lineTo(Math.cos(a)*s, Math.sin(a)*s);
    }
    ctx.closePath(); ctx.fill();
    ctx.strokeStyle = 'rgba(255,255,255,0.3)';
    ctx.lineWidth = 1.5; ctx.stroke();
  } else {
    // Basic: invader-style square with notch
    ctx.fillStyle = e.color;
    ctx.fillRect(-s, -s * 0.8, s * 2, s * 1.6);
    ctx.fillStyle = '#020508';
    ctx.fillRect(-s * 0.3, -s * 0.8, s * 0.25, s * 0.5); // left eye hole
    ctx.fillRect( s * 0.05, -s * 0.8, s * 0.25, s * 0.5); // right eye hole
    ctx.fillRect(-s, s * 0.3, s * 0.4, s * 0.5); // left foot
    ctx.fillRect( s * 0.6, s * 0.3, s * 0.4, s * 0.5); // right foot
  }
}

function drawBossShape(b) {
  const s = b.size;
  ctx.rotate(b.angle * 0.3);
  // Outer ring
  ctx.strokeStyle = b.color;
  ctx.lineWidth = 3;
  ctx.beginPath(); ctx.arc(0, 0, s, 0, Math.PI * 2); ctx.stroke();
  // Inner ring
  ctx.lineWidth = 2;
  ctx.strokeStyle = COLORS.yellow;
  ctx.beginPath(); ctx.arc(0, 0, s * 0.6, 0, Math.PI * 2); ctx.stroke();
  // Core
  ctx.fillStyle = b.color;
  ctx.beginPath(); ctx.arc(0, 0, s * 0.35, 0, Math.PI * 2); ctx.fill();
  // Eye
  ctx.fillStyle = COLORS.yellow;
  ctx.beginPath(); ctx.arc(0, 0, s * 0.15, 0, Math.PI * 2); ctx.fill();
  // Spikes
  ctx.strokeStyle = b.color;
  ctx.lineWidth = 2;
  for (let i = 0; i < 8; i++) {
    const a = (i / 8) * Math.PI * 2 + b.angle;
    ctx.beginPath();
    ctx.moveTo(Math.cos(a) * s * 0.65, Math.sin(a) * s * 0.65);
    ctx.lineTo(Math.cos(a) * s * 1.1,  Math.sin(a) * s * 1.1);
    ctx.stroke();
  }
}

function drawParticles() {
  for (const p of particles) {
    ctx.save();
    ctx.globalAlpha = p.alpha;
    if (p.type === 'dot') {
      ctx.shadowBlur  = 8;
      ctx.shadowColor = p.color;
      ctx.fillStyle   = p.color;
      ctx.beginPath();
      ctx.arc(p.x, p.y, p.size, 0, Math.PI * 2);
      ctx.fill();
    } else if (p.type === 'ring') {
      ctx.strokeStyle = p.color;
      ctx.shadowBlur  = 12;
      ctx.shadowColor = p.color;
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.arc(p.x, p.y, p.size * (1 - p.alpha) * 2 + 5, 0, Math.PI * 2);
      ctx.stroke();
    } else if (p.type === 'text') {
      ctx.font = 'bold 16px "Orbitron", monospace';
      ctx.fillStyle   = p.color;
      ctx.shadowBlur  = 10;
      ctx.shadowColor = p.color;
      ctx.textAlign   = 'center';
      ctx.fillText(p.text, p.x, p.y);
    }
    ctx.restore();
  }
}

function drawPowerups() {
  const icons = { shield: '🛡', rapid: '⚡', score: '★', life: '♥' };
  const cols  = { shield: COLORS.cyan, rapid: COLORS.yellow, score: COLORS.green, life: COLORS.pink };

  for (const p of powerups) {
    ctx.save();
    ctx.translate(p.x, p.y);
    ctx.rotate(p.angle);
    ctx.shadowBlur  = 20;
    ctx.shadowColor = cols[p.type];
    ctx.strokeStyle = cols[p.type];
    ctx.lineWidth   = 1.5;
    ctx.beginPath(); ctx.arc(0, 0, 15, 0, Math.PI * 2); ctx.stroke();
    ctx.fillStyle   = `${cols[p.type]}22`;
    ctx.fill();
    ctx.shadowBlur  = 0;
    ctx.font        = '14px serif';
    ctx.textAlign   = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(icons[p.type], 0, 1);
    ctx.restore();
  }
}

function drawBossBar() {
  const boss   = enemies.find(e => e.tier === 'boss');
  if (!boss) return;
  const bw  = Math.min(400, W * 0.6);
  const bh  = 10;
  const bx  = (W - bw) / 2;
  const by  = 65;
  const pct = boss.hp / boss.maxHp;

  ctx.fillStyle = 'rgba(0,0,0,0.5)';
  ctx.fillRect(bx - 2, by - 2, bw + 4, bh + 4);
  ctx.fillStyle = '#1a0010';
  ctx.fillRect(bx, by, bw, bh);

  const g = ctx.createLinearGradient(bx, 0, bx + bw * pct, 0);
  g.addColorStop(0, COLORS.pink);
  g.addColorStop(1, COLORS.yellow);
  ctx.fillStyle = g;
  ctx.shadowBlur = 10; ctx.shadowColor = COLORS.pink;
  ctx.fillRect(bx, by, bw * pct, bh);
  ctx.shadowBlur = 0;

  ctx.font = '10px "Orbitron", monospace';
  ctx.fillStyle = COLORS.pink;
  ctx.textAlign = 'center';
  ctx.fillText('BOSS', W / 2, by - 6);
}

// ── HUD update ─────────────────────────────────────
function updateHUD() {
  hudScore.textContent = score;
  hudWave.textContent  = wave;
  hudLives.innerHTML   = '';
  for (let i = 0; i < Math.max(lives, 0); i++) {
    const span = document.createElement('span');
    span.className = 'life-icon';
    hudLives.appendChild(span);
  }
}

// ── Wave banner ────────────────────────────────────
function showWaveBanner(cb) {
  bannerWaveNum.textContent = wave;
  screenWave.classList.remove('hidden');
  setTimeout(() => {
    screenWave.classList.add('hidden');
    cb();
  }, 1400);
}

// ── Game flow ──────────────────────────────────────
function pauseGame() {
  gameState = 'paused';
  screenPause.classList.remove('hidden');
}
function resumeGame() {
  screenPause.classList.add('hidden');
  gameState = 'playing';
  loop();
}

function gameOver() {
  gameState = 'gameover';
  cancelAnimationFrame(animId);
  if (score > hiScore) {
    hiScore = score;
    localStorage.setItem('nova_hiscore', hiScore);
    titleHiscore.textContent = hiScore;
  }
  goScore.textContent   = score;
  goWave.textContent    = wave;
  goHiscore.textContent = hiScore;
  hud.classList.add('hidden');
  screenGO.classList.remove('hidden');
}

function hideAllScreens() {
  [screenTitle, screenWave, screenPause, screenGO].forEach(s => s.classList.add('hidden'));
  hud.classList.add('hidden');
}

// ── Utility ────────────────────────────────────────
function dist(x1, y1, x2, y2) {
  const dx = x1 - x2, dy = y1 - y2;
  return Math.sqrt(dx * dx + dy * dy);
}
