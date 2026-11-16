(() => {
  "use strict";
  const API_BASE = "https://cluesimpsons-online.jappstore.workers.dev";
  const SESSION_KEY = "clue_online_session_v1";
  const MAX_SEATS = 6;
  const panel = document.getElementById("online-panel");
  const content = document.getElementById("online-content");
  const closeButton = document.getElementById("online-close");
  const entryButton = document.getElementById("btn-online");
  if (!panel || !content || !entryButton) return;

  const state = {
    screen: "home", session: null, room: null, joinLookup: null,
    joinCode: "", joinName: "", selectedSeat: null, selectedFirst: "random",
    error: "", busy: false, socket: null, reconnectTimer: null, open: false,
    handSelection: [], responseChoice: "", expectedHandCount: 0,
    annotatorActive: false, conventionalSnapshot: null, onlineAnnotationKey: "",
    originalSaveState: null, originalSaveActionStacks: null, historyWrapperInstalled: false
  };

  function escapeHtml(value) {
    return String(value ?? "").replace(/[&<>"']/g, character => ({
      "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#039;"
    })[character]);
  }

  function readSession() {
    try {
      const saved = JSON.parse(localStorage.getItem(SESSION_KEY) || "null");
      return saved && /^\d{6}$/.test(saved.code || "") ? saved : null;
    } catch { return null; }
  }

  function saveSession() {
    try {
      if (state.session) localStorage.setItem(SESSION_KEY, JSON.stringify(state.session));
      else localStorage.removeItem(SESSION_KEY);
    } catch { state.error = "No se pudo guardar la sesión en este dispositivo."; }
  }

  function authToken(preferHost = false) {
    if (!state.session) return "";
    if (preferHost && state.session.organizerToken) return state.session.organizerToken;
    return state.session.playerToken || state.session.organizerToken || "";
  }

  async function api(path, options = {}) {
    const headers = { "content-type": "application/json" };
    const token = options.token ?? authToken(Boolean(options.host));
    if (token) headers.Authorization = "Bearer " + token;
    const response = await fetch(API_BASE + path, {
      method: options.method || "GET", headers,
      body: options.body ? JSON.stringify(options.body) : undefined,
      cache: "no-store"
    });
    const data = await response.json().catch(() => ({}));
    if (!response.ok) throw new Error(data.error || "No se pudo completar la operación.");
    return data;
  }

  function setError(message) { state.error = message || ""; render(); }
  function sortedPlayers() {
    return [...(state.room?.players || [])].sort((a, b) => (a.seat || 99) - (b.seat || 99));
  }


  function localPlayerOrder(room = state.room) {
    if (!room || !state.session?.playerId) return [];
    const ordered = [...room.players].sort((a, b) => a.seat - b.seat);
    const index = ordered.findIndex(player => player.id === state.session.playerId);
    if (index < 0) return [];
    return [...ordered.slice(index), ...ordered.slice(0, index)];
  }

  function expectedHandCount(room = state.room) {
    const ordered = [...(room?.players || [])].sort((a, b) => a.seat - b.seat);
    const absoluteIndex = ordered.findIndex(player => player.id === state.session?.playerId);
    if (absoluteIndex < 0 || !ordered.length) return 0;
    const base = Math.floor(18 / ordered.length);
    const remainder = 18 % ordered.length;
    return base + (absoluteIndex < remainder ? 1 : 0);
  }

  function onlineAnnotationStorageKey() {
    return "clue_online_annotation_" + state.session.code + "_" + state.session.playerId;
  }

  function persistOnlineAnnotation() {
    if (!state.annotatorActive || !state.session?.playerId) return false;
    try {
      const payload = {
        gameState,
        guessSelection,
        undoStack,
        redoStack
      };
      localStorage.setItem(state.onlineAnnotationKey, JSON.stringify(payload));
      return true;
    } catch (error) {
      console.warn("No se pudo guardar el anotador online:", error);
      return false;
    }
  }

  function installOnlineAnnotationWrappers() {
    if (state.originalSaveState === null && typeof window.saveState === "function") {
      state.originalSaveState = window.saveState;
      window.saveState = function(...args) {
        return state.annotatorActive
          ? persistOnlineAnnotation()
          : state.originalSaveState.apply(this, args);
      };
    }
    if (state.originalSaveActionStacks === null && typeof window.saveActionStacks === "function") {
      state.originalSaveActionStacks = window.saveActionStacks;
      window.saveActionStacks = function(...args) {
        if (!state.annotatorActive) return state.originalSaveActionStacks.apply(this, args);
        persistOnlineAnnotation();
        if (typeof window.updateUndoButtons === "function") window.updateUndoButtons();
      };
    }
    if (!state.historyWrapperInstalled && typeof window.historyItemsHtml === "function") {
      const original = window.historyItemsHtml;
      window.historyItemsHtml = function(...args) {
        return original.apply(this, args).replace(
          /mostró <b class="text-emerald-700">\\?<\\/b>/g,
          "mostró una carta (oculta)"
        );
      };
      state.historyWrapperInstalled = true;
    }
  }

  function activateOnlineAnnotator(room) {
    const localOrder = localPlayerOrder(room);
    if (!localOrder.length || !state.session?.playerId) return;
    const key = onlineAnnotationStorageKey();
    const signature = localOrder.map(player => player.id).join("|");

    if (!state.annotatorActive) {
      state.conventionalSnapshot = {
        gameState,
        guessSelection,
        undoStack,
        redoStack
      };
      state.onlineAnnotationKey = key;
      state.expectedHandCount = expectedHandCount(room);

      let saved = null;
      try { saved = JSON.parse(localStorage.getItem(key) || "null"); } catch {}
      if (saved?.gameState && Array.isArray(saved.gameState.players)) {
        gameState = saved.gameState;
        guessSelection = saved.guessSelection || { suspect: "", weapon: "", place: "" };
        undoStack = Array.isArray(saved.undoStack) ? saved.undoStack : [];
        redoStack = Array.isArray(saved.redoStack) ? saved.redoStack : [];
      } else {
        gameState = createDefaultGameState();
        gameState.started = true;
        gameState.handLocked = false;
        gameState.myCardsCount = state.expectedHandCount;
        gameState.players = localOrder.map(player => player.name);
        gameState.matrix = {};
        gameState.envelope = { suspect: "", weapon: "", place: "" };
        gameState.history = [];
        guessSelection = { suspect: "", weapon: "", place: "" };
        undoStack = [];
        redoStack = [];
      }
      state.annotatorActive = true;
      installOnlineAnnotationWrappers();
    } else {
      state.expectedHandCount = expectedHandCount(room);
      if (!room.rosterLocked && !gameState.handLocked) {
        gameState.players = localOrder.map(player => player.name);
        gameState.myCardsCount = state.expectedHandCount;
      }
    }

    if (gameState.players.length !== localOrder.length ||
        gameState.players.some((name, index) => name !== localOrder[index].name)) {
      gameState.players = localOrder.map(player => player.name);
    }
    gameState.started = true;
    if (!gameState.handLocked) gameState.myCardsCount = state.expectedHandCount;
    renderAll();
    updateGuessButton();
    if (!gameState.handLocked && Array.isArray(room.private?.ownCards) && room.private.ownCards.length) {
      restoreOwnHandFromServer(room.private.ownCards);
    }
    persistOnlineAnnotation();
  }

  function restoreOwnHandFromServer(cards) {
    if (gameState.handLocked || !Array.isArray(cards) || !cards.length) return;
    try {
      window.openMyHandModal();
      const inputs = document.querySelectorAll('#myhand-options input[name="myhand-card"]');
      inputs.forEach(input => { input.checked = cards.includes(input.value); });
      window.saveMyHand();
      state.handSelection = [];
    } catch (error) {
      console.warn("No se pudo restaurar la mano privada en el anotador:", error);
    }
  }

  function deactivateOnlineAnnotator() {
    if (!state.annotatorActive) return;
    persistOnlineAnnotation();
    const saved = state.conventionalSnapshot;
    if (saved) {
      gameState = saved.gameState;
      guessSelection = saved.guessSelection;
      undoStack = saved.undoStack;
      redoStack = saved.redoStack;
    }
    state.conventionalSnapshot = null;
    state.annotatorActive = false;
    renderAll();
    updateGuessButton();
    if (typeof window.updateUndoButtons === "function") window.updateUndoButtons();
  }

  function markSuggestionAsProcessed(suggestionId) {
    const key = "clue_online_processed_" + state.session.code + "_" + state.session.playerId;
    let processed = [];
    try { processed = JSON.parse(localStorage.getItem(key) || "[]"); } catch {}
    if (!Array.isArray(processed)) processed = [];
    if (processed.includes(suggestionId)) return false;
    processed.push(suggestionId);
    localStorage.setItem(key, JSON.stringify(processed.slice(-100)));
    return true;
  }

  function hasProcessedSuggestion(suggestionId) {
    const key = "clue_online_processed_" + state.session.code + "_" + state.session.playerId;
    try {
      const processed = JSON.parse(localStorage.getItem(key) || "[]");
      return Array.isArray(processed) && processed.includes(suggestionId);
    } catch { return false; }
  }

  function applyCompletedSuggestion(room) {
    const suggestion = room?.suggestion;
    if (!state.annotatorActive || !suggestion?.completed || !suggestion.id ||
        hasProcessedSuggestion(suggestion.id)) return;

    const localOrder = localPlayerOrder(room);
    if (!localOrder.length) return;
    gameState.players = localOrder.map(player => player.name);
    const localIsSuggester = suggestion.byPlayerId === state.session.playerId;
    const shownResponse = suggestion.responses.find(response => response.type === "shown");
    const actualCard = localIsSuggester ? room.private?.shownCard : "";

    const suspectInput = document.getElementById("guess-suspect");
    const weaponInput = document.getElementById("guess-weapon");
    const placeInput = document.getElementById("guess-place");
    if (!suspectInput || !weaponInput || !placeInput || typeof window.saveGuess !== "function") return;

    suspectInput.value = suggestion.cards[0];
    weaponInput.value = suggestion.cards[1];
    placeInput.value = suggestion.cards[2];
    window.renderGuessResponses();

    const responseById = new Map(suggestion.responses.map(response => [response.playerId, response]));
    localOrder.forEach((player, index) => {
      if (index === 0) return;
      const select = document.getElementById("card-shown-" + index);
      if (!select) return;
      const response = responseById.get(player.id);
      if (!response) {
        select.value = "passed";
      } else if (response.type === "none") {
        select.value = "none";
      } else if (response.type === "shown") {
        select.value = localIsSuggester && actualCard && shownResponse?.playerId === player.id
          ? actualCard
          : "passed";
      }
    });

    try {
      window.saveGuess();
      const latest = gameState.history?.[0];
      if (latest && shownResponse && !localIsSuggester) {
        const response = latest.responses?.find(item =>
          item.player === (localOrder.find(player => player.id === shownResponse.playerId)?.name || "")
        );
        if (response) {
          response.type = "shown";
          response.card = "?";
        }
        if (typeof window.renderHistory === "function") window.renderHistory();
      }
      markSuggestionAsProcessed(suggestion.id);
      persistOnlineAnnotation();
    } catch (error) {
      console.error("No se pudo incorporar la suposición al anotador existente:", error);
    }
  }

  function renderHome() {
    const resume = state.session
      ? '<button class="online-button online-button-primary" data-action="resume">Reanudar partida ' + escapeHtml(state.session.code) + '</button>'
      : "";
    return '<section class="online-card"><p class="online-eyebrow">DOS FORMAS DE JUGAR</p>' +
      '<h3>¿Cómo querés jugar?</h3><p>El anotador convencional sigue funcionando como siempre. Para jugar en varios celulares, creá una sala o ingresá con un código.</p>' +
      resume + '<div class="online-actions"><button class="online-button online-button-primary" data-action="create-screen">Crear partida</button>' +
      '<button class="online-button online-button-secondary" data-action="join-screen">Unirme con un código</button></div>' +
      '<p class="online-muted">El organizador administra la sala y no está obligado a participar como jugador.</p></section>';
  }

  function renderCreate() {
    return '<section class="online-card"><p class="online-eyebrow">NUEVA SALA</p><h3>Crear una partida</h3>' +
      '<label class="online-label" for="online-host-name">Nombre del organizador</label>' +
      '<input id="online-host-name" class="online-input" maxlength="30" autocomplete="name" placeholder="Tu nombre">' +
      '<div class="online-actions"><button class="online-button online-button-primary" data-action="create" ' +
      (state.busy ? 'disabled' : '') + '>' + (state.busy ? 'Creando…' : 'Crear sala') + '</button>' +
      '<button class="online-button online-button-light" data-action="home">Volver</button></div></section>';
  }

  function renderJoin() {
    let seats = "";
    const room = state.joinLookup;
    if (room) {
      seats = Array.from({ length: MAX_SEATS }, (_, index) => {
        const seat = index + 1;
        const player = room.players.find(item => item.seat === seat);
        const selected = state.selectedSeat === seat;
        return '<button class="online-seat-choice ' + (player ? "is-occupied" : "") + (selected ? " is-selected" : "") +
          '" data-action="choose-seat" data-seat="' + seat + '" ' + (player ? "disabled" : "") +
          ' aria-pressed="' + selected + '"><strong>Asiento ' + seat + '</strong><span>' +
          (player ? escapeHtml(player.name) : (selected ? "Seleccionado" : "Libre")) + '</span></button>';
      }).join("");
    }

    return '<section class="online-card"><p class="online-eyebrow">INGRESAR A UNA SALA</p><h3>Unirme a una partida</h3>' +
      '<label class="online-label" for="online-room-code">Código de la partida</label>' +
      '<input id="online-room-code" class="online-input online-code-input" maxlength="6" inputmode="numeric" placeholder="000000" value="' + escapeHtml(state.joinCode) + '">' +
      '<label class="online-label" for="online-player-name">Tu nombre</label>' +
      '<input id="online-player-name" class="online-input" maxlength="30" autocomplete="name" placeholder="Cómo te verán los demás" value="' + escapeHtml(state.joinName) + '">' +
      '<div class="online-actions"><button class="online-button online-button-secondary" data-action="find-room" ' +
      (state.busy ? "disabled" : "") + '>Buscar partida</button><button class="online-button online-button-light" data-action="home">Volver</button></div>' +
      (room ? '<div class="online-room-found"><strong>Sala ' + escapeHtml(room.code) + '</strong><span>Organiza ' +
        escapeHtml(room.hostName) + ' · ' + room.players.length + '/6 jugadores</span><p>Elegí tu lugar en la mesa:</p>' +
        '<div class="online-seat-grid">' + seats + '</div><button class="online-button online-button-primary online-full-button" data-action="join-confirm" ' +
        (state.selectedSeat && !state.busy ? "" : "disabled") + '>' + (state.busy ? "Ingresando…" : "Confirmar asiento y unirme") + '</button></div>' : "") +
      '</section>';
  }

  function renderHandPanel(room, me) {
    if (!me || room.status !== "lobby") return "";
    if (me.handSubmitted) {
      return '<section class="online-hand-panel"><p class="online-eyebrow">TUS CARTAS</p><strong>Mano confirmada</strong>' +
        '<p class="online-muted">Tus cartas quedaron guardadas de forma privada. Los demás solo pueden ver que ya completaste la carga.</p></section>';
    }
    if (room.players.length < 3) {
      return '<section class="online-hand-panel"><p class="online-eyebrow">CARGA DE CARTAS</p>' +
        '<strong>Esperando al menos 3 jugadores</strong><p class="online-muted">Cuando estén todos sentados, vas a poder cargar tus cartas.</p></section>';
    }
    const count = state.expectedHandCount || expectedHandCount(room);
    const groups = [
      { title: "Sospechosos", cards: CARDS.suspects },
      { title: "Armas", cards: CARDS.weapons },
      { title: "Lugares", cards: CARDS.places }
    ];
    const choices = groups.map(group => '<div class="online-hand-category"><strong>' + group.title + '</strong><div class="online-hand-options">' +
      group.cards.map(card => '<label><input type="checkbox" data-online-card value="' + escapeHtml(card) + '" ' +
        (state.handSelection.includes(card) ? "checked" : "") + '><span>' + escapeHtml(card) + '</span></label>').join("") +
      '</div></div>').join("");
    return '<section class="online-hand-panel"><p class="online-eyebrow">CARGÁ TUS CARTAS</p><h4>Tu mano privada</h4>' +
      '<p>Según tu asiento, te corresponden <strong>' + count + ' cartas</strong>. Solo vos vas a poder consultar cuáles cargaste.</p>' +
      '<div class="online-hand-counter">' + state.handSelection.length + ' / ' + count + ' seleccionadas</div>' +
      choices + '<button class="online-button online-button-primary online-full-button" data-action="submit-hand" ' +
      (state.handSelection.length === count && !state.busy ? "" : "disabled") + '>' +
      (state.busy ? "Guardando cartas…" : "Confirmar mi mano") + '</button>' +
      '<p class="online-muted">La primera confirmación cierra la lista de participantes y bloquea los asientos para conservar la distribución.</p></section>';
  }

  function renderSuggestionComposer() {
    const fields = [
      { id: "online-suspect", label: "Sospechoso", cards: CARDS.suspects },
      { id: "online-weapon", label: "Arma", cards: CARDS.weapons },
      { id: "online-place", label: "Lugar", cards: CARDS.places }
    ];
    return '<section class="online-suggestion-composer"><p class="online-eyebrow">ES TU TURNO</p><h4>Hacer una suposición</h4>' +
      fields.map(field => '<label class="online-label" for="' + field.id + '">' + field.label + '</label>' +
        '<select id="' + field.id + '" class="online-input"><option value="">Elegir…</option>' +
        field.cards.map(card => '<option value="' + escapeHtml(card) + '">' + escapeHtml(card) + '</option>').join("") +
        '</select>').join("") +
      '<button class="online-button online-button-primary online-full-button" data-action="make-suggestion" ' +
      (state.busy ? "disabled" : "") + '>Enviar suposición</button>' +
      '<p class="online-muted">Todos verán los tres elementos y el orden de respuestas. Las cartas que se muestren seguirán siendo privadas.</p></section>';
  }

  function renderSuggestionPanel(room, me) {
    if (room.status !== "playing" || !me) return "";
    const suggestion = room.suggestion;
    const myTurn = room.turnPlayerId === me.id;
    let output = "";

    if (suggestion) {
      const responseRows = suggestion.responses.map(response => {
        const status = response.type === "none"
          ? '<span class="online-response-none">No tiene ninguna</span>'
          : '<span class="online-card-back" aria-label="Carta oculta">?</span><span class="online-response-shown">Mostró una carta</span>';
        return '<div class="online-response-row"><strong>' + escapeHtml(response.playerName) + '</strong>' + status + '</div>';
      }).join("");
      const responder = room.players.find(player => player.id === suggestion.currentResponderId);
      const shown = suggestion.responses.find(response => response.type === "shown");
      let result = "";
      if (suggestion.completed && suggestion.outcome === "nobody") {
        result = '<div class="online-suggestion-result">Ningún jugador tenía alguna de las tres cartas.</div>';
      } else if (suggestion.completed && suggestion.outcome === "shown") {
        if (suggestion.byPlayerId === me.id && room.private?.shownCard) {
          result = '<div class="online-suggestion-result online-private-result"><span>Te mostraron esta carta</span><strong>' +
            escapeHtml(room.private.shownCard) + '</strong></div>';
        } else {
          result = '<div class="online-suggestion-result"><span class="online-card-back" aria-label="Carta oculta">?</span>' +
            '<strong>' + escapeHtml(shown?.playerName || "Un jugador") + ' mostró una carta</strong></div>';
        }
      }

      let responseControl = "";
      if (!suggestion.completed && suggestion.currentResponderId === me.id) {
        const matching = Array.isArray(room.private?.matchingCards) ? room.private.matchingCards : [];
        if (!matching.length) {
          responseControl = '<div class="online-response-control"><p>Revisaste tus cartas y no tenés ninguna de las tres.</p>' +
            '<button class="online-button online-button-primary online-full-button" data-action="respond-none" ' +
            (state.busy ? "disabled" : "") + '>Confirmar: no tengo ninguna</button></div>';
        } else {
          responseControl = '<div class="online-response-control"><p>Tenés más de una posibilidad? Elegí exactamente una carta para mostrar.</p>' +
            '<div class="online-matching-cards">' + matching.map(card =>
              '<label><input type="radio" name="online-response-card" value="' + escapeHtml(card) + '" ' +
              (state.responseChoice === card ? "checked" : "") + '><span>' + escapeHtml(card) + '</span></label>'
            ).join("") + '</div><button class="online-button online-button-primary online-full-button" data-action="respond-card" ' +
            (state.responseChoice && matching.includes(state.responseChoice) && !state.busy ? "" : "disabled") + '>Mostrar carta seleccionada</button></div>';
        }
      } else if (!suggestion.completed && suggestion.byPlayerId === me.id) {
        responseControl = '<p class="online-waiting-note">Esperando respuesta de <strong>' +
          escapeHtml(responder?.name || "el siguiente jugador") + '</strong>.</p>';
      }

      output += '<section class="online-suggestion-live"><p class="online-eyebrow">' +
        (suggestion.completed ? "SUPOSICIÓN RESPONDIDA" : "SUPOSICIÓN EN CURSO") + '</p>' +
        '<h4>' + escapeHtml(suggestion.byPlayerName) + ' supone:</h4>' +
        '<div class="online-suggestion-cards"><span>' + escapeHtml(suggestion.cards[0]) + '</span><span>' +
        escapeHtml(suggestion.cards[1]) + '</span><span>' + escapeHtml(suggestion.cards[2]) + '</span></div>' +
        '<div class="online-response-list">' + (responseRows || '<p class="online-muted">Todavía no hay respuestas.</p>') + '</div>' +
        (!suggestion.completed ? '<p class="online-waiting-note">Ahora responde <strong>' + escapeHtml(responder?.name || "—") + '</strong>.</p>' : "") +
        responseControl + result + '</section>';
    }

    if (myTurn) {
      output += renderSuggestionComposer();
    } else if (!suggestion || suggestion.completed) {
      const current = room.players.find(player => player.id === room.turnPlayerId);
      output += '<p class="online-waiting-note">Turno de <strong>' + escapeHtml(current?.name || "otro jugador") + '</strong>.</p>';
    }
    return output;
  }

  function renderRoom() {
    const room = state.room;
    if (!room) return renderHome();
    const isHost = Boolean(state.session?.organizerToken);
    const me = room.players.find(player => player.id === state.session?.playerId);
    const players = sortedPlayers();
    const handsReady = players.length >= 3 && players.every(player => player.handSubmitted);
    const seatsLocked = room.status !== "lobby" || room.rosterLocked;

    const seats = Array.from({ length: MAX_SEATS }, (_, index) => {
      const seat = index + 1;
      const player = players.find(item => item.seat === seat);
      if (!player) return '<div class="online-table-seat is-free"><span class="online-seat-number">' + seat + '</span><strong>Asiento libre</strong></div>';
      const selector = isHost && !seatsLocked
        ? '<select class="online-seat-select" data-action="host-seat" data-player-id="' + escapeHtml(player.id) +
          '" aria-label="Cambiar asiento de ' + escapeHtml(player.name) + '">' +
          Array.from({ length: MAX_SEATS }, (_, i) => '<option value="' + (i + 1) + '" ' + (player.seat === i + 1 ? "selected" : "") +
          '>Asiento ' + (i + 1) + '</option>').join("") + '</select>'
        : "";
      return '<div class="online-table-seat ' + (player.id === state.session?.playerId ? "is-me" : "") + '">' +
        '<span class="online-seat-number">' + seat + '</span><strong>' + escapeHtml(player.name) + '</strong>' +
        '<span class="online-presence"><i class="' + (player.connected ? "is-online" : "") + '"></i>' +
        (player.connected ? "Conectado" : "Desconectado") + '</span>' +
        '<span class="online-hand-status">' + (player.handSubmitted ? "Cartas cargadas" : "Falta cargar cartas") + '</span>' +
        selector + '</div>';
    }).join("");

    const selfSeatControl = me && !isHost && !seatsLocked
      ? '<div class="online-inline-control"><label class="online-label" for="online-self-seat">Tu asiento</label>' +
        '<select id="online-self-seat" class="online-input" data-action="self-seat">' +
        Array.from({ length: MAX_SEATS }, (_, i) => {
          const seat = i + 1;
          const occupied = players.some(player => player.seat === seat && player.id !== me.id);
          return '<option value="' + seat + '" ' + (me.seat === seat ? "selected" : "") +
            (occupied ? " disabled" : "") + '>Asiento ' + seat + (occupied ? " — ocupado" : "") + '</option>';
        }).join("") + '</select></div>'
      : "";

    const canStart = players.length >= 3 && players.length <= 6 &&
      players.every(player => Number.isInteger(player.seat)) && handsReady;
    const firstControl = isHost && room.status === "lobby"
      ? '<div class="online-start-controls"><label class="online-label" for="online-first-player">¿Quién comienza?</label>' +
        '<select id="online-first-player" class="online-input"><option value="random" ' +
        (state.selectedFirst === "random" ? "selected" : "") + '>Sortear aleatoriamente</option>' +
        players.map(player => '<option value="' + escapeHtml(player.id) + '" ' + (state.selectedFirst === player.id ? "selected" : "") +
          '>' + escapeHtml(player.name) + '</option>').join("") + '</select>' +
        '<button class="online-button online-button-primary online-full-button" data-action="start" ' +
        (canStart && !state.busy ? "" : "disabled") + '>' + (state.busy ? "Iniciando…" : "Iniciar partida") + '</button>' +
        '<p class="online-muted">' + (players.length < 3 ? "Se necesitan al menos 3 jugadores." :
          !handsReady ? "Todos los jugadores deben cargar y confirmar sus cartas." : "Al iniciar, los asientos quedan bloqueados.") + '</p></div>'
      : "";

    const joinAsPlayer = isHost && !me && room.status === "lobby"
      ? '<button class="online-button online-button-secondary" data-action="join-as-player">Sumarme como jugador</button>' : "";

    const handPanel = renderHandPanel(room, me);
    const suggestionPanel = renderSuggestionPanel(room, me);
    let turnPanel = "";
    if (room.status === "playing") {
      const current = room.players.find(player => player.id === room.turnPlayerId);
      const currentIndex = players.findIndex(player => player.id === room.turnPlayerId);
      const next = currentIndex >= 0 && players.length ? players[(currentIndex + 1) % players.length] : null;
      const responder = room.suggestion?.currentResponderId
        ? room.players.find(player => player.id === room.suggestion.currentResponderId)
        : null;
      turnPanel = '<section class="online-turn-panel"><p class="online-eyebrow">INDICADOR DE TURNO</p>' +
        '<div class="online-turn-grid"><div class="online-turn-current"><span>Turno actual</span><strong>' +
        escapeHtml(current?.name || "Sin definir") + '</strong></div><div><span>Próximo turno</span><strong>' +
        escapeHtml(next?.name || "—") + '</strong></div><div><span>Debe responder</span><strong>' +
        escapeHtml(responder?.name || "Nadie") + '</strong></div></div></section>';
    }

    const statusText = room.status === "playing" ? "Partida iniciada" : "Esperando jugadores";
    return '<section class="online-card online-room-card"><div class="online-room-heading"><div><p class="online-eyebrow">' +
      escapeHtml(statusText) + '</p><h3>Sala ' + escapeHtml(room.code) + '</h3></div>' +
      '<button class="online-copy-button" data-action="copy-code">Copiar código</button></div>' +
      '<p class="online-muted">Organiza ' + escapeHtml(room.hostName) + ' · ' + players.length + '/6 jugadores · Código para compartir</p>' +
      (room.rosterLocked && room.status === "lobby" ? '<p class="online-roster-locked">La mesa quedó cerrada: ya comenzó la carga de cartas y no se pueden mover los asientos.</p>' : "") +
      '<div class="online-seat-grid online-table-grid">' + seats + '</div>' + selfSeatControl + joinAsPlayer +
      handPanel + firstControl + turnPanel + suggestionPanel +
      '<div class="online-actions online-room-actions"><button class="online-button online-button-light" data-action="refresh">Actualizar sala</button>' +
      '<button class="online-button online-button-secondary" data-action="show-annotator">Ver anotador</button>' +
      '<button class="online-button online-button-light" data-action="home">Salir de esta vista</button></div></section>';
  }
  function render() {
    if (!state.open) return;
    let body = state.screen === "create" ? renderCreate() : state.screen === "join" ? renderJoin() :
      state.screen === "room" ? renderRoom() : renderHome();
    content.innerHTML = '<div class="online-status-line"><span class="online-status-dot"></span> Sala sincronizada en tiempo real</div>' +
      (state.error ? '<div class="online-error" role="alert">' + escapeHtml(state.error) + '</div>' : "") + body;
  }

  async function connectSocket() {
    if (!state.session || !state.open) return;
    if (state.socket) { try { state.socket.close(); } catch {} state.socket = null; }
    try {
      const ticketData = await api("/api/rooms/" + state.session.code + "/socket-ticket", { method: "POST", token: authToken() });
      const wsBase = API_BASE.replace(/^https:/, "wss:");
      const socket = new WebSocket(wsBase + "/api/rooms/" + state.session.code + "/ws?ticket=" + encodeURIComponent(ticketData.ticket));
      state.socket = socket;
      socket.onmessage = event => {
        try {
          const payload = JSON.parse(event.data);
          if (payload.type === "room.snapshot" && payload.room) {
            state.room = payload.room;
            activateOnlineAnnotator(state.room);
            applyCompletedSuggestion(state.room);
            if (state.open && state.screen === "room") render();
          }
        } catch {}
      };
      socket.onclose = () => {
        if (!state.open || !state.session || state.socket !== socket) return;
        if (state.reconnectTimer) clearTimeout(state.reconnectTimer);
        state.reconnectTimer = setTimeout(connectSocket, 3500);
      };
      socket.onerror = () => { try { socket.close(); } catch {} };
    } catch (error) { state.error = error.message; render(); }
  }

  async function loadRoom() {
    const data = await api("/api/rooms/" + state.session.code);
    state.room = data.room;
    state.screen = "room";
    state.error = "";
    render();
    connectSocket();
  }

  async function restoreSession() {
    state.session = readSession();
    if (!state.session) return false;
    const token = state.session.playerToken || state.session.organizerToken;
    if (!token) { state.session = null; saveSession(); return false; }
    try {
      const data = await api("/api/rooms/" + state.session.code, { token });
      state.room = data.room;
      state.screen = "room";
      state.error = "";
      activateOnlineAnnotator(state.room);
      applyCompletedSuggestion(state.room);
      render();
      connectSocket();
      return true;
    } catch {
      state.session = null;
      saveSession();
      return false;
    }
  }

  async function openPanel() {
    state.open = true;
    panel.classList.remove("hidden");
    document.body.classList.add("online-panel-open");
    state.error = "";
    const restored = await restoreSession();
    if (!restored) { state.screen = "home"; render(); }
    closeButton?.focus();
  }

  function closePanel() {
    deactivateOnlineAnnotator();
    state.open = false;
    panel.classList.add("hidden");
    document.body.classList.remove("online-panel-open");
    if (state.reconnectTimer) clearTimeout(state.reconnectTimer);
    state.reconnectTimer = null;
    if (state.socket) { try { state.socket.close(); } catch {} state.socket = null; }
  }

  async function createRoom() {
    const name = document.getElementById("online-host-name")?.value.trim();
    if (!name) return setError("Ingresá el nombre del organizador.");
    state.busy = true; state.error = ""; render();
    try {
      const data = await api("/api/rooms", { method: "POST", token: "", body: { hostName: name } });
      state.session = { code: data.code, organizerToken: data.hostToken, playerId: null, playerToken: null, hostName: name };
      saveSession(); state.room = data.room; state.screen = "room"; state.busy = false;
      render(); connectSocket();
    } catch (error) { state.busy = false; setError(error.message); }
  }

  async function findRoom() {
    state.joinCode = (document.getElementById("online-room-code")?.value || "").replace(/\D/g, "").slice(0, 6);
    state.joinName = document.getElementById("online-player-name")?.value.trim() || "";
    state.selectedSeat = null;
    if (!/^\d{6}$/.test(state.joinCode)) return setError("Ingresá un código de seis números.");
    if (!state.joinName) return setError("Ingresá tu nombre.");
    state.busy = true; state.error = ""; render();
    try {
      const data = await api("/api/rooms/" + state.joinCode);
      if (data.room.status !== "lobby") throw new Error("La partida ya comenzó y no admite nuevos jugadores.");
      if (data.room.players.length >= MAX_SEATS) throw new Error("La mesa ya está completa.");
      state.joinLookup = data.room; state.busy = false; state.error = ""; render();
    } catch (error) { state.busy = false; state.joinLookup = null; setError(error.message); }
  }

  async function submitHand() {
    const selected = [...content.querySelectorAll("[data-online-card]:checked")].map(input => input.value);
    const expected = state.expectedHandCount || expectedHandCount(state.room);
    if (selected.length !== expected) return setError("Seleccioná exactamente " + expected + " cartas.");
    state.busy = true;
    state.error = "";
    render();
    try {
      const data = await api("/api/rooms/" + state.session.code + "/hand", {
        method: "POST",
        body: { cards: selected }
      });
      state.room = data.room;
      activateOnlineAnnotator(state.room);
      // El marcado de la mano se procesa mediante la función existente de v72.
      window.openMyHandModal();
      document.querySelectorAll('#myhand-options input[name="myhand-card"]').forEach(input => {
        input.checked = selected.includes(input.value);
      });
      window.saveMyHand();
      state.handSelection = [];
      state.busy = false;
      state.error = "";
      await refreshRoom(false);
    } catch (error) {
      state.busy = false;
      setError(error.message);
    }
  }

  async function submitSuggestion() {
    const suspect = document.getElementById("online-suspect")?.value || "";
    const weapon = document.getElementById("online-weapon")?.value || "";
    const place = document.getElementById("online-place")?.value || "";
    if (!suspect || !weapon || !place) return setError("Elegí un sospechoso, un arma y un lugar.");
    state.busy = true;
    state.error = "";
    render();
    try {
      const data = await api("/api/rooms/" + state.session.code + "/suggestions", {
        method: "POST",
        body: { suspect, weapon, place }
      });
      state.room = data.room;
      state.busy = false;
      state.responseChoice = "";
      activateOnlineAnnotator(state.room);
      render();
    } catch (error) {
      state.busy = false;
      setError(error.message);
    }
  }

  async function submitResponse(card) {
    if (!card) return setError("Elegí una carta o confirmá que no tenés ninguna.");
    state.busy = true;
    state.error = "";
    render();
    try {
      const data = await api("/api/rooms/" + state.session.code + "/responses", {
        method: "POST",
        body: { card }
      });
      state.room = data.room;
      state.busy = false;
      state.responseChoice = "";
      render();
    } catch (error) {
      state.busy = false;
      setError(error.message);
    }
  }

  async function joinRoom() {
    if (!state.selectedSeat || !state.joinLookup) return setError("Elegí un asiento libre.");
    state.busy = true; state.error = ""; render();
    try {
      const data = await api("/api/rooms/" + state.joinCode + "/join", {
        method: "POST", token: "", body: { name: state.joinName, seat: state.selectedSeat }
      });
      const retainedOrganizerToken = state.session?.code === state.joinCode ? state.session.organizerToken : null;
      const retainedHostName = state.session?.code === state.joinCode ? state.session.hostName : null;
      state.session = {
        code: state.joinCode, organizerToken: retainedOrganizerToken, hostName: retainedHostName,
        playerId: data.playerId, playerToken: data.playerToken, playerName: state.joinName
      };
      saveSession(); state.room = data.room; state.screen = "room"; state.busy = false; state.error = "";
      render();
      await refreshRoom(false);
      connectSocket();
    } catch (error) { state.busy = false; setError(error.message); }
  }

  async function changeSeat(playerId, seat, hostAction) {
    try {
      const body = { seat: Number(seat) };
      if (hostAction) body.playerId = playerId;
      const data = await api("/api/rooms/" + state.session.code + "/seat", {
        method: "PATCH", host: hostAction, body
      });
      state.room = data.room; state.error = ""; render();
    } catch (error) { setError(error.message); await refreshRoom(false); }
  }

  async function refreshRoom(reconnect = true) {
    try {
      const data = await api("/api/rooms/" + state.session.code);
      state.room = data.room;
      activateOnlineAnnotator(state.room);
      applyCompletedSuggestion(state.room);
      state.error = "";
      render();
      if (reconnect) connectSocket();
    } catch (error) { setError(error.message); }
  }

  async function startGame() {
    const firstPlayerId = document.getElementById("online-first-player")?.value || "random";
    state.selectedFirst = firstPlayerId; state.busy = true; state.error = ""; render();
    try {
      const data = await api("/api/rooms/" + state.session.code + "/start", {
        method: "POST", host: true, body: { firstPlayerId }
      });
      state.room = data.room; state.busy = false; state.screen = "room";
      await refreshRoom(false);
      render();
    } catch (error) { state.busy = false; setError(error.message); }
  }

  async function copyCode() {
    try {
      await navigator.clipboard.writeText(state.room.code);
      if (typeof window.showToast === "function") window.showToast("Código copiado.");
      else state.error = "Código copiado.";
    } catch { state.error = "No se pudo copiar el código. Anotalo: " + state.room.code; }
    render();
  }

  content.addEventListener("click", async event => {
    const button = event.target.closest("[data-action]");
    if (!button || button.disabled) return;
    const action = button.dataset.action;
    state.error = "";
    if (action === "home") {
      state.screen = "home"; state.joinLookup = null; render();
    } else if (action === "create-screen") {
      state.screen = "create"; render(); document.getElementById("online-host-name")?.focus();
    } else if (action === "join-screen" || action === "join-as-player") {
      state.screen = "join"; state.joinLookup = null; state.selectedSeat = null;
      if (action === "join-as-player") {
        state.joinCode = state.session.code; state.joinName = state.session.hostName || "";
      } else { state.joinCode = ""; state.joinName = ""; }
      render(); document.getElementById("online-room-code")?.focus();
    } else if (action === "create") await createRoom();
    else if (action === "find-room") await findRoom();
    else if (action === "choose-seat") {
      const seat = Number(button.dataset.seat);
      state.selectedSeat = state.selectedSeat === seat ? null : seat; render();
    } else if (action === "join-confirm") await joinRoom();
    else if (action === "resume") await restoreSession();
    else if (action === "start") await startGame();
    else if (action === "submit-hand") await submitHand();
    else if (action === "make-suggestion") await submitSuggestion();
    else if (action === "respond-none") await submitResponse("none");
    else if (action === "respond-card") await submitResponse(state.responseChoice);
    else if (action === "show-annotator") closePanel();
    else if (action === "refresh") await refreshRoom();
    else if (action === "copy-code") await copyCode();
  });

  content.addEventListener("change", async event => {
    const target = event.target;
    if (target.dataset.action === "host-seat") await changeSeat(target.dataset.playerId, target.value, true);
    else if (target.dataset.action === "self-seat") await changeSeat(state.session.playerId, target.value, false);
    else if (target.id === "online-first-player") state.selectedFirst = target.value;
    else if (target.hasAttribute("data-online-card")) {
      state.handSelection = [...content.querySelectorAll("[data-online-card]:checked")].map(input => input.value);
      render();
    } else if (target.name === "online-response-card") {
      state.responseChoice = target.value;
      render();
    }
  });

  content.addEventListener("input", event => {
    if (event.target.id === "online-room-code") event.target.value = event.target.value.replace(/\D/g, "").slice(0, 6);
  });

  entryButton.addEventListener("click", openPanel);
  closeButton?.addEventListener("click", closePanel);
  panel.addEventListener("click", event => { if (event.target === panel) closePanel(); });
  document.addEventListener("keydown", event => { if (event.key === "Escape" && state.open) closePanel(); });
  window.openOnlinePanel = openPanel;
  window.closeOnlinePanel = closePanel;
})();
