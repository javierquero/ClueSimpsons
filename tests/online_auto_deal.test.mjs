// Reparto aleatorio opcional: cartas privadas, solución válida y personajes únicos.
import test from 'node:test';
import assert from 'node:assert/strict';

const BASE = process.env.ONLINE_BASE || 'http://127.0.0.1:8787';
const S = ["Coronel Mostaza","Profesor Moradillo","Sr. Verdi","Sra. Azulino","Srita. Escarlata","Sra. Blanco"];
const W = ["Collar","Barra de Plutonio","Honda","Saxofón","Guante extensible","Dona envenenada"];
const P = ["Asilo Springfield","Bolerama","El Calabozo del Androide","Casa de los Simpsons","Estudios Krustylu","El Holandés Frito","Kwik-E-Mart","Mansión Burns","Planta Nuclear"];
async function api(path, options={}) {
  const method=options.method||'GET', token=options.token, body=options.body;
  const r=await fetch(BASE+path,{method,headers:{...(body?{'content-type':'application/json'}:{}),...(token?{authorization:'Bearer '+token}:{})},body:body?JSON.stringify(body):undefined});
  return {status:r.status,data:await r.json().catch(()=>({}))};
}

test('el reparto automático está apagado por defecto y sortea 18 cartas y personajes únicos', {timeout:30000}, async()=>{
  const created=await api('/api/rooms',{method:'POST',body:{hostName:'Organizador'}});
  assert.equal(created.status,201);
  const code=created.data.code, hostToken=created.data.hostToken;
  const players=[];
  for(const name of ['Ana','Beto','Caro','Dani']){
    const j=await api('/api/rooms/'+code+'/join',{method:'POST',body:{name}});
    assert.equal(j.status,201);
    players.push({id:j.data.playerId,token:j.data.playerToken});
  }
  const initial=await api('/api/rooms/'+code);
  assert.equal(initial.data.room.autoDealEnabled,false);
  assert.equal(initial.data.room.autoDealt,false);
  const denied=await api('/api/rooms/'+code+'/settings',{method:'POST',token:players[0].token,body:{autoDealEnabled:true}});
  assert.equal(denied.status,403);
  const enabled=await api('/api/rooms/'+code+'/settings',{method:'POST',token:hostToken,body:{autoDealEnabled:true}});
  assert.equal(enabled.status,200);
  const blockedManual=await api('/api/rooms/'+code+'/hand',{method:'POST',token:players[0].token,body:{cards:[S[0]]}});
  assert.equal(blockedManual.status,409);
  const dealt=await api('/api/rooms/'+code+'/deal',{method:'POST',token:hostToken,body:{}});
  assert.equal(dealt.status,200);
  assert.equal(dealt.data.room.autoDealt,true);
  const publicView=await api('/api/rooms/'+code);
  assert.ok(players.every(p=>!publicView.data.room.private));
  assert.ok(players.every(p=>publicView.data.room.players.find(x=>x.id===p.id).character));
  const characters=publicView.data.room.players.map(p=>p.character);
  assert.equal(new Set(characters).size,4);
  const hands=[];
  for(const player of players){
    const view=await api('/api/rooms/'+code,{token:player.token});
    assert.equal(view.status,200);
    assert.ok(Array.isArray(view.data.room.private.ownCards));
    hands.push(...view.data.room.private.ownCards);
  }
  assert.equal(hands.length,18);
  assert.equal(new Set(hands).size,18);
  const solution=[...S,...W,...P].filter(card=>!hands.includes(card));
  assert.equal(solution.length,3);
  assert.equal(solution.filter(card=>S.includes(card)).length,1);
  assert.equal(solution.filter(card=>W.includes(card)).length,1);
  assert.equal(solution.filter(card=>P.includes(card)).length,1);
  const counts=players.map(p=>publicView.data.room.players.find(x=>x.id===p.id).handCount);
  assert.ok(Math.max(...counts)-Math.min(...counts)<=1);
  const again=await api('/api/rooms/'+code+'/deal',{method:'POST',token:hostToken,body:{}});
  assert.equal(again.status,409);
  const started=await api('/api/rooms/'+code+'/start',{method:'POST',token:hostToken,body:{firstPlayerId:'random'}});
  assert.equal(started.status,200);
  assert.equal(started.data.room.status,'playing');
  assert.ok(started.data.room.players.every(p=>p.character));
});
