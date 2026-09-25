    // ── DATOS ──────────────────────────────────────────────────────────────
    const CARDS = {
      suspects: ["Coronel Mostaza","Profesor Moradillo","Sr. Verdi","Sra. Azulino","Srita. Escarlata","Sra. Blanco"],
      weapons:  ["Collar","Barra de Plutonio","Honda","Saxofón","Guante extensible","Dona envenenada"],
      places:   ["Asilo Springfield","Bolerama","El Calabozo del Androide","Casa de los Simpsons","Estudios Krustylu","El Holandés Frito","Kwik-E-Mart","Mansión Burns","Planta Nuclear"]
    };
    const ALL_CARDS_FLAT = [...CARDS.suspects, ...CARDS.weapons, ...CARDS.places];
    const CARD_CATEGORY = {};
    CARDS.suspects.forEach(c => CARD_CATEGORY[c] = 'suspect');
    CARDS.weapons.forEach(c  => CARD_CATEGORY[c] = 'weapon');
    CARDS.places.forEach(c   => CARD_CATEGORY[c] = 'place');

    const STATES = [
      { code: 0, symbol: "",   bg: "bg-white",      text: "text-slate-300" },
      { code: 1, symbol: "❌", bg: "bg-red-100",    text: "text-red-600 font-bold" },
      { code: 2, symbol: "✔️", bg: "bg-emerald-100",text: "text-emerald-700 font-bold" },
      { code: 9, symbol: "?",  bg: "bg-slate-100",  text: "text-slate-500 font-bold" },
      { code: 3, symbol: "1",  bg: "bg-amber-100",  text: "text-amber-600 font-bold" },
      { code: 4, symbol: "2",  bg: "bg-amber-100",  text: "text-amber-600 font-bold" },
      { code: 5, symbol: "3",  bg: "bg-amber-100",  text: "text-amber-600 font-bold" },
      { code: 8, symbol: "👁️", bg: "bg-blue-100",   text: "text-blue-600 font-bold" }
    ];
    const STATE_LABELS = {
      0: 'sin marcar', 1: 'no tiene la carta', 2: 'tiene la carta', 8: 'carta mostrada',
      9: 'desconocido', 3: 'nota 1', 4: 'nota 2', 5: 'nota 3'
    };

    let gameState = {
      started: false, handLocked: false, myCardsCount: null, myCharacter: "",
      players: ["J1","J2","J3","J4"],
      matrix: {}, envelope: { suspect:"", weapon:"", place:"" }, history: []
    };
    let viewSettings = { collapsed: { suspect:false, weapon:false, place:false } };
    let guessSelection = { suspect: "", weapon: "", place: "" };
    let undoStack = [], redoStack = [];
    let applyingAppUpdate = false;
    let lastFocusedElement = null;
    let audioCtx = null, soundInterval = null, solvedRevealTimer = null, spanishVoice = null;
    let longPressTimer = null, longPressKey = null, suppressedClickKey = null;
    let toastTimer = null, storageWarningShown = false;
    let pendingHistoryDeleteIndex = null;

    function escapeHtml(value) {
      return String(value).replace(/[&<>"']/g, character => ({
        '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#039;'
      })[character]);
    }

    function handleCellKeydown(event, card, playerIndex) {
      if (event.key !== 'Enter' && event.key !== ' ') return;
      event.preventDefault();
      handleCellClick(card, playerIndex);
    }

    function showToast(message, tone = 'normal') {
      const toast = document.getElementById('action-toast');
      if (!toast) return;
      if (toastTimer) clearTimeout(toastTimer);
      toast.textContent = message;
      toast.className = `fixed left-1/2 -translate-x-1/2 bottom-20 md:bottom-5 z-[70] text-white text-sm font-semibold px-4 py-2.5 rounded-xl shadow-2xl max-w-[90vw] text-center ${tone === 'error' ? 'bg-red-700' : 'bg-slate-900'}`;
      toastTimer = setTimeout(() => toast.classList.add('hidden'), 2600);
    }

    function writeStorage(key, value) {
      try {
        localStorage.setItem(key, value);
        return true;
      } catch (error) {
        if (!storageWarningShown) {
          storageWarningShown = true;
          showToast('No se pudo guardar la partida en este dispositivo.', 'error');
        }
        console.error('No se pudo guardar en localStorage:', error);
        return false;
      }
    }

    function updateUndoButtons() {
      const undoAvailable = undoStack.length > 0;
      const redoAvailable = redoStack.length > 0;
      const desktop = document.getElementById('btn-undo-desktop');
      const mobile = document.getElementById('btn-undo-mobile');
      if (desktop) {
        desktop.disabled = !undoAvailable;
        desktop.className = undoAvailable
          ? 'bg-blue-600 hover:bg-blue-700 text-white font-bold py-1.5 px-2 rounded-lg text-sm shadow flex items-center justify-center w-28 transition-colors'
          : 'bg-slate-300 text-slate-400 cursor-not-allowed font-bold py-1.5 px-2 rounded-lg text-sm shadow flex items-center justify-center w-28 transition-colors';
      }
      if (mobile) {
        mobile.disabled = !undoAvailable;
        mobile.classList.toggle('opacity-40', !undoAvailable);
      }
      const redoDesktop = document.getElementById('btn-redo-desktop');
      const redoMobile = document.getElementById('btn-redo-mobile');
      if (redoDesktop) {
        redoDesktop.disabled = !redoAvailable;
        redoDesktop.className = redoAvailable
          ? 'bg-blue-600 hover:bg-blue-700 text-white font-bold py-1.5 px-2 rounded-lg text-sm shadow flex items-center justify-center w-24 transition-colors'
          : 'bg-slate-300 text-slate-400 cursor-not-allowed font-bold py-1.5 px-2 rounded-lg text-sm shadow flex items-center justify-center w-24 transition-colors';
      }
      if (redoMobile) {
        redoMobile.disabled = !redoAvailable;
        redoMobile.classList.toggle('opacity-40', !redoAvailable);
      }
    }

    function currentSnapshot(label) {
      return {
        gameState: JSON.parse(JSON.stringify(gameState)),
        guessSelection: { ...guessSelection },
        label
      };
    }

    function saveActionStacks() {
      writeStorage('simpsons_clue_undo', JSON.stringify(undoStack));
      writeStorage('simpsons_clue_redo', JSON.stringify(redoStack));
      updateUndoButtons();
    }

    function recordUndo(label = 'última acción') {
      undoStack.push(currentSnapshot(label));
      if (undoStack.length > 20) undoStack.shift();
      redoStack = [];
      saveActionStacks();
    }

    function undoLastAction() {
      const previous = undoStack.pop();
      if (!previous) return;
      redoStack.push(currentSnapshot(previous.label));
      if (redoStack.length > 20) redoStack.shift();
      gameState = previous.gameState;
      guessSelection = previous.guessSelection;
      document.querySelectorAll('.bottom-sheet').forEach(sheet => sheet.classList.add('hidden'));
      saveActionStacks();
      saveState();
      renderAll();
      updateGuessButton();
      showToast(`Se deshizo: ${previous.label}.`);
    }

    function redoLastAction() {
      const next = redoStack.pop();
      if (!next) return;
      undoStack.push(currentSnapshot(next.label));
      if (undoStack.length > 20) undoStack.shift();
      gameState = next.gameState;
      guessSelection = next.guessSelection;
      document.querySelectorAll('.bottom-sheet').forEach(sheet => sheet.classList.add('hidden'));
      saveActionStacks();
      saveState();
      renderAll();
      updateGuessButton();
      showToast(`Se rehizo: ${next.label}.`);
    }

    function applyAppUpdate(worker) {
      if (!worker || applyingAppUpdate) return;
      applyingAppUpdate = true;
      worker.postMessage({ type: 'SKIP_WAITING' });
    }

    function watchForAppUpdates(registration) {
      if (registration.waiting && navigator.serviceWorker.controller) {
        applyAppUpdate(registration.waiting);
      }
      registration.addEventListener('updatefound', () => {
        const installingWorker = registration.installing;
        installingWorker?.addEventListener('statechange', () => {
          if (installingWorker.state === 'installed' && navigator.serviceWorker.controller) {
            applyAppUpdate(installingWorker);
          }
        });
      });
      registration.update().catch(() => {});
      document.addEventListener('visibilitychange', () => {
        if (document.visibilityState === 'visible') registration.update().catch(() => {});
      });
      window.setInterval(() => registration.update().catch(() => {}), 60 * 60 * 1000);
    }

    // ── BOTTOM SHEET helpers ───────────────────────────────────────────────
    function openSheet(id) {
      const modal = document.getElementById(id);
      lastFocusedElement = document.activeElement;
      modal.classList.remove('hidden');
      const inner = modal.querySelector('.bottom-sheet-inner');
      const handle = modal.querySelector('.sheet-handle');
      if (inner) { inner.style.animation = 'none'; inner.offsetHeight; inner.style.animation = ''; }
      if (handle) { handle.style.animation = 'none'; handle.offsetHeight; handle.style.animation = ''; }
      window.setTimeout(() => modal.querySelector('button, select, input:not([type="hidden"])')?.focus(), 0);
    }
    function closeSheet(id) {
      document.getElementById(id).classList.add('hidden');
      lastFocusedElement?.focus?.();
    }

    function sheetBackdropClose(e, modalId) {
      if (e.target === document.getElementById(modalId)) closeSheet(modalId);
    }

    function openQuickGuide(automatic = false) {
      if (automatic && localStorage.getItem('clue_quick_guide_seen') === '1') return;
      openSheet('quick-guide-modal');
    }

    function closeQuickGuide(markSeen = true) {
      closeSheet('quick-guide-modal');
      if (markSeen) writeStorage('clue_quick_guide_seen', '1');
    }

    // ── AUDIO ──────────────────────────────────────────────────────────────
    function loadSpeechVoices() {
      if (!window.speechSynthesis) return;
      const voices = window.speechSynthesis.getVoices();
      spanishVoice = voices.find(voice => voice.lang.toLowerCase() === 'es-ar')
        || voices.find(voice => voice.lang.toLowerCase() === 'es-es')
        || voices.find(voice => voice.lang.toLowerCase().startsWith('es'))
        || null;
    }

    function warmUpAudio() {
      try {
        const AudioContextClass = window.AudioContext || window.webkitAudioContext;
        if (!AudioContextClass) return;
        if (!audioCtx || audioCtx.state === 'closed') audioCtx = new AudioContextClass();
        if (audioCtx.state === 'suspended') audioCtx.resume().catch(() => {});
      } catch (error) {
        console.warn('No se pudo preparar el audio:', error);
      }
      loadSpeechVoices();
    }

    window.addEventListener('pointerdown', warmUpAudio, { once: true, capture: true });
    window.speechSynthesis?.addEventListener?.('voiceschanged', loadSpeechVoices);

    function playSolvedSound() {
      try {
        if (soundInterval) { clearInterval(soundInterval); soundInterval = null; }
        warmUpAudio();
        function playDing(freq, duration, startTime, volume = 0.3) {
          if (!audioCtx) return;
          const osc = audioCtx.createOscillator(), gain = audioCtx.createGain();
          osc.type = 'sine'; osc.frequency.value = freq;
          gain.gain.setValueAtTime(volume, audioCtx.currentTime + startTime);
          gain.gain.exponentialRampToValueAtTime(0.001, audioCtx.currentTime + startTime + duration);
          osc.connect(gain); gain.connect(audioCtx.destination);
          osc.start(audioCtx.currentTime + startTime);
          osc.stop(audioCtx.currentTime + startTime + duration);
          const osc2 = audioCtx.createOscillator(), gain2 = audioCtx.createGain();
          osc2.type = 'sine'; osc2.frequency.value = freq * 2.003;
          gain2.gain.setValueAtTime(volume * 0.15, audioCtx.currentTime + startTime);
          gain2.gain.exponentialRampToValueAtTime(0.001, audioCtx.currentTime + startTime + duration);
          osc2.connect(gain2); gain2.connect(audioCtx.destination);
          osc2.start(audioCtx.currentTime + startTime);
          osc2.stop(audioCtx.currentTime + startTime + duration);
        }
        playDing(1000, 0.35, 0.0, 0.25);
        playDing(800, 0.45, 0.25, 0.2);
      } catch(e) { console.warn('No se pudo reproducir el sonido:', e); }
    }
    function stopSolvedSound() {
      if (soundInterval) { clearInterval(soundInterval); soundInterval = null; }
      window.speechSynthesis?.cancel();
    }

    function speakSolution(suspect, weapon, place) {
      if (!window.speechSynthesis) return;
      window.speechSynthesis.cancel();
      const spokenSuspect = {
        'Sr. Verdi': 'señor Verdi',
        'Sra. Azulino': 'señora Azulino',
        'Srita. Escarlata': 'señorita Escarlata',
        'Sra. Blanco': 'señora Blanco'
      }[suspect] || suspect;
      const texto = `¡Caso resuelto! El asesino fue ${spokenSuspect}, con ${weapon}, en ${place}.`;
      if (!spanishVoice) loadSpeechVoices();
      const utterance = new SpeechSynthesisUtterance(texto);
      utterance.lang = spanishVoice?.lang || 'es-AR';
      utterance.rate = 0.92;
      utterance.pitch = 1.05;
      if (spanishVoice) utterance.voice = spanishVoice;
      utterance.onstart = () => {
        if (soundInterval) { clearInterval(soundInterval); soundInterval = null; }
      };
      utterance.onend = () => {};
      setTimeout(() => window.speechSynthesis.speak(utterance), 0);
    }

    // ── SOLVED MODAL ──────────────────────────────────────────────────────
    const CARD_IMAGE = {
      "Coronel Mostaza":          "Cartas/Mostaza.png",
      "Profesor Moradillo":       "Cartas/Moradillo.png",
      "Sr. Verdi":                "Cartas/Verdi.png",
      "Sra. Azulino":             "Cartas/Azulino.png",
      "Srita. Escarlata":         "Cartas/Escarlata.png",
      "Sra. Blanco":              "Cartas/Blanco.png",
      "Collar":                   "Cartas/Collar.png",
      "Barra de Plutonio":        "Cartas/BarradePlutonio.png",
      "Honda":                    "Cartas/Honda.png",
      "Saxofón":                  "Cartas/Saxofon.png",
      "Guante extensible":        "Cartas/GuanteExtensible.png",
      "Dona envenenada":          "Cartas/DonaEnvenenada.png",
      "Asilo Springfield":        "Cartas/AsiloSpringfield.png",
      "Bolerama":                 "Cartas/Bolerama.png",
      "El Calabozo del Androide": "Cartas/ElCalabozodelAndroide.png",
      "Casa de los Simpsons":     "Cartas/CasadelosSimpsons.png",
      "Estudios Krustylu":        "Cartas/EstudiosKrustilu.png",
      "El Holandés Frito":        "Cartas/ELHolandesFrito.png",
      "Kwik-E-Mart":              "Cartas/KwikEMart.png",
      "Mansión Burns":            "Cartas/MansionBurns.png",
      "Planta Nuclear":           "Cartas/PlantaNuclear.png"
    };

    function showSolvedModal() {
      const modal = document.getElementById('solved-modal');
      const env = gameState.envelope;
      const imgContainer = document.getElementById('solved-cards-images');
      if (imgContainer) {
        const cards = [env.suspect, env.weapon, env.place];
        const cardHTML = (card, i) => {
          const src = CARD_IMAGE[card];
          return `<div class="card-flip-container" style="width: min(140px, 38vw);">
              <div class="card-flip-inner" id="card-flip-${i}">
                <img class="card-back" src="Cartas/Dorso.png" alt="Dorso" style="width: min(140px, 38vw);">
                <img class="card-front" src="${src || ''}" alt="${card}" style="width: min(140px, 38vw);">
              </div>
            </div>`;
        };
        imgContainer.innerHTML = `
          <div class="flex justify-center gap-3">
            ${cardHTML(cards[0], 0)}
            ${cardHTML(cards[1], 1)}
          </div>
          <div class="flex justify-center">
            ${cardHTML(cards[2], 2)}
          </div>`;
      }
      modal.classList.remove('hidden');
      const content = modal.querySelector('.solved-modal-content');
      content.style.animation = 'none';
      content.offsetHeight;
      content.style.animation = 'slideDown 0.55s ease-out forwards';
      if (solvedRevealTimer) clearTimeout(solvedRevealTimer);
      solvedRevealTimer = setTimeout(() => {
        [0, 1, 2].forEach(i => {
          document.getElementById(`card-flip-${i}`)?.classList.add('flipped');
        });
        playSolvedSound();
        speakSolution(env.suspect, env.weapon, env.place);
        solvedRevealTimer = null;
      }, 350);
    }
    function closeSolvedModal() {
      document.getElementById('solved-modal').classList.add('hidden');
      if (solvedRevealTimer) { clearTimeout(solvedRevealTimer); solvedRevealTimer = null; }
      stopSolvedSound();
    }

    function triggerSolvedFromEnvelope() {
      closeEnvelopeModal();
      showSolvedModal();
    }

    // ── GAME LOGIC ────────────────────────────────────────────────────────
    function getCardCountForPlayer(playerIdx, totalPlayers) {
      const base = Math.floor(18 / totalPlayers), rem = 18 % totalPlayers;
      return playerIdx < rem ? base + 1 : base;
    }
    function getMyEffectiveCardCount() {
      if (gameState.myCardsCount !== null && gameState.myCardsCount !== undefined) return gameState.myCardsCount;
      return getCardCountForPlayer(0, gameState.players.length);
    }
    function allCrossedForCard(card) {
      return gameState.players.every((_, pIdx) => {
        const val = gameState.matrix[`${card}_${pIdx}`] || 0;
        if (pIdx === 0) return val === 1; // "Vos": solo ❌ cuenta
        return val === 1 || val === 8;    // otros: ❌ o 👁️ cuentan
      });
    }
    function updateEnvelopeFromCrosses() {
      const catCards = { suspect: CARDS.suspects, weapon: CARDS.weapons, place: CARDS.places };
      ['suspect','weapon','place'].forEach(cat => {
        let found = null;
        for (const card of catCards[cat]) { if (allCrossedForCard(card)) { found = card; break; } }
        gameState.envelope[cat] = found || "";
      });
      
      const solved = !!(gameState.envelope.suspect && gameState.envelope.weapon && gameState.envelope.place);
      const btnDesk = document.getElementById('btn-envelope');
      const btnNav = document.getElementById('nav-btn-envelope');
      
      if (solved) {
        btnDesk?.classList.add('envelope-glow');
        btnNav?.classList.add('envelope-glow');
        document.getElementById('table-wrapper')?.classList.add('table-border-solved');
      } else {
        btnDesk?.classList.remove('envelope-glow');
        document.getElementById('table-wrapper')?.classList.remove('table-border-solved');
        btnNav?.classList.remove('envelope-glow');
      }
    }
    function ensureSingleCheck(card, playerIdx) {
      gameState.players.forEach((_, pIdx) => {
        if (pIdx !== playerIdx) {
          const key = `${card}_${pIdx}`;
          const cur = gameState.matrix[key] || 0;
          if (cur === 2) gameState.matrix[key] = 1;
        }
      });
    }
    function refreshState() { updateEnvelopeFromCrosses(); saveState(); renderAll(); }
    function getStateInfo(code) { return STATES.find(s => s.code === code) || STATES[0]; }

    function cycleCell(card, playerIdx) {
      if (playerIdx === 0 && gameState.handLocked) return;
      const isMyCard = gameState.matrix[`${card}_0`] === 2 || gameState.matrix[`${card}_0`] === 8;
      const key = `${card}_${playerIdx}`;
      const cur = gameState.matrix[key] || 0;

      // La tilde solo se coloca con toque largo. Un toque normal la quita.
      if (cur === 2) {
        recordUndo(`cambiar ${card}`);
        gameState.matrix[key] = 0;
        refreshState(); return;
      }

      if (isMyCard && playerIdx !== 0) {
        recordUndo(`marcar a quién mostraste ${card}`);
        // Ciclo: cualquier estado → ❌ → 👁️ → ❌ → ...
        gameState.matrix[key] = (cur === 8) ? 1 : 8;
        refreshState(); return;
      }

      if (!isMyCard) {
        recordUndo(`cambiar ${card}`);
        const seqOther = [0,1,9,3,4,5,0];
        const idx = seqOther.indexOf(cur);
        gameState.matrix[key] = idx >= 0 ? seqOther[idx + 1] ?? 0 : 0;
        refreshState();
      }
    }

    function markCardOwner(card, playerIdx) {
      if (playerIdx === 0 && gameState.handLocked) return;
      const alreadyMarked = gameState.players.every((_, idx) =>
        (gameState.matrix[`${card}_${idx}`] || 0) === (idx === playerIdx ? 2 : 1)
      );
      if (alreadyMarked) return;

      recordUndo(`confirmar quién tiene ${card}`);
      gameState.players.forEach((_, idx) => {
        gameState.matrix[`${card}_${idx}`] = idx === playerIdx ? 2 : 1;
      });
      navigator.vibrate?.(35);
      refreshState();
    }

    function startCellLongPress(event, card, playerIdx) {
      if (event.pointerType === 'mouse' && event.button !== 0) return;
      if (playerIdx === 0 && gameState.handLocked) return;
      cancelCellLongPress();
      longPressKey = `${card}_${playerIdx}`;
      longPressTimer = setTimeout(() => {
        suppressedClickKey = longPressKey;
        markCardOwner(card, playerIdx);
        longPressTimer = null;
      }, 550);
    }

    function cancelCellLongPress() {
      if (longPressTimer) clearTimeout(longPressTimer);
      longPressTimer = null;
      longPressKey = null;
    }

    function handleCellClick(card, playerIdx) {
      const key = `${card}_${playerIdx}`;
      if (suppressedClickKey === key) {
        suppressedClickKey = null;
        return;
      }
      cycleCell(card, playerIdx);
    }

    // El elemento se vuelve a renderizar al completar el toque largo. Estos
    // listeners globales limpian el gesto aunque la celda original ya no exista.
    window.addEventListener('pointerup', () => {
      cancelCellLongPress();
      setTimeout(() => { suppressedClickKey = null; }, 0);
    });
    window.addEventListener('pointercancel', () => {
      cancelCellLongPress();
      suppressedClickKey = null;
    });

    // ── STORAGE ───────────────────────────────────────────────────────────
    function createDefaultGameState() {
      return {
        started: false, handLocked: false, myCardsCount: null, myCharacter: "",
        players: ["J1","J2","J3","J4"], matrix: {},
        envelope: { suspect:"", weapon:"", place:"" }, history: []
      };
    }

    function cleanLegacyHistoryText(value) {
      return String(value).replace(/<[^>]*>/g, ' ').replace(/\s+/g, ' ').trim().slice(0, 500);
    }

    function sanitizeHistoryItem(item, index) {
      if (typeof item === 'string') {
        return { id: `legacy-${index}`, legacyText: cleanLegacyHistoryText(item) };
      }
      if (!item || typeof item !== 'object') return null;
      if (typeof item.legacyText === 'string') {
        return {
          id: String(item.id || `legacy-${index}`).slice(0, 80),
          legacyText: cleanLegacyHistoryText(item.legacyText)
        };
      }
      const suspect = CARDS.suspects.includes(item.suspect) ? item.suspect : '';
      const weapon = CARDS.weapons.includes(item.weapon) ? item.weapon : '';
      const place = CARDS.places.includes(item.place) ? item.place : '';
      if (!suspect || !weapon || !place) return null;
      const responses = Array.isArray(item.responses) ? item.responses.map(response => {
        if (!response || typeof response !== 'object') return null;
        const type = ['passed','none','shown'].includes(response.type) ? response.type : null;
        if (!type) return null;
        return {
          player: String(response.player || 'Jugador').slice(0, 30),
          type,
          card: type === 'shown' && ALL_CARDS_FLAT.includes(response.card) ? response.card : ''
        };
      }).filter(Boolean) : [];
      return {
        id: String(item.id || `history-${Date.now()}-${index}`).slice(0, 80),
        suspect, weapon, place, responses
      };
    }

    function sanitizeGameState(candidate) {
      const fallback = createDefaultGameState();
      if (!candidate || typeof candidate !== 'object') return fallback;
      const players = Array.isArray(candidate.players)
        ? candidate.players.slice(0, 6).map((name, index) => String(name || `J${index+1}`).trim().slice(0, 30) || `J${index+1}`)
        : fallback.players;
      if (players.length < 3) return fallback;

      const matrix = {};
      const validStates = new Set(STATES.map(state => state.code));
      ALL_CARDS_FLAT.forEach(card => players.forEach((_, index) => {
        const key = `${card}_${index}`;
        const value = Number(candidate.matrix?.[key]);
        if (validStates.has(value) && value !== 0) matrix[key] = value;
      }));

      const history = Array.isArray(candidate.history)
        ? candidate.history.slice(0, 200).map(sanitizeHistoryItem).filter(Boolean)
        : [];
      const myCardsCount = Number.isInteger(candidate.myCardsCount) && candidate.myCardsCount >= 1 && candidate.myCardsCount <= 6
        ? candidate.myCardsCount : null;
      return {
        started: candidate.started === true,
        handLocked: candidate.handLocked === true,
        myCardsCount,
        myCharacter: CARDS.suspects.includes(candidate.myCharacter) ? candidate.myCharacter : '',
        players,
        matrix,
        envelope: {
          suspect: CARDS.suspects.includes(candidate.envelope?.suspect) ? candidate.envelope.suspect : '',
          weapon: CARDS.weapons.includes(candidate.envelope?.weapon) ? candidate.envelope.weapon : '',
          place: CARDS.places.includes(candidate.envelope?.place) ? candidate.envelope.place : ''
        },
        history
      };
    }

    function sanitizeGuessSelection(candidate) {
      return {
        suspect: CARDS.suspects.includes(candidate?.suspect) ? candidate.suspect : '',
        weapon: CARDS.weapons.includes(candidate?.weapon) ? candidate.weapon : '',
        place: CARDS.places.includes(candidate?.place) ? candidate.place : ''
      };
    }

    function sanitizeSnapshot(snapshot) {
      if (!snapshot || typeof snapshot !== 'object') return null;
      return {
        gameState: sanitizeGameState(snapshot.gameState),
        guessSelection: sanitizeGuessSelection(snapshot.guessSelection),
        label: String(snapshot.label || 'última acción').slice(0, 80)
      };
    }

    function saveState() {
      const stateSaved = writeStorage('simpsons_clue_state', JSON.stringify(gameState));
      const guessSaved = writeStorage('simpsons_clue_guess', JSON.stringify(guessSelection));
      return stateSaved && guessSaved;
    }

    function loadState() {
      try {
        const saved = localStorage.getItem('simpsons_clue_state');
        gameState = saved ? sanitizeGameState(JSON.parse(saved)) : createDefaultGameState();
      } catch(e) {
        console.warn('Se descartó un estado guardado inválido:', e);
        gameState = createDefaultGameState();
      }
      try {
        const savedGuess = localStorage.getItem('simpsons_clue_guess');
        guessSelection = savedGuess ? sanitizeGuessSelection(JSON.parse(savedGuess)) : sanitizeGuessSelection(null);
      } catch(e) { guessSelection = sanitizeGuessSelection(null); }
      try {
        const parsedUndo = JSON.parse(localStorage.getItem('simpsons_clue_undo') || '[]');
        undoStack = Array.isArray(parsedUndo) ? parsedUndo.slice(-20).map(sanitizeSnapshot).filter(Boolean) : [];
      } catch(e) { undoStack = []; }
      try {
        const parsedRedo = JSON.parse(localStorage.getItem('simpsons_clue_redo') || '[]');
        redoStack = Array.isArray(parsedRedo) ? parsedRedo.slice(-20).map(sanitizeSnapshot).filter(Boolean) : [];
      } catch(e) { redoStack = []; }
      saveState();
    }

    // ── CHARACTER MODAL ───────────────────────────────────────────────────
    function openCharacterModal() {
      const container = document.getElementById('character-options');
      container.innerHTML = '';
      CARDS.suspects.forEach(char => {
        const isSelected = gameState.myCharacter === char;
        container.innerHTML += `
          <button onclick="selectMyCharacter('${char}')" class="w-full text-left p-2.5 rounded-lg border-2 font-bold text-xs sm:text-sm transition-colors flex justify-between items-center ${isSelected ? 'border-yellow-500 bg-yellow-100 text-yellow-950' : 'border-slate-200 bg-slate-50 text-slate-800 hover:bg-yellow-50'}">
            <span>${char}</span>
            ${isSelected ? '<span>✔️</span>' : ''}
          </button>`;
      });
      openSheet('character-modal');
    }
    function closeCharacterModal() { closeSheet('character-modal'); }
    function selectMyCharacter(charName) {
      if (gameState.myCharacter === charName) { closeCharacterModal(); return; }
      recordUndo('cambiar tu personaje');
      gameState.myCharacter = charName;
      refreshState();
      closeCharacterModal();
    }

    // ── CONFIG MODAL ──────────────────────────────────────────────────────
    function updateMyCardsCountOptions() {
      const playerCount = parseInt(document.getElementById('player-count-select').value);
      const select = document.getElementById('my-cards-count-select');
      if (!select) return;
      const base = Math.floor(18 / playerCount), rem = 18 % playerCount;
      const options = rem > 0 ? [base, base + 1] : [base];
      select.innerHTML = options.map(n => {
        const sel = (gameState.myCardsCount === n) ? 'selected' : '';
        return `<option value="${n}" ${sel}>${n} cartas</option>`;
      }).join('');
      if (options.length === 1) select.value = options[0];
    }
    function openConfigModal() {
      document.getElementById('player-count-select').value = gameState.players.length.toString();
      updateMyCardsCountOptions();
      document.getElementById('btn-cancel-config').classList.toggle('hidden', !gameState.started);
      openSheet('config-modal');
    }
    function closeConfigModal() { closeSheet('config-modal'); }

    function closeNewGameConfirmation() { closeSheet('new-game-confirm-modal'); }

    function startNewGame(confirmed = false) {
      const count = parseInt(document.getElementById('player-count-select').value || 4);
      if (gameState.started && !confirmed) {
        openSheet('new-game-confirm-modal');
        return;
      }
      if (gameState.started) {
        closeNewGameConfirmation();
        recordUndo('comenzar una partida nueva');
      }
      const newPlayers = ["J1"];
      for (let i = 1; i < count; i++) newPlayers.push(`J${i+1}`);
      const myCardsSelect = document.getElementById('my-cards-count-select');
      gameState.myCardsCount = myCardsSelect ? parseInt(myCardsSelect.value) : null;
      gameState.started = true; gameState.handLocked = false; gameState.myCharacter = "";
      gameState.players = newPlayers; gameState.matrix = {};
      gameState.envelope = { suspect:"", weapon:"", place:"" }; gameState.history = [];
      guessSelection = { suspect: "", weapon: "", place: "" };
      updateGuessButton();
      saveState(); renderAll(); closeConfigModal(); openMyHandModal();
    }

    function updatePlayerName(index, newName) {
      const normalizedName = newName.trim().slice(0, 30) || `J${index+1}`;
      if (gameState.players[index] === normalizedName) return;
      recordUndo(`renombrar a ${gameState.players[index]}`);
      gameState.players[index] = normalizedName;
      saveState(); renderAll();
    }

    function toggleCollapse(category) {
      viewSettings.collapsed[category] = !viewSettings.collapsed[category];
      renderAll();
    }

    // ── MY HAND MODAL ─────────────────────────────────────────────────────
    function updateHandModalCounter() {
      const maxAllowed = getMyEffectiveCardCount();
      const selected = document.querySelectorAll('input[name="myhand-card"]:checked').length;
      const counterEl = document.getElementById('myhand-counter');
      const btnConfirm = document.getElementById('btn-confirm-hand');
      if (counterEl) {
        counterEl.innerText = `${selected}/${maxAllowed}`;
        counterEl.className = selected === maxAllowed
          ? "text-xs font-bold px-2 py-0.5 rounded bg-emerald-600 text-white"
          : "text-xs font-bold px-2 py-0.5 rounded bg-yellow-300 text-yellow-950";
      }
      if (btnConfirm) {
        const ready = selected === maxAllowed;
        btnConfirm.disabled = !ready;
        btnConfirm.className = ready
          ? "px-5 py-2.5 rounded-xl font-extrabold text-sm shadow bg-blue-600 hover:bg-blue-700 text-white cursor-pointer transition-colors"
          : "px-5 py-2.5 rounded-xl font-extrabold text-sm shadow bg-slate-300 text-slate-400 cursor-not-allowed transition-colors";
      }
      document.querySelectorAll('input[name="myhand-card"]').forEach(cb => {
        if (!cb.checked) {
          cb.disabled = selected >= maxAllowed;
          const lbl = cb.closest('label');
          if (lbl) {
            lbl.classList.toggle('opacity-40', selected >= maxAllowed);
            lbl.classList.toggle('cursor-not-allowed', selected >= maxAllowed);
          }
        }
      });
    }
    function handleHandCheckboxChange(checkbox) {
      const maxAllowed = getMyEffectiveCardCount();
      if (document.querySelectorAll('input[name="myhand-card"]:checked').length > maxAllowed)
        checkbox.checked = false;
      updateHandModalCounter();
    }
    function openMyHandModal() {
      if (gameState.handLocked) return;
      const container = document.getElementById('myhand-options');
      container.innerHTML = '';
      const sections = [
        { title: "👤 Sospechosos", cards: CARDS.suspects },
        { title: "🔪 Armas",       cards: CARDS.weapons  },
        { title: "🏠 Lugares",     cards: CARDS.places   }
      ];
      sections.forEach(sec => {
        let html = `<div class="font-bold text-xs text-yellow-900 bg-yellow-200 p-1.5 rounded">${sec.title}</div><div class="grid grid-cols-1 sm:grid-cols-2 gap-1.5 my-1">`;
        sec.cards.forEach(card => {
          const isChecked = gameState.matrix[`${card}_0`] === 2 || gameState.matrix[`${card}_0`] === 8;
          html += `<label class="flex items-center space-x-2 text-xs bg-slate-50 p-2 rounded border border-slate-200 cursor-pointer min-h-[40px]">
            <input type="checkbox" name="myhand-card" value="${card}" ${isChecked ? 'checked' : ''} onchange="handleHandCheckboxChange(this)" class="rounded text-emerald-600 w-4 h-4 shrink-0">
            <span class="truncate">${card}</span>
          </label>`;
        });
        html += `</div>`;
        container.innerHTML += html;
      });
      updateHandModalCounter();
      openSheet('myhand-modal');
    }
    function closeMyHandModal() { closeSheet('myhand-modal'); }

    function saveMyHand() {
      const allotted = getMyEffectiveCardCount();
      const checkboxes = document.querySelectorAll('input[name="myhand-card"]:checked');
      if (checkboxes.length !== allotted) return; // no debería llegar acá con el botón deshabilitado
      recordUndo('confirmar tu mano');
      ALL_CARDS_FLAT.forEach(card => {
        if (gameState.matrix[`${card}_0`] === 2) gameState.matrix[`${card}_0`] = 0;
      });
      checkboxes.forEach(cb => { gameState.matrix[`${cb.value}_0`] = 2; });
      checkboxes.forEach(cb => {
        gameState.players.forEach((_, pIdx) => {
          if (pIdx !== 0) {
            const key = `${cb.value}_${pIdx}`, cur = gameState.matrix[key] || 0;
            if (cur !== 8 && (cur < 3 || cur > 7)) gameState.matrix[key] = 1;
          }
        });
      });
      ALL_CARDS_FLAT.forEach(card => {
        if (gameState.matrix[`${card}_0`] !== 2) gameState.matrix[`${card}_0`] = 1;
      });
      gameState.handLocked = true;
      refreshState();
      closeMyHandModal();
      setTimeout(() => openQuickGuide(true), 150);
    }

    // ── ENVELOPE MODAL ────────────────────────────────────────────────────
    function openEnvelopeModal() {
      document.getElementById('envelope-display-suspect').textContent = gameState.envelope.suspect || "---";
      document.getElementById('envelope-display-weapon').textContent  = gameState.envelope.weapon  || "---";
      document.getElementById('envelope-display-place').textContent   = gameState.envelope.place   || "---";
      
      const isSolved = !!(gameState.envelope.suspect && gameState.envelope.weapon && gameState.envelope.place);
      const btnSolved = document.getElementById('btn-show-solved');
      if (btnSolved) {
        btnSolved.disabled = !isSolved;
        if (isSolved) {
          btnSolved.className = "px-4 py-2.5 rounded-xl font-extrabold text-xs sm:text-sm shadow bg-emerald-600 hover:bg-emerald-700 text-white cursor-pointer transition-all";
        } else {
          btnSolved.className = "px-4 py-2.5 rounded-xl font-extrabold text-xs sm:text-sm shadow bg-gray-300 text-gray-500 cursor-not-allowed transition-all";
        }
      }
      openSheet('envelope-modal');
      // Mostrar mis cartas si la mano está confirmada
      const myCardsDiv  = document.getElementById('envelope-mycards');
      const myCardsList = document.getElementById('envelope-mycards-list');
      if (gameState.handLocked) {
        const mine = ALL_CARDS_FLAT.filter(c => gameState.matrix[`${c}_0`] === 2 || gameState.matrix[`${c}_0`] === 8);
        myCardsList.textContent = mine.length ? mine.join(', ') : '—';
        myCardsDiv.classList.remove('hidden');
      } else {
        myCardsDiv.classList.add('hidden');
      }
    }
    function closeEnvelopeModal() { closeSheet('envelope-modal'); }

    // ── RULES ─────────────────────────────────────────────────────────────
    function openRulesModal()  { openSheet('rules-modal'); }
    function closeRulesModal() { closeSheet('rules-modal'); }

    // ── GUESS MODAL ───────────────────────────────────────────────────────
    function getCategoryForCard(card) {
      return CARD_CATEGORY[card] || null;
    }

    function updateGuessButton() {
      const ready = guessSelection.suspect && guessSelection.weapon && guessSelection.place;
      const btnD = document.getElementById('btn-guess-desktop');
      const btnM = document.getElementById('btn-guess-mobile');
      if (btnD) {
        btnD.disabled = !ready;
        btnD.className = ready
          ? 'bg-blue-600 hover:bg-blue-700 text-white font-bold py-1.5 px-2 rounded-lg text-sm shadow flex items-center justify-center w-28 transition-colors'
          : 'font-bold py-1.5 px-2 rounded-lg text-sm shadow flex items-center justify-center w-28 bg-slate-300 text-slate-400 cursor-not-allowed transition-colors';
      }
      if (btnM) {
        btnM.disabled = !ready;
        btnM.style.opacity = ready ? '1' : '0.4';
      }
    }

    function selectForGuess(card) {
      const cat = getCategoryForCard(card);
      if (!cat) return;
      recordUndo('cambiar la selección de la suposición');
      guessSelection[cat] = (guessSelection[cat] === card) ? "" : card;
      updateGuessButton();
      saveState();
      renderAll();
    }

    function openGuessModal() {
      if (!gameState.players.length) return;
      document.getElementById('guess-suspect').value = guessSelection.suspect;
      document.getElementById('guess-weapon').value  = guessSelection.weapon;
      document.getElementById('guess-place').value   = guessSelection.place;
      document.getElementById('guess-display-suspect').textContent = guessSelection.suspect || '—';
      document.getElementById('guess-display-weapon').textContent  = guessSelection.weapon  || '—';
      document.getElementById('guess-display-place').textContent   = guessSelection.place   || '—';
      document.getElementById('guess-nobody').checked = false;
      renderGuessResponses();
      const modalHistory = document.getElementById('guess-modal-history');
      if (modalHistory) modalHistory.innerHTML = historyItemsHtml(true);
      openSheet('guess-modal');
    }
    function closeGuessModal() { closeSheet('guess-modal'); }

    function renderGuessResponses() {
      const container = document.getElementById('guess-responses-container');
      container.innerHTML = '';
      const myCards = new Set(ALL_CARDS_FLAT.filter(c => gameState.matrix[`${c}_0`] === 2 || gameState.matrix[`${c}_0`] === 8));
      const suspect = document.getElementById('guess-suspect').value;
      const weapon  = document.getElementById('guess-weapon').value;
      const place   = document.getElementById('guess-place').value;
      gameState.players.forEach((p, idx) => {
        if (idx === 0) return;
        const optSuspect = !myCards.has(suspect) ? `<option value="${suspect}">${suspect}</option>` : '';
        const optWeapon  = !myCards.has(weapon)  ? `<option value="${weapon}">${weapon}</option>` : '';
        const optPlace   = !myCards.has(place)   ? `<option value="${place}">${place}</option>` : '';
        container.innerHTML += `
          <div class="flex items-center gap-2 p-2 border rounded-lg bg-slate-50">
            <span class="text-xs font-bold text-slate-700 w-16 shrink-0">${escapeHtml(p)}</span>
            <select id="card-shown-${idx}" onchange="enforceOneShown(${idx})" class="flex-1 border rounded p-1.5 text-xs text-slate-700 bg-white">
              <option value="passed">Pasó</option>
              <option value="none" selected>No mostró</option>
              ${optSuspect}${optWeapon}${optPlace}
            </select>
          </div>`;
      });
    }
    function enforceOneShown(changedIdx) {
      const changedVal = document.getElementById(`card-shown-${changedIdx}`)?.value;
      // Si eligió una carta (no pasó ni no mostró), resetear los demás a "No mostró"
      if (changedVal && changedVal !== 'passed' && changedVal !== 'none') {
        gameState.players.forEach((_, idx) => {
          if (idx === 0 || idx === changedIdx) return;
          const sel = document.getElementById(`card-shown-${idx}`);
          if (sel && sel.value !== 'passed' && sel.value !== 'none') {
            sel.value = 'none';
          }
        });
      }
    }

    function saveGuess() {
      recordUndo('guardar una suposición');
      guessSelection = { suspect: "", weapon: "", place: "" };
      updateGuessButton();
      const suspect = document.getElementById('guess-suspect').value;
      const weapon  = document.getElementById('guess-weapon').value;
      const place   = document.getElementById('guess-place').value;
      const nobody  = document.getElementById('guess-nobody').checked;
      const askedCards = [suspect, weapon, place];
      const responses = [];

      if (nobody) {
        askedCards.forEach(card => {
          gameState.players.forEach((p, idx) => {
            if (idx === 0) return;
            const key = `${card}_${idx}`, cur = gameState.matrix[key] || 0;
            if (cur === 0 || (cur >= 3 && cur <= 7)) gameState.matrix[key] = 1;
          });
        });
        gameState.players.forEach((player, idx) => {
          if (idx !== 0) responses.push({ player, type: 'none', card: '' });
        });
      } else {
        // Procesar cada jugador de forma independiente
        gameState.players.forEach((p, idx) => {
          if (idx === 0) return;
          const val = document.getElementById(`card-shown-${idx}`)?.value;
          if (val === 'passed') {
            // Pasó: no se hace nada
            responses.push({ player: p, type: 'passed', card: '' });
          } else if (val === 'none') {
            // No mostró: ❌ en las 3 cartas para este jugador
            askedCards.forEach(card => {
              const key = `${card}_${idx}`, cur = gameState.matrix[key] || 0;
              if (cur === 0 || (cur >= 3 && cur <= 7)) gameState.matrix[key] = 1;
            });
            responses.push({ player: p, type: 'none', card: '' });
          } else if (val) {
            // Mostró una carta: ✔️ en esa carta para este jugador
            gameState.matrix[`${val}_${idx}`] = 2;
            ensureSingleCheck(val, idx);
            // ❌ al resto de jugadores en esa misma carta
            gameState.players.forEach((_, otherIdx) => {
              if (otherIdx === 0 || otherIdx === idx) return;
              const key = `${val}_${otherIdx}`, cur = gameState.matrix[key] || 0;
              if (cur === 0 || (cur >= 3 && cur <= 7)) gameState.matrix[key] = 1;
            });
            responses.push({ player: p, type: 'shown', card: val });
          }
        });
      }
      gameState.history.unshift({
        id: crypto.randomUUID?.() || `history-${Date.now()}`,
        suspect, weapon, place, responses
      });
      refreshState();
      closeGuessModal();
    }

    // ── HISTORY ───────────────────────────────────────────────────────────
    function historyItemsHtml(compact = false) {
      if (!gameState.history?.length) return `<p class="text-slate-400 italic">No hay suposiciones registradas aún.</p>`;
      return gameState.history.map((item, index) => {
        if (item.legacyText) {
          return `<article class="${compact ? 'p-2' : 'p-3'} bg-yellow-50 border border-yellow-200 rounded-lg">
            <div class="flex gap-2 justify-between">
              <p class="text-slate-700 leading-snug">${escapeHtml(item.legacyText)}</p>
              <button onclick="deleteHistoryEntry(${index})" class="text-red-600 font-bold px-1" aria-label="Eliminar registro">✕</button>
            </div>
          </article>`;
        }
        const responseText = item.responses.map(response => {
          if (response.type === 'passed') return `${escapeHtml(response.player)} pasó`;
          if (response.type === 'none') return `${escapeHtml(response.player)} no mostró`;
          return `${escapeHtml(response.player)} mostró <b class="text-emerald-700">${escapeHtml(response.card)}</b>`;
        }).join(' · ');
        return `<article class="${compact ? 'p-2' : 'p-3'} bg-yellow-50 border border-yellow-200 rounded-lg text-slate-700">
          <div class="flex gap-2 justify-between items-start">
            <div>
              <p class="text-[11px] sm:text-xs">👤 ${escapeHtml(item.suspect)} · 🔪 ${escapeHtml(item.weapon)} · 🏠 ${escapeHtml(item.place)}</p>
            </div>
            <button onclick="deleteHistoryEntry(${index})" class="text-red-600 font-bold px-1" aria-label="Eliminar registro">✕</button>
          </div>
          <p class="text-[11px] mt-2">${responseText || 'Sin respuestas registradas.'}</p>
        </article>`;
      }).join('');
    }

    function deleteHistoryEntry(index) {
      if (!gameState.history[index]) return;
      pendingHistoryDeleteIndex = index;
      openSheet('delete-history-confirm-modal');
    }

    function closeDeleteHistoryConfirmation() {
      pendingHistoryDeleteIndex = null;
      closeSheet('delete-history-confirm-modal');
    }

    function confirmDeleteHistoryEntry() {
      const index = pendingHistoryDeleteIndex;
      if (!Number.isInteger(index) || !gameState.history[index]) {
        closeDeleteHistoryConfirmation();
        return;
      }
      pendingHistoryDeleteIndex = null;
      closeSheet('delete-history-confirm-modal');
      recordUndo('eliminar una entrada del historial');
      gameState.history.splice(index, 1);
      saveState();
      renderHistory();
      const modalHistory = document.getElementById('guess-modal-history');
      if (modalHistory) modalHistory.innerHTML = historyItemsHtml(true);
      showToast('Entrada eliminada. Podés recuperarla con Deshacer.');
    }

    function renderHistory() {
      const list = document.getElementById('history-list');
      list.innerHTML = historyItemsHtml(false);
    }

    // ── LOCK SCREEN ───────────────────────────────────────────────────────
    function toggleLock(show) { document.getElementById('lock-screen').classList.toggle('hidden', !show); }

    // ── RENDER ALL ────────────────────────────────────────────────────────
    function renderAll() {
      const totalPlayers = gameState.players.length;
      const cornerTitle = gameState.myCharacter ? gameState.myCharacter : "Cartas";

      const headerTr = document.getElementById('table-header');
      headerTr.innerHTML = `<th class="p-1 sm:p-1.5 font-bold text-slate-800 sticky-col bg-yellow-200 w-[90px] sm:w-auto min-w-[90px] sm:min-w-[150px] border-r border-yellow-300 text-center text-xs sm:text-sm truncate">${cornerTitle}</th>`;
      
      gameState.players.forEach((p, idx) => {
        const inputHtml = idx === 0
          ? `<button onclick="openCharacterModal()" class="font-extrabold text-xs sm:text-sm text-yellow-950 py-0.5 flex items-center justify-center w-full" title="Hacé clic para elegir tu personaje">Vos</button>`
          : `<input type="text" value="${escapeHtml(p)}" maxlength="30" onchange="updatePlayerName(${idx}, this.value)"
               class="w-full text-center font-bold text-xs sm:text-sm bg-transparent focus:outline-none py-0.5"
               placeholder="J${idx+1}">`;
        headerTr.innerHTML += `
          <th class="p-1 sm:p-2.5 font-bold text-center border-r border-yellow-300 min-w-[40px] sm:min-w-[90px]">
            ${inputHtml}
          </th>`;
      });

      const tbody = document.getElementById('table-body');
      tbody.innerHTML = '';
      const sections = [
        { key: "suspect", name: "SOSPECHOSOS", items: CARDS.suspects, color: "bg-yellow-200 border-yellow-400 text-yellow-950" },
        { key: "weapon",  name: "ARMAS",       items: CARDS.weapons,  color: "bg-yellow-200 border-yellow-400 text-yellow-950" },
        { key: "place",   name: "LUGARES",     items: CARDS.places,   color: "bg-yellow-200 border-yellow-400 text-yellow-950" }
      ];

      sections.forEach(sec => {
        const isCollapsed = viewSettings.collapsed[sec.key];
        tbody.innerHTML += `
          <tr class="${sec.color} border-y cursor-pointer" role="button" tabindex="0" aria-expanded="${!isCollapsed}" aria-label="${isCollapsed ? 'Expandir' : 'Contraer'} ${sec.name.toLowerCase()}" onclick="toggleCollapse('${sec.key}')" onkeydown="if(event.key==='Enter'||event.key===' '){event.preventDefault();toggleCollapse('${sec.key}')}">
            <td colspan="${totalPlayers + 1}" class="p-1.5 sm:p-2 font-black text-xs sm:text-sm tracking-wider uppercase ${sec.color} border-t-2 border-yellow-400">
              ${isCollapsed ? '▶' : '▼'} ${sec.name}
            </td>
          </tr>`;

        if (!isCollapsed) {
          sec.items.forEach(card => {
            const inEnvelope = Object.values(gameState.envelope).includes(card);
            const envBadge = inEnvelope
              ? ` <span class="text-[9px] sm:text-[10px] bg-amber-200 text-amber-900 px-1 rounded font-bold">✉️</span>`
              : '';
            const cat = getCategoryForCard(card);
            const isSelected = cat && guessSelection[cat] === card;
            const selBadge = isSelected ? ` <span class="text-blue-500">🔍</span>` : '';
            let rowHtml = `<tr class="border-b border-slate-100 hover:bg-amber-50/50 ${inEnvelope ? 'bg-amber-100/80 font-semibold' : ''} ${isSelected ? 'bg-blue-50' : ''}">
              <td onclick="selectForGuess('${card}')" onkeydown="if(event.key==='Enter'||event.key===' '){event.preventDefault();selectForGuess('${card}')}" role="button" tabindex="0" aria-pressed="${isSelected}" aria-label="${escapeHtml(card)}: ${isSelected ? 'seleccionada' : 'seleccionar'} para suposición" class="h-12 sm:h-10 px-1 sm:px-2 text-[11px] sm:text-sm font-medium sticky-col bg-white border-r border-slate-200 shadow-sm leading-tight max-w-[90px] sm:max-w-none cursor-pointer select-none ${isSelected ? '!bg-blue-50' : ''}">${card}${envBadge}${selBadge}</td>`;

            gameState.players.forEach((p, pIdx) => {
              const key = `${card}_${pIdx}`;
              const stateCode = gameState.matrix[key] || 0;
              const isMyCard = gameState.matrix[`${card}_0`] === 2 || gameState.matrix[`${card}_0`] === 8;
              let st, cursorClass, interactionHandlers;

              if (pIdx === 0 && gameState.handLocked) {
                st = getStateInfo(stateCode); cursorClass = 'cursor-not-allowed opacity-70'; interactionHandlers = '';
              } else if (isMyCard && pIdx !== 0) {
                st = getStateInfo(stateCode === 0 ? 1 : stateCode);
                cursorClass = 'cursor-pointer';
                interactionHandlers = `role="button" tabindex="0" onclick="handleCellClick('${card}', ${pIdx})" onkeydown="handleCellKeydown(event, '${card}', ${pIdx})" onpointerdown="startCellLongPress(event, '${card}', ${pIdx})" onpointerup="cancelCellLongPress()" onpointercancel="cancelCellLongPress()" onpointerleave="cancelCellLongPress()" oncontextmenu="return false"`;
              } else {
                st = getStateInfo(stateCode); cursorClass = 'cursor-pointer';
                interactionHandlers = `role="button" tabindex="0" onclick="handleCellClick('${card}', ${pIdx})" onkeydown="handleCellKeydown(event, '${card}', ${pIdx})" onpointerdown="startCellLongPress(event, '${card}', ${pIdx})" onpointerup="cancelCellLongPress()" onpointercancel="cancelCellLongPress()" onpointerleave="cancelCellLongPress()" oncontextmenu="return false"`;
              }
              const effectiveState = isMyCard && pIdx !== 0 && stateCode === 0 ? 1 : stateCode;
              rowHtml += `<td ${interactionHandlers} aria-label="${escapeHtml(card)}, ${escapeHtml(p)}: ${STATE_LABELS[effectiveState] || 'sin marcar'}" class="h-12 sm:h-10 px-1 sm:px-2 text-center text-sm sm:text-base select-none touch-manipulation border-r border-slate-200 ${st.bg} ${st.text} ${cursorClass} transition-colors min-w-[44px] sm:min-w-0">${st.symbol}</td>`;
            });
            rowHtml += `</tr>`;
            tbody.innerHTML += rowHtml;
          });
        }
      });

      renderHistory();
      updateEnvelopeFromCrosses();
      updateUndoButtons();
    }

    // ── INICIALIZACIÓN ───────────────────────────────────────────────────
    window.addEventListener('DOMContentLoaded', () => {
      document.querySelectorAll('.bottom-sheet').forEach(modal => {
        modal.setAttribute('role', 'dialog');
        modal.setAttribute('aria-modal', 'true');
        const title = modal.querySelector('h2');
        if (title) {
          if (!title.id) title.id = `${modal.id}-title`;
          modal.setAttribute('aria-labelledby', title.id);
        }
      });
      document.querySelectorAll('.bottom-sheet button').forEach(button => {
        const text = button.textContent.trim();
        if ((text === '×' || text === '✕') && !button.hasAttribute('aria-label')) button.setAttribute('aria-label', 'Cerrar');
      });
      loadState();
      updateGuessButton();
      updateUndoButtons();
      if (sessionStorage.getItem('clue_update_completed') === '1') {
        sessionStorage.removeItem('clue_update_completed');
        window.setTimeout(() => showToast('Aplicación actualizada.'), 150);
      }
      if (!gameState.started) {
        openConfigModal();
      } else {
        renderAll();
        if (!gameState.handLocked) {
          openMyHandModal();
        } else {
          setTimeout(() => openQuickGuide(true), 200);
        }
      }
    });

    document.addEventListener('keydown', event => {
      if (event.key !== 'Escape') return;
      const openModal = [...document.querySelectorAll('.bottom-sheet:not(.hidden)')].pop();
      if (openModal && openModal.id !== 'config-modal') closeSheet(openModal.id);
    });

    // Habilita la instalación y el uso sin conexión de la aplicación.
    if ('serviceWorker' in navigator) {
      window.addEventListener('load', () => {
        navigator.serviceWorker.register('./sw.js', { updateViaCache: 'none' })
          .then(watchForAppUpdates)
          .catch(error => console.warn('No se pudo registrar el Service Worker:', error));
      });
      navigator.serviceWorker.addEventListener('controllerchange', () => {
        if (applyingAppUpdate) {
          sessionStorage.setItem('clue_update_completed', '1');
          window.location.reload();
        }
      });
    }
