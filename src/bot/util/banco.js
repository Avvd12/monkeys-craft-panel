'use strict';

const fs = require('fs');
const path = require('path');
const Database = require('better-sqlite3');

const CAMINHO = path.join(__dirname, '..', '..', '..', 'dados', 'bot.db');

let db = null;

function abrir() {
  if (db) return db;

  fs.mkdirSync(path.dirname(CAMINHO), { recursive: true });

  db = new Database(CAMINHO);
  db.pragma('journal_mode = WAL');

  db.exec(`
    CREATE TABLE IF NOT EXISTS avisos (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      guild_id TEXT NOT NULL,
      usuario_id TEXT NOT NULL,
      moderador_id TEXT NOT NULL,
      motivo TEXT NOT NULL,
      criado_em INTEGER NOT NULL
    );

    CREATE TABLE IF NOT EXISTS vinculos (
      guild_id TEXT NOT NULL,
      discord_id TEXT NOT NULL,
      nick TEXT NOT NULL,
      vinculado_em INTEGER NOT NULL,
      PRIMARY KEY (guild_id, discord_id)
    );

    CREATE TABLE IF NOT EXISTS tickets (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      guild_id TEXT NOT NULL,
      canal_id TEXT NOT NULL,
      autor_id TEXT NOT NULL,
      assunto TEXT,
      status TEXT NOT NULL DEFAULT 'aberto',
      assumido_por TEXT,
      criado_em INTEGER NOT NULL,
      fechado_em INTEGER
    );

    CREATE TABLE IF NOT EXISTS config (
      guild_id TEXT NOT NULL,
      chave TEXT NOT NULL,
      valor TEXT,
      PRIMARY KEY (guild_id, chave)
    );

    CREATE TABLE IF NOT EXISTS niveis (
      guild_id TEXT NOT NULL,
      usuario_id TEXT NOT NULL,
      xp INTEGER NOT NULL DEFAULT 0,
      mensagens INTEGER NOT NULL DEFAULT 0,
      PRIMARY KEY (guild_id, usuario_id)
    );

    CREATE TABLE IF NOT EXISTS esmeraldas (
      guild_id TEXT NOT NULL,
      usuario_id TEXT NOT NULL,
      saldo INTEGER NOT NULL DEFAULT 0,
      ultimo_daily INTEGER NOT NULL DEFAULT 0,
      PRIMARY KEY (guild_id, usuario_id)
    );

    CREATE TABLE IF NOT EXISTS reputacoes (
      guild_id TEXT NOT NULL,
      de_id TEXT NOT NULL,
      para_id TEXT NOT NULL,
      criado_em INTEGER NOT NULL,
      PRIMARY KEY (guild_id, de_id, para_id)
    );

    CREATE TABLE IF NOT EXISTS lembretes (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      guild_id TEXT,
      canal_id TEXT NOT NULL,
      usuario_id TEXT NOT NULL,
      texto TEXT NOT NULL,
      quando INTEGER NOT NULL
    );
  `);

  return db;
}

/* ---------- avisos ---------- */

function criarAviso(guildId, usuarioId, moderadorId, motivo) {
  const r = abrir()
    .prepare('INSERT INTO avisos (guild_id, usuario_id, moderador_id, motivo, criado_em) VALUES (?, ?, ?, ?, ?)')
    .run(guildId, usuarioId, moderadorId, motivo, Date.now());
  return r.lastInsertRowid;
}

function listarAvisos(guildId, usuarioId) {
  return abrir()
    .prepare('SELECT * FROM avisos WHERE guild_id = ? AND usuario_id = ? ORDER BY criado_em DESC')
    .all(guildId, usuarioId);
}

function contarAvisos(guildId, usuarioId) {
  const r = abrir()
    .prepare('SELECT COUNT(*) AS total FROM avisos WHERE guild_id = ? AND usuario_id = ?')
    .get(guildId, usuarioId);
  return r ? r.total : 0;
}

function limparAvisos(guildId, usuarioId) {
  return abrir()
    .prepare('DELETE FROM avisos WHERE guild_id = ? AND usuario_id = ?')
    .run(guildId, usuarioId).changes;
}

function apagarAviso(guildId, id) {
  return abrir()
    .prepare('DELETE FROM avisos WHERE guild_id = ? AND id = ?')
    .run(guildId, id).changes;
}

/* ---------- vinculos ---------- */

function vincular(guildId, discordId, nick) {
  abrir()
    .prepare('INSERT INTO vinculos (guild_id, discord_id, nick, vinculado_em) VALUES (?, ?, ?, ?) ON CONFLICT(guild_id, discord_id) DO UPDATE SET nick = excluded.nick')
    .run(guildId, discordId, nick, Date.now());
}

function desvincular(guildId, discordId) {
  return abrir()
    .prepare('DELETE FROM vinculos WHERE guild_id = ? AND discord_id = ?')
    .run(guildId, discordId).changes;
}

function nickDe(guildId, discordId) {
  const r = abrir()
    .prepare('SELECT nick FROM vinculos WHERE guild_id = ? AND discord_id = ?')
    .get(guildId, discordId);
  return r ? r.nick : null;
}

function discordDe(guildId, nick) {
  const r = abrir()
    .prepare('SELECT discord_id FROM vinculos WHERE guild_id = ? AND LOWER(nick) = LOWER(?)')
    .get(guildId, nick);
  return r ? r.discord_id : null;
}

/* ---------- config ---------- */

function definir(guildId, chave, valor) {
  abrir()
    .prepare('INSERT INTO config (guild_id, chave, valor) VALUES (?, ?, ?) ON CONFLICT(guild_id, chave) DO UPDATE SET valor = excluded.valor')
    .run(guildId, chave, String(valor));
}

function obter(guildId, chave, padrao) {
  const r = abrir()
    .prepare('SELECT valor FROM config WHERE guild_id = ? AND chave = ?')
    .get(guildId, chave);
  return r ? r.valor : (padrao === undefined ? null : padrao);
}

/* ---------- tickets ---------- */

function criarTicket(guildId, canalId, autorId, assunto) {
  const r = abrir()
    .prepare('INSERT INTO tickets (guild_id, canal_id, autor_id, assunto, criado_em) VALUES (?, ?, ?, ?, ?)')
    .run(guildId, canalId, autorId, assunto || null, Date.now());
  return r.lastInsertRowid;
}

function ticketPorCanal(canalId) {
  return abrir()
    .prepare("SELECT * FROM tickets WHERE canal_id = ? AND status = 'aberto'")
    .get(canalId);
}

function assumirTicket(canalId, moderadorId) {
  abrir()
    .prepare("UPDATE tickets SET assumido_por = ? WHERE canal_id = ? AND status = 'aberto'")
    .run(moderadorId, canalId);
}

function fecharTicket(canalId) {
  abrir()
    .prepare("UPDATE tickets SET status = 'fechado', fechado_em = ? WHERE canal_id = ? AND status = 'aberto'")
    .run(Date.now(), canalId);
}

/* ---------- niveis ---------- */

function somarXp(guildId, usuarioId, xp, mensagens) {
  abrir()
    .prepare(`
      INSERT INTO niveis (guild_id, usuario_id, xp, mensagens) VALUES (?, ?, ?, ?)
      ON CONFLICT(guild_id, usuario_id) DO UPDATE SET
        xp = xp + excluded.xp,
        mensagens = mensagens + excluded.mensagens
    `)
    .run(guildId, usuarioId, xp, mensagens);
}

function nivelDe(guildId, usuarioId) {
  const r = abrir()
    .prepare('SELECT xp, mensagens FROM niveis WHERE guild_id = ? AND usuario_id = ?')
    .get(guildId, usuarioId);
  return r || { xp: 0, mensagens: 0 };
}

function ranking(guildId, limite) {
  return abrir()
    .prepare('SELECT usuario_id, xp, mensagens FROM niveis WHERE guild_id = ? ORDER BY xp DESC LIMIT ?')
    .all(guildId, limite || 10);
}

/* ---------- esmeraldas ---------- */

function contaEsmeraldas(guildId, usuarioId) {
  const r = abrir()
    .prepare('SELECT saldo, ultimo_daily FROM esmeraldas WHERE guild_id = ? AND usuario_id = ?')
    .get(guildId, usuarioId);
  return r || { saldo: 0, ultimo_daily: 0 };
}

function adicionarEsmeraldas(guildId, usuarioId, quantidade) {
  abrir()
    .prepare(`
      INSERT INTO esmeraldas (guild_id, usuario_id, saldo) VALUES (?, ?, ?)
      ON CONFLICT(guild_id, usuario_id) DO UPDATE SET saldo = saldo + excluded.saldo
    `)
    .run(guildId, usuarioId, quantidade);
}

function marcarDaily(guildId, usuarioId) {
  abrir()
    .prepare(`
      INSERT INTO esmeraldas (guild_id, usuario_id, saldo, ultimo_daily) VALUES (?, ?, 0, ?)
      ON CONFLICT(guild_id, usuario_id) DO UPDATE SET ultimo_daily = excluded.ultimo_daily
    `)
    .run(guildId, usuarioId, Date.now());
}

function rankEsmeraldas(guildId, limite) {
  return abrir()
    .prepare('SELECT usuario_id, saldo FROM esmeraldas WHERE guild_id = ? ORDER BY saldo DESC LIMIT ?')
    .all(guildId, limite || 10);
}

/* ---------- reputacoes ---------- */

function darRep(guildId, deId, paraId) {
  abrir()
    .prepare('INSERT OR IGNORE INTO reputacoes (guild_id, de_id, para_id, criado_em) VALUES (?, ?, ?, ?)')
    .run(guildId, deId, paraId, Date.now());
}

function jaDeuRep(guildId, deId, paraId) {
  const r = abrir()
    .prepare('SELECT 1 AS achou FROM reputacoes WHERE guild_id = ? AND de_id = ? AND para_id = ?')
    .get(guildId, deId, paraId);
  return Boolean(r);
}

function contarRep(guildId, usuarioId) {
  const r = abrir()
    .prepare('SELECT COUNT(*) AS total FROM reputacoes WHERE guild_id = ? AND para_id = ?')
    .get(guildId, usuarioId);
  return r ? r.total : 0;
}

function rankRep(guildId, limite) {
  return abrir()
    .prepare('SELECT para_id AS usuario_id, COUNT(*) AS total FROM reputacoes WHERE guild_id = ? GROUP BY para_id ORDER BY total DESC LIMIT ?')
    .all(guildId, limite || 10);
}

/* ---------- lembretes ---------- */

function criarLembrete(guildId, canalId, usuarioId, texto, quando) {
  const r = abrir()
    .prepare('INSERT INTO lembretes (guild_id, canal_id, usuario_id, texto, quando) VALUES (?, ?, ?, ?, ?)')
    .run(guildId, canalId, usuarioId, texto, quando);
  return r.lastInsertRowid;
}

function listarLembretes(usuarioId) {
  return abrir()
    .prepare('SELECT * FROM lembretes WHERE usuario_id = ? ORDER BY quando ASC')
    .all(usuarioId);
}

function apagarLembrete(usuarioId, id) {
  return abrir()
    .prepare('DELETE FROM lembretes WHERE usuario_id = ? AND id = ?')
    .run(usuarioId, id).changes;
}

function lembretesVencidos(agora) {
  return abrir()
    .prepare('SELECT * FROM lembretes WHERE quando <= ?')
    .all(agora);
}

function apagarLembretePorId(id) {
  abrir().prepare('DELETE FROM lembretes WHERE id = ?').run(id);
}

module.exports = {
  abrir,
  criarAviso, listarAvisos, contarAvisos, limparAvisos, apagarAviso,
  vincular, desvincular, nickDe, discordDe,
  definir, obter,
  criarTicket, ticketPorCanal, assumirTicket, fecharTicket,
  somarXp, nivelDe, ranking,
  contaEsmeraldas, adicionarEsmeraldas, marcarDaily, rankEsmeraldas,
  darRep, jaDeuRep, contarRep, rankRep,
  criarLembrete, listarLembretes, apagarLembrete, lembretesVencidos, apagarLembretePorId
};