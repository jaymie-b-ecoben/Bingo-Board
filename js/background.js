/* ===========================
   Seamless Pixel Background
   =========================== */
(function () {
  const bg = document.getElementById('bg');
  const fg = document.getElementById('fg');
  const bgCtx = bg.getContext('2d');
  const fgCtx = fg.getContext('2d');
  const TILE = 256; // tile size
  let seed = 1337;
  const rand = (function () {
    // mulberry32 PRNG for reproducible tile content
    return function () {
      seed |= 0; seed = (seed + 0x6D2B79F5) | 0;
      let t = Math.imul(seed ^ seed >>> 15, 1 | seed);
      t = (t + Math.imul(t ^ t >>> 7, 61 | t)) ^ t;
      return ((t ^ t >>> 14) >>> 0) / 4294967296;
    };
  })();

  function fitCanvases() {
    const dpr = Math.max(1, Math.min(2, window.devicePixelRatio || 1));
    const w = Math.ceil(window.innerWidth);
    const h = Math.ceil(window.innerHeight);
    [bg, fg].forEach(c => {
      c.width = Math.ceil(w * dpr);
      c.height = Math.ceil(h * dpr);
      c.style.width = w + 'px';
      c.style.height = h + 'px';
    });
    bgCtx.setTransform(dpr, 0, 0, dpr, 0, 0);
    fgCtx.setTransform(dpr, 0, 0, dpr, 0, 0);
    bgCtx.imageSmoothingEnabled = false;
    fgCtx.imageSmoothingEnabled = false;
  }
  fitCanvases();
  window.addEventListener('resize', fitCanvases);

  // Build a reusable 256x256 tile
  const tile = document.createElement('canvas');
  tile.width = TILE; tile.height = TILE;
  const tctx = tile.getContext('2d');
  tctx.imageSmoothingEnabled = false;

  function drawTile() {
    // Pixelated sky - blocky gradient
    const skyColors = ['#b9ecff', '#a4e4ff', '#8bdcff', '#7dd3ff'];
    const skyHeight = 180;
    const blockSize = 16; // Pixel block size

    // Draw pixelated sky in horizontal bands
    for (let y = 0; y < skyHeight; y += blockSize) {
      const colorIndex = Math.floor((y / skyHeight) * skyColors.length);
      const color = skyColors[Math.min(colorIndex, skyColors.length - 1)];
      tctx.fillStyle = color;
      tctx.fillRect(0, y, TILE, blockSize);

      // Add some pixel variation for texture
      for (let x = 0; x < TILE; x += blockSize) {
        if (rand() < 0.1) { // 10% chance of slightly different shade
          const variation = rand() < 0.5 ? -10 : 10;
          tctx.fillStyle = adjustBrightness(color, variation);
          tctx.fillRect(x, y, blockSize, blockSize);
        }
      }
    }

    // Pixelated grass ground
    const grassColors = ['#77dd77', '#5fcc5f', '#6dd06d', '#85e085'];
    const grassStart = 180;
    const grassHeight = TILE - grassStart;

    // Draw pixelated grass blocks
    for (let y = grassStart; y < TILE; y += blockSize) {
      for (let x = 0; x < TILE; x += blockSize) {
        const colorIndex = Math.floor(rand() * grassColors.length);
        tctx.fillStyle = grassColors[colorIndex];
        tctx.fillRect(x, y, blockSize, blockSize);

        // Add some darker grass pixels for texture
        if (rand() < 0.15) {
          tctx.fillStyle = adjustBrightness(grassColors[colorIndex], -15);
          tctx.fillRect(x, y, blockSize, blockSize);
        }
      }
    }

    // Add some pixelated grass blades
    for (let i = 0; i < 40; i++) {
      const x = Math.floor(rand() * TILE);
      const y = grassStart + Math.floor(rand() * (TILE - grassStart));
      drawPixelGrassBlade(x, y);
    }

    // Pixelated clouds (blocky)
    drawPixelCloud(36, 46);
    drawPixelCloud(170, 32);
    drawPixelCloud(120, 68);

    // Pixel stars in sky
    for (let i = 0; i < 20; i++) {
      const x = Math.floor(rand() * TILE);
      const y = Math.floor(rand() * skyHeight);
      drawStar(x, y, 1, '#ffffff', 0.6);
    }
  }

  function adjustBrightness(color, amount) {
    // Simple brightness adjustment for pixel variation
    const hex = color.replace('#', '');
    const r = Math.max(0, Math.min(255, parseInt(hex.substr(0, 2), 16) + amount));
    const g = Math.max(0, Math.min(255, parseInt(hex.substr(2, 2), 16) + amount));
    const b = Math.max(0, Math.min(255, parseInt(hex.substr(4, 2), 16) + amount));
    return `#${r.toString(16).padStart(2, '0')}${g.toString(16).padStart(2, '0')}${b.toString(16).padStart(2, '0')}`;
  }

  function blendColors(color1, color2, t) {
    // Blend between two colors smoothly
    const hex1 = color1.replace('#', '');
    const hex2 = color2.replace('#', '');
    const r1 = parseInt(hex1.substr(0, 2), 16);
    const g1 = parseInt(hex1.substr(2, 2), 16);
    const b1 = parseInt(hex1.substr(4, 2), 16);
    const r2 = parseInt(hex2.substr(0, 2), 16);
    const g2 = parseInt(hex2.substr(2, 2), 16);
    const b2 = parseInt(hex2.substr(4, 2), 16);

    const r = Math.floor(r1 + (r2 - r1) * t);
    const g = Math.floor(g1 + (g2 - g1) * t);
    const b = Math.floor(b1 + (b2 - b1) * t);

    return `#${r.toString(16).padStart(2, '0')}${g.toString(16).padStart(2, '0')}${b.toString(16).padStart(2, '0')}`;
  }



  function drawStar(ctx, x, y, size, color, alpha = 1) {
    ctx.save();
    ctx.globalAlpha = alpha;
    ctx.fillStyle = color;
    // simple pixel star (diamond)
    for (let i = -size; i <= size; i++) {
      ctx.fillRect(x + i, y, 1, 1);
      if (i >= -size && i <= size) {
        ctx.fillRect(x, y + i, 1, 1);
      }
    }
    ctx.restore();
  }

  function drawFlower(x, y) {
    // tiny 3x3 flower
    const p = [
      '.....',
      '..y..',
      '.yyy.',
      '..y..',
      '.....',
    ];
    const colors = { y: '#ffec6e', w: '#ffffff', p: '#ff6ea8' };
    const px = x - 2, py = y - 2;
    for (let j = 0; j < 5; j++) {
      for (let i = 0; i < 5; i++) {
        const ch = p[j][i];
        if (ch === '.') continue;
        tctx.fillStyle = colors[ch] || '#fff';
        tctx.fillRect(px + i, py + j, 1, 1);
      }
    }
  }

  // No longer using tile - drawing directly to canvas
  // drawTile(); // Removed - using direct canvas drawing instead

  // Animated sprites layer (seamless loop)
  const sprites = [];
  const spriteTypes = ['star', 'coin', 'animal'];

  function spawnSprites(count) {
    sprites.length = 0;
    for (let i = 0; i < count; i++) {
      const type = spriteTypes[Math.floor(rand() * spriteTypes.length)];
      const x = Math.floor(rand() * TILE);
      const y = Math.floor(rand() * 160) + 10;
      const vx = (rand() * 0.5 + 0.3) * (rand() < 0.5 ? 1 : -1); // px/frame @60fps approx
      const size = 10 + Math.floor(rand() * 8);
      const basePhase = rand() * Math.PI * 2;
      const drift = rand() * 0.3 + 0.1;
      const spin = (rand() * 0.02 + 0.01) * (rand() < 0.5 ? -1 : 1);
      sprites.push({ type, x, y, vx, size, basePhase, drift, spin, frame: 0 });
    }
  }
  spawnSprites(12); // Fewer sprites to reduce ghostly appearance

  let last = performance.now();
  let timeSec = 0;

  function loop(now) {
    const dt = Math.min(32, now - last); // ms
    last = now;
    timeSec += dt / 1000;

    drawBackground(timeSec);
    drawSprites(timeSec);
    requestAnimationFrame(loop);
  }
  requestAnimationFrame(loop);

  function drawBackground(t) {
    const w = bg.clientWidth;
    const h = bg.clientHeight;
    bgCtx.clearRect(0, 0, w, h);

    // Sunrise pastel gradient background
    const gradient = bgCtx.createLinearGradient(0, 0, 0, h);
    gradient.addColorStop(0, '#FFE5F1'); // Soft pink at top
    gradient.addColorStop(0.2, '#FFD6E8'); // Light pink
    gradient.addColorStop(0.35, '#FFE8CC'); // Soft peach
    gradient.addColorStop(0.5, '#FFF4E6'); // Warm cream
    gradient.addColorStop(0.65, '#E8F4F8'); // Pale blue
    gradient.addColorStop(0.8, '#D6EBF5'); // Light sky blue
    gradient.addColorStop(1, '#C5E1F0'); // Soft blue at bottom

    bgCtx.fillStyle = gradient;
    bgCtx.fillRect(0, 0, w, h);
  }

  function drawCozyMountains(ctx, x, y, width, height) {
    // Draw pixelated mountains in the distance
    const mountainColors = ['#B8D4B8', '#A8C4A8', '#98B498'];
    const peaks = [];

    // Create mountain peaks
    for (let i = 0; i < 5; i++) {
      peaks.push({
        x: x + (i * width / 4.5),
        height: 30 + (i * 17) % 25
      });
    }

    // Draw mountains
    for (let i = 0; i < peaks.length - 1; i++) {
      const p1 = peaks[i];
      const p2 = peaks[i + 1];
      const steps = Math.abs(p2.x - p1.x);

      for (let step = 0; step < steps; step += 4) {
        const px = Math.floor(p1.x + (p2.x - p1.x) * (step / steps));
        const progress = step / steps;
        const peakHeight = p1.height + (p2.height - p1.height) * progress;
        const py = y + height - peakHeight;

        const colorIndex = Math.floor(peakHeight / 10) % mountainColors.length;
        ctx.fillStyle = mountainColors[colorIndex];

        // Draw mountain slope
        for (let h = 0; h < peakHeight; h += 4) {
          const widthAtHeight = Math.floor(peakHeight - h);
          ctx.fillRect(px - widthAtHeight / 2, py + h, widthAtHeight, 4);
        }
      }
    }
  }

  function drawCozyCloud(ctx, x, y) {
    // Fluffy cozy cloud
    ctx.fillStyle = 'rgba(255,255,255,0.85)';
    const cloud = [
      [0, 0, 0, 1, 1, 1, 0, 0, 0],
      [0, 0, 1, 1, 1, 1, 1, 0, 0],
      [0, 1, 1, 1, 1, 1, 1, 1, 0],
      [1, 1, 1, 1, 1, 1, 1, 1, 1],
      [0, 1, 1, 1, 1, 1, 1, 1, 0],
      [0, 0, 1, 1, 1, 1, 1, 0, 0]
    ];
    const pixelSize = 6;
    for (let j = 0; j < cloud.length; j++) {
      for (let i = 0; i < cloud[j].length; i++) {
        if (cloud[j][i] === 1) {
          ctx.fillRect(x + i * pixelSize, y + j * pixelSize, pixelSize, pixelSize);
        }
      }
    }
  }

  function drawCozyTree(ctx, x, y) {
    // Cozy pixel tree
    // Trunk
    ctx.fillStyle = '#8B4513';
    ctx.fillRect(x - 3, y, 6, 12);

    // Leaves (multiple layers for coziness)
    ctx.fillStyle = '#228B22';
    // Bottom layer
    ctx.fillRect(x - 8, y - 8, 16, 8);
    // Middle layer
    ctx.fillRect(x - 6, y - 14, 12, 8);
    // Top layer
    ctx.fillRect(x - 4, y - 18, 8, 6);

    // Add some highlight
    ctx.fillStyle = '#32CD32';
    ctx.fillRect(x - 4, y - 10, 8, 4);
    ctx.fillRect(x - 3, y - 15, 6, 3);
  }

  function drawCozyFlower(ctx, x, y) {
    // Small cozy flower
    const flowerTypes = [
      { center: '#FFD700', petals: '#FF69B4' }, // Yellow center, pink petals
      { center: '#FFD700', petals: '#FFB6C1' }, // Yellow center, light pink
      { center: '#FFD700', petals: '#87CEEB' }  // Yellow center, sky blue
    ];
    const type = flowerTypes[Math.floor((x * 73 + y * 137) % flowerTypes.length)];

    // Petals (4 directions)
    ctx.fillStyle = type.petals;
    ctx.fillRect(x, y - 2, 2, 2); // Top
    ctx.fillRect(x, y + 2, 2, 2); // Bottom
    ctx.fillRect(x - 2, y, 2, 2); // Left
    ctx.fillRect(x + 2, y, 2, 2); // Right

    // Center
    ctx.fillStyle = type.center;
    ctx.fillRect(x, y, 2, 2);
  }

  function drawGrassBlade(ctx, x, y) {
    // Individual pixel grass blade
    const bladeTypes = [
      { color: '#5A8F3A', height: 6 }, // Dark green, tall
      { color: '#6BA044', height: 5 }, // Medium green, medium
      { color: '#7CB342', height: 4 }, // Light green, short
      { color: '#8BC34A', height: 5 }  // Lighter green, medium
    ];
    const seed = (x * 73856093) ^ (y * 19349663);
    const normalizedSeed = ((seed >>> 0) % 1000000) / 1000000;
    const type = bladeTypes[Math.floor(normalizedSeed * bladeTypes.length)];

    ctx.fillStyle = type.color;

    // Draw grass blade (slight curve)
    const height = type.height;
    for (let i = 0; i < height; i++) {
      const offset = Math.floor(Math.sin(i * 0.5) * 1); // Slight curve
      ctx.fillRect(x + offset, y - i, 1, 1);
    }

    // Sometimes add a second blade next to it
    if (normalizedSeed > 0.7) {
      ctx.fillStyle = adjustBrightness(type.color, -8);
      for (let i = 0; i < height - 1; i++) {
        const offset = Math.floor(Math.sin(i * 0.5) * 1);
        ctx.fillRect(x + offset + 2, y - i, 1, 1);
      }
    }
  }

  function drawGrassClump(ctx, x, y) {
    // Pixelated grass clump - darker patch
    ctx.fillStyle = '#5A8F3A';
    // Clump shape
    ctx.fillRect(x, y, 3, 3);
    ctx.fillRect(x - 1, y + 1, 5, 2);
    ctx.fillRect(x, y + 3, 3, 2);

    // Add some individual blades on top
    ctx.fillStyle = '#6BA044';
    ctx.fillRect(x + 1, y - 2, 1, 2);
    ctx.fillRect(x + 2, y - 1, 1, 1);
  }

  function drawTallGrassBlade(ctx, x, y) {
    // Tall individual grass blade
    const seed = (x * 73856093) ^ (y * 19349663);
    const normalizedSeed = ((seed >>> 0) % 1000000) / 1000000;
    const height = 8 + Math.floor(normalizedSeed * 4); // 8-12 pixels tall

    ctx.fillStyle = '#5A8F3A';
    // Draw blade with slight curve
    for (let i = 0; i < height; i++) {
      const curve = Math.floor(Math.sin(i * 0.3) * 1.5);
      ctx.fillRect(x + curve, y - i, 1, 1);
    }

    // Sometimes add a second blade
    if (normalizedSeed > 0.6) {
      ctx.fillStyle = '#6BA044';
      for (let i = 0; i < height - 2; i++) {
        const curve = Math.floor(Math.sin(i * 0.3) * 1.5);
        ctx.fillRect(x + curve + 2, y - i, 1, 1);
      }
    }
  }

  function drawGrassTuft(ctx, x, y) {
    // Small grass tuft - multiple blades together
    const seed = (x * 73856093) ^ (y * 19349663);
    const normalizedSeed = ((seed >>> 0) % 1000000) / 1000000;

    ctx.fillStyle = '#7CB342';
    // Center blades
    ctx.fillRect(x, y, 1, 4);
    ctx.fillRect(x + 1, y, 1, 3);
    ctx.fillRect(x - 1, y, 1, 3);

    // Outer blades (slightly curved)
    if (normalizedSeed < 0.5) {
      ctx.fillStyle = '#6BA044';
      ctx.fillRect(x - 2, y + 1, 1, 2);
      ctx.fillRect(x + 2, y + 1, 1, 2);
    }
  }

  function drawSprites(t) {
    const w = fg.clientWidth;
    const h = fg.clientHeight;
    fgCtx.clearRect(0, 0, w, h);
    fgCtx.save();

    // Determine visible tile window to place sprites near seamlessly
    const offX = Math.floor((t * 10) % TILE);
    const offY = Math.floor((t * 4) % TILE);
    const cols = Math.ceil(w / TILE) + 2;
    const rows = Math.ceil(h / TILE) + 2;

    for (const s of sprites) {
      s.frame++;
      // Wrap horizontally to keep speed consistent
      if (s.x < -20) s.x += TILE + 40;
      if (s.x > TILE + 20) s.x -= TILE + 40;

      const bob = Math.sin(t * 2 + s.basePhase) * s.drift;
      const yy = s.y + bob;
      const xx = s.x;

      // Draw wrapped copies across viewport for seamless edges
      for (let j = 0; j < rows; j++) {
        for (let i = 0; i < cols; i++) {
          const baseX = -offX + i * TILE;
          const baseY = -offY + j * TILE;
          // Only draw if within viewport bounds to avoid ghostly duplicates
          if (baseX + xx >= -50 && baseX + xx <= w + 50 && baseY + yy >= -50 && baseY + yy <= h + 50) {
            drawSprite(fgCtx, s.type, baseX + xx, baseY + yy, s.size, t + s.basePhase);
          }
        }
      }
    }
    fgCtx.restore();
  }

  function drawSprite(ctx, type, x, y, size, t) {
    if (type === 'star') {
      const twinkle = (Math.sin(t * 6) + 1) / 2;
      const s = Math.max(2, Math.floor(size / 6));
      ctx.save();
      ctx.translate(Math.floor(x), Math.floor(y));
      ctx.rotate((Math.sin(t * 2) * 0.1));
      // More solid, less transparent stars
      ctx.fillStyle = `rgba(255,255,200,${0.8 + 0.2 * twinkle})`;
      ctx.strokeStyle = '#FFD700';
      ctx.lineWidth = 1;
      // diamond star - more solid
      for (let i = -s; i <= s; i++) {
        ctx.fillRect(-1 + i, 0, 1, 1);
        if (i >= -s && i <= s) ctx.fillRect(0, i, 1, 1);
      }
      ctx.restore();
    } else if (type === 'coin') {
      const bounce = Math.abs(Math.sin(t * 4)) * 2;
      const s = Math.max(3, Math.floor(size / 5));
      ctx.save();
      ctx.translate(Math.floor(x), Math.floor(y - bounce));
      // coin body - more solid
      ctx.fillStyle = '#ffcd2e';
      ctx.fillRect(-s, -s, s * 2, s * 2);
      ctx.fillStyle = '#ffb300';
      ctx.fillRect(-s, 0, s * 2, Math.floor(s / 2));
      // coin shine
      ctx.fillStyle = '#fff8b0';
      ctx.fillRect(-s + 1, -s + 1, Math.floor(s / 2), 1);
      // Add border for definition
      ctx.strokeStyle = '#ff9800';
      ctx.lineWidth = 1;
      ctx.strokeRect(-s, -s, s * 2, s * 2);
      ctx.restore();
    } else if (type === 'animal') {
      // Make animals more solid and less ghostly
      const s = Math.max(3, Math.floor(size / 5));
      ctx.save();
      ctx.translate(Math.floor(x), Math.floor(y));
      // Use warmer, more solid colors instead of pure white
      ctx.fillStyle = '#FFF8DC'; // Cream color instead of white
      // body
      ctx.fillRect(-s, -s, s * 2, s * 2);
      // head bump
      ctx.fillRect(-Math.floor(s / 2), -s - 1, Math.floor(s / 2), Math.floor(s / 2) + 1);
      // ears - add color
      ctx.fillStyle = '#FFE4B5';
      ctx.fillRect(-Math.floor(s / 2) - 1, -s - 3, 2, 2);
      ctx.fillRect(Math.floor(s / 2) - 1, -s - 3, 2, 2);
      // eye
      ctx.fillStyle = '#222';
      ctx.fillRect(Math.floor(s / 2) - 1, -Math.floor(s / 2), 1, 1);
      // feet bounce
      const foot = Math.floor((Math.sin(t * 5) + 1) / 2 * s / 2);
      ctx.fillStyle = '#F5DEB3';
      ctx.fillRect(-s, s - foot, Math.floor(s / 2), 2);
      ctx.fillRect(Math.floor(s / 2), s - foot, Math.floor(s / 2), 2);
      // Add outline for definition
      ctx.strokeStyle = '#DEB887';
      ctx.lineWidth = 1;
      ctx.strokeRect(-s, -s, s * 2, s * 2);
      ctx.restore();
    }
  }
})();
