// ===========================
// Bingo Board Game Logic
// ===========================
(function () {
  // ---------- Utilities ----------
  const $ = (sel, el = document) => el.querySelector(sel);
  const $$ = (sel, el = document) => Array.from(el.querySelectorAll(sel));
  const clamp = (n, min, max) => Math.max(min, Math.min(max, n));
  const now = () => performance.now();

  function shuffle(arr) {
    for (let i = arr.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [arr[i], arr[j]] = [arr[j], arr[i]];
    }
    return arr;
  }

  function formatTime(ms) {
    const s = Math.max(0, Math.floor(ms / 1000));
    const m = Math.floor(s / 60);
    const r = s % 60;
    return `${m}:${String(r).padStart(2, '0')}`;
  }

  function safeJSONParse(str) {
    try { return JSON.parse(str); } catch (e) { return null; }
  }

  // ---------- Audio (Web Audio) ----------
  const AudioSys = (() => {
    let ctx = null;
    let enabled = true;

    function ensure() {
      if (!ctx) {
        const AC = window.AudioContext || window.webkitAudioContext;
        ctx = new AC();
      }
      if (ctx.state === "suspended") ctx.resume().catch(() => { });
    }

    function click(freq = 440, dur = 0.05, type = "sine", gain = 0.05) {
      if (!enabled) return;
      ensure();
      const t = ctx.currentTime;
      const o = ctx.createOscillator();
      const g = ctx.createGain();
      o.type = type;
      o.frequency.setValueAtTime(freq, t);
      g.gain.setValueAtTime(0.0001, t);
      g.gain.exponentialRampToValueAtTime(gain, t + 0.005);
      g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
      o.connect(g).connect(ctx.destination);
      o.start(t);
      o.stop(t + dur + 0.02);
    }

    function success() {
      if (!enabled) return;
      ensure();
      const base = 440;
      click(base * 1.0, 0.06, "triangle", 0.06);
      setTimeout(() => click(base * 1.26, 0.07, "triangle", 0.06), 70);
      setTimeout(() => click(base * 1.5, 0.09, "triangle", 0.07), 150);
    }

    function bingo() {
      if (!enabled) return;
      ensure();
      const t0 = ctx.currentTime;
      const o1 = ctx.createOscillator();
      const o2 = ctx.createOscillator();
      const g = ctx.createGain();
      o1.type = "sawtooth"; o2.type = "square";
      o1.frequency.setValueAtTime(220, t0);
      o2.frequency.setValueAtTime(330, t0);
      o1.frequency.exponentialRampToValueAtTime(660, t0 + 0.25);
      o2.frequency.exponentialRampToValueAtTime(990, t0 + 0.25);
      g.gain.setValueAtTime(0.0001, t0);
      g.gain.exponentialRampToValueAtTime(0.08, t0 + 0.02);
      g.gain.exponentialRampToValueAtTime(0.0001, t0 + 0.45);
      o1.connect(g); o2.connect(g); g.connect(ctx.destination);
      o1.start(t0); o2.start(t0);
      o1.stop(t0 + 0.5); o2.stop(t0 + 0.5);
    }

    return {
      get enabled() { return enabled; },
      set enabled(v) { enabled = !!v; },
      click, success, bingo,
      resume() { if (enabled) ensure(); }
    };
  })();

  // ---------- Game State ----------
  const STORAGE_KEY = "goal_bingo_v1";
  const BEST_KEY = "goal_bingo_best_v1";
  const GOAL_POOLS_KEY = "goal_bingo_pools_v1";
  const SLOTS_KEY = "goal_bingo_slots_v1";

  const state = {
    screen: "start", // start | play | over
    size: 5,
    free: true,
    win: "1", // "1","2","3","5","blackout"
    goalsPool: [],
    board: [], // {text, checked, free}
    startedAt: 0,
    score: 0,
    bingos: 0,
    editMode: false,
    lastBingoLinesKey: "",
    won: false
  };

  function defaultSampleGoals() {
    return [
      "Read 20 pages",
      "Write 200 words",
      "Journal 5 minutes",
      "Drink 2L of water",
      "Walk 20 minutes",
      "Stretch 10 minutes",
      "Tidy one small area",
      "Meditate 5 minutes",
      "Plan tomorrow (3 tasks)",
      "No social media for 1 hour",
      "Practice a skill 15 minutes",
      "Learn 10 new words",
      "Send a kind message",
      "Cook a healthy meal",
      "Do a 10-minute workout",
      "Sleep by a set time",
      "Review finances for 10 minutes",
      "Read a chapter",
      "Listen to an educational podcast",
      "Do one hard thing you're avoiding",
      "Clean your desk",
      "Take a short break outside",
      "Write 3 gratitudes",
      "Declutter 5 items",
      "Organize your notes"
    ].join("\n");
  }

  function computeLines(size) {
    const lines = [];
    // rows
    for (let r = 0; r < size; r++) {
      const line = [];
      for (let c = 0; c < size; c++) line.push(r * size + c);
      lines.push(line);
    }
    // cols
    for (let c = 0; c < size; c++) {
      const line = [];
      for (let r = 0; r < size; r++) line.push(r * size + c);
      lines.push(line);
    }
    // diag
    let d1 = []; for (let i = 0; i < size; i++) d1.push(i * size + i);
    let d2 = []; for (let i = 0; i < size; i++) d2.push(i * size + (size - 1 - i));
    lines.push(d1, d2);
    return lines;
  }

  function countBingos(board, size) {
    const lines = computeLines(size);
    let b = 0;
    const winningLines = [];
    for (const line of lines) {
      if (line.every(i => board[i]?.checked)) { b++; winningLines.push(line); }
    }
    return { bingos: b, winningLines };
  }

  function boardKeyForLines(lines) {
    return lines.map(l => l.join(",")).sort().join("|");
  }

  function calcScoreDelta(prevChecked, nextChecked, newBingos) {
    let d = 0;
    if (!prevChecked && nextChecked) d += 10;
    if (prevChecked && !nextChecked) d -= 8;
    d += newBingos * 75;
    return d;
  }

  // ---------- Persistence / Share ----------
  function save() {
    const payload = {
      size: state.size,
      free: state.free,
      win: state.win,
      goalsPool: state.goalsPool,
      board: state.board,
      startedAt: state.startedAt,
      score: state.score,
      bingos: state.bingos,
      won: state.won,
      lastBingoLinesKey: state.lastBingoLinesKey
    };
    localStorage.setItem(STORAGE_KEY, JSON.stringify(payload));
  }

  function load() {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return false;
    const data = safeJSONParse(raw);
    if (!data || !Array.isArray(data.board)) return false;
    Object.assign(state, {
      size: clamp(+data.size || 5, 3, 7),
      free: !!data.free,
      win: (data.win ?? "1") + "",
      goalsPool: Array.isArray(data.goalsPool) ? data.goalsPool : [],
      board: data.board,
      startedAt: +data.startedAt || 0,
      score: +data.score || 0,
      bingos: +data.bingos || 0,
      won: !!data.won,
      lastBingoLinesKey: data.lastBingoLinesKey || ""
    });
    return true;
  }

  function bestScoreGet() {
    return +localStorage.getItem(BEST_KEY) || 0;
  }
  function bestScoreMaybeSet(v) {
    const b = bestScoreGet();
    if (v > b) localStorage.setItem(BEST_KEY, String(v));
  }

  function getPools() {
    const raw = localStorage.getItem(GOAL_POOLS_KEY);
    const data = safeJSONParse(raw);
    return Array.isArray(data) ? data : [];
  }
  function savePool(name) {
    const goals = state.goalsPool.slice();
    if (!goals.length) return;
    const pools = getPools();
    const id = "p_" + Date.now();
    pools.unshift({ id, name: (name || "Pool").trim() || "Pool", goals, savedAt: Date.now() });
    localStorage.setItem(GOAL_POOLS_KEY, JSON.stringify(pools));
  }
  function loadPoolById(id) {
    const pools = getPools();
    const p = pools.find(x => x.id === id);
    if (!p || !Array.isArray(p.goals)) return false;
    state.goalsPool = p.goals.slice();
    $("#goalsInput").value = state.goalsPool.join("\n");
    save();
    renderPreview();
    return true;
  }
  function deletePoolById(id) {
    let pools = getPools().filter(x => x.id !== id);
    localStorage.setItem(GOAL_POOLS_KEY, JSON.stringify(pools));
  }

  function getSlots() {
    const raw = localStorage.getItem(SLOTS_KEY);
    const data = safeJSONParse(raw);
    return Array.isArray(data) ? data : [];
  }
  function saveSlot(title) {
    const payload = {
      size: state.size,
      free: state.free,
      win: state.win,
      goalsPool: state.goalsPool.slice(),
      board: state.board.map(t => ({ ...t })),
      startedAt: state.startedAt,
      score: state.score,
      bingos: state.bingos,
      won: state.won,
      lastBingoLinesKey: state.lastBingoLinesKey
    };
    const slots = getSlots();
    const id = "s_" + Date.now();
    const savedAt = Date.now();
    const displayTitle = (title && String(title).trim()) || formatSlotDate(savedAt);
    slots.unshift({ id, savedAt, title: displayTitle, payload });
    if (slots.length > 20) slots.length = 20;
    localStorage.setItem(SLOTS_KEY, JSON.stringify(slots));
    renderSlotsList();
  }
  function getSlotTitle(slot) {
    return (slot && (slot.title || formatSlotDate(slot.savedAt))) || "Saved game";
  }
  function loadSlotById(id) {
    const slots = getSlots();
    const s = slots.find(x => x.id === id);
    if (!s || !s.payload) return false;
    const d = s.payload;
    state.size = clamp(+d.size || 5, 3, 7);
    state.free = !!d.free;
    state.win = (d.win ?? "1") + "";
    state.goalsPool = Array.isArray(d.goalsPool) ? d.goalsPool : [];
    state.board = Array.isArray(d.board) ? d.board : [];
    state.startedAt = +d.startedAt || 0;
    state.score = +d.score || 0;
    state.bingos = +d.bingos || 0;
    state.won = !!d.won;
    state.lastBingoLinesKey = d.lastBingoLinesKey || "";
    syncSetupControls();
    renderPreview();
    save();
    return true;
  }
  function deleteSlotById(id) {
    let slots = getSlots().filter(x => x.id !== id);
    localStorage.setItem(SLOTS_KEY, JSON.stringify(slots));
    renderSlotsList();
  }
  function formatSlotDate(ts) {
    const d = new Date(ts);
    const date = d.toLocaleDateString(undefined, { month: "short", day: "numeric", year: "numeric" });
    const time = d.toLocaleTimeString(undefined, { hour: "2-digit", minute: "2-digit" });
    return date + " " + time;
  }
  function renderSlotsList() {
    const el = $("#slotsList");
    if (!el) return;
    const slots = getSlots();
    if (!slots.length) {
      el.innerHTML = "<div class=\"slot-empty-guide\">No saved slots yet. During or after a game, click <strong>Save to slot</strong> to save this board and progress. Load a slot below to continue that game.</div>";
      return;
    }
    const esc = (str) => String(str).replace(/&/g, "&amp;").replace(/"/g, "&quot;").replace(/</g, "&lt;");
    el.innerHTML = slots.map(s => {
      const marked = (s.payload && s.payload.board) ? s.payload.board.filter(t => t.checked).length : 0;
      const total = (s.payload && s.payload.board) ? s.payload.board.length : 0;
      const bingos = (s.payload && s.payload.bingos) || 0;
      const size = (s.payload && s.payload.size) || 5;
      const detail = size + "x" + size + " · " + marked + "/" + total + " marked · " + bingos + " bingo" + (bingos !== 1 ? "s" : "");
      const slotTitle = getSlotTitle(s);
      return `
        <div class="slot-item" data-slot-id="${s.id}" data-slot-title="${esc(slotTitle)}">
          <div class="slot-item-info">
            <div class="slot-item-date">${esc(slotTitle)}</div>
            <div class="slot-item-detail">${formatSlotDate(s.savedAt)} · ${detail}</div>
          </div>
          <div class="slot-item-actions">
            <button class="btn ghost slot-load" data-id="${s.id}">Load</button>
            <button class="btn ghost slot-delete" data-id="${s.id}" data-title="${esc(slotTitle)}">Delete</button>
          </div>
        </div>`;
    }).join("");
    el.querySelectorAll(".slot-load").forEach(btn => {
      btn.onclick = () => {
        const id = btn.dataset.id;
        const slot = getSlots().find(x => x.id === id);
        const title = getSlotTitle(slot);
        if (loadSlotById(id)) {
          startGameplay();
          AudioSys.success();
          showToast("Loaded: " + title + ". Resuming game.");
        }
      };
    });
    el.querySelectorAll(".slot-delete").forEach(btn => {
      btn.onclick = (e) => {
        e.stopPropagation();
        const id = btn.dataset.id;
        const rawTitle = (btn.dataset.title || "this slot").replace(/&quot;/g, '"');
        const safeTitle = String(rawTitle).replace(/&/g, "&amp;").replace(/"/g, "&quot;").replace(/</g, "&lt;");
        openModal(`
          <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:12px;">
            <div style="font-weight:900; font-size:18px;">Delete slot?</div>
            <button id="slotDelClose" class="btn ghost">Cancel</button>
          </div>
          <div class="setup-card" style="margin:0 0 12px 0;">
            <div style="font-weight:700; margin-bottom:6px;">"${safeTitle}"</div>
            <div style="font-size:13px; color:#555;">This cannot be undone.</div>
          </div>
          <div style="display:flex; gap:8px; justify-content:flex-end;">
            <button id="slotDelCancel" class="btn ghost">Cancel</button>
            <button id="slotDelConfirm" class="btn" style="background:linear-gradient(#ff5c5c,#ff3d3d); border-color:#5a1a1a;">Delete</button>
          </div>
        `);
        $("#slotDelClose").onclick = closeModal;
        $("#slotDelCancel").onclick = closeModal;
        $("#slotDelConfirm").onclick = () => {
          deleteSlotById(id);
          closeModal();
          AudioSys.click(220, 0.05, "sine", 0.04);
        };
      };
    });
  }

  function encodeShare() {
    const payload = {
      s: state.size,
      f: state.free ? 1 : 0,
      w: state.win,
      g: state.goalsPool
    };
    const json = JSON.stringify(payload);
    const b64 = btoa(unescape(encodeURIComponent(json)));
    location.hash = "share=" + b64;
    return location.href;
  }

  function decodeShareFromHash() {
    const h = location.hash || "";
    const m = h.match(/share=([A-Za-z0-9+/=]+)/);
    if (!m) return null;
    try {
      const json = decodeURIComponent(escape(atob(m[1])));
      const data = JSON.parse(json);
      if (!data) return null;
      if (!Array.isArray(data.g)) return null;
      return data;
    } catch (e) { return null; }
  }

  // ---------- Board generation ----------
  function normalizeGoalLines(text) {
    const lines = (text || "")
      .split("\n")
      .map(s => s.trim())
      .filter(Boolean);
    const seen = new Set();
    const out = [];
    for (const l of lines) {
      const key = l.toLowerCase();
      if (seen.has(key)) continue;
      seen.add(key);
      out.push(l);
    }
    return out;
  }

  function generateBoard() {
    const size = state.size;
    const total = size * size;
    let pool = state.goalsPool.slice();
    shuffle(pool);

    const board = new Array(total).fill(null).map(() => ({ text: "", checked: false, free: false }));
    const center = Math.floor(total / 2);

    let needs = total;
    if (state.free && (size % 2 === 1)) needs -= 1;

    const picked = pool.slice(0, needs);
    while (picked.length < needs) {
      picked.push("Your goal here");
    }

    let idx = 0;
    for (let i = 0; i < total; i++) {
      if (state.free && (size % 2 === 1) && i === center) {
        board[i] = { text: "Free", checked: true, free: true };
      } else {
        board[i] = { text: picked[idx++] || "Your goal here", checked: false, free: false };
      }
    }

    state.board = board;
    state.score = 0;
    state.bingos = countBingos(state.board, state.size).bingos;
    state.startedAt = 0;
    state.won = false;
    state.lastBingoLinesKey = boardKeyForLines(countBingos(state.board, state.size).winningLines);
    save();
    renderPreview();
  }

  function shuffleUnmarked() {
    const unmarkedIdx = [];
    const unmarkedTexts = [];
    for (let i = 0; i < state.board.length; i++) {
      const t = state.board[i];
      if (t.free) continue;
      if (!t.checked) {
        unmarkedIdx.push(i);
        unmarkedTexts.push(t.text);
      }
    }
    shuffle(unmarkedTexts);
    for (let k = 0; k < unmarkedIdx.length; k++) {
      state.board[unmarkedIdx[k]].text = unmarkedTexts[k];
    }
    save();
    renderBoard();
  }

  // ---------- Screens / Rendering ----------
  function showScreen(which) {
    state.screen = which;
    $("#screenStart").classList.toggle("hidden", which !== "start");
    $("#screenPlay").classList.toggle("hidden", which !== "play");
    $("#screenOver").classList.toggle("hidden", which !== "over");
    if (which === "start") renderSlotsList();
  }

  function renderPreview() {
    const size = state.size;
    const grid = $("#previewGrid");
    grid.style.gridTemplateColumns = `repeat(${size}, minmax(0,1fr))`;
    grid.innerHTML = "";

    const total = size * size;
    $("#previewCount").textContent = total;

    const center = Math.floor(total / 2);
    for (let i = 0; i < total; i++) {
      const d = document.createElement("div");
      d.className = "preview-cell";
      let txt = state.board[i]?.text || "";
      if (!txt) {
        if (state.free && (size % 2 === 1) && i === center) txt = "Free";
        else txt = "-";
      }
      d.textContent = txt;
      if (state.free && (size % 2 === 1) && i === center) {
        d.classList.add("free");
      }
      grid.appendChild(d);
    }

    $("#statTotal").textContent = total;
    $("#winGoalLabel").textContent = state.win === "blackout" ? "Blackout" : `${state.win} Bingo${state.win === "1" ? "" : "s"}`;
  }

  function renderBoard() {
    const boardEl = $("#board");
    const size = state.size;
    boardEl.style.gridTemplateColumns = `repeat(${size}, minmax(0,1fr))`;
    boardEl.innerHTML = "";

    for (let i = 0; i < state.board.length; i++) {
      const tile = state.board[i];
      const cell = document.createElement("div");
      cell.className = "cell";
      cell.dataset.idx = i;

      if (tile.checked) cell.classList.add("done");
      if (tile.free) cell.classList.add("free");

      const text = document.createElement("div");
      text.className = "cellText";
      text.textContent = tile.text || "-";
      cell.appendChild(text);

      const check = document.createElement("div");
      check.className = "check";
      check.textContent = "✓";
      cell.appendChild(check);

      attachCellHandlers(cell);
      boardEl.appendChild(cell);
    }

    updateStats();
  }

  function updateStats() {
    const total = state.board.length;
    const marked = state.board.reduce((a, t) => a + (t.checked ? 1 : 0), 0);
    $("#statMarked").textContent = marked;
    $("#statTotal").textContent = total;
    $("#statScore").textContent = Math.max(0, Math.floor(state.score));
    $("#statScorePlay").textContent = Math.max(0, Math.floor(state.score));
    $("#statBingos").textContent = state.bingos;
    $("#statBingosPlay").textContent = state.bingos;
    $("#statBest").textContent = bestScoreGet();
    $("#winGoalLabel").textContent = state.win === "blackout" ? "Blackout" : `${state.win} Bingo${state.win === "1" ? "" : "s"}`;
    save();
  }

  // ---------- Long press / editing ----------
  let lpTimer = null;
  let lpFired = false;

  function attachCellHandlers(cell) {
    const idx = +cell.dataset.idx;

    function onToggle() {
      if (state.editMode) {
        openEditCell(idx);
        return;
      }
      toggleCell(idx);
    }

    cell.addEventListener("click", (e) => {
      if (lpFired) { lpFired = false; return; }
      onToggle();
    });

    const startLP = (e) => {
      if (state.editMode) return;
      lpFired = false;
      clearTimeout(lpTimer);
      lpTimer = setTimeout(() => {
        lpFired = true;
        openEditCell(idx);
        AudioSys.click(330, 0.06, "triangle", 0.05);
      }, 420);
    };
    const cancelLP = () => {
      clearTimeout(lpTimer);
      lpTimer = null;
    };

    cell.addEventListener("pointerdown", startLP);
    cell.addEventListener("pointerup", cancelLP);
    cell.addEventListener("pointercancel", cancelLP);
    cell.addEventListener("pointerleave", cancelLP);
  }

  function openModal(html) {
    const host = $("#modalHost");
    host.classList.remove("hidden");
    host.innerHTML = `<div class="modalBack" role="dialog" aria-modal="true"><div class="modal">${html}</div></div>`;
    const back = host.querySelector(".modalBack");
    back.addEventListener("click", (e) => {
      if (e.target === back) closeModal();
    });
    setTimeout(() => {
      const af = host.querySelector("[autofocus]") || host.querySelector("input,textarea,button,select");
      if (af) af.focus({ preventScroll: true });
    }, 0);
  }
  function closeModal() {
    const host = $("#modalHost");
    host.classList.add("hidden");
    host.innerHTML = "";
  }

  function openEditCell(idx) {
    const tile = state.board[idx];
    if (!tile) return;

    openModal(`
      <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:12px;">
        <div>
          <div style="font-weight:900; font-size:18px;">✏️ Edit tile</div>
          <div style="font-size:12px; color:#666;">Update the goal text.</div>
        </div>
        <button id="mClose" class="btn ghost">Close</button>
      </div>
      <textarea id="mText" class="field" autofocus placeholder="Enter goal..." style="min-height:100px; margin-bottom:12px;"></textarea>
      <div style="display:flex; justify-content:space-between; align-items:center; flex-wrap:wrap; gap:8px;">
        <label style="display:flex; align-items:center; gap:8px; font-weight:700;">
          <input id="mChecked" type="checkbox" style="width:18px; height:18px;" ${tile.checked ? "checked" : ""} ${tile.free ? "disabled" : ""}/>
          <span>${tile.free ? "Free space is always marked" : "Marked"}</span>
        </label>
        <div style="display:flex; gap:8px;">
          <button id="mDelete" class="btn ghost">🗑️ Clear</button>
          <button id="mSave" class="btn">💾 Save</button>
        </div>
      </div>
    `);

    $("#mText").value = tile.text || "";
    $("#mClose").onclick = closeModal;
    $("#mDelete").onclick = () => {
      $("#mText").value = "";
      AudioSys.click(220, 0.05, "sine", 0.04);
    };
    $("#mSave").onclick = () => {
      const newText = ($("#mText").value || "").trim();
      const newChecked = tile.free ? true : !!$("#mChecked").checked;

      const prevChecked = tile.checked;
      tile.text = newText || "-";
      tile.checked = newChecked;

      const { bingos, winningLines } = countBingos(state.board, state.size);
      state.bingos = bingos;

      const key = boardKeyForLines(winningLines);
      const prevKey = state.lastBingoLinesKey || "";
      const prevSet = new Set(prevKey ? prevKey.split("|") : []);
      const nextSet = new Set(key ? key.split("|") : []);
      let newly = 0;
      for (const k of nextSet) if (k && !prevSet.has(k)) newly++;
      state.lastBingoLinesKey = key;

      state.score += calcScoreDelta(prevChecked, newChecked, newly);
      if (newly > 0) AudioSys.bingo(); else AudioSys.success();
      bestScoreMaybeSet(state.score);

      save();
      closeModal();
      renderBoard();
      checkWinAndMaybeOver();
    };
  }

  // ---------- Gameplay ----------
  let raf = 0;

  function startGameplay() {
    if (!state.board || state.board.length !== state.size * state.size) {
      generateBoard();
    }
    if (!state.startedAt) state.startedAt = Date.now();
    state.won = false;

    showScreen("play");
    renderBoard();
    renderPreview();

    cancelAnimationFrame(raf);
    const loop = () => {
      if (state.screen === "play" && state.startedAt) {
        $("#statTime").textContent = formatTime(Date.now() - state.startedAt);
      }
      raf = requestAnimationFrame(loop);
    };
    raf = requestAnimationFrame(loop);
    save();
  }

  function toggleCell(idx) {
    const tile = state.board[idx];
    if (!tile || tile.free) { AudioSys.click(260, 0.04, "sine", 0.03); return; }

    const prevChecked = tile.checked;
    tile.checked = !tile.checked;

    const { bingos, winningLines } = countBingos(state.board, state.size);
    state.bingos = bingos;

    const key = boardKeyForLines(winningLines);
    const prevKey = state.lastBingoLinesKey || "";
    const prevSet = new Set(prevKey ? prevKey.split("|") : []);
    const nextSet = new Set(key ? key.split("|") : []);
    let newly = 0;
    for (const k of nextSet) if (k && !prevSet.has(k)) newly++;
    state.lastBingoLinesKey = key;

    const delta = calcScoreDelta(prevChecked, tile.checked, newly);
    state.score += delta;

    if (tile.checked) AudioSys.click(520, 0.05, "triangle", 0.05);
    else AudioSys.click(260, 0.045, "sine", 0.04);

    if (newly > 0) {
      AudioSys.bingo();
      showToast(`Bingo! +${newly * 75} points`);
    }

    bestScoreMaybeSet(state.score);
    save();

    // Update the visual state of the cell
    const cellEl = $(`.cell[data-idx="${idx}"]`);
    if (cellEl) {
      if (tile.checked) {
        cellEl.classList.add("done");
      } else {
        cellEl.classList.remove("done");
      }
    } else {
      // If cell not found, re-render the board to ensure consistency
      console.warn(`Cell element not found for index ${idx}, re-rendering board`);
      renderBoard();
    }
    updateStats();
    checkWinAndMaybeOver();
  }

  function showToast(msg) {
    const statusEl = $("#status");
    const t = document.createElement("div");
    t.className = "toast";
    t.textContent = msg;
    statusEl.appendChild(t);
    setTimeout(() => { t.remove(); }, 2400);
  }

  function checkWinAndMaybeOver() {
    if (state.won) return;

    const total = state.board.length;
    const marked = state.board.reduce((a, t) => a + (t.checked ? 1 : 0), 0);

    let won = false;
    if (state.win === "blackout") {
      won = marked === total;
    } else {
      const need = parseInt(state.win, 10) || 1;
      won = state.bingos >= need;
    }

    if (won) {
      state.won = true;
      save();
      const time = state.startedAt ? formatTime(Date.now() - state.startedAt) : "0:00";
      $("#overTitle").textContent = (state.win === "blackout") ? "🎉 BLACKOUT!" : "🎉 BINGO!";
      const score = Math.max(0, Math.floor(state.score));
      const bingoText = state.bingos === 1 ? "bingo" : "bingos";
      $("#overSubtitle").innerHTML = `
        <div style="margin-bottom:4px;">Score: <strong>${score}</strong></div>
        <div style="margin-bottom:4px;">${state.bingos} ${bingoText}</div>
        <div>Time: ${time}</div>
      `;
      showScreen("over");
      AudioSys.bingo();
    }
  }

  function resetMarks() {
    for (const t of state.board) {
      if (t.free) continue;
      t.checked = false;
    }
    if (state.free && (state.size % 2 === 1)) {
      const center = Math.floor(state.board.length / 2);
      if (state.board[center]) state.board[center].checked = true;
    }
    state.score = 0;
    state.bingos = countBingos(state.board, state.size).bingos;
    state.lastBingoLinesKey = boardKeyForLines(countBingos(state.board, state.size).winningLines);
    state.startedAt = Date.now();
    state.won = false;
    save();
    renderBoard();
    AudioSys.click(300, 0.07, "triangle", 0.05);
  }

  // ---------- Export/Import ----------
  function exportJSON() {
    const payload = {
      v: 1,
      size: state.size,
      free: state.free,
      win: state.win,
      goalsPool: state.goalsPool,
      board: state.board,
      startedAt: state.startedAt,
      score: state.score,
      bingos: state.bingos,
      won: state.won,
      lastBingoLinesKey: state.lastBingoLinesKey
    };
    return JSON.stringify(payload, null, 2);
  }

  function importJSON(str) {
    const data = safeJSONParse(str);
    if (!data || !Array.isArray(data.board)) return false;
    state.size = clamp(+data.size || 5, 3, 7);
    state.free = !!data.free;
    state.win = (data.win ?? "1") + "";
    state.goalsPool = Array.isArray(data.goalsPool) ? data.goalsPool : [];
    state.board = data.board.map(t => ({
      text: (t?.text ?? "").toString(),
      checked: !!t?.checked,
      free: !!t?.free
    }));
    if (state.free && (state.size % 2 === 1)) {
      const center = Math.floor(state.board.length / 2);
      if (state.board[center]) {
        state.board[center].free = true;
        state.board[center].checked = true;
        if (!state.board[center].text) state.board[center].text = "Free";
      }
    }
    state.startedAt = +data.startedAt || Date.now();
    state.score = +data.score || 0;
    state.bingos = countBingos(state.board, state.size).bingos;
    state.lastBingoLinesKey = data.lastBingoLinesKey || boardKeyForLines(countBingos(state.board, state.size).winningLines);
    state.won = !!data.won;
    save();
    syncSetupControls();
    renderPreview();
    return true;
  }

  // ---------- Setup UI syncing ----------
  function syncSetupControls() {
    $("#sizeSelect").value = String(state.size);
    $("#freeToggle").checked = state.free;
    $("#winSelect").value = String(state.win);
    $("#goalsInput").value = (state.goalsPool || []).join("\n");
    renderPreview();
  }

  function applySetupInputs() {
    state.size = clamp(parseInt($("#sizeSelect").value, 10) || 5, 3, 7);
    state.free = !!$("#freeToggle").checked;
    state.win = $("#winSelect").value;
    state.goalsPool = normalizeGoalLines($("#goalsInput").value);

    if (state.board.length !== state.size * state.size) {
      state.board = [];
    }
    save();
    renderPreview();
  }

  // ---------- Help modal ----------
  function openHelp() {
    openModal(`
      <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:16px;">
        <div>
          <div style="font-weight:900; font-size:18px;">💡 How it works</div>
          <div style="font-size:12px; color:#666;">A bingo board for personal goals.</div>
        </div>
        <button id="hClose" class="btn ghost">Close</button>
      </div>
      <div style="display:flex; flex-direction:column; gap:12px;">
        <div class="setup-card">
          <div style="font-weight:900; margin-bottom:6px;">🎯 Play</div>
          <div style="font-size:13px; color:#666;">Tap a tile to mark it complete. Complete a full row/column/diagonal to score a Bingo.</div>
        </div>
        <div class="setup-card">
          <div style="font-weight:900; margin-bottom:6px;">✏️ Edit</div>
          <div style="font-size:13px; color:#666;">Long-press a tile to edit its text (or toggle Edit mode).</div>
        </div>
        <div class="setup-card">
          <div style="font-weight:900; margin-bottom:6px;">📊 Scoring</div>
          <div style="font-size:13px; color:#666;">+10 per mark, −8 per unmark, +75 for each newly completed Bingo line.</div>
        </div>
        <div class="setup-card">
          <div style="font-weight:900; margin-bottom:6px;">💾 Save & Share</div>
          <div style="font-size:13px; color:#666;">Your board auto-saves. Export/Import preserves exact layout + checkmarks.</div>
        </div>
      </div>
    `);
    $("#hClose").onclick = closeModal;
  }

  // ---------- Wire up controls ----------
  $("#sizeSelect").addEventListener("change", () => {
    applySetupInputs();
    $("#previewGrid").style.gridTemplateColumns = `repeat(${state.size}, minmax(0,1fr))`;
  });
  $("#freeToggle").addEventListener("change", applySetupInputs);
  $("#winSelect").addEventListener("change", applySetupInputs);
  $("#goalsInput").addEventListener("input", () => {
    state.goalsPool = normalizeGoalLines($("#goalsInput").value);
    save();
  });

  $("#btnFillSample").onclick = () => {
    $("#goalsInput").value = defaultSampleGoals();
    applySetupInputs();
    AudioSys.click(440, 0.06, "triangle", 0.05);
  };
  $("#btnClearGoals").onclick = () => {
    $("#goalsInput").value = "";
    applySetupInputs();
    AudioSys.click(220, 0.05, "sine", 0.04);
  };

  $("#btnSavePool").onclick = () => {
    applySetupInputs();
    if (!state.goalsPool.length) { showToast("Goal pool is empty."); return; }
    openModal(`
      <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:12px;">
        <div style="font-weight:900; font-size:18px;">Save pool</div>
        <button id="poolClose" class="btn ghost">Close</button>
      </div>
      <div style="margin-bottom:12px;">
        <label style="display:block; font-weight:700; font-size:12px; margin-bottom:6px;">Pool name</label>
        <input id="poolName" class="field" placeholder="e.g. Daily goals" />
      </div>
      <div style="display:flex; gap:8px; justify-content:flex-end;">
        <button id="poolCancel" class="btn ghost">Cancel</button>
        <button id="poolSave" class="btn">Save</button>
      </div>
    `);
    $("#poolClose").onclick = closeModal;
    $("#poolCancel").onclick = closeModal;
    $("#poolSave").onclick = () => {
      const name = $("#poolName").value.trim() || "Pool";
      savePool(name);
      closeModal();
      AudioSys.success();
      openModal(`
        <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:12px;">
          <div style="font-weight:900; font-size:18px;">Pool saved</div>
          <button id="poolConfirmClose" class="btn ghost">OK</button>
        </div>
        <div class="setup-card" style="margin:0;">
          <div style="font-weight:700; margin-bottom:6px;">"${String(name || "Pool").replace(/&/g, "&amp;").replace(/"/g, "&quot;").replace(/</g, "&lt;")}" saved.</div>
          <div style="font-size:13px; color:#555;">Use <strong>Load pool</strong> anytime to restore this goal list.</div>
        </div>
      `);
      $("#poolConfirmClose").onclick = closeModal;
    };
  };

  $("#btnLoadPool").onclick = () => {
    const pools = getPools();
    openModal(`
      <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:12px;">
        <div style="font-weight:900; font-size:18px;">Load pool</div>
        <button id="loadPoolClose" class="btn ghost">Close</button>
      </div>
      ${!pools.length ? `
        <div class="setup-card" style="margin:0 0 12px 0;">
          <div style="font-weight:700; margin-bottom:6px;">No saved pools yet</div>
          <div style="font-size:13px; color:#555;">Add goals in the Goal pool above, then click <strong>Save pool</strong> and give it a name. You can load it later from here.</div>
        </div>
      ` : ""}
      <div id="loadPoolList" style="display:flex; flex-direction:column; gap:8px; max-height:280px; overflow-y:auto;"></div>
    `);
    $("#loadPoolClose").onclick = closeModal;
    const list = $("#loadPoolList");
    if (!pools.length) { list.innerHTML = ""; return; }
    pools.forEach(p => {
      const row = document.createElement("div");
      row.className = "slot-item";
      const date = formatSlotDate(p.savedAt || 0);
      const poolName = (p.name || "Pool").replace(/"/g, "&quot;").replace(/</g, "&lt;").replace(/&/g, "&amp;");
      row.innerHTML = `
        <div class="slot-item-info">
          <div class="slot-item-date">${(p.name || "Pool")}</div>
          <div class="slot-item-detail">${(p.goals && p.goals.length) || 0} goals · ${date}</div>
        </div>
        <div class="slot-item-actions">
          <button class="btn ghost load-pool-btn" data-id="${p.id}">Load</button>
          <button class="btn ghost delete-pool-btn" data-id="${p.id}" data-name="${poolName}">Delete</button>
        </div>`;
      list.appendChild(row);
      row.querySelector(".load-pool-btn").onclick = () => {
        loadPoolById(p.id);
        closeModal();
        AudioSys.success();
        openModal(`
          <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:12px;">
            <div style="font-weight:900; font-size:18px;">Pool loaded</div>
            <button id="loadConfirmClose" class="btn ghost">OK</button>
          </div>
          <div class="setup-card" style="margin:0;">
            <div style="font-weight:700; margin-bottom:6px;">Goal list updated.</div>
            <div style="font-size:13px; color:#555;">Generate or Start when ready.</div>
          </div>
        `);
        $("#loadConfirmClose").onclick = closeModal;
      };
      row.querySelector(".delete-pool-btn").onclick = () => {
        const poolId = p.id;
        const rawName = (p.name || "Pool").replace(/&quot;/g, '"');
        const safeName = String(rawName).replace(/&/g, "&amp;").replace(/"/g, "&quot;").replace(/</g, "&lt;");
        openModal(`
          <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:12px;">
            <div style="font-weight:900; font-size:18px;">Delete pool?</div>
            <button id="poolDelClose" class="btn ghost">Cancel</button>
          </div>
          <div class="setup-card" style="margin:0 0 12px 0;">
            <div style="font-weight:700; margin-bottom:6px;">"${safeName}"</div>
            <div style="font-size:13px; color:#555;">This cannot be undone.</div>
          </div>
          <div style="display:flex; gap:8px; justify-content:flex-end;">
            <button id="poolDelCancel" class="btn ghost">Cancel</button>
            <button id="poolDelConfirm" class="btn" style="background:linear-gradient(#ff5c5c,#ff3d3d); border-color:#5a1a1a;">Delete</button>
          </div>
        `);
        $("#poolDelClose").onclick = closeModal;
        $("#poolDelCancel").onclick = closeModal;
        $("#poolDelConfirm").onclick = () => {
          deletePoolById(poolId);
          row.remove();
          closeModal();
          AudioSys.click(220, 0.05, "sine", 0.04);
        };
      };
    });
  };

  $("#btnSaveSlot").onclick = () => {
    applySetupInputs();
    openModal(`
      <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:12px;">
        <div style="font-weight:900; font-size:18px;">Save to slot</div>
        <button id="slotSaveClose" class="btn ghost">Close</button>
      </div>
      <div style="margin-bottom:12px;">
        <label style="display:block; font-weight:700; font-size:12px; margin-bottom:6px;">Title for this save (optional)</label>
        <input id="slotSaveTitle" class="field" placeholder="e.g. Week 1 goals" />
      </div>
      <div style="display:flex; gap:8px; justify-content:flex-end;">
        <button id="slotSaveCancel" class="btn ghost">Cancel</button>
        <button id="slotSaveConfirm" class="btn">Save</button>
      </div>
    `);
    $("#slotSaveClose").onclick = closeModal;
    $("#slotSaveCancel").onclick = closeModal;
    $("#slotSaveConfirm").onclick = () => {
      const title = $("#slotSaveTitle").value.trim();
      saveSlot(title || null);
      closeModal();
      AudioSys.success();
      openModal(`
        <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:12px;">
          <div style="font-weight:900; font-size:18px;">Saved to slot</div>
          <button id="slotConfirmClose" class="btn ghost">OK</button>
        </div>
        <div class="setup-card" style="margin:0;">
          <div style="font-weight:700; margin-bottom:6px;">Snapshot saved.</div>
          <div style="font-size:13px; color:#555;">It appears in <strong>Saved slots</strong> below. Click <strong>Load</strong> on any slot to restore it.</div>
        </div>
      `);
      $("#slotConfirmClose").onclick = closeModal;
    };
  };

  $("#btnGenerate").onclick = () => {
    applySetupInputs();
    if (state.goalsPool.length === 0) {
      $("#goalsInput").value = defaultSampleGoals();
      applySetupInputs();
    }
    generateBoard();
    AudioSys.success();
  };

  $("#btnStart").onclick = () => {
    AudioSys.resume();
    applySetupInputs();
    if (state.goalsPool.length === 0) {
      $("#goalsInput").value = defaultSampleGoals();
      applySetupInputs();
    }
    if (!state.board.length) generateBoard();
    state.startedAt = Date.now();
    state.won = false;
    save();
    startGameplay();
    AudioSys.success();
  };

  $("#btnContinue").onclick = () => {
    AudioSys.resume();
    const ok = load();
    if (ok) {
      syncSetupControls();
      startGameplay();
      AudioSys.success();
    } else {
      AudioSys.click(220, 0.06, "sine", 0.05);
      showToast("No saved board found. Generate a new one!");
    }
  };

  $("#btnNew").onclick = () => {
    AudioSys.resume();
    state.board = [];
    state.score = 0;
    state.bingos = 0;
    state.startedAt = 0;
    state.won = false;
    state.lastBingoLinesKey = "";
    // Generate a new board if goals are available
    applySetupInputs();
    if (state.goalsPool.length === 0) {
      $("#goalsInput").value = defaultSampleGoals();
      applySetupInputs();
    }
    generateBoard();
    save();
    renderPreview();
    AudioSys.click(320, 0.06, "triangle", 0.05);
  };

  $("#btnBackToSetup").onclick = () => {
    showScreen("start");
    renderPreview();
    AudioSys.click(280, 0.05, "sine", 0.04);
  };

  $("#btnResetMarks").onclick = () => {
    openModal(`
      <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:12px;">
        <div>
          <div style="font-weight:900; font-size:18px;">🔄 Reset all marks?</div>
          <div style="font-size:12px; color:#666;">Keeps your current goals/layout.</div>
        </div>
        <button id="rClose" class="btn ghost">Close</button>
      </div>
      <div style="display:flex; gap:8px; justify-content:flex-end;">
        <button id="rCancel" class="btn ghost">Cancel</button>
        <button id="rOk" class="btn">Reset</button>
      </div>
    `);
    $("#rClose").onclick = closeModal;
    $("#rCancel").onclick = closeModal;
    $("#rOk").onclick = () => {
      closeModal();
      resetMarks();
    };
  };

  $("#btnShuffleUnmarked").onclick = () => {
    shuffleUnmarked();
    AudioSys.click(420, 0.06, "triangle", 0.05);
  };

  $("#btnEditMode").onclick = () => {
    state.editMode = !state.editMode;
    $("#btnEditMode").textContent = `Edit: ${state.editMode ? "On" : "Off"}`;
    AudioSys.click(state.editMode ? 520 : 280, 0.05, "sine", 0.04);
    save();
  };

  $("#btnHelp").onclick = () => {
    AudioSys.resume();
    openHelp();
    AudioSys.click(440, 0.05, "triangle", 0.05);
  };

  $("#btnSound").onclick = () => {
    AudioSys.enabled = !AudioSys.enabled;
    $("#btnSound").textContent = `Sound: ${AudioSys.enabled ? "On" : "Off"}`;
    if (AudioSys.enabled) AudioSys.resume();
    AudioSys.click(380, 0.05, "triangle", 0.05);
    save();
  };

  $("#btnExport").onclick = () => {
    AudioSys.resume();
    openModal(`
      <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:12px;">
        <div>
          <div style="font-weight:900; font-size:18px;">📤 Export</div>
          <div style="font-size:12px; color:#666;">Copy this JSON to save/share your board.</div>
        </div>
        <button id="xClose" class="btn ghost">Close</button>
      </div>
      <textarea id="xText" class="field" style="min-height:200px; font-family:monospace; font-size:11px;"></textarea>
      <div style="margin-top:12px; display:flex; justify-content:flex-end;">
        <button id="xCopy" class="btn">📋 Copy</button>
      </div>
    `);
    $("#xText").value = exportJSON();
    $("#xClose").onclick = closeModal;
    $("#xCopy").onclick = async () => {
      const val = $("#xText").value;
      try {
        await navigator.clipboard.writeText(val);
        AudioSys.success();
      } catch (e) {
        $("#xText").select();
        document.execCommand("copy");
        AudioSys.success();
      }
    };
  };

  $("#btnImport").onclick = () => {
    AudioSys.resume();
    openModal(`
      <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:12px;">
        <div>
          <div style="font-weight:900; font-size:18px;">📥 Import</div>
          <div style="font-size:12px; color:#666;">Paste exported JSON to restore a board.</div>
        </div>
        <button id="iClose" class="btn ghost">Close</button>
      </div>
      <textarea id="iText" class="field" autofocus placeholder="Paste JSON here..." style="min-height:200px; font-family:monospace; font-size:11px;"></textarea>
      <div style="margin-top:12px; display:flex; justify-content:space-between; align-items:center;">
        <div id="iMsg" style="font-size:12px; color:#666;"></div>
        <div style="display:flex; gap:8px;">
          <button id="iCancel" class="btn ghost">Cancel</button>
          <button id="iOk" class="btn">📥 Import</button>
        </div>
      </div>
    `);
    const msg = $("#iMsg");
    $("#iClose").onclick = closeModal;
    $("#iCancel").onclick = closeModal;
    $("#iOk").onclick = () => {
      const ok = importJSON($("#iText").value);
      if (ok) {
        msg.textContent = "Imported! Starting gameplay...";
        AudioSys.success();
        closeModal();
        startGameplay();
      } else {
        msg.textContent = "Invalid JSON. Please paste an exported board.";
        AudioSys.click(200, 0.08, "sine", 0.06);
      }
    };
  };

  $("#btnCopyShare").onclick = async () => {
    AudioSys.resume();
    applySetupInputs();
    if (!state.goalsPool.length) {
      $("#goalsInput").value = defaultSampleGoals();
      applySetupInputs();
    }
    const url = encodeShare();
    const btn = $("#btnCopyShare");
    const origText = btn.textContent;
    try {
      await navigator.clipboard.writeText(url);
      AudioSys.success();
      btn.textContent = "Copied!";
      setTimeout(() => { btn.textContent = origText; }, 2000);
    } catch (e) {
      openModal(`
        <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:12px;">
          <div style="font-weight:900; font-size:18px;">Share link</div>
          <button id="sClose" class="btn ghost">Close</button>
        </div>
        <input id="sUrl" class="field" value="${url.replace(/"/g, '&quot;')}" />
        <div style="margin-top:8px; font-size:12px; color:#666;">Copy the URL above.</div>
      `);
      $("#sClose").onclick = closeModal;
      $("#sUrl").select();
      document.execCommand("copy");
      AudioSys.success();
      btn.textContent = "Copied!";
      setTimeout(() => { btn.textContent = origText; }, 2000);
    }
  };

  $("#btnKeepPlaying").onclick = () => {
    AudioSys.resume();
    showScreen("play");
    renderBoard();
    AudioSys.success();
  };
  $("#btnNewRound").onclick = () => {
    AudioSys.resume();
    showScreen("start");
    state.board = [];
    state.score = 0;
    state.bingos = 0;
    state.startedAt = 0;
    state.won = false;
    state.lastBingoLinesKey = "";
    save();
    renderPreview();
    AudioSys.click(360, 0.06, "triangle", 0.05);
  };
  $("#btnOverSetup").onclick = () => {
    AudioSys.resume();
    showScreen("start");
    renderPreview();
    AudioSys.click(260, 0.05, "sine", 0.04);
  };

  // Keyboard shortcuts
  window.addEventListener("keydown", (e) => {
    if (e.key.toLowerCase() === "r" && state.screen === "play") {
      resetMarks();
    }
    if (e.key.toLowerCase() === "e" && state.screen === "play") {
      state.editMode = !state.editMode;
      $("#btnEditMode").textContent = `Edit: ${state.editMode ? "On" : "Off"}`;
      AudioSys.click(state.editMode ? 520 : 280, 0.05, "sine", 0.04);
      save();
    }
    if (e.key === "Escape" && !$("#modalHost").classList.contains("hidden")) {
      closeModal();
    }
  });

  // ---------- Boot ----------
  (function init() {
    const share = decodeShareFromHash();
    if (share) {
      state.size = clamp(+share.s || 5, 3, 7);
      state.free = !!share.f;
      state.win = (share.w ?? "1") + "";
      state.goalsPool = Array.isArray(share.g) ? share.g.map(x => (x ?? "").toString()).filter(Boolean) : [];
      state.board = [];
      state.score = 0;
      state.bingos = 0;
      state.startedAt = 0;
      state.won = false;
      state.lastBingoLinesKey = "";
      save();
      history.replaceState(null, "", location.pathname + location.search);
    } else {
      load();
    }

    if (!Array.isArray(state.goalsPool) || state.goalsPool.length === 0) {
      state.goalsPool = normalizeGoalLines(defaultSampleGoals());
    }

    syncSetupControls();

    if (state.board && state.board.length === state.size * state.size) {
      renderPreview();
    } else {
      state.board = [];
      renderPreview();
    }

    showScreen("start");
    renderSlotsList();
    $("#btnSound").textContent = `Sound: ${AudioSys.enabled ? "On" : "Off"}`;
    $("#btnEditMode").textContent = `Edit: ${state.editMode ? "On" : "Off"}`;
  })();

  // Expose functions globally for music player
  window.$ = $;
  window.$$ = $$;
  window.AudioSys = AudioSys;
  window.openModal = openModal;
  window.closeModal = closeModal;
  window.showToast = showToast;
})();
