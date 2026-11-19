import { DurableObject } from "cloudflare:workers";

const ALLOWED_ORIGINS = new Set([
  "https://javierquero.github.io",
  "http://localhost:8000",
  "http://127.0.0.1:8000",
  "http://localhost:5500",
  "http://127.0.0.1:5500"
]);

const ROOM_CODE_PATTERN = /^\d{6}$/;
const MAX_PLAYERS = 6;
const MIN_PLAYERS = 3;
const SUSPECT_CARDS = ["Coronel Mostaza","Profesor Moradillo","Sr. Verdi","Sra. Azulino","Srita. Escarlata","Sra. Blanco"];
const WEAPON_CARDS = ["Collar","Barra de Plutonio","Honda","Saxofón","Guante extensible","Dona envenenada"];
const PLACE_CARDS = ["Asilo Springfield","Bolerama","El Calabozo del Androide","Casa de los Simpsons","Estudios Krustylu","El Holandés Frito","Kwik-E-Mart","Mansión Burns","Planta Nuclear"];
const ALL_GAME_CARDS = [...SUSPECT_CARDS, ...WEAPON_CARDS, ...PLACE_CARDS];

// Limpieza de salas abandonadas. Una sala se considera abandonada cuando no
// tiene ningún WebSocket abierto y pasó este tiempo sin actividad (cualquier
// cambio guardado: unirse, cargar cartas, suponer, responder, conectarse o
// desconectarse). El plazo depende del estado de la sala.
const HOUR_MS = 60 * 60 * 1000;
const ROOM_IDLE_TTL_MS = {
  lobby: 12 * HOUR_MS,    // esperando jugadores
  playing: 12 * HOUR_MS,  // partida en curso (se puede retomar al día siguiente)
  finished: 3 * HOUR_MS   // partida terminada
};
// Tope absoluto de vida de una sala, contado desde su creación. Se aplica
// aunque haya conexiones abiertas o actividad reciente.
const ROOM_MAX_AGE_MS = 24 * HOUR_MS;
// Si hay conexiones abiertas, se vuelve a revisar con esta frecuencia.
const CLEANUP_RECHECK_MS = HOUR_MS;

// Cuántas suposiciones completadas se conservan para que un jugador que estuvo
// desconectado pueda actualizar su anotador al volver.
const SUGGESTION_HISTORY_LIMIT = 5;

function json(data, status = 200, headers = {}) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { "content-type": "application/json; charset=utf-8", "cache-control": "no-store", ...headers }
  });
}

function corsHeaders(origin) {
  const headers = new Headers({
    "access-control-allow-methods": "GET, POST, PATCH, OPTIONS",
    "access-control-allow-headers": "Content-Type, Authorization",
    "access-control-max-age": "86400",
    "vary": "Origin"
  });
  if (origin && ALLOWED_ORIGINS.has(origin)) headers.set("access-control-allow-origin", origin);
  return headers;
}

function withCors(response, origin) {
  if (response.status === 101) return response;
  const headers = new Headers(response.headers);
  for (const [key, value] of corsHeaders(origin)) headers.set(key, value);
  return new Response(response.body, { status: response.status, statusText: response.statusText, headers });
}

async function readJson(request) {
  const text = await request.text();
  if (text.length > 16000) throw new Error("La solicitud es demasiado grande.");
  try { return text ? JSON.parse(text) : {}; }
  catch { throw new Error("El contenido enviado no es JSON válido."); }
}

function cleanName(value) {
  return String(value || "").replace(/[<>]/g, "").replace(/\s+/g, " ").trim().slice(0, 30);
}

function randomToken() {
  const bytes = new Uint8Array(32);
  crypto.getRandomValues(bytes);
  return Array.from(bytes, value => value.toString(16).padStart(2, "0")).join("");
}

function randomCode() {
  const bytes = new Uint32Array(1);
  crypto.getRandomValues(bytes);
  return String(bytes[0] % 1000000).padStart(6, "0");
}

async function sha256(value) {
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(value));
  return Array.from(new Uint8Array(digest), byte => byte.toString(16).padStart(2, "0")).join("");
}

async function requestJson(request, url, env) {
  const path = url.pathname;

  if (request.method === "OPTIONS") {
    return withCors(new Response(null, { status: 204 }), request.headers.get("Origin"));
  }

  const origin = request.headers.get("Origin");
  if (origin && !ALLOWED_ORIGINS.has(origin)) {
    return json({ error: "Origen no autorizado." }, 403);
  }

  if (path === "/health" && request.method === "GET") {
    return withCors(json({ ok: true, service: "cluesimpsons-online", stage: "rooms-seats-turn-order" }), origin);
  }

  if (path === "/api/rooms" && request.method === "POST") {
    let body;
    try { body = await readJson(request); }
    catch (error) { return withCors(json({ error: error.message }, 400), origin); }
    const hostName = cleanName(body.hostName);
    if (!hostName) return withCors(json({ error: "Ingresá el nombre del organizador." }, 400), origin);

    for (let attempt = 0; attempt < 8; attempt++) {
      const code = randomCode();
      const stub = env.GAME_ROOMS.getByName(code);
      const created = await stub.fetch("https://room.internal/initialize", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ code, hostName })
      });
      if (created.status === 409) continue;
      const result = await created.json();
      return withCors(json(result, created.status), origin);
    }
    return withCors(json({ error: "No se pudo generar un código disponible. Intentá nuevamente." }, 503), origin);
  }

  const match = path.match(/^\/api\/rooms\/(\d{6})(?:\/(join|seat|hand|start|pause|suggestions|responses|accusations|socket-ticket|ws))?$/);
  if (!match) return withCors(json({ error: "Ruta no encontrada." }, 404), origin);

  const code = match[1];
  const action = match[2] || (request.method === "GET" ? "snapshot" : "");
  if (!["snapshot", "join", "seat", "hand", "start", "pause", "suggestions", "responses", "accusations", "socket-ticket", "ws"].includes(action)) {
    return withCors(json({ error: "Operación no permitida." }, 405), origin);
  }

  const stub = env.GAME_ROOMS.getByName(code);
  if (action === "ws") {
    if (request.headers.get("Upgrade") !== "websocket") return json({ error: "Se esperaba una conexión WebSocket." }, 426);
    return stub.fetch(request);
  }

  return withCors(await stub.fetch(request), origin);
}

export default {
  async fetch(request, env) {
    return requestJson(request, new URL(request.url), env);
  }
};

export class GameRoom extends DurableObject {
  constructor(ctx, env) {
    super(ctx, env);
    // Serializar mutaciones de la sala: evita que dos respuestas simultáneas
    // lean el mismo estado y pisen cambios entre sí.
    this.requestQueue = Promise.resolve();
  }

  async loadRoom() {
    return await this.ctx.storage.get("room");
  }

  async saveRoom(room) {
    room.updatedAt = Date.now();
    await this.ctx.storage.put("room", room);
    await this.scheduleCleanup(room);
  }

  // ── Limpieza de salas abandonadas ───────────────────────────────────────
  // Los plazos se pueden acortar con la variable CLEANUP_TTL_OVERRIDE_MS, solo
  // para pruebas locales (el tope de edad pasa a ser 3 veces ese valor).
  cleanupLimits() {
    const override = Number(this.env?.CLEANUP_TTL_OVERRIDE_MS);
    if (Number.isFinite(override) && override > 0) {
      return {
        idle: { lobby: override, playing: override, finished: override },
        maxAge: override * 3,
        recheck: Math.min(CLEANUP_RECHECK_MS, override)
      };
    }
    return { idle: ROOM_IDLE_TTL_MS, maxAge: ROOM_MAX_AGE_MS, recheck: CLEANUP_RECHECK_MS };
  }

  cleanupDeadlines(room) {
    const limits = this.cleanupLimits();
    const idleTtl = limits.idle[room.status] ?? limits.idle.lobby;
    const lastActivity = room.updatedAt || room.createdAt || Date.now();
    return {
      idleDeadline: lastActivity + idleTtl,
      maxDeadline: (room.createdAt || lastActivity) + limits.maxAge,
      recheck: limits.recheck
    };
  }

  async scheduleCleanup(room) {
    const { idleDeadline, maxDeadline } = this.cleanupDeadlines(room);
    await this.ctx.storage.setAlarm(Math.min(idleDeadline, maxDeadline));
  }

  openSocketCount() {
    return this.ctx.getWebSockets().filter(socket => socket.readyState === WebSocket.OPEN).length;
  }

  async destroyRoom(reason) {
    for (const socket of this.ctx.getWebSockets()) {
      try { socket.close(1001, reason); } catch {}
    }
    await this.ctx.storage.deleteAlarm();
    await this.ctx.storage.deleteAll();
  }

  async runCleanup() {
    const room = await this.loadRoom();
    if (!room) { await this.ctx.storage.deleteAll(); return; }
    const now = Date.now();
    const { idleDeadline, maxDeadline, recheck } = this.cleanupDeadlines(room);
    const hasConnections = this.openSocketCount() > 0;

    if (now >= maxDeadline) { await this.destroyRoom("Sala vencida"); return; }
    if (now >= idleDeadline && !hasConnections) { await this.destroyRoom("Sala abandonada"); return; }

    // Sigue viva: con conexiones abiertas se revisa más adelante; sin ellas,
    // se espera al vencimiento por inactividad.
    const next = hasConnections ? Math.min(maxDeadline, now + recheck) : Math.min(idleDeadline, maxDeadline);
    await this.ctx.storage.setAlarm(Math.max(next, now + 1000));
  }

  // Las mutaciones y la limpieza comparten la misma cola para no pisarse.
  enqueue(task) {
    const result = this.requestQueue.then(task);
    this.requestQueue = result.then(() => undefined, () => undefined);
    return result;
  }

  alarm() {
    return this.enqueue(() => this.runCleanup());
  }

  // Una desconexión cuenta como actividad: el plazo de abandono empieza ahí.
  touchRoom() {
    return this.enqueue(async () => {
      const room = await this.loadRoom();
      if (room) await this.saveRoom(room);
    });
  }

  async actorFor(request, room) {
    const auth = request.headers.get("Authorization") || "";
    const token = auth.startsWith("Bearer ") ? auth.slice(7).trim() : "";
    if (!token) return null;
    const hash = await sha256(token);
    if (hash === room.hostTokenHash) return { role: "host", playerId: null };
    const player = room.players.find(item => item.tokenHash === hash);
    return player ? { role: "player", playerId: player.id } : null;
  }

  // Vista pública de una suposición: nunca incluye la carta mostrada.
  publicSuggestion(room, suggestion) {
    return {
      id: suggestion.id,
      byPlayerId: suggestion.byPlayerId,
      byPlayerName: room.players.find(player => player.id === suggestion.byPlayerId)?.name || "Jugador",
      cards: suggestion.cards,
      responderOrder: suggestion.responderOrder,
      currentResponderId: suggestion.currentResponderId,
      responses: suggestion.responses.map(response => ({
        playerId: response.playerId,
        playerName: room.players.find(player => player.id === response.playerId)?.name || "Jugador",
        type: response.type
      })),
      completed: suggestion.completed,
      outcome: suggestion.outcome
    };
  }

  // Guarda las últimas suposiciones completadas para que un jugador que estuvo
  // desconectado pueda ponerse al día al volver (ver snapshotFor).
  recordCompletedSuggestion(room, suggestion) {
    room.suggestionLog = [...(room.suggestionLog || []), { ...suggestion }].slice(-SUGGESTION_HISTORY_LIMIT);
  }

  publicSnapshot(room) {
    const onlineIds = new Set();
    let hostOnline = false;
    for (const socket of this.ctx.getWebSockets()) {
      try {
        const attachment = socket.deserializeAttachment();
        if (attachment?.role === "host") hostOnline = true;
        if (attachment?.playerId) onlineIds.add(attachment.playerId);
      } catch {}
    }

    const players = [...room.players]
      .sort((a, b) => (a.seat ?? 99) - (b.seat ?? 99))
      .map(({ id, name, seat }) => ({
        id, name, seat,
        connected: onlineIds.has(id),
        handSubmitted: Boolean(room.hands?.[id]),
        handCount: room.hands?.[id]?.length || 0
      }));

    return {
      code: room.code,
      status: room.status,
      paused: Boolean(room.paused),
      rosterLocked: Boolean(room.rosterLocked),
      hostName: room.hostName,
      hostOnline,
      createdAt: room.createdAt,
      updatedAt: room.updatedAt,
      players,
      firstPlayerId: room.firstPlayerId,
      turnPlayerId: room.turnPlayerId,
      nextTurnPlayerId: room.turnPlayerId ? this.nextEligiblePlayerId(room, room.turnPlayerId) : null,
      suggestion: room.suggestion ? this.publicSuggestion(room, room.suggestion) : null,
      // Últimas suposiciones completadas, de la más vieja a la más nueva.
      suggestionHistory: (room.suggestionLog || []).map(item => this.publicSuggestion(room, item)),
      startedAt: room.startedAt,
      winnerId: room.status === "finished" ? room.winnerId : null,
      winnerName: room.status === "finished" && room.winnerId
        ? room.players.find(player => player.id === room.winnerId)?.name || null
        : null,
      finishReason: room.status === "finished" ? room.finishReason || null : null,
      solution: room.status === "finished" ? room.solution || null : null
    };
  }

  snapshotFor(room, actor) {
    const snapshot = this.publicSnapshot(room);
    if (!actor || actor.role !== "player") return snapshot;
    const privateData = {};
    const hand = room.hands?.[actor.playerId] || [];
    if (hand.length) privateData.ownCards = hand;
    privateData.canWin = !(room.ineligibleToWin || []).includes(actor.playerId);
    if (room.privateAccusations?.[actor.playerId]) {
      privateData.lastAccusation = room.privateAccusations[actor.playerId];
    }
    if (room.suggestion && !room.suggestion.completed && room.suggestion.currentResponderId === actor.playerId) {
      privateData.matchingCards = room.suggestion.cards.filter(card => hand.includes(card));
      privateData.mustRespond = true;
    }
    if (room.suggestion && room.suggestion.completed && room.suggestion.outcome === "shown" &&
        room.suggestion.byPlayerId === actor.playerId) {
      privateData.shownCard = room.suggestion.shownCard;
      privateData.shownByPlayerId = room.suggestion.shownByPlayerId;
    }
    // Cartas que le mostraron a este jugador en las últimas suposiciones. Solo
    // las ve quien supuso: el resto del historial es público y no las incluye.
    const shownCards = {};
    for (const item of room.suggestionLog || []) {
      if (item.outcome === "shown" && item.byPlayerId === actor.playerId) {
        shownCards[item.id] = { card: item.shownCard, byPlayerId: item.shownByPlayerId };
      }
    }
    privateData.shownCards = shownCards;
    return { ...snapshot, private: privateData };
  }

  async broadcastSnapshot() {
    const room = await this.loadRoom();
    if (!room) return;
    for (const socket of this.ctx.getWebSockets()) {
      try {
        if (socket.readyState !== WebSocket.OPEN) continue;
        const attachment = socket.deserializeAttachment();
        const actor = attachment?.role === "player" ? attachment : null;
        socket.send(JSON.stringify({ type: "room.snapshot", room: this.snapshotFor(room, actor) }));
      } catch {}
    }
  }

  nextPlayerId(room, playerId) {
    const ordered = [...room.players].sort((a, b) => a.seat - b.seat);
    const index = ordered.findIndex(player => player.id === playerId);
    if (index < 0 || !ordered.length) return null;
    return ordered[(index + 1) % ordered.length].id;
  }

  nextEligiblePlayerId(room, playerId) {
    const ordered = [...room.players].sort((a, b) => a.seat - b.seat);
    const index = ordered.findIndex(player => player.id === playerId);
    if (index < 0 || !ordered.length) return null;
    const ineligible = new Set(room.ineligibleToWin || []);
    for (let offset = 1; offset <= ordered.length; offset++) {
      const candidate = ordered[(index + offset) % ordered.length];
      if (!ineligible.has(candidate.id)) return candidate.id;
    }
    return null;
  }

  fetch(request) {
    return this.enqueue(() => this.handleRequest(request));
  }

  async handleRequest(request) {
    const url = new URL(request.url);
    const path = url.pathname;
    const method = request.method;

    if (path.endsWith("/initialize") && method === "POST") {
      const body = await readJson(request);
      const existing = await this.loadRoom();
      if (existing) return json({ error: "Código ocupado." }, 409);

      const hostToken = randomToken();
      const now = Date.now();
      const room = {
        code: body.code,
        hostName: cleanName(body.hostName),
        hostTokenHash: await sha256(hostToken),
        status: "lobby",
        rosterLocked: false,
        paused: false,
        players: [],
        firstPlayerId: null,
        turnPlayerId: null,
        socketTickets: [],
        createdAt: now,
        updatedAt: now,
        startedAt: null
      };
      await this.saveRoom(room);
      return json({ code: room.code, hostToken, room: this.publicSnapshot(room) }, 201);
    }

    if (path.endsWith("/ws") && method === "GET") return this.upgradeWebSocket(request);

    const room = await this.loadRoom();
    if (!room) return json({ error: "No existe una partida con ese código." }, 404);

    if (method === "GET") {
      const authHeader = request.headers.get("Authorization") || "";
      const actor = authHeader ? await this.actorFor(request, room) : null;
      if (authHeader && !actor) return json({ error: "Sesión no válida." }, 401);
      if (path.endsWith("/hand")) {
        if (!actor || actor.role !== "player") return json({ error: "Solo un jugador puede consultar su propia mano." }, 403);
        return json({ cards: room.hands?.[actor.playerId] || [] });
      }
      return json({ room: this.snapshotFor(room, actor) });
    }

    if (path.endsWith("/join") && method === "POST") {
      if (room.status !== "lobby" || room.rosterLocked) return json({ error: "La inscripción y los asientos ya fueron cerrados por la carga de cartas." }, 409);
      let body;
      try { body = await readJson(request); }
      catch (error) { return json({ error: error.message }, 400); }
      const name = cleanName(body.name);
      if (!name) return json({ error: "Ingresá tu nombre." }, 400);
      if (room.players.length >= MAX_PLAYERS) return json({ error: "La mesa ya está completa." }, 409);
      // El servidor asigna el primer asiento libre: el jugador no puede elegirlo.
      const seat = Array.from({ length: MAX_PLAYERS }, (_, index) => index + 1)
        .find(candidate => !room.players.some(player => player.seat === candidate));
      if (!seat) return json({ error: "La mesa ya está completa." }, 409);

      const playerId = crypto.randomUUID();
      const playerToken = randomToken();
      room.players.push({ id: playerId, name, seat, tokenHash: await sha256(playerToken), joinedAt: Date.now() });
      await this.saveRoom(room);
      await this.broadcastSnapshot();
      return json({ playerId, playerToken, room: this.publicSnapshot(room) }, 201);
    }

    const actor = await this.actorFor(request, room);
    if (!actor) return json({ error: "Sesión no válida. Volvé a ingresar a la partida." }, 401);

    if (path.endsWith("/hand") && method === "POST") {
      if (actor.role !== "player") return json({ error: "Solo los jugadores pueden cargar sus cartas." }, 403);
      if (room.status !== "lobby") return json({ error: "Las cartas solo se pueden cargar antes de iniciar." }, 409);
      let body;
      try { body = await readJson(request); }
      catch (error) { return json({ error: error.message }, 400); }
      const cards = Array.isArray(body.cards) ? body.cards : [];
      if (cards.some(card => typeof card !== "string" || !ALL_GAME_CARDS.includes(card))) {
        return json({ error: "La selección contiene cartas que no pertenecen al juego." }, 400);
      }
      if (new Set(cards).size !== cards.length) return json({ error: "No se pueden repetir cartas." }, 400);
      if (!cards.length || cards.length > ALL_GAME_CARDS.length) {
        return json({ error: "Seleccioná entre 1 y 21 cartas." }, 400);
      }
      room.hands = room.hands || {};
      // La mano puede reemplazarse mientras la sala siga en lobby.
      room.hands[actor.playerId] = cards;
      room.rosterLocked = true;
      await this.saveRoom(room);
      await this.broadcastSnapshot();
      return json({ saved: true, count: cards.length, room: this.snapshotFor(room, actor) });
    }

    if (path.endsWith("/seat") && (method === "PATCH" || method === "POST")) {
      if (actor.role !== "host") return json({ error: "Solo el organizador puede ordenar los asientos." }, 403);
      if (room.status !== "lobby") return json({ error: "Los asientos quedan bloqueados cuando comienza la partida." }, 409);
      let body;
      try { body = await readJson(request); }
      catch (error) { return json({ error: error.message }, 400); }
      const seat = Number(body.seat);
      if (!Number.isInteger(seat) || seat < 1 || seat > MAX_PLAYERS) return json({ error: "Elegí un asiento entre 1 y 6." }, 400);

      const targetId = String(body.playerId || "");
      const target = room.players.find(player => player.id === targetId);
      if (!target) return json({ error: "No se encontró al jugador." }, 404);
      if (target.seat === seat) return json({ room: this.publicSnapshot(room) });

      const occupant = room.players.find(player => player.seat === seat && player.id !== target.id);
      if (occupant) {
        if (actor.role !== "host") return json({ error: "Ese asiento ya está ocupado." }, 409);
        occupant.seat = target.seat;
      }
      target.seat = seat;
      await this.saveRoom(room);
      await this.broadcastSnapshot();
      return json({ room: this.publicSnapshot(room) });
    }

    if (path.endsWith("/pause") && method === "POST") {
      if (actor.role !== "host") return json({ error: "Solo el organizador puede pausar o reanudar." }, 403);
      if (room.status !== "playing") return json({ error: "La partida todavía no comenzó." }, 409);
      let body;
      try { body = await readJson(request); }
      catch (error) { return json({ error: error.message }, 400); }
      if (typeof body.paused !== "boolean") return json({ error: "Indicá si la partida queda pausada." }, 400);
      room.paused = body.paused;
      await this.saveRoom(room);
      await this.broadcastSnapshot();
      return json({ room: this.publicSnapshot(room) });
    }

    if (path.endsWith("/suggestions") && method === "POST") {
      if (actor.role !== "player") return json({ error: "El organizador debe ingresar como jugador para hacer suposiciones." }, 403);
      if (room.status !== "playing") return json({ error: "La partida todavía no está iniciada." }, 409);
      if (room.paused) return json({ error: "La partida está pausada por el organizador." }, 409);
      if ((room.ineligibleToWin || []).includes(actor.playerId)) {
        return json({ error: "Ya no podés realizar suposiciones, pero seguís participando como respondedor." }, 403);
      }
      if (room.turnPlayerId !== actor.playerId) return json({ error: "Todavía no es tu turno." }, 409);
      if (room.suggestion && !room.suggestion.completed) return json({ error: "Hay una suposición esperando respuestas." }, 409);
      let body;
      try { body = await readJson(request); }
      catch (error) { return json({ error: error.message }, 400); }
      const suspect = body.suspect;
      const weapon = body.weapon;
      const place = body.place;
      if (!SUSPECT_CARDS.includes(suspect) || !WEAPON_CARDS.includes(weapon) || !PLACE_CARDS.includes(place)) {
        return json({ error: "La suposición debe incluir un sospechoso, un arma y un lugar válidos." }, 400);
      }
      const ordered = [...room.players].sort((a, b) => a.seat - b.seat);
      const startIndex = ordered.findIndex(player => player.id === actor.playerId);
      if (startIndex < 0) return json({ error: "No se pudo determinar tu lugar en la mesa." }, 409);
      const responderOrder = Array.from({ length: ordered.length - 1 }, (_, offset) => ordered[(startIndex + offset + 1) % ordered.length].id);
      room.suggestion = {
        id: crypto.randomUUID(),
        byPlayerId: actor.playerId,
        cards: [suspect, weapon, place],
        responderOrder,
        responderIndex: 0,
        currentResponderId: responderOrder[0] || null,
        responses: [],
        shownCard: null,
        shownByPlayerId: null,
        completed: false,
        outcome: null,
        createdAt: Date.now(),
        completedAt: null
      };
      await this.saveRoom(room);
      await this.broadcastSnapshot();
      return json({ room: this.snapshotFor(room, actor) }, 201);
    }

    if (path.endsWith("/accusations") && method === "POST") {
      if (actor.role !== "player") return json({ error: "Solo los jugadores pueden acusar." }, 403);
      if (room.status !== "playing") return json({ error: "La partida no está activa." }, 409);
      if (room.paused) return json({ error: "La partida está pausada por el organizador." }, 409);
      if ((room.ineligibleToWin || []).includes(actor.playerId)) {
        return json({ error: "Ya perdiste la posibilidad de ganar con una acusación anterior." }, 403);
      }
      if (room.turnPlayerId !== actor.playerId) return json({ error: "Solo podés acusar durante tu turno." }, 409);
      if (room.suggestion && !room.suggestion.completed) return json({ error: "Primero debe terminar la suposición pendiente." }, 409);
      let body;
      try { body = await readJson(request); }
      catch (error) { return json({ error: error.message }, 400); }
      const suspect = body.suspect;
      const weapon = body.weapon;
      const place = body.place;
      if (!SUSPECT_CARDS.includes(suspect) || !WEAPON_CARDS.includes(weapon) || !PLACE_CARDS.includes(place)) {
        return json({ error: "La acusación debe incluir un sospechoso, un arma y un lugar válidos." }, 400);
      }
      const correct = room.solution?.length === 3 &&
        room.solution.includes(suspect) && room.solution.includes(weapon) && room.solution.includes(place);
      const accusation = {
        id: crypto.randomUUID(),
        suspect,
        weapon,
        place,
        correct,
        createdAt: Date.now()
      };
      if (correct) {
        room.status = "finished";
        room.winnerId = actor.playerId;
        room.finishReason = "correct-accusation";
        room.winningAccusation = accusation;
      } else {
        room.ineligibleToWin = room.ineligibleToWin || [];
        room.ineligibleToWin.push(actor.playerId);
        room.privateAccusations = room.privateAccusations || {};
        room.privateAccusations[actor.playerId] = {
          id: accusation.id,
          correct: false,
          createdAt: accusation.createdAt,
          message: "Acusación incorrecta. Ya no podés ganar, pero seguís respondiendo cuando te consulten."
        };
        room.turnPlayerId = this.nextEligiblePlayerId(room, actor.playerId);
        if (!room.turnPlayerId) {
          room.status = "finished";
          room.finishReason = "no-eligible-players";
        }
      }
      await this.saveRoom(room);
      await this.broadcastSnapshot();
      const currentActor = await this.actorFor(request, room);
      return json({ room: this.snapshotFor(room, currentActor) });
    }

    if (path.endsWith("/responses") && method === "POST") {
      if (actor.role !== "player") return json({ error: "Solo los jugadores pueden responder." }, 403);
      if (room.paused) return json({ error: "La partida está pausada por el organizador." }, 409);
      const suggestion = room.suggestion;
      if (!suggestion || suggestion.completed) return json({ error: "No hay una suposición pendiente." }, 409);
      if (suggestion.currentResponderId !== actor.playerId) return json({ error: "Todavía no te corresponde responder." }, 409);
      let body;
      try { body = await readJson(request); }
      catch (error) { return json({ error: error.message }, 400); }
      const selected = body.card;
      const ownCards = room.hands?.[actor.playerId] || [];
      if (selected === "none") {
        if (suggestion.cards.some(card => ownCards.includes(card))) {
          return json({ error: "Tenés al menos una de las cartas mencionadas y debés elegir cuál mostrar." }, 400);
        }
        suggestion.responses.push({ playerId: actor.playerId, type: "none" });
        suggestion.responderIndex += 1;
        if (suggestion.responderIndex >= suggestion.responderOrder.length) {
          suggestion.completed = true;
          suggestion.currentResponderId = null;
          suggestion.outcome = "nobody";
          suggestion.completedAt = Date.now();
          this.recordCompletedSuggestion(room, suggestion);
          room.turnPlayerId = this.nextEligiblePlayerId(room, suggestion.byPlayerId);
          if (!room.turnPlayerId) {
            room.status = "finished";
            room.finishReason = "no-eligible-players";
          }
        } else {
          suggestion.currentResponderId = suggestion.responderOrder[suggestion.responderIndex];
        }
      } else {
        if (!suggestion.cards.includes(selected)) return json({ error: "Elegí una de las tres cartas de la suposición." }, 400);
        if (!ownCards.includes(selected)) return json({ error: "No tenés esa carta. Elegí una carta que tengas o indicá que no tenés ninguna." }, 400);
        suggestion.responses.push({ playerId: actor.playerId, type: "shown" });
        suggestion.shownCard = selected;
        suggestion.shownByPlayerId = actor.playerId;
        suggestion.currentResponderId = null;
        suggestion.completed = true;
        suggestion.outcome = "shown";
        suggestion.completedAt = Date.now();
        this.recordCompletedSuggestion(room, suggestion);
        room.turnPlayerId = this.nextEligiblePlayerId(room, suggestion.byPlayerId);
        if (!room.turnPlayerId) {
          room.status = "finished";
          room.finishReason = "no-eligible-players";
        }
      }
      await this.saveRoom(room);
      await this.broadcastSnapshot();
      return json({ room: this.snapshotFor(room, actor) });
    }

    if (path.endsWith("/start") && method === "POST") {
      if (actor.role !== "host") return json({ error: "Solo el organizador puede iniciar la partida." }, 403);
      if (room.status !== "lobby") return json({ error: "La partida ya fue iniciada." }, 409);
      if (room.players.length < MIN_PLAYERS || room.players.length > MAX_PLAYERS) {
        return json({ error: "Para comenzar necesitás entre 3 y 6 jugadores." }, 409);
      }
      if (room.players.some(player => !Number.isInteger(player.seat))) {
        return json({ error: "Todos los jugadores deben elegir un asiento." }, 409);
      }
      const orderedPlayers = [...room.players].sort((a, b) => a.seat - b.seat);
      const allHands = orderedPlayers.map(player => room.hands?.[player.id] || []);
      if (allHands.some(hand => !hand.length)) return json({ error: "Todos los jugadores deben cargar y confirmar sus cartas." }, 409);
      const allCards = allHands.flat();
      if (allCards.length !== 18 || new Set(allCards).size !== 18 || allCards.some(card => !ALL_GAME_CARDS.includes(card))) {
        return json({ error: "La distribución debe contener exactamente las 18 cartas sin repetir ninguna." }, 409);
      }
      const solution = ALL_GAME_CARDS.filter(card => !allCards.includes(card));
      const solutionByCategory = [
        solution.filter(card => SUSPECT_CARDS.includes(card)),
        solution.filter(card => WEAPON_CARDS.includes(card)),
        solution.filter(card => PLACE_CARDS.includes(card))
      ];
      if (solution.length !== 3 || solutionByCategory.some(group => group.length !== 1)) {
        const remainingCounts = solutionByCategory.map(group => group.length);
        const dealtCounts = [
          SUSPECT_CARDS.length - remainingCounts[0],
          WEAPON_CARDS.length - remainingCounts[1],
          PLACE_CARDS.length - remainingCounts[2]
        ];
        return json({
          error: "Hay un error en la carga de cartas. Revisen que la distribución sea correcta: entre los " + room.players.length + " participantes deben quedar repartidas 5 cartas de sospechosos, 5 de armas y 8 de lugares. Actualmente cargaron: " +
            dealtCounts[0] + " sospechosos, " + dealtCounts[1] + " armas y " + dealtCounts[2] +
            " lugares. Debe quedar 1 carta sin repartir de cada categoría."
        }, 409);
      }
      room.solution = solution;
      room.ineligibleToWin = [];
      room.privateAccusations = {};
      room.winnerId = null;
      room.finishReason = null;
      let body;
      try { body = await readJson(request); }
      catch (error) { return json({ error: error.message }, 400); }
      let firstPlayerId = "";
      if (body.firstPlayerId === "random") {
        const index = crypto.getRandomValues(new Uint32Array(1))[0] % room.players.length;
        firstPlayerId = room.players[index].id;
      } else {
        firstPlayerId = String(body.firstPlayerId || "");
        if (!room.players.some(player => player.id === firstPlayerId)) {
          return json({ error: "Elegí quién comienza o seleccioná el sorteo aleatorio." }, 400);
        }
      }
      room.status = "playing";
      room.firstPlayerId = firstPlayerId;
      room.turnPlayerId = firstPlayerId;
      room.startedAt = Date.now();
      await this.saveRoom(room);
      await this.broadcastSnapshot();
      return json({ room: this.publicSnapshot(room) });
    }

    if (path.endsWith("/socket-ticket") && method === "POST") {
      const ticket = randomToken();
      const now = Date.now();
      room.socketTickets = (room.socketTickets || []).filter(item => item.expiresAt > now).slice(-20);
      room.socketTickets.push({
        hash: await sha256(ticket),
        role: actor.role,
        playerId: actor.playerId,
        expiresAt: now + 60000
      });
      await this.saveRoom(room);
      return json({ ticket, expiresIn: 60 });
    }

    return json({ error: "Operación no encontrada." }, 404);
  }

  async upgradeWebSocket(request) {
    if (request.headers.get("Upgrade") !== "websocket") return json({ error: "Se esperaba WebSocket." }, 426);
    const room = await this.loadRoom();
    if (!room) return json({ error: "Partida inexistente." }, 404);

    const ticket = new URL(request.url).searchParams.get("ticket") || "";
    if (!ticket) return json({ error: "Falta el ticket de conexión." }, 401);
    const hash = await sha256(ticket);
    const now = Date.now();
    const tickets = room.socketTickets || [];
    const index = tickets.findIndex(item => item.hash === hash && item.expiresAt > now);
    if (index < 0) return json({ error: "El ticket venció o ya fue utilizado." }, 401);
    const actor = tickets[index];
    tickets.splice(index, 1);
    room.socketTickets = tickets;
    await this.saveRoom(room);

    const [client, server] = Object.values(new WebSocketPair());
    this.ctx.acceptWebSocket(server);
    server.serializeAttachment({ role: actor.role, playerId: actor.playerId });
    server.send(JSON.stringify({ type: "room.snapshot", room: this.snapshotFor(room, actor) }));
    await this.broadcastSnapshot();

    return new Response(null, { status: 101, webSocket: client });
  }

  async webSocketMessage(socket, message) {
    if (typeof message !== "string") return;
    try {
      const payload = JSON.parse(message);
      if (payload.type === "ping") socket.send(JSON.stringify({ type: "pong", at: Date.now() }));
    } catch {}
  }

  async webSocketClose(socket, code, reason, wasClean) {
    await this.broadcastSnapshot();
    await this.touchRoom();
  }

  async webSocketError(socket, error) {
    console.error("ClueSimpsons room WebSocket error:", error);
  }
}

