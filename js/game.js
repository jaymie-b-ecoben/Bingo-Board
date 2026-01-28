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
  const SAVED_CARD_KEY = "goal_bingo_saved_card_v1";

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
    lastBingoLinesKey: "",
    won: false,
    timerPaused: false,
    pausedAt: 0,
    accumulatedPauseMs: 0,
    elapsedMsAtWin: 0,
    keepPlayingDismissed: false,
    strikesLeft: 3
  };

  const STRIKES_MAX = 3;
  const STRIKE_PENALTIES = {
    edit: 15,
    skip: 10,
    replace: 20
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
  function hasSavedGame() {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return false;
    const data = safeJSONParse(raw);
    return !!(data && Array.isArray(data.board) && data.board.length > 0);
  }

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
      lastBingoLinesKey: state.lastBingoLinesKey,
      timerPaused: state.timerPaused,
      pausedAt: state.pausedAt,
      accumulatedPauseMs: state.accumulatedPauseMs,
      strikesLeft: state.strikesLeft
    };
    localStorage.setItem(STORAGE_KEY, JSON.stringify(payload));
    const savedEl = $("#savedAutomaticallyText");
    if (savedEl) savedEl.classList.remove("hidden");
  }

  function getElapsedMs() {
    if (!state.startedAt) return 0;
    let elapsed = Date.now() - state.startedAt - state.accumulatedPauseMs;
    if (state.timerPaused && state.pausedAt) {
      elapsed -= (Date.now() - state.pausedAt);
    }
    return Math.max(0, elapsed);
  }

  function getSavedCards() {
    const raw = localStorage.getItem(SAVED_CARD_KEY);
    const data = safeJSONParse(raw);
    if (Array.isArray(data)) return data;
    if (data && data.board && Array.isArray(data.board)) {
      return [{ ...data, name: data.name || "Saved card", id: data.id || "c_old" }];
    }
    return [];
  }

  function saveCurrentCard(name) {
    const timeMs = (state.won && state.elapsedMsAtWin != null) ? state.elapsedMsAtWin : getElapsedMs();
    const cards = getSavedCards();
    const payload = {
      id: "c_" + Date.now(),
      name: (name || "Bingo card").trim() || "Bingo card",
      savedAt: Date.now(),
      size: state.size,
      free: state.free,
      win: state.win,
      board: state.board.map(t => ({ ...t })),
      score: state.score,
      bingos: state.bingos,
      timeMs,
      marked: state.board.reduce((a, t) => a + (t.checked ? 1 : 0), 0),
      total: state.board.length
    };
    cards.unshift(payload);
    if (cards.length > 20) cards.length = 20;
    localStorage.setItem(SAVED_CARD_KEY, JSON.stringify(cards));
  }

  function deleteSavedCard(id) {
    const cards = getSavedCards().filter((c) => c.id !== id);
    localStorage.setItem(SAVED_CARD_KEY, JSON.stringify(cards));
  }

  function openViewSavedCardModal() {
    const cards = getSavedCards();
    const esc = (s) => String(s).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
    const openDeleteSavedCardConfirm = (id, name) => {
      const safeName = (name || "Saved card").trim() || "Saved card";
      const safeNameEsc = esc(safeName);
      openModal(`
        <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:12px;">
          <div>
            <div style="font-weight:900; font-size:18px;">🗑️ Delete saved card</div>
            <div style="font-size:12px; color:#666;">This action can’t be undone.</div>
          </div>
          <button id="delSavedCancelX" class="btn ghost">Close</button>
        </div>
        <div class="setup-card" style="margin:0;">
          <div style="font-weight:800; margin-bottom:6px;">Delete “${safeNameEsc}”?</div>
          <div style="font-size:12px; color:#666;">You’ll permanently remove this saved slot from this device.</div>
        </div>
        <div style="display:flex; justify-content:flex-end; gap:8px; margin-top:12px; flex-wrap:wrap;">
          <button id="delSavedCancel" class="btn ghost">Cancel</button>
          <button id="delSavedConfirm" class="btn" style="background:var(--ui-bad); border-color:var(--ui-bad);">Delete</button>
        </div>
      `);
      $("#delSavedCancelX").onclick = () => { closeModal(); openViewSavedCardModal(); };
      $("#delSavedCancel").onclick = () => { closeModal(); openViewSavedCardModal(); AudioSys.click(220, 0.05, "sine", 0.04); };
      $("#delSavedConfirm").onclick = () => {
        deleteSavedCard(id);
        closeModal();
        openViewSavedCardModal();
        AudioSys.click(220, 0.06, "triangle", 0.05);
      };
    };
    if (!cards.length) {
      openModal(`
        <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:12px;">
          <div style="font-weight:900; font-size:18px;">📋 Saved bingo cards</div>
          <button id="savedCardClose" class="btn ghost">Close</button>
        </div>
        <div class="setup-card" style="margin:0;">
          <div style="font-weight:700; color:#555;">No saved cards yet.</div>
          <div style="font-size:12px; color:#666; margin-top:6px;">After you finish a game, use <strong>Save Card</strong> on the game over screen and give it a name.</div>
        </div>
      `);
      $("#savedCardClose").onclick = closeModal;
      return;
    }
    let listHtml = "";
    for (const saved of cards) {
      const date = new Date(saved.savedAt);
      const dateStr = date.toLocaleDateString(undefined, { month: "short", day: "numeric", year: "numeric", hour: "2-digit", minute: "2-digit" });
      const timeStr = formatTime(saved.timeMs || 0);
      const size = saved.size || 5;
      const total = saved.total ?? size * size;
      let gridHtml = "";
      for (let i = 0; i < (saved.board || []).length; i++) {
        const t = saved.board[i];
        const txt = esc(t?.text || "-");
        const done = t?.checked ? " done" : "";
        const free = t?.free ? " free" : "";
        gridHtml += `<div class="preview-cell${done}${free}" style="min-height:36px; font-size:11px;">${txt}</div>`;
      }
      const cardName = esc(saved.name || "Bingo card");
      const cardId = saved.id || "";
      listHtml += `
        <div class="saved-card-item" data-id="${esc(cardId)}">
          <button type="button" class="saved-card-header" aria-expanded="false">
            <span class="saved-card-name">${cardName}</span>
            <span class="saved-card-date">${dateStr}</span>
            <span class="saved-card-toggle">▼</span>
          </button>
          <div class="saved-card-details" hidden>
            <div class="saved-card-meta">
              <div class="saved-card-meta-left">
                <span>Score: ${saved.score ?? 0}</span>
                <span>Bingos: ${saved.bingos ?? 0}</span>
                <span>Time: ${timeStr}</span>
                <span>Marked: ${saved.marked ?? 0}/${total}</span>
              </div>
              <button
                type="button"
                class="saved-card-delete-btn"
                data-id="${esc(cardId)}"
                data-name="${cardName}"
                title="Delete saved card"
                aria-label="Delete saved card"
              >🗑️</button>
            </div>
            <div class="preview-grid saved-card-grid" style="grid-template-columns: repeat(${size}, 1fr); gap:4px; padding:8px;">${gridHtml}</div>
          </div>
        </div>`;
    }
    openModal(`
      <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:8px;">
        <div style="font-weight:900; font-size:18px;">📋 Saved bingo cards</div>
        <button id="savedCardClose" class="btn ghost">Close</button>
      </div>
      <div id="savedCardsList" class="saved-cards-list">${listHtml}</div>
    `);
    $("#savedCardClose").onclick = closeModal;
    const host = $("#modalHost");
    host.querySelectorAll(".saved-card-header").forEach((btn) => {
      btn.onclick = () => {
        const item = btn.closest(".saved-card-item");
        const details = item && item.querySelector(".saved-card-details");
        const isExpanded = details && !details.hidden;
        if (details) details.hidden = isExpanded;
        if (btn) btn.setAttribute("aria-expanded", isExpanded ? "false" : "true");
        const toggle = btn.querySelector(".saved-card-toggle");
        if (toggle) toggle.textContent = isExpanded ? "▼" : "▲";
      };
    });
    host.querySelectorAll(".saved-card-delete-btn").forEach((btn) => {
      btn.onclick = () => {
        const id = btn.getAttribute("data-id");
        const name = btn.getAttribute("data-name") || "Saved card";
        openDeleteSavedCardConfirm(id, name);
      };
    });
  }

  function load() {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return false;
    const data = safeJSONParse(raw);
    if (!data || !Array.isArray(data.board)) return false;
    Object.assign(state, {
      size: clamp(+data.size || 5, 3, 5),
      free: !!data.free,
      win: (data.win ?? "1") + "",
      goalsPool: Array.isArray(data.goalsPool) ? data.goalsPool : [],
      board: data.board,
      startedAt: +data.startedAt || 0,
      score: +data.score || 0,
      bingos: +data.bingos || 0,
      won: !!data.won,
      lastBingoLinesKey: data.lastBingoLinesKey || "",
      timerPaused: !!data.timerPaused,
      pausedAt: +data.pausedAt || 0,
      accumulatedPauseMs: +data.accumulatedPauseMs || 0,
      strikesLeft: Number.isFinite(+data.strikesLeft) ? clamp(+data.strikesLeft, 0, STRIKES_MAX) : STRIKES_MAX
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

    const board = new Array(total).fill(null).map(() => ({ text: "", checked: false, free: false, skipped: false }));
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
        board[i] = { text: "Free", checked: true, free: true, skipped: false };
      } else {
        board[i] = { text: picked[idx++] || "Your goal here", checked: false, free: false, skipped: false };
      }
    }

    state.board = board;
    state.score = 0;
    state.strikesLeft = STRIKES_MAX;
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
    document.body.classList.toggle("screen-play", which === "play");
  }

  function renderPreview() {
    const size = state.size;
    const total = size * size;
    const grid = $("#previewGrid");
    const emptyEl = $("#previewEmpty");
    const poolEmpty = !state.goalsPool || state.goalsPool.length === 0;
    const hasGenerated = state.board && state.board.length === total;

    if (emptyEl) {
      const shouldShowEmpty = poolEmpty || !hasGenerated;
      emptyEl.classList.toggle("hidden", !shouldShowEmpty);
      emptyEl.textContent = poolEmpty ? "No goals yet — add some above!" : "Kindly generate your card first.";
    }
    if (grid) grid.classList.toggle("hidden", poolEmpty || !hasGenerated);

    grid.style.gridTemplateColumns = `repeat(${size}, minmax(0,1fr))`;
    grid.innerHTML = "";
    $("#previewCount").textContent = total;

    if (!poolEmpty && hasGenerated) {
      const showGoals = $("#previewShowGoals") && $("#previewShowGoals").checked;
      const center = Math.floor(total / 2);
      for (let i = 0; i < total; i++) {
        const d = document.createElement("div");
        d.className = "preview-cell";
        const isFree = state.free && (size % 2 === 1) && i === center;
        let txt;
        if (isFree) {
          txt = "Free";
        } else if (!showGoals) {
          txt = "-";
        } else {
          txt = state.board[i]?.text || "-";
        }
        d.textContent = txt;
        if (isFree) d.classList.add("free");
        grid.appendChild(d);
      }
    }

    $("#statTotal").textContent = total;
    $("#winGoalLabel").textContent = state.win === "blackout" ? "Blackout" : `${state.win} Bingo${state.win === "1" ? "" : "s"}`;
    updateSetupButtonStates();
  }

  function updateSetupButtonStates() {
    const startBtn = $("#btnStart");
    const goalsHint = $("#goalsHint");
    const goalsCounter = $("#goalsCounter");
    const poolCount = state.goalsPool ? state.goalsPool.length : 0;
    const total = state.size * state.size;
    const needs = total - (state.free && (state.size % 2 === 1) ? 1 : 0);
    const hasGenerated = state.board && state.board.length === total;
    if (goalsCounter) goalsCounter.textContent = `Goals: ${poolCount}/${needs}`;
    if (startBtn) startBtn.disabled = (poolCount < needs) || !hasGenerated;
    if (goalsHint) {
      goalsHint.classList.toggle("hidden", poolCount >= needs);
      const remaining = Math.max(0, needs - poolCount);
      goalsHint.textContent = remaining > 0
        ? `Add ${remaining} more goal${remaining === 1 ? "" : "s"} to fill a ${state.size}×${state.size} board.`
        : (!hasGenerated ? `Click Generate to preview your board before starting.` : `Ready to start!`);
    }
    const soundBtn = $("#btnSound");
    if (soundBtn) soundBtn.classList.toggle("active", AudioSys.enabled);
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
      if (tile.skipped) cell.classList.add("skipped");

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
    const strikesEl = $("#statStrikes");
    if (strikesEl) strikesEl.textContent = String(clamp(state.strikesLeft, 0, STRIKES_MAX));
    $("#winGoalLabel").textContent = state.win === "blackout" ? "Blackout" : `${state.win} Bingo${state.win === "1" ? "" : "s"}`;
    const endGameBtn = $("#btnEndGame");
    if (endGameBtn) endGameBtn.classList.toggle("hidden", !state.keepPlayingDismissed);
    save();
  }

  function renderGameOverCard() {
    const time = formatTime(state.elapsedMsAtWin || 0);
    const score = Math.max(0, Math.floor(state.score));
    const isBlackout = state.win === "blackout";
    $("#overTitle").textContent = isBlackout ? "BLACKOUT!" : "BINGO!";

    $("#overSubtitle").textContent = "You hit your win condition.";

    const scoreEl = $("#overScoreVal");
    const bingosEl = $("#overBingosVal");
    const timeEl = $("#overTimeVal");
    const bingosLabelEl = $("#overBingosLabel");
    if (scoreEl) scoreEl.textContent = String(score);
    if (bingosEl) bingosEl.textContent = String(state.bingos);
    if (timeEl) timeEl.textContent = String(time);
    if (bingosLabelEl) bingosLabelEl.textContent = state.bingos === 1 ? "Bingo" : "Bingos";
  }

  function resetRunProgress() {
    state.board = [];
    state.score = 0;
    state.bingos = 0;
    state.startedAt = 0;
    state.won = false;
    state.keepPlayingDismissed = false;
    state.lastBingoLinesKey = "";
    state.timerPaused = false;
    state.pausedAt = 0;
    state.accumulatedPauseMs = 0;
    state.elapsedMsAtWin = 0;
    state.strikesLeft = STRIKES_MAX;
  }

  function showGameOverNow() {
    state.won = true;
    state.keepPlayingDismissed = false;
    state.elapsedMsAtWin = getElapsedMs();
    save();
    renderGameOverCard();
    showScreen("over");
    AudioSys.bingo();
  }

  // ---------- Long press / editing ----------
  let lpTimer = null;
  let lpFired = false;

  function attachCellHandlers(cell) {
    const idx = +cell.dataset.idx;

    function onToggle() {
      if (state.timerPaused) {
        showToast("Resume the game to make a move.");
        return;
      }
      toggleCell(idx);
    }

    cell.addEventListener("click", (e) => {
      if (lpFired) { lpFired = false; return; }
      onToggle();
    });

    const startLP = (e) => {
      lpFired = false;
      clearTimeout(lpTimer);
      lpTimer = setTimeout(() => {
        if (state.timerPaused) return;
        lpFired = true;
        openStrikeActions(idx);
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

  function spendStrike(action) {
    if (state.strikesLeft <= 0) return false;
    state.strikesLeft = clamp(state.strikesLeft - 1, 0, STRIKES_MAX);
    const penalty = STRIKE_PENALTIES[action] || 0;
    if (penalty) state.score -= penalty;
    showToast(`-${penalty} points · Strikes left: ${state.strikesLeft}`);
    return true;
  }

  function normalizeTextKey(s) {
    return String(s || "").trim().toLowerCase();
  }

  function pickRandomReplacementGoal(excludeText) {
    const used = new Set(state.board.map(t => normalizeTextKey(t && t.text)));
    const pool = (state.goalsPool || []).filter(Boolean);
    const candidates = pool.filter(g => {
      const key = normalizeTextKey(g);
      if (!key) return false;
      if (key === normalizeTextKey(excludeText)) return false;
      return !used.has(key);
    });
    if (!candidates.length) return null;
    shuffle(candidates);
    return candidates[0];
  }

  function recomputeBingosOnly() {
    const { bingos, winningLines } = countBingos(state.board, state.size);
    state.bingos = bingos;
    state.lastBingoLinesKey = boardKeyForLines(winningLines);
  }

  function openStrikeActions(idx) {
    const tile = state.board[idx];
    if (!tile) return;
    if (state.timerPaused) { showToast("Resume the game to make a move."); return; }
    if (tile.free) { showToast("Free space can't be changed."); return; }
    if (state.strikesLeft <= 0) { showToast("No strikes left."); return; }

    const replacement = pickRandomReplacementGoal(tile.text);
    const esc = (s) => String(s).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");

    openModal(`
      <div style="display:flex; justify-content:space-between; align-items:center; gap:12px; margin-bottom:10px;">
        <div>
          <div style="font-weight:900; font-size:18px;">⚡ Use a strike</div>
          <div style="font-size:12px; color:#666;">Choose one action for this tile. Strikes left: <b>${state.strikesLeft}</b></div>
        </div>
        <button id="sClose" class="btn ghost">Close</button>
      </div>
      <div style="font-size:13px; color:#222; font-weight:700; margin-bottom:10px;">Tile: <span style="font-weight:900;">${esc(tile.text || "-")}</span></div>
      <div style="display:flex; flex-direction:column; gap:10px;">
        <button id="sEdit" class="btn secondary">✏️ Edit (-${STRIKE_PENALTIES.edit})</button>
        <button id="sSkip" class="btn secondary">⏭ Skip (-${STRIKE_PENALTIES.skip})</button>
        <button id="sReplace" class="btn secondary" ${replacement ? "" : "disabled"}>🎲 Replace random (-${STRIKE_PENALTIES.replace})</button>
        <div style="font-size:12px; color:#666;">Replace picks a random unused goal from your Goal pool.</div>
        ${replacement ? `<div style="font-size:12px; color:#666;">Preview: <b>${esc(replacement)}</b></div>` : `<div style="font-size:12px; color:#b23;">No unused goals available to replace with.</div>`}
      </div>
    `);

    $("#sClose").onclick = closeModal;

    $("#sEdit").onclick = () => {
      if (!spendStrike("edit")) return;
      save();
      closeModal();
      openEditCell(idx);
      updateStats();
    };

    $("#sSkip").onclick = () => {
      if (!spendStrike("skip")) return;
      const prevChecked = !!tile.checked;
      tile.checked = true;
      tile.skipped = true;
      const { bingos, winningLines } = countBingos(state.board, state.size);
      state.bingos = bingos;
      const key = boardKeyForLines(winningLines);
      const prevKey = state.lastBingoLinesKey || "";
      const prevSet = new Set(prevKey ? prevKey.split("|") : []);
      const nextSet = new Set(key ? key.split("|") : []);
      let newly = 0;
      for (const k of nextSet) if (k && !prevSet.has(k)) newly++;
      state.lastBingoLinesKey = key;
      state.score += calcScoreDelta(prevChecked, true, newly);
      if (newly > 0) AudioSys.bingo();
      bestScoreMaybeSet(state.score);
      save();
      closeModal();
      renderBoard();
      updateStats();
      checkWinAndMaybeOver();
    };

    const replaceBtn = $("#sReplace");
    if (replaceBtn) replaceBtn.onclick = () => {
      const newGoal = pickRandomReplacementGoal(tile.text);
      if (!newGoal) { showToast("No unused goals available."); return; }
      if (!spendStrike("replace")) return;
      const prevChecked = !!tile.checked;
      tile.text = newGoal;
      tile.checked = false;
      tile.skipped = false;
      state.score += calcScoreDelta(prevChecked, false, 0);
      recomputeBingosOnly();
      save();
      closeModal();
      renderBoard();
      updateStats();
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
    if (!state.timerPaused) state.accumulatedPauseMs = 0;

    showScreen("play");
    renderBoard();
    renderPreview();
    updatePauseButtonLabel();

    cancelAnimationFrame(raf);
    const loop = () => {
      if (state.screen === "play" && state.startedAt) {
        $("#statTime").textContent = formatTime(getElapsedMs());
      }
      raf = requestAnimationFrame(loop);
    };
    raf = requestAnimationFrame(loop);
    save();
  }

  function updatePauseButtonLabel() {
    const btn = $("#btnPauseTime");
    if (btn) btn.textContent = state.timerPaused ? "▶ Resume" : "⏸ Pause";
    const banner = $("#pauseBanner");
    if (banner) banner.classList.toggle("hidden", !state.timerPaused);
  }

  function toggleCell(idx) {
    const tile = state.board[idx];
    if (!tile || tile.free) { AudioSys.click(260, 0.04, "sine", 0.03); return; }
    if (state.timerPaused) { showToast("Resume the game to make a move."); return; }
    if (tile.skipped) { showToast("This tile is skipped."); AudioSys.click(220, 0.04, "sine", 0.03); return; }

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

    const cellEl = $(`.cell[data-idx="${idx}"]`);
    if (cellEl) {
      if (tile.checked) {
        cellEl.classList.add("done");
      } else {
        cellEl.classList.remove("done");
      }
    } else {
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
    const need = parseInt(state.win, 10) || 1;
    const stillWinning = state.win === "blackout" ? (marked === total) : (state.bingos >= need);

    if (state.keepPlayingDismissed) {
      if (stillWinning) return;
      state.keepPlayingDismissed = false;
    }

    let won = false;
    if (state.win === "blackout") {
      won = marked === total;
    } else {
      won = state.bingos >= need;
    }

    if (won) {
      state.won = true;
      state.elapsedMsAtWin = getElapsedMs();
      save();
      renderGameOverCard();
      showScreen("over");
      AudioSys.bingo();
    }
  }

  function resetMarks() {
    for (const t of state.board) {
      if (t.free) continue;
      t.checked = false;
      t.skipped = false;
    }
    if (state.free && (state.size % 2 === 1)) {
      const center = Math.floor(state.board.length / 2);
      if (state.board[center]) state.board[center].checked = true;
    }
    state.strikesLeft = STRIKES_MAX;
    state.score = 0;
    state.bingos = countBingos(state.board, state.size).bingos;
    state.lastBingoLinesKey = boardKeyForLines(countBingos(state.board, state.size).winningLines);
    state.startedAt = Date.now();
    state.won = false;
    state.keepPlayingDismissed = false;
    state.timerPaused = false;
    state.pausedAt = 0;
    state.accumulatedPauseMs = 0;
    save();
    renderBoard();
    updatePauseButtonLabel();
    AudioSys.click(300, 0.07, "triangle", 0.05);
  }

  function downloadBoardImage() {
    const size = state.size;
    const board = state.board;
    if (!board || board.length !== size * size) return;

    const pad = 16;
    const gap = 4;
    const gridSize = 520;
    const cellSize = (gridSize - gap * (size - 1)) / size;
    const titleHeight = 56;
    const canvasWidth = gridSize + pad * 2;
    const canvasHeight = titleHeight + gridSize + pad * 2;

    const canvas = document.createElement("canvas");
    canvas.width = canvasWidth;
    canvas.height = canvasHeight;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    const now = new Date();
    const dateStr = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}-${String(now.getDate()).padStart(2, "0")}`;

    ctx.fillStyle = "#fefefe";
    ctx.fillRect(0, 0, canvasWidth, canvasHeight);

    ctx.fillStyle = "#2b2b2b";
    ctx.font = "bold 18px system-ui, sans-serif";
    ctx.textAlign = "center";
    ctx.fillText("Bingo Board", canvasWidth / 2, 28);
    ctx.font = "12px system-ui, sans-serif";
    ctx.fillStyle = "#555";
    ctx.fillText(dateStr, canvasWidth / 2, 46);

    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    const cellFontPx = Math.max(10, Math.floor(cellSize / 6));

    for (let i = 0; i < board.length; i++) {
      const tile = board[i];
      const row = Math.floor(i / size);
      const col = i % size;
      const x = pad + col * (cellSize + gap);
      const y = titleHeight + pad + row * (cellSize + gap);

      if (tile.free) ctx.fillStyle = "#e6e6ff";
      else if (tile.skipped) ctx.fillStyle = "#f3f3f3";
      else if (tile.checked) ctx.fillStyle = "#dfffe1";
      else ctx.fillStyle = "#fff";
      ctx.fillRect(x, y, cellSize, cellSize);

      ctx.strokeStyle = "#222";
      ctx.lineWidth = 2;
      ctx.strokeRect(x, y, cellSize, cellSize);

      const text = (tile.text || "-").trim();
      ctx.fillStyle = tile.skipped ? "#666" : "#2a2a2a";
      ctx.font = `bold ${cellFontPx}px system-ui, sans-serif`;
      const maxW = cellSize - 10;
      const words = text.split(/\s+/);
      let line = "";
      const lines = [];
      for (const w of words) {
        const test = line ? line + " " + w : w;
        if (ctx.measureText(test).width <= maxW) line = test;
        else {
          if (line) lines.push(line);
          line = ctx.measureText(w).width <= maxW ? w : w.slice(0, 8) + "...";
        }
      }
      if (line) lines.push(line);
      if (lines.length === 0) lines.push("-");
      const maxLines = 3;
      const drawn = lines.slice(0, maxLines);
      const lineHeight = Math.min(cellSize / 5, 14);
      const startY = y + cellSize / 2 - (drawn.length - 1) * (lineHeight / 2);
      drawn.forEach((ln, j) => {
        ctx.fillText(ln, x + cellSize / 2, startY + j * lineHeight);
      });

      if (tile.checked) {
        ctx.fillStyle = "#2ecc71";
        ctx.beginPath();
        const cx = x + cellSize - 12;
        const cy = y + 12;
        ctx.arc(cx, cy, 8, 0, Math.PI * 2);
        ctx.fill();
        ctx.strokeStyle = "#222";
        ctx.lineWidth = 1.5;
        ctx.stroke();
        ctx.fillStyle = "#fff";
        ctx.font = "bold 12px system-ui";
        ctx.fillText("✓", cx, cy + 1);
      }
    }

    const dataUrl = canvas.toDataURL("image/png");
    const a = document.createElement("a");
    a.href = dataUrl;
    a.download = `Bingo Board - ${dateStr}.png`;
    a.click();
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
    state.size = clamp(+data.size || 5, 3, 5);
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
    state.size = clamp(parseInt($("#sizeSelect").value, 10) || 5, 3, 5);
    state.free = !!$("#freeToggle").checked;
    state.win = $("#winSelect").value;
    state.goalsPool = normalizeGoalLines($("#goalsInput").value);

    if (state.board.length !== state.size * state.size) {
      state.board = [];
    }
    save();
    renderPreview();
  }

  // ---------- Help modal (How to play guide) ----------
  function openHelp() {
    openModal(`
      <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:16px;">
        <div>
          <div style="font-weight:900; font-size:18px;">How to play</div>
          <div style="font-size:12px; color:#666;">Guide to Bingo Board.</div>
        </div>
        <button id="hClose" class="btn ghost">Close</button>
      </div>
      <div style="display:flex; flex-direction:column; gap:12px;">
        <div class="setup-card">
          <div style="font-weight:900; margin-bottom:6px;">Play</div>
          <div style="font-size:13px; color:#666;">Tap a tile to mark it complete. Complete a full row, column, or diagonal to score a Bingo.</div>
        </div>
        <div class="setup-card">
          <div style="font-weight:900; margin-bottom:6px;">Strikes</div>
          <div style="font-size:13px; color:#666;">Long-press a tile to use a strike: edit the goal, skip it (counts as marked), or replace with a random goal from your pool. You get 3 strikes per game.</div>
        </div>
        <div class="setup-card">
          <div style="font-weight:900; margin-bottom:6px;">Scoring</div>
          <div style="font-size:13px; color:#666;">+10 per mark, −8 per unmark, +75 for each newly completed Bingo line.</div>
        </div>
        <div class="setup-card">
          <div style="font-weight:900; margin-bottom:6px;">Save & share</div>
          <div style="font-size:13px; color:#666;">Your board auto-saves. Use Save Card to store a named card; use Download Card after a win to save an image of your board. Export/Import preserves exact layout and checkmarks.</div>
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
  const previewShowGoalsEl = $("#previewShowGoals");
  if (previewShowGoalsEl) previewShowGoalsEl.addEventListener("change", renderPreview);
  $("#goalsInput").addEventListener("input", () => {
    state.goalsPool = normalizeGoalLines($("#goalsInput").value);
    state.board = [];
    save();
    updateSetupButtonStates();
    renderPreview();
  });

  $("#btnFillSample").onclick = () => {
    $("#goalsInput").value = defaultSampleGoals();
    applySetupInputs();
    updateSetupButtonStates();
    renderPreview();
    AudioSys.click(440, 0.06, "triangle", 0.05);
  };
  $("#btnClearGoals").onclick = () => {
    $("#goalsInput").value = "";
    applySetupInputs();
    updateSetupButtonStates();
    renderPreview();
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
    state.keepPlayingDismissed = false;
    save();
    startGameplay();
    AudioSys.success();
  };

  $("#btnEndGame").onclick = () => {
    showGameOverNow();
  };

  $("#btnBackToSetup").onclick = () => {
    openModal(`
      <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:12px;">
        <div>
          <div style="font-weight:900; font-size:18px;">Exit game?</div>
          <div style="font-size:12px; color:#666;">Your current progress will be reset.</div>
        </div>
        <button id="exitClose" class="btn ghost">Cancel</button>
      </div>
      <div class="setup-card" style="margin:0 0 12px 0;">
        <div style="font-weight:700; margin-bottom:6px;">This will take you back to setup.</div>
        <div style="font-size:13px; color:#555;">Your goal pool and settings stay the same, but the current board/run will be cleared.</div>
      </div>
      <div style="display:flex; gap:8px; justify-content:flex-end;">
        <button id="exitCancel" class="btn ghost">Cancel</button>
        <button id="exitOk" class="btn">Exit</button>
      </div>
    `);
    $("#exitClose").onclick = closeModal;
    $("#exitCancel").onclick = closeModal;
    $("#exitOk").onclick = () => {
      closeModal();
      AudioSys.resume();
      resetRunProgress();
      save();
      showScreen("start");
      syncSetupControls();
      renderPreview();
      AudioSys.click(280, 0.05, "sine", 0.04);
    };
  };

  $("#btnResetMarks").onclick = () => {
    openModal(`
      <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:12px;">
        <div>
          <div style="font-weight:900; font-size:18px;">🔄 Reset</div>
          <div style="font-size:12px; color:#666;">Choose what to reset.</div>
        </div>
        <button id="rClose" class="btn ghost">Close</button>
      </div>
      <div style="display:flex; flex-direction:column; gap:10px;">
        <button id="rMarksOnly" class="btn secondary">Reset marks only</button>
        <div style="font-size:12px; color:#666;">Clear all checkmarks and skipped tiles, restore strikes to 3. Same goals in the same spots.</div>
        <button id="rCardAndShuffle" class="btn secondary">Reset card & shuffle goals</button>
        <div style="font-size:12px; color:#666;">New random placement of goals from your pool, then clear marks and restore strikes.</div>
      </div>
    `);
    $("#rClose").onclick = closeModal;
    $("#rMarksOnly").onclick = () => {
      closeModal();
      resetMarks();
    };
    $("#rCardAndShuffle").onclick = () => {
      closeModal();
      generateBoard();
      state.startedAt = Date.now();
      state.won = false;
      state.keepPlayingDismissed = false;
      state.timerPaused = false;
      state.pausedAt = 0;
      state.accumulatedPauseMs = 0;
      save();
      renderBoard();
      updatePauseButtonLabel();
      AudioSys.click(300, 0.07, "triangle", 0.05);
    };
  };

  $("#btnPauseTime").onclick = () => {
    if (state.timerPaused) {
      state.accumulatedPauseMs += (Date.now() - state.pausedAt);
      state.timerPaused = false;
      state.pausedAt = 0;
    } else {
      state.pausedAt = Date.now();
      state.timerPaused = true;
    }
    updatePauseButtonLabel();
    save();
    AudioSys.click(380, 0.05, "sine", 0.04);
  };

  $("#btnViewSavedCard").onclick = () => {
    openViewSavedCardModal();
    AudioSys.click(440, 0.05, "sine", 0.04);
  };

  $("#btnSaveCardImage").onclick = () => {
    downloadBoardImage();
    showToast("Card image downloaded.");
    AudioSys.click(440, 0.05, "sine", 0.04);
  };

  $("#btnSaveCardOver").onclick = () => {
    openModal(`
      <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:12px;">
        <div style="font-weight:900; font-size:18px;">Save Card</div>
        <button id="saveCardModalClose" class="btn ghost">Cancel</button>
      </div>
      <div style="margin-bottom:12px;">
        <label style="display:block; font-weight:700; font-size:12px; margin-bottom:6px;">Card name</label>
        <input id="saveCardName" class="field" placeholder="e.g. Week 1 Bingo" autofocus />
      </div>
      <div style="display:flex; gap:8px; justify-content:flex-end;">
        <button id="saveCardCancel" class="btn ghost">Cancel</button>
        <button id="saveCardConfirm" class="btn">Save</button>
      </div>
    `);
    $("#saveCardModalClose").onclick = closeModal;
    $("#saveCardCancel").onclick = closeModal;
    $("#saveCardConfirm").onclick = () => {
      const name = $("#saveCardName").value.trim() || "Bingo card";
      saveCurrentCard(name);
      closeModal();
      AudioSys.success();
      showToast("Card saved. View it from home.");
    };
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
    updateSetupButtonStates();
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
    state.won = false;
    state.keepPlayingDismissed = true;
    state.elapsedMsAtWin = 0;
    save();
    showScreen("play");
    renderBoard();
    updatePauseButtonLabel();
    AudioSys.success();
  };
  $("#btnNewRound").onclick = () => {
    openModal(`
      <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:12px;">
        <div>
          <div style="font-weight:900; font-size:18px;">Start a brand new setup?</div>
          <div style="font-size:12px; color:#666;">This clears your goal pool.</div>
        </div>
        <button id="newClose" class="btn ghost">Cancel</button>
      </div>
      <div class="setup-card" style="margin:0 0 12px 0;">
        <div style="font-weight:700; margin-bottom:6px;">You’ll return to setup with an empty goal list.</div>
        <div style="font-size:13px; color:#555;">You can paste a new set of goals and click <strong>Generate</strong> again.</div>
      </div>
      <div style="display:flex; gap:8px; justify-content:flex-end;">
        <button id="newCancel" class="btn ghost">Cancel</button>
        <button id="newOk" class="btn" style="background:var(--ui-bad); border-color:var(--ui-bad);">Clear &amp; go to setup</button>
      </div>
    `);
    $("#newClose").onclick = closeModal;
    $("#newCancel").onclick = closeModal;
    $("#newOk").onclick = () => {
      closeModal();
      AudioSys.resume();
      $("#goalsInput").value = "";
      state.goalsPool = [];
      resetRunProgress();
      save();
      syncSetupControls();
      showScreen("start");
      renderPreview();
      AudioSys.click(220, 0.05, "sine", 0.04);
    };
  };
  $("#btnOverSetup").onclick = () => {
    openModal(`
      <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:12px;">
        <div>
          <div style="font-weight:900; font-size:18px;">Back to setup?</div>
          <div style="font-size:12px; color:#666;">Your run will be cleared.</div>
        </div>
        <button id="overSetupClose" class="btn ghost">Cancel</button>
      </div>
      <div class="setup-card" style="margin:0 0 12px 0;">
        <div style="font-weight:700; margin-bottom:6px;">Keep the same goals and settings.</div>
        <div style="font-size:13px; color:#555;">You’ll go back to setup with your current goal pool and options. The current board/progress will be reset.</div>
      </div>
      <div style="display:flex; gap:8px; justify-content:flex-end;">
        <button id="overSetupCancel" class="btn ghost">Cancel</button>
        <button id="overSetupOk" class="btn">Back to setup</button>
      </div>
    `);
    $("#overSetupClose").onclick = closeModal;
    $("#overSetupCancel").onclick = closeModal;
    $("#overSetupOk").onclick = () => {
      closeModal();
      AudioSys.resume();
      resetRunProgress();
      save();
      syncSetupControls();
      showScreen("start");
      renderPreview();
      AudioSys.click(260, 0.05, "sine", 0.04);
    };
  };

  // Keyboard shortcuts
  window.addEventListener("keydown", (e) => {
    if (e.key.toLowerCase() === "r" && state.screen === "play") {
      resetMarks();
    }
    if (e.key === "Escape" && !$("#modalHost").classList.contains("hidden")) {
      closeModal();
    }
  });

  // ---------- Boot ----------
  (function init() {
    const share = decodeShareFromHash();
    if (share) {
      state.size = clamp(+share.s || 5, 3, 5);
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
    $("#btnSound").textContent = `Sound: ${AudioSys.enabled ? "On" : "Off"}`;
    updateSetupButtonStates();
  })();

  // Expose functions globally for music player
  window.$ = $;
  window.$$ = $$;
  window.AudioSys = AudioSys;
  window.openModal = openModal;
  window.closeModal = closeModal;
  window.showToast = showToast;
})();
