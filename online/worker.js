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

async function requestJson(request, url) {
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

  const match = path.match(/^\/api\/rooms\/(\d{6})(?:\/(join|seat|start|socket-ticket|ws))?$/);
  if (!match) return withCors(json({ error: "Ruta no encontrada." }, 404), origin);

  const code = match[1];
  const action = match[2] || (request.method === "GET" ? "snapshot" : "");
  if (!["snapshot", "join", "seat", "start", "socket-ticket", "ws"].includes(action)) {
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
  }

  async loadRoom() {
    return await this.ctx.storage.get("room");
  }

  async saveRoom(room) {
    room.updatedAt = Date.now();
    await this.ctx.storage.put("room", room);
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
        connected: onlineIds.has(id)
      }));

    return {
      code: room.code,
      status: room.status,
      hostName: room.hostName,
      hostOnline,
      createdAt: room.createdAt,
      updatedAt: room.updatedAt,
      players,
      firstPlayerId: room.firstPlayerId,
      turnPlayerId: room.turnPlayerId,
      startedAt: room.startedAt
    };
  }

  async broadcastSnapshot() {
    const room = await this.loadRoom();
    if (!room) return;
    const payload = JSON.stringify({ type: "room.snapshot", room: this.publicSnapshot(room) });
    for (const socket of this.ctx.getWebSockets()) {
      try {
        if (socket.readyState === WebSocket.OPEN) socket.send(payload);
      } catch {}
    }
  }

  async fetch(request) {
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

    const room = await this.loadRoom();
    if (!room) return json({ error: "No existe una partida con ese código." }, 404);

    if (method === "GET") {
      return json({ room: this.publicSnapshot(room) });
    }

    if (path.endsWith("/join") && method === "POST") {
      if (room.status !== "lobby") return json({ error: "La partida ya comenzó y no admite nuevos jugadores." }, 409);
      let body;
      try { body = await readJson(request); }
      catch (error) { return json({ error: error.message }, 400); }
      const name = cleanName(body.name);
      const seat = Number(body.seat);
      if (!name) return json({ error: "Ingresá tu nombre." }, 400);
      if (!Number.isInteger(seat) || seat < 1 || seat > MAX_PLAYERS) return json({ error: "Elegí un asiento válido." }, 400);
      if (room.players.length >= MAX_PLAYERS) return json({ error: "La mesa ya está completa." }, 409);
      if (room.players.some(player => player.seat === seat)) return json({ error: "Ese asiento ya está ocupado." }, 409);

      const playerId = crypto.randomUUID();
      const playerToken = randomToken();
      room.players.push({ id: playerId, name, seat, tokenHash: await sha256(playerToken), joinedAt: Date.now() });
      await this.saveRoom(room);
      await this.broadcastSnapshot();
      return json({ playerId, playerToken, room: this.publicSnapshot(room) }, 201);
    }

    const actor = await this.actorFor(request, room);
    if (!actor) return json({ error: "Sesión no válida. Volvé a ingresar a la partida." }, 401);

    if (path.endsWith("/seat") && (method === "PATCH" || method === "POST")) {
      if (room.status !== "lobby") return json({ error: "Los asientos quedan bloqueados al comenzar." }, 409);
      let body;
      try { body = await readJson(request); }
      catch (error) { return json({ error: error.message }, 400); }
      const seat = Number(body.seat);
      if (!Number.isInteger(seat) || seat < 1 || seat > MAX_PLAYERS) return json({ error: "Elegí un asiento entre 1 y 6." }, 400);

      const targetId = actor.role === "host" ? String(body.playerId || "") : actor.playerId;
      if (actor.role !== "host" && body.playerId) return json({ error: "Solo el organizador puede cambiar el asiento de otro jugador." }, 403);
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

    if (path.endsWith("/start") && method === "POST") {
      if (actor.role !== "host") return json({ error: "Solo el organizador puede iniciar la partida." }, 403);
      if (room.status !== "lobby") return json({ error: "La partida ya fue iniciada." }, 409);
      if (room.players.length < MIN_PLAYERS || room.players.length > MAX_PLAYERS) {
        return json({ error: "Para comenzar necesitás entre 3 y 6 jugadores." }, 409);
      }
      if (room.players.some(player => !Number.isInteger(player.seat))) {
        return json({ error: "Todos los jugadores deben elegir un asiento." }, 409);
      }
      let firstPlayerId = "";
      if (bodyIsRandom(request)) {
        const index = crypto.getRandomValues(new Uint32Array(1))[0] % room.players.length;
        firstPlayerId = room.players[index].id;
      } else {
        let body;
        try { body = await readJson(request); }
        catch (error) { return json({ error: error.message }, 400); }
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

    const pair = new WebSocketPair();
    const client = pair[0];
    const server = pair[1];
    this.ctx.acceptWebSocket(server);
    server.serializeAttachment({ role: actor.role, playerId: actor.playerId });
    server.send(JSON.stringify({ type: "room.snapshot", room: this.publicSnapshot(room) }));
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
  }

  async webSocketError(socket, error) {
    console.error("ClueSimpsons room WebSocket error:", error);
  }
}

function bodyIsRandom(request) {
  return request.headers.get("x-clue-first-player") === "random";
}
