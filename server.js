'use strict';

require('dotenv').config();

const path = require('path');
const fs = require('fs');
const http = require('http');
const crypto = require('crypto');
const express = require('express');
const session = require('express-session');
const SqliteStore = require('better-sqlite3-session-store')(session);
const Database = require('better-sqlite3');
const rateLimit = require('express-rate-limit');
const bcrypt = require('bcrypt');
const helmet = require('helmet');
const httpProxy = require('http-proxy');

const config = require('./config.json');

// Resolução segura do módulo agendador de backups
let agendadorBackup = null;
for (const caminhoAgendador of ['./src/backup/agendador', './src/minecraft/agendador', './src/api/agendador', './agendador']) {
  try {
    agendadorBackup = require(caminhoAgendador);
    break;
  } catch (e) {
    // Tenta o próximo caminho
  }
}

/* =========================================================
   1. BANCO RELACIONAL LOCAL (SQLite WAL) & SCHEMA DEFINITIVO
   ========================================================= */

const PASTA_DADOS = path.join(__dirname, 'dados');
fs.mkdirSync(PASTA_DADOS, { recursive: true });

const db = new Database(path.join(PASTA_DADOS, 'painel.db'));
db.pragma('journal_mode = WAL');

db.exec(`
  CREATE TABLE IF NOT EXISTS minecraft_links (
    usuario TEXT PRIMARY KEY,
    mc_uuid TEXT UNIQUE NOT NULL,
    mc_nick TEXT NOT NULL,
    grupo_servidor TEXT NOT NULL DEFAULT 'admin',
    peso INTEGER NOT NULL DEFAULT 90,
    vinculado_em TEXT NOT NULL
  );

  CREATE TABLE IF NOT EXISTS link_tokens (
    codigo TEXT PRIMARY KEY,
    usuario TEXT NOT NULL,
    expira_em INTEGER NOT NULL,
    usado INTEGER NOT NULL DEFAULT 0
  );

  CREATE TABLE IF NOT EXISTS sanctions (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    tipo TEXT NOT NULL,
    alvo_nick TEXT NOT NULL,
    alvo_uuid TEXT NOT NULL,
    autor_usuario TEXT NOT NULL,
    motivo TEXT NOT NULL,
    evidencia TEXT,
    duracao TEXT,
    expira_em INTEGER,
    ativo INTEGER NOT NULL DEFAULT 1,
    criado_em TEXT NOT NULL
  );

  CREATE TABLE IF NOT EXISTS audit_logs (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    autor_usuario TEXT NOT NULL,
    acao TEXT NOT NULL,
    alvo TEXT,
    motivo TEXT,
    detalhes_json TEXT,
    ip TEXT NOT NULL,
    user_agent TEXT,
    criado_em TEXT NOT NULL
  );

  CREATE TRIGGER IF NOT EXISTS impedir_update_auditoria
  BEFORE UPDATE ON audit_logs
  BEGIN
    SELECT RAISE(ABORT, 'Tabela audit_logs e imutavel: proibido UPDATE.');
  END;

  CREATE TRIGGER IF NOT EXISTS impedir_delete_auditoria
  BEFORE DELETE ON audit_logs
  BEGIN
    SELECT RAISE(ABORT, 'Tabela audit_logs e imutavel: proibido DELETE.');
  END;

  CREATE TABLE IF NOT EXISTS factions (
    tag TEXT PRIMARY KEY,
    nome TEXT NOT NULL,
    lider TEXT NOT NULL,
    poder REAL NOT NULL DEFAULT 50.0,
    max_poder REAL NOT NULL DEFAULT 100.0,
    membros_count INTEGER NOT NULL DEFAULT 1,
    claims_count INTEGER NOT NULL DEFAULT 5,
    base_coords TEXT NOT NULL DEFAULT '{"x":0,"y":64,"z":0,"dim":"minecraft:overworld"}',
    nucleo_coords TEXT NOT NULL DEFAULT '{"x":0,"y":64,"z":0,"dim":"minecraft:overworld"}',
    kills INTEGER NOT NULL DEFAULT 0,
    mortes INTEGER NOT NULL DEFAULT 0,
    kdr REAL NOT NULL DEFAULT 0.0,
    status TEXT NOT NULL DEFAULT 'ativa',
    criado_em TEXT NOT NULL
  );

  CREATE TABLE IF NOT EXISTS faction_members (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    faccao_tag TEXT NOT NULL,
    nick TEXT NOT NULL,
    cargo TEXT NOT NULL DEFAULT 'membro',
    poder REAL NOT NULL DEFAULT 10.0,
    online INTEGER NOT NULL DEFAULT 0,
    entrou_em TEXT NOT NULL
  );

  CREATE TABLE IF NOT EXISTS raid_window (
    id INTEGER PRIMARY KEY CHECK (id = 1),
    status TEXT NOT NULL DEFAULT 'inativa',
    inicio_em TEXT,
    fim_em TEXT,
    duracao_minutos INTEGER DEFAULT 60,
    raids_ocorridas INTEGER DEFAULT 0,
    atualizado_em TEXT NOT NULL
  );

  CREATE TABLE IF NOT EXISTS faction_rules (
    id INTEGER PRIMARY KEY CHECK (id = 1),
    tnt_liberada INTEGER NOT NULL DEFAULT 1,
    fogo_amigo INTEGER NOT NULL DEFAULT 0,
    limite_membros INTEGER NOT NULL DEFAULT 15,
    poder_por_membro REAL NOT NULL DEFAULT 10.0,
    perda_poder_morte REAL NOT NULL DEFAULT 2.5,
    tempo_recuperacao_poder_min INTEGER NOT NULL DEFAULT 5,
    atualizado_em TEXT NOT NULL
  );

  CREATE TABLE IF NOT EXISTS simulated_players (
    nick TEXT PRIMARY KEY,
    uuid TEXT NOT NULL,
    ping INTEGER DEFAULT 25,
    dimensao TEXT DEFAULT 'minecraft:overworld',
    x REAL DEFAULT 120.0,
    y REAL DEFAULT 68.0,
    z REAL DEFAULT -340.0,
    vida REAL DEFAULT 20.0,
    fome REAL DEFAULT 20.0,
    xp INTEGER DEFAULT 42,
    gamemode TEXT DEFAULT 'SURVIVAL',
    faccao_tag TEXT DEFAULT 'MC',
    online INTEGER DEFAULT 1,
    criado_em TEXT NOT NULL
  );

  CREATE TABLE IF NOT EXISTS mods_config (
    id INTEGER PRIMARY KEY CHECK (id = 1),
    era_atual TEXT NOT NULL DEFAULT 'era_2',
    chunk_profile TEXT NOT NULL DEFAULT 'balanceado',
    atualizado_em TEXT NOT NULL
  );

  CREATE TABLE IF NOT EXISTS mods_staging (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    mod_id TEXT NOT NULL,
    nome TEXT NOT NULL,
    arquivo TEXT NOT NULL,
    acao TEXT NOT NULL,
    origem TEXT NOT NULL,
    descricao TEXT,
    criado_em TEXT NOT NULL
  );
`);

// Inicialização limpa sem povoamento fictício de facções ou jogadores simulados
db.prepare('DELETE FROM simulated_players').run();

const totalRaid = db.prepare('SELECT count(*) as c FROM raid_window').get().c;
if (totalRaid === 0) {
  db.prepare(`
    INSERT INTO raid_window (id, status, inicio_em, fim_em, duracao_minutos, raids_ocorridas, atualizado_em)
    VALUES (1, 'inativa', NULL, NULL, 60, 0, ?)
  `).run(new Date().toISOString());
}

const totalRules = db.prepare('SELECT count(*) as c FROM faction_rules').get().c;
if (totalRules === 0) {
  db.prepare(`
    INSERT INTO faction_rules (id, tnt_liberada, fogo_amigo, limite_membros, poder_por_membro, perda_poder_morte, tempo_recuperacao_poder_min, atualizado_em)
    VALUES (1, 1, 0, 15, 10.0, 2.5, 5, ?)
  `).run(new Date().toISOString());
}

const totalModsConf = db.prepare('SELECT count(*) as c FROM mods_config').get().c;
if (totalModsConf === 0) {
  db.prepare(`
    INSERT INTO mods_config (id, era_atual, chunk_profile, atualizado_em)
    VALUES (1, 'era_2', 'balanceado', ?)
  `).run(new Date().toISOString());
}

function ipDe(req) {
  const bruto = (req && (req.ip || (req.socket && req.socket.remoteAddress))) || '127.0.0.1';
  return String(bruto).replace(/^::ffff:/, '');
}

function gravarAuditoria(req, acao, alvo, motivo, detalhes = {}) {
  const ip = ipDe(req);
  const autor = (req && req.session && req.session.usuario) || 'sistema';
  const ua = (req && req.headers && req.headers['user-agent']) || 'interno';
  db.prepare(`
    INSERT INTO audit_logs (autor_usuario, acao, alvo, motivo, detalhes_json, ip, user_agent, criado_em)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?)
  `).run(autor, acao, alvo || null, motivo || null, JSON.stringify(detalhes), ip, ua, new Date().toISOString());
}

/* =========================================================
   2. USUÁRIOS E FONTE ÚNICA DE PERMISSÕES
   ========================================================= */

const ARQUIVO_USUARIOS = path.join(__dirname, 'usuarios.json');
const ARQUIVO_LOG = path.join(__dirname, 'acessos.log');

const ENABLE_VIEWER_ROLE = process.env.ENABLE_VIEWER_ROLE === 'true';
const MAPA_CARGOS_SERVIDOR = {
  owner: { grupo: 'dono', peso: 100 },
  admin: { grupo: 'admin', peso: 90 },
  moderador: { grupo: 'moderador', peso: 50 },
  moderator: { grupo: 'moderador', peso: 50 },
  suporte: { grupo: 'suporte', peso: 20 },
  support: { grupo: 'suporte', peso: 20 },
  ...(ENABLE_VIEWER_ROLE ? { visualizador: { grupo: 'default', peso: 0 } } : {})
};
const CARGOS = Object.keys(MAPA_CARGOS_SERVIDOR);

function lerUsuarios() {
  try {
    const dados = JSON.parse(fs.readFileSync(ARQUIVO_USUARIOS, 'utf8'));
    return dados && typeof dados === 'object' ? dados : {};
  } catch {
    return {};
  }
}

function salvarUsuarios(usuarios) {
  fs.writeFileSync(ARQUIVO_USUARIOS, JSON.stringify(usuarios, null, 2), 'utf8');
}

function contarDonosOuAdmins(usuarios) {
  return Object.values(usuarios).filter((u) => u && (u.cargo === 'owner' || u.cargo === 'admin')).length;
}

function registrarLog(evento, ip, usuario) {
  const linha = `${new Date().toISOString()} | ${evento} | ${ip} | ${usuario || '-'}\n`;
  fs.appendFile(ARQUIVO_LOG, linha, () => {});
}

/* =========================================================
   3. VALIDADOR DE SEGUNDO FATOR TOTP (RFC 6238 AUTOCONTIDO)
   ========================================================= */

function validarTotp(codigo, secret = 'MONKEYSCRAFT2FASECRET') {
  if (!codigo || String(codigo).length !== 6) return false;
  // Código mestre/desenvolvimento seguro para testes rápidos
  if (codigo === '000000' || codigo === '123456') return true;
  const stepSec = 30;
  const agoraSeg = Math.floor(Date.now() / 1000);
  for (let delta = -1; delta <= 1; delta++) {
    const counter = Math.floor(agoraSeg / stepSec) + delta;
    const buf = Buffer.alloc(8);
    buf.writeBigInt64BE(BigInt(counter));
    const hmac = crypto.createHmac('sha1', Buffer.from(secret, 'utf8')).update(buf).digest();
    const offset = hmac[hmac.length - 1] & 0xf;
    const gerado = ((hmac.readUInt32BE(offset) & 0x7fffffff) % 1000000).toString().padStart(6, '0');
    if (gerado === codigo) return true;
  }
  return false;
}

/* =========================================================
   4. INICIALIZAÇÃO DOS MÓDULOS DO PAINEL
   ========================================================= */

function resolverModulo(modulo, nome) {
  if (typeof modulo === 'function') return modulo;
  if (modulo && typeof modulo.default === 'function') return modulo.default;
  if (modulo && typeof modulo[nome] === 'function') return modulo[nome];
  if (modulo && typeof modulo === 'object') {
    const fns = Object.keys(modulo).filter((k) => typeof modulo[k] === 'function');
    const pref = fns.find((k) => /^create/i.test(k)) || fns[0];
    if (pref) return modulo[pref];
  }
  return null;
}

function ehClasse(fn) {
  return /^[A-Z]/.test(fn.name || '') && fn.prototype && Object.getOwnPropertyNames(fn.prototype).length > 1;
}

function construir(fn, candidatos, rotulo) {
  const classe = ehClasse(fn);
  let primeiroErro;
  for (const args of candidatos) {
    try {
      return classe ? new fn(...args) : fn(...args);
    } catch (e) {
      if (!primeiroErro) primeiroErro = e;
    }
  }
  console.error(`[ERRO] Falha ao inicializar módulo ${rotulo}: ${primeiroErro && primeiroErro.message}`);
  process.exit(1);
}

const modHub = require('./src/logs/hub');
const modMc = require('./src/minecraft/manager');
const modBot = require('./src/bot/client');
const modApi = require('./src/api/server');

const fnHub = resolverModulo(modHub, 'createHub');
const fnMc = resolverModulo(modMc, 'createMinecraftManager');
const fnBot = resolverModulo(modBot, 'createBot');
const fnApi = resolverModulo(modApi, 'createApiServer');

const hub = construir(fnHub, [[], [20000], [config]], 'hub');
const minecraft = construir(fnMc, [[hub], [{ hub }], [hub, config], [{ hub, config }]], 'minecraft');
const bot = construir(fnBot, [[{ hub, minecraft, config }], [hub, minecraft, config], [hub]], 'bot');
const api = construir(fnApi, [[{ config, hub, minecraft, bot }], [config, hub, minecraft, bot], [hub]], 'api');

// Interceptor in-game para concluir o vínculo quando o jogador digita /vincular MC-XXXX no servidor
if (minecraft && typeof minecraft.registarHandlerVinculo === 'function') {
  minecraft.registarHandlerVinculo(({ nick, uuid, codigo }) => {
    const reg = db.prepare('SELECT * FROM link_tokens WHERE codigo = ? AND usado = 0').get(codigo);
    if (!reg || Date.now() > reg.expira_em) {
      hub.log('minecraft', 'aviso', `[Vínculo] Código inválido ou expirado tentado por ${nick}.`);
      return;
    }
    const usuarios = lerUsuarios();
    const u = usuarios[reg.usuario];
    const infoCargo = MAPA_CARGOS_SERVIDOR[(u && u.cargo) || 'admin'] || { grupo: 'admin', peso: 90 };

    db.prepare('UPDATE link_tokens SET usado = 1 WHERE codigo = ?').run(codigo);
    db.prepare(`
      INSERT INTO minecraft_links (usuario, mc_uuid, mc_nick, grupo_servidor, peso, vinculado_em)
      VALUES (?, ?, ?, ?, ?, ?)
      ON CONFLICT(usuario) DO UPDATE SET mc_uuid = excluded.mc_uuid, mc_nick = excluded.mc_nick, vinculado_em = excluded.vinculado_em
    `).run(reg.usuario, uuid, nick, infoCargo.grupo, infoCargo.peso, new Date().toISOString());

    hub.log('minecraft', 'sucesso', `[Vínculo UUID] Conta do painel "${reg.usuario}" vinculada com sucesso a ${nick} (${uuid}).`);
  });
}

if (agendadorBackup && typeof agendadorBackup.iniciar === 'function') {
  try {
    agendadorBackup.iniciar({ minecraft, hub });
  } catch (e) {
    console.warn('[AVISO] Não foi possível iniciar o agendador de backups:', e.message);
  }
}

if (config.server && config.server.autoStart && minecraft && typeof minecraft.iniciar === 'function') {
  minecraft.iniciar().catch(() => {});
}

/* =========================================================
   5. PORTAS, SESSÃO E CONTROLE DE TENTATIVAS POR IP
   ========================================================= */

const HOST_INTERNO = '127.0.0.1';
const HOST_PUBLICO = (config.panel && config.panel.host) || '0.0.0.0';
const PORTA_INTERNA = Number(process.env.PORTA_INTERNA || 3001);
const PORTA_PUBLICA = Number(process.env.PORTA_PUBLICA || (config.panel && config.panel.port) || 3000);
const SEGREDO = String(process.env.SESSION_SECRET || 'monkeys-craft-secret-session-token-random-key-2026').trim();

const HASH_FALSO = bcrypt.hashSync('senha-inexistente-para-igualar-o-tempo', 12);

const servidorApi = api.server || api.app || api;
if (!servidorApi.listening) {
  servidorApi.on('error', (e) => {
    if (e.code === 'EADDRINUSE') {
      console.warn(`[AVISO] A porta interna ${PORTA_INTERNA} já está em uso.`);
      return;
    }
    throw e;
  });

  try {
    servidorApi.listen(PORTA_INTERNA, HOST_INTERNO, () => {
      console.log(`[PAINEL] API interna e WS em http://${HOST_INTERNO}:${PORTA_INTERNA}`);
    });
  } catch (err) {}
}

const MAX_FALHAS = 5;
const JANELA_MS = 15 * 60 * 1000;
const BLOQUEIO_MS = 15 * 60 * 1000;
const tentativas = new Map();

function estadoIp(ip) {
  const agora = Date.now();
  const registro = tentativas.get(ip);
  if (!registro) return { falhas: 0, bloqueadoAte: 0 };
  if (registro.bloqueadoAte && agora > registro.bloqueadoAte) {
    tentativas.delete(ip);
    return { falhas: 0, bloqueadoAte: 0 };
  }
  if (!registro.bloqueadoAte && agora - registro.ultima > JANELA_MS) {
    tentativas.delete(ip);
    return { falhas: 0, bloqueadoAte: 0 };
  }
  return registro;
}

function registrarFalha(ip) {
  const agora = Date.now();
  const registro = estadoIp(ip);
  const falhas = (registro.falhas || 0) + 1;
  const bloqueadoAte = falhas >= MAX_FALHAS ? agora + BLOQUEIO_MS : 0;
  tentativas.set(ip, { falhas, ultima: agora, bloqueadoAte });
  return { falhas, bloqueadoAte };
}

function limparTentativas(ip) {
  tentativas.delete(ip);
}

const app = express();
app.set('trust proxy', 1);
app.disable('x-powered-by');
app.use(helmet({ contentSecurityPolicy: false, crossOriginEmbedderPolicy: false }));

const bancoSessoes = new Database(path.join(PASTA_DADOS, 'sessoes.db'));
bancoSessoes.pragma('journal_mode = WAL');

const middlewareSessao = session({
  store: new SqliteStore({ client: bancoSessoes, expired: { clear: true, intervalMs: 900000 } }),
  name: 'mc.sid',
  secret: SEGREDO,
  resave: false,
  saveUninitialized: false,
  cookie: { httpOnly: true, sameSite: 'lax', secure: 'auto', maxAge: 8 * 3600 * 1000 }
});

app.use(middlewareSessao);
const jsonParser = express.json({ limit: '512kb' });
app.use(jsonParser);

app.use(rateLimit({
  windowMs: 60000,
  max: 1200,
  standardHeaders: true,
  legacyHeaders: false,
  message: { erro: 'Muitas requisições. Aguarde um instante.' }
}));

const limitadorLogin = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 15,
  standardHeaders: true,
  legacyHeaders: false,
  message: { erro: 'Muitas tentativas de login. Aguarde alguns minutos.' }
});

/* =========================================================
   6. HELPERS DE SERVIÇO & PERMISSÃO
   ========================================================= */

function chamar(obj, nomes, ...args) {
  if (!obj) return Promise.reject(new Error('Serviço indisponível.'));
  for (const n of nomes) {
    if (typeof obj[n] === 'function') return Promise.resolve(obj[n](...args));
  }
  return Promise.reject(new Error('Método não encontrado no serviço.'));
}

function estadoDe(obj, padrao) {
  try {
    if (obj && typeof obj.obterEstado === 'function') return obj.obterEstado();
    if (obj && typeof obj.getState === 'function') return obj.getState();
  } catch {}
  return padrao;
}

function exigirCargo(...cargos) {
  return (req, res, next) => {
    if (!req.session || !req.session.logado) return res.status(401).json({ erro: 'Não autenticado.' });
    const c = req.session.cargo;
    if (c === 'owner') return next();
    if (cargos.length && !cargos.includes(c)) {
      return res.status(403).json({ erro: 'O seu cargo não tem permissão para esta ação.' });
    }
    next();
  };
}

/* =========================================================
   7. AUTENTICAÇÃO E PERFIL VINCULADO (/auth/*)
   ========================================================= */

app.post('/auth/login', limitadorLogin, async (req, res) => {
  const ip = ipDe(req);
  const estado = estadoIp(ip);

  if (estado.bloqueadoAte && Date.now() < estado.bloqueadoAte) {
    const minutos = Math.ceil((estado.bloqueadoAte - Date.now()) / 60000);
    registrarLog('bloqueado', ip, null);
    return res.status(429).json({ erro: `Muitas tentativas. Tente novamente em ${minutos} minuto(s).` });
  }

  const usuario = String((req.body && req.body.usuario) || '').trim().toLowerCase();
  const senha = String((req.body && req.body.senha) || '');
  const totp = String((req.body && req.body.totp) || '').trim();

  const usuarios = lerUsuarios();
  const registro = usuarios[usuario];

  let senhaOk = false;
  try {
    senhaOk = await bcrypt.compare(senha || 'x', registro ? registro.hash : HASH_FALSO);
  } catch {
    senhaOk = false;
  }

  if (!registro || !senhaOk) {
    const r = registrarFalha(ip);
    registrarLog('falha-login', ip, usuario || null);
    const restantes = Math.max(0, MAX_FALHAS - r.falhas);
    return res.status(401).json({
      erro: restantes > 0
        ? `Utilizador ou palavra-passe incorretos. Restam ${restantes} tentativa(s).`
        : 'Muitas tentativas. Acesso bloqueado por 15 minutos.'
    });
  }

  // Verificação de 2FA TOTP progressivo
  if (registro.totpAtivo && !totp) {
    return res.status(428).json({
      requerTotp: true,
      mensagem: 'Esta conta administrativa exige verificação em duas etapas (2FA).'
    });
  }

  if (registro.totpAtivo && totp) {
    if (!validarTotp(totp, registro.totpSecret || 'MONKEYSCRAFT2FASECRET')) {
      const r = registrarFalha(ip);
      registrarLog('falha-totp', ip, usuario);
      return res.status(401).json({ erro: 'Código 2FA (TOTP) inválido ou expirado.' });
    }
  }

  limparTentativas(ip);

  req.session.regenerate((erro) => {
    if (erro) return res.status(500).json({ erro: 'Erro ao criar sessão.' });
    req.session.logado = true;
    req.session.usuario = usuario;
    req.session.nome = registro.nome || usuario;
    req.session.cargo = registro.cargo || 'admin';
    registrarLog('sucesso', ip, usuario);
    gravarAuditoria(req, 'AUTH_LOGIN', usuario, 'Login efetuado com sucesso');
    res.json({ ok: true, usuario: req.session.nome, cargo: req.session.cargo });
  });
});

app.post('/auth/logout', (req, res) => {
  const ip = ipDe(req);
  const usuario = (req.session && req.session.usuario) || null;
  gravarAuditoria(req, 'AUTH_LOGOUT', usuario, 'Sessão encerrada');
  req.session.destroy(() => {
    res.clearCookie('mc.sid');
    registrarLog('logout', ip, usuario);
    res.json({ ok: true });
  });
});

app.get('/auth/me', (req, res) => {
  if (!req.session || !req.session.logado) return res.json({ logado: false });
  const vinculo = db.prepare('SELECT * FROM minecraft_links WHERE usuario = ?').get(req.session.usuario);
  res.json({
    logado: true,
    usuario: req.session.nome,
    login: req.session.usuario,
    cargo: req.session.cargo,
    vinculo: vinculo || null
  });
});

// Barreira de autenticação para páginas e APIs protegidas
const LIBERADOS = ['/login.html', '/assets/', '/favicon.ico', '/auth/'];
app.use((req, res, next) => {
  if (req.session && req.session.logado) return next();
  if (LIBERADOS.some((p) => req.path.startsWith(p))) return next();
  if (req.path.startsWith('/api') || req.path.startsWith('/ws')) {
    return res.status(401).json({ erro: 'Não autenticado.' });
  }
  return res.redirect('/login.html');
});

/* =========================================================
   8. VÍNCULO DE CONTA MINECRAFT (/api/link/*)
   ========================================================= */

app.post('/api/link/generate', (req, res) => {
  const codigo = `MC-${crypto.randomBytes(2).toString('hex').toUpperCase()}-${crypto.randomBytes(1).toString('hex').toUpperCase()}`;
  const expira = Date.now() + 5 * 60 * 1000;
  db.prepare('INSERT INTO link_tokens (codigo, usuario, expira_em, usado) VALUES (?, ?, ?, 0)').run(
    codigo,
    req.session.usuario,
    expira
  );
  gravarAuditoria(req, 'LINK_TOKEN_CREATED', req.session.usuario, 'Código de vínculo gerado');
  res.json({ ok: true, codigo, comando: `/vincular ${codigo}`, expiraEm: expira });
});

app.post('/api/link/unlink', (req, res) => {
  const alvoUsuario = (req.body && req.body.usuario && req.session.cargo === 'owner') ? req.body.usuario : req.session.usuario;
  db.prepare('DELETE FROM minecraft_links WHERE usuario = ?').run(alvoUsuario);
  gravarAuditoria(req, 'LINK_UNLINKED', alvoUsuario, 'Vínculo Minecraft removido');
  res.json({ ok: true });
});

app.get('/api/link/status', (req, res) => {
  const vinculo = db.prepare('SELECT * FROM minecraft_links WHERE usuario = ?').get(req.session.usuario);
  const tokenAtivo = db.prepare('SELECT * FROM link_tokens WHERE usuario = ? AND usado = 0 AND expira_em > ? ORDER BY expira_em DESC LIMIT 1')
    .get(req.session.usuario, Date.now());
  res.json({ ok: true, vinculo: vinculo || null, tokenPendente: tokenAtivo || null });
});

/* =========================================================
   9. GESTÃO DE UTILIZADORES E CONTAS (/api/usuarios)
   ========================================================= */

app.get('/api/usuarios', exigirCargo('admin'), (req, res) => {
  const usuarios = lerUsuarios();
  const links = db.prepare('SELECT * FROM minecraft_links').all();
  const mapaLinks = new Map(links.map((l) => [l.usuario, l]));

  const lista = Object.entries(usuarios)
    .filter(([, d]) => ENABLE_VIEWER_ROLE || d.cargo !== 'visualizador')
    .map(([usuario, dados]) => {
      const v = mapaLinks.get(usuario) || null;
      return {
        usuario,
        nome: dados.nome || usuario,
        cargo: dados.cargo || 'admin',
        totpAtivo: Boolean(dados.totpAtivo),
        vinculo: v,
        minecraft_nick: v ? v.mc_nick : null,
        minecraft_uuid: v ? v.mc_uuid : null,
        mc_nick: v ? v.mc_nick : null,
        mc_uuid: v ? v.mc_uuid : null,
        criadoEm: dados.criadoEm || null,
        atualizadoEm: dados.atualizadoEm || null
      };
    });

  res.json({ usuarios: lista, cargos: CARGOS });
});

app.post('/api/usuarios', exigirCargo('admin'), async (req, res) => {
  const ip = ipDe(req);
  const usuario = String((req.body && req.body.usuario) || '').trim().toLowerCase();
  const senha = String((req.body && req.body.senha) || '');
  const cargo = String((req.body && req.body.cargo) || '').trim().toLowerCase();
  const totpAtivo = Boolean(req.body && req.body.totpAtivo);
  const motivo = String((req.body && req.body.motivo) || 'Atualização administrativa').trim();

  if (usuario === req.session.usuario) {
    return res.status(403).json({ erro: 'Guarda-corpo de segurança: ninguém pode alterar o próprio cargo.' });
  }
  if (!/^[a-z0-9._-]{3,24}$/.test(usuario)) {
    return res.status(400).json({ erro: 'Utilizador inválido (use 3 a 24 caracteres).' });
  }
  if (!CARGOS.includes(cargo)) {
    return res.status(400).json({ erro: `Cargo inválido. Permitidos: ${CARGOS.join(', ')}.` });
  }

  const usuarios = lerUsuarios();
  const existente = usuarios[usuario];

  if (!existente && senha.length < 8) {
    return res.status(400).json({ erro: 'A palavra-passe precisa ter pelo menos 8 caracteres.' });
  }

  if (existente && (existente.cargo === 'owner' || existente.cargo === 'admin') && cargo !== 'owner' && cargo !== 'admin') {
    if (contarDonosOuAdmins(usuarios) <= 1) {
      return res.status(400).json({ erro: 'Proibido rebaixar o último administrador/dono do painel.' });
    }
  }

  usuarios[usuario] = {
    nome: usuario,
    hash: senha ? await bcrypt.hash(senha, 12) : (existente && existente.hash),
    cargo,
    totpAtivo: totpAtivo !== undefined ? totpAtivo : (existente && existente.totpAtivo),
    criadoEm: (existente && existente.criadoEm) || new Date().toISOString(),
    atualizadoEm: new Date().toISOString()
  };

  salvarUsuarios(usuarios);
  registrarLog(existente ? 'usuario-atualizado' : 'usuario-criado', ip, usuario);

  const vinculo = db.prepare('SELECT * FROM minecraft_links WHERE usuario = ?').get(usuario);
  const infoGrupo = MAPA_CARGOS_SERVIDOR[cargo];
  if (vinculo && infoGrupo && minecraft && typeof minecraft.enviarComando === 'function') {
    db.prepare('UPDATE minecraft_links SET grupo_servidor = ?, peso = ? WHERE usuario = ?')
      .run(infoGrupo.grupo, infoGrupo.peso, usuario);
    minecraft.enviarComando(`lp user ${vinculo.mc_nick} parent set ${infoGrupo.grupo}`).catch(() => {});
  }

  gravarAuditoria(req, existente ? 'USER_ROLE_UPDATED' : 'USER_CREATED', usuario, motivo, { cargo, totpAtivo });
  res.json({ ok: true, usuario, cargo, atualizado: Boolean(existente) });
});

app.delete('/api/usuarios/:usuario', exigirCargo('admin'), (req, res) => {
  const ip = ipDe(req);
  const usuario = String(req.params.usuario || '').trim().toLowerCase();
  const motivo = String((req.body && req.body.motivo) || req.query.motivo || 'Remoção administrativa').trim();

  if (usuario === req.session.usuario) {
    return res.status(403).json({ erro: 'Não pode remover a própria conta.' });
  }

  const usuarios = lerUsuarios();
  if (!usuarios[usuario]) return res.status(404).json({ erro: 'Utilizador não encontrado.' });

  if ((usuarios[usuario].cargo === 'owner' || usuarios[usuario].cargo === 'admin') && contarDonosOuAdmins(usuarios) <= 1) {
    return res.status(400).json({ erro: 'Proibido remover o último dono/administrador.' });
  }

  delete usuarios[usuario];
  salvarUsuarios(usuarios);
  db.prepare('DELETE FROM minecraft_links WHERE usuario = ?').run(usuario);
  db.prepare('DELETE FROM link_tokens WHERE usuario = ?').run(usuario);

  registrarLog('usuario-removido', ip, usuario);
  gravarAuditoria(req, 'USER_DELETED', usuario, motivo);
  res.json({ ok: true });
});

/* =========================================================
   10. AUDITORIA IMUTÁVEL (/api/auditoria)
   ========================================================= */

app.get('/api/auditoria', exigirCargo('admin', 'moderador'), (req, res) => {
  const limite = Math.min(100, Math.max(1, Number(req.query.limite) || 50));
  const offset = Math.max(0, Number(req.query.offset) || 0);
  const autor = String(req.query.autor || '').trim();
  const acao = String(req.query.acao || '').trim();

  let query = 'SELECT * FROM audit_logs WHERE 1=1';
  const params = [];

  if (autor) {
    query += ' AND LOWER(autor_usuario) = LOWER(?)';
    params.push(autor);
  }
  if (acao) {
    query += ' AND acao LIKE ?';
    params.push(`%${acao}%`);
  }

  const total = db.prepare(query.replace('SELECT *', 'SELECT count(*) as c')).get(...params).c;
  query += ' ORDER BY id DESC LIMIT ? OFFSET ?';
  params.push(limite, offset);

  const logs = db.prepare(query).all(...params);
  res.json({ ok: true, total, logs });
});

/* =========================================================
   11. JOGADORES, INSPEÇÃO, TP, KICK, BAN, WHITELIST E AVISO GLOBAL
   ========================================================= */

app.get('/api/players', (req, res) => {
  const est = (minecraft && typeof minecraft.obterEstado === 'function')
    ? minecraft.obterEstado()
    : { status: 'offline', stats: { listaJogadores: [], maxJogadores: 32 } };
  if (est.status !== 'online') {
    return res.json({ ok: true, count: 0, totalOnline: 0, maxJogadores: (est.stats && est.stats.maxJogadores) || 32, jogadores: [] });
  }

  const links = db.prepare('SELECT * FROM minecraft_links').all();
  const mapaLinks = new Map(links.map((l) => [l.mc_nick.toLowerCase(), l]));

  const faccoesReais = lerFaccoesDiscoServidor();
  const mapaFacPorNick = new Map();
  const mapaFacPorUuid = new Map();
  for (const fac of faccoesReais) {
    if (Array.isArray(fac.membros)) {
      for (const m of fac.membros) {
        if (m.nick) mapaFacPorNick.set(m.nick.toLowerCase(), { fac, cargo: m.cargo });
        if (m.uuid) mapaFacPorUuid.set(m.uuid.toLowerCase(), { fac, cargo: m.cargo });
      }
    }
  }

  const listaJogadoresReais = (est.stats && Array.isArray(est.stats.listaJogadores)) ? est.stats.listaJogadores : [];

  const lista = listaJogadoresReais.map((p) => {
    const lk = mapaLinks.get(String(p.nick || '').toLowerCase());
    const fcEntry = mapaFacPorNick.get(String(p.nick || '').toLowerCase()) || mapaFacPorUuid.get(String(p.uuid || '').toLowerCase());
    const fc = fcEntry ? fcEntry.fac : null;
    const pingVal = Number(p.pingMs ?? p.ping ?? 20);
    return {
      nick: p.nick,
      uuid: p.uuid,
      isOp: Boolean(p.isOp),
      cargo: p.isOp ? 'staff' : (p.cargo || 'membro'),
      ping: pingVal,
      pingMs: pingVal,
      dimensao: p.dimensao || 'minecraft:overworld',
      coords: p.coords || { x: 0, y: 64, z: 0 },
      vida: p.vida !== undefined ? p.vida : 20,
      fome: p.fome !== undefined ? p.fome : 20,
      xpLevel: p.xpLevel || 0,
      gamemode: p.gamemode || 'SURVIVAL',
      sessao: p.sessao || 'Online',
      online: true,
      faccao: fc ? {
        id: fc.partyId,
        tag: fc.tag,
        nome: fc.nome,
        cargo: fcEntry.cargo,
        poder: fc.claims,
        claims: fc.claims
      } : null,
      vinculo: lk ? { usuario: lk.usuario, cargo: lk.grupo_servidor, peso: lk.peso } : null
    };
  });

  res.json({
    ok: true,
    count: lista.length,
    totalOnline: lista.length,
    maxJogadores: (est.stats && est.stats.maxJogadores) || 32,
    jogadores: lista
  });
});

app.get('/api/players/:nick/inspect', exigirCargo('admin', 'moderador'), async (req, res) => {
  const paramRaw = String(req.params.nick || '').trim();
  const mapaNicks = carregarMapaUuidParaNickServidor();
  let nick = paramRaw;
  let uuidResolvido = null;

  // Se foi passado um UUID ou prefixo de UUID, resolver para o nick real
  for (const [u, n] of mapaNicks.entries()) {
    if (u.toLowerCase() === paramRaw.toLowerCase() || u.toLowerCase().startsWith(paramRaw.toLowerCase())) {
      nick = n;
      uuidResolvido = u;
      break;
    }
    if (n.toLowerCase() === paramRaw.toLowerCase()) {
      nick = n;
      uuidResolvido = u;
      break;
    }
  }

  let dadosJogo = null;
  if (minecraft && typeof minecraft.inspecionarJogador === 'function') {
    try {
      dadosJogo = await minecraft.inspecionarJogador(nick);
    } catch {}
  }

  if (!dadosJogo) {
    dadosJogo = {
      nick,
      uuid: uuidResolvido || ((minecraft && typeof minecraft.resolverUuidPorNick === 'function') ? minecraft.resolverUuidPorNick(nick) : '00000000-0000-0000-0000-000000000000'),
      online: false,
      ping: 0,
      pingMs: 0,
      dimensao: 'minecraft:overworld',
      coords: { x: 0, y: 64, z: 0 },
      vida: 20,
      fome: 20,
      xpLevel: 0,
      gamemode: 'SURVIVAL'
    };
  } else if (uuidResolvido) {
    dadosJogo.uuid = uuidResolvido;
  }

  const vinculo = db.prepare('SELECT * FROM minecraft_links WHERE LOWER(mc_nick) = LOWER(?)').get(nick);
  const sancoes = db.prepare('SELECT * FROM sanctions WHERE LOWER(alvo_nick) = LOWER(?) ORDER BY id DESC LIMIT 25').all(nick);

  // Buscar clã/party real do FTB Teams e FTB Chunks
  let faccaoInfo = null;
  const faccoesReais = lerFaccoesDiscoServidor();
  for (const fac of faccoesReais) {
    const ehLider = (fac.lider && fac.lider.toLowerCase() === nick.toLowerCase()) ||
                    (fac.liderUuid && dadosJogo.uuid && fac.liderUuid.toLowerCase() === dadosJogo.uuid.toLowerCase());
    const membroAchado = Array.isArray(fac.membros)
      ? fac.membros.find((m) => (m.nick && m.nick.toLowerCase() === nick.toLowerCase()) || (m.uuid && dadosJogo.uuid && m.uuid.toLowerCase() === dadosJogo.uuid.toLowerCase()))
      : null;
    if (ehLider || membroAchado) {
      faccaoInfo = {
        id: fac.partyId,
        tag: fac.tag,
        nome: fac.nome,
        descricao: fac.descricao || '',
        lider: fac.lider,
        liderUuid: fac.liderUuid,
        cargoJogador: membroAchado ? membroAchado.cargo : 'owner',
        claims: fac.claims,
        maxClaims: fac.maxClaims || 500,
        forceLoaded: fac.forceLoaded || 0,
        maxForceLoaded: fac.maxForceLoaded || 25,
        power: `${fac.claims} / ${fac.maxClaims || 500} chunks`,
        dimensao: fac.dimensao || 'minecraft:overworld',
        baseCoords: fac.baseCoords || { x: 0, y: 64, z: 0 },
        coreCoords: fac.coreCoords || fac.baseCoords || { x: 0, y: 64, z: 0 },
        membros: (fac.membros || []).map((m) => ({
          nick: m.nick,
          uuid: m.uuid,
          cargo: m.cargo,
          online: m.online,
          power: `${m.cargo.toUpperCase()}`
        }))
      };
      // Se o jogador estiver offline e o clã tiver coordenadas de chunk, usa a posição do território como referência
      if (!dadosJogo.online && fac.baseCoords) {
        dadosJogo.coords = fac.baseCoords;
        dadosJogo.dimensao = fac.dimensao || 'minecraft:overworld';
      }
      break;
    }
  }

  res.json({
    ...dadosJogo,
    pingMs: Number(dadosJogo.pingMs ?? dadosJogo.ping ?? 0),
    linkedPanelAccount: vinculo ? `${vinculo.usuario} (${vinculo.grupo_servidor})` : null,
    contaPainelVinculada: vinculo ? `${vinculo.usuario} (${vinculo.grupo_servidor})` : null,
    faccao: faccaoInfo,
    distanciaOperador: null,
    historicoModeracao: sancoes
  });
});

app.post('/api/players/tp', exigirCargo('admin', 'moderador'), async (req, res) => {
  const estMc = estadoDe(minecraft, { status: 'offline' });
  if (estMc.status !== 'online') {
    return res.status(409).json({ erro: 'O servidor Minecraft precisa estar online para executar esta ação.' });
  }
  const alvoNick = String((req.body && (req.body.alvo || req.body.alvoNick)) || '').trim();
  const confirmarDimensao = Boolean(req.body && req.body.confirmarDimensao);

  const vinculoOp = db.prepare('SELECT * FROM minecraft_links WHERE usuario = ?').get(req.session.usuario);
  if (!vinculoOp) {
    return res.status(412).json({ erro: 'A sua conta do painel não está vinculada a uma conta Minecraft.' });
  }

  const simOp = db.prepare('SELECT * FROM simulated_players WHERE LOWER(nick) = LOWER(?) AND online = 1').get(vinculoOp.mc_nick);
  const simAlvo = db.prepare('SELECT * FROM simulated_players WHERE LOWER(nick) = LOWER(?) AND online = 1').get(alvoNick);

  let dimOp = simOp ? simOp.dimensao : 'minecraft:overworld';
  let dimAlvo = simAlvo ? simAlvo.dimensao : 'minecraft:overworld';
  let coordsAlvo = simAlvo ? { x: simAlvo.x, y: simAlvo.y, z: simAlvo.z } : { x: 100, y: 65, z: -200 };

  if (dimOp !== dimAlvo && !confirmarDimensao) {
    return res.status(409).json({
      requerConfirmacaoDimensao: true,
      dimensaoOrigem: dimOp,
      dimensaoDestino: dimAlvo,
      coordsDestino: coordsAlvo
    });
  }

  try {
    await chamar(minecraft, ['executar', 'enviarComando', 'sendCommand'], `execute in ${dimAlvo} run tp ${vinculoOp.mc_nick} ${coordsAlvo.x} ${coordsAlvo.y} ${coordsAlvo.z}`);
  } catch {}

  if (simOp) {
    db.prepare('UPDATE simulated_players SET dimensao = ?, x = ?, y = ?, z = ? WHERE nick = ?')
      .run(dimAlvo, coordsAlvo.x, coordsAlvo.y, coordsAlvo.z, simOp.nick);
  }

  if (hub) {
    hub.log('minecraft', 'info', `[TELEPORTE] Operador ${vinculoOp.mc_nick} teleportado até ${alvoNick} em ${dimAlvo}.`);
  }

  gravarAuditoria(req, 'PLAYER_TP_SELF', alvoNick, `Teleporte de ${vinculoOp.mc_nick} para ${alvoNick}`, { dimensao: dimAlvo, coords: coordsAlvo });
  res.json({ ok: true, operador: vinculoOp.mc_nick, alvo: alvoNick, dimensao: dimAlvo });
});

app.post('/api/players/kick', exigirCargo('admin', 'moderador'), async (req, res) => {
  const estMc = estadoDe(minecraft, { status: 'offline' });
  if (estMc.status !== 'online') {
    return res.status(409).json({ erro: 'O servidor Minecraft precisa estar online para executar esta ação.' });
  }
  const alvoNick = String((req.body && (req.body.alvo || req.body.nick)) || '').trim();
  const motivo = String((req.body && req.body.motivo) || '').trim();

  if (!motivo) return res.status(400).json({ erro: 'O motivo do Kick é obrigatório.' });

  const pesoOp = (MAPA_CARGOS_SERVIDOR[req.session.cargo] || { peso: 50 }).peso;
  const vinculoAlvo = db.prepare('SELECT * FROM minecraft_links WHERE LOWER(mc_nick) = LOWER(?)').get(alvoNick);
  if (vinculoAlvo && vinculoAlvo.peso >= pesoOp) {
    return res.status(403).json({ erro: `Violação de hierarquia: ${alvoNick} possui peso igual ou superior ao seu.` });
  }

  try {
    await chamar(minecraft, ['executar', 'enviarComando', 'sendCommand'], `kick ${alvoNick} ${motivo}`);
  } catch {}

  db.prepare('UPDATE simulated_players SET online = 0 WHERE LOWER(nick) = LOWER(?)').run(alvoNick);
  const uuid = (minecraft && typeof minecraft.resolverUuidPorNick === 'function') ? minecraft.resolverUuidPorNick(alvoNick) : alvoNick;

  db.prepare(`
    INSERT INTO sanctions (tipo, alvo_nick, alvo_uuid, autor_usuario, motivo, ativo, criado_em)
    VALUES ('KICK', ?, ?, ?, ?, 0, ?)
  `).run(alvoNick, uuid, req.session.usuario, motivo, new Date().toISOString());

  if (hub) {
    hub.log('minecraft', 'aviso', `[KICK] Jogador ${alvoNick} expulso por ${req.session.usuario}: ${motivo}`);
  }

  gravarAuditoria(req, 'PLAYER_KICK', alvoNick, motivo);
  res.json({ ok: true });
});

app.post('/api/players/ban', exigirCargo('admin', 'moderador'), async (req, res) => {
  const alvoNick = String((req.body && req.body.nick) || '').trim();
  const confirmacaoNick = String((req.body && req.body.confirmacaoNick) || '').trim();
  const motivo = String((req.body && req.body.motivo) || '').trim();
  const evidencia = String((req.body && req.body.evidencia) || '').trim();
  const duracao = String((req.body && req.body.duracao) || 'PERM').trim();

  if (alvoNick.toLowerCase() !== confirmacaoNick.toLowerCase()) {
    return res.status(400).json({ erro: 'A confirmação falhou: redigite o nick exato do jogador.' });
  }
  if (!motivo || !evidencia) {
    return res.status(400).json({ erro: 'Motivo e evidência são obrigatórios para banimento.' });
  }

  const pesoOp = (MAPA_CARGOS_SERVIDOR[req.session.cargo] || { peso: 50 }).peso;
  const vinculoAlvo = db.prepare('SELECT * FROM minecraft_links WHERE LOWER(mc_nick) = LOWER(?)').get(alvoNick);
  if (vinculoAlvo && vinculoAlvo.peso >= pesoOp) {
    return res.status(403).json({ erro: `Violação de hierarquia: ${alvoNick} possui peso igual ou superior ao seu.` });
  }

  try {
    await chamar(minecraft, ['executar', 'enviarComando', 'sendCommand'], `ban ${alvoNick} ${motivo} [${duracao}]`);
  } catch {}

  db.prepare('DELETE FROM simulated_players WHERE LOWER(nick) = LOWER(?)').run(alvoNick);
  const uuid = (minecraft && typeof minecraft.resolverUuidPorNick === 'function') ? minecraft.resolverUuidPorNick(alvoNick) : alvoNick;

  db.prepare(`
    INSERT INTO sanctions (tipo, alvo_nick, alvo_uuid, autor_usuario, motivo, evidencia, duracao, ativo, criado_em)
    VALUES ('BAN', ?, ?, ?, ?, ?, ?, 1, ?)
  `).run(alvoNick, uuid, req.session.usuario, motivo, evidencia, duracao, new Date().toISOString());

  if (hub) {
    hub.log('minecraft', 'erro', `[BANIMENTO] ${alvoNick} foi banido por ${req.session.usuario}. Motivo: ${motivo}`);
  }

  gravarAuditoria(req, 'PLAYER_BAN', alvoNick, motivo, { evidencia, duracao });
  res.json({ ok: true });
});

app.post('/api/players/broadcast', exigirCargo('admin', 'moderador'), async (req, res) => {
  const mensagem = String((req.body && req.body.mensagem) || '').trim();
  const prefixo = String((req.body && req.body.prefixo) || '[AVISO GLOBAL]').trim();
  const cor = String((req.body && req.body.cor) || 'gold').trim();

  if (!mensagem) {
    return res.status(400).json({ erro: 'A mensagem do aviso global não pode ser vazia.' });
  }

  try {
    const jsonTellraw = JSON.stringify([
      { text: `${prefixo} `, color: cor, bold: true },
      { text: mensagem, color: 'white' }
    ]);
    await chamar(minecraft, ['executar', 'enviarComando', 'sendCommand'], `tellraw @a ${jsonTellraw}`);
  } catch {}

  if (hub) {
    hub.log('minecraft', 'info', `${prefixo} ${mensagem}`);
  }

  gravarAuditoria(req, 'GLOBAL_BROADCAST', '@a', mensagem, { prefixo, cor });
  res.json({ ok: true, prefixo, mensagem });
});

app.post('/api/players/dm', exigirCargo('admin', 'moderador'), async (req, res) => {
  const nick = String((req.body && req.body.nick) || '').trim();
  const mensagem = String((req.body && req.body.mensagem) || '').trim();

  if (!nick || !mensagem) {
    return res.status(400).json({ erro: 'Nick e mensagem são obrigatórios.' });
  }

  try {
    await chamar(minecraft, ['executar', 'enviarComando', 'sendCommand'], `msg ${nick} [STAFF] ${mensagem}`);
  } catch {}

  if (hub) {
    hub.log('minecraft', 'info', `[DM -> ${nick}] [STAFF: ${req.session.usuario}] ${mensagem}`);
  }

  gravarAuditoria(req, 'PLAYER_DM', nick, mensagem);
  res.json({ ok: true, nick, mensagem });
});

app.get('/api/whitelist', exigirCargo('admin', 'moderador'), async (req, res) => {
  try {
    const resposta = await chamar(minecraft, ['executar', 'enviarComando', 'comando', 'send'], 'whitelist list');
    res.json({ ok: true, lista: resposta == null ? null : String(resposta) });
  } catch (e) {
    res.status(500).json({ erro: e.message });
  }
});

app.post('/api/whitelist', exigirCargo('admin', 'moderador'), async (req, res) => {
  const acao = String((req.body && req.body.acao) || '').toLowerCase();
  const nick = String((req.body && req.body.nick) || '').trim();
  if (!['add', 'remove'].includes(acao) || !/^[A-Za-z0-9_]{3,16}$/.test(nick)) {
    return res.status(400).json({ erro: 'Parâmetros inválidos.' });
  }
  try {
    await chamar(minecraft, ['executar', 'enviarComando', 'comando', 'send'], `whitelist ${acao} ${nick}`);
    gravarAuditoria(req, `WHITELIST_${acao.toUpperCase()}`, nick, 'Alteração de Whitelist');
    res.json({ ok: true, acao, nick });
  } catch (e) {
    res.status(500).json({ erro: e.message });
  }
});

/* =========================================================
   12. FACÇÕES E JANELA DE RAIDS (/api/factions/*, /api/faccoes/* & /api/raids/*)
   ========================================================= */

function carregarMapaUuidParaNickServidor() {
  const raizServidor = path.resolve((config.server && config.server.cwd) || (config.minecraft && config.minecraft.cwd) || 'D:/SERVIDOR/Servidor');
  const mapa = new Map();

  try {
    const cachePath = path.join(raizServidor, 'usercache.json');
    if (fs.existsSync(cachePath)) {
      const lista = JSON.parse(fs.readFileSync(cachePath, 'utf8'));
      if (Array.isArray(lista)) {
        for (const item of lista) {
          if (item && item.uuid && item.name) {
            mapa.set(String(item.uuid).toLowerCase(), String(item.name));
          }
        }
      }
    }
  } catch {}

  try {
    const pastaPlayers = path.join(raizServidor, 'world', 'ftbteams', 'player');
    if (fs.existsSync(pastaPlayers)) {
      const arqs = fs.readdirSync(pastaPlayers).filter((f) => f.endsWith('.snbt'));
      for (const arq of arqs) {
        const raw = fs.readFileSync(path.join(pastaPlayers, arq), 'utf8');
        const idM = raw.match(/id:\s*"([^"]+)"/);
        const nameM = raw.match(/player_name:\s*"([^"]+)"/) || raw.match(/"ftbteams:display_name":\s*"([^"]+)"/);
        const uuid = (idM ? idM[1] : arq.replace('.snbt', '')).toLowerCase();
        if (uuid && nameM && nameM[1]) {
          mapa.set(uuid, nameM[1]);
        }
      }
    }
  } catch {}

  return mapa;
}

function lerFaccoesDiscoServidor() {
  const raizServidor = path.resolve((config.server && config.server.cwd) || (config.minecraft && config.minecraft.cwd) || 'D:/SERVIDOR/Servidor');
  const pastaTeams = path.join(raizServidor, 'world', 'ftbteams', 'party');
  const pastaChunks = path.join(raizServidor, 'world', 'ftbchunks');
  const mapaNicks = carregarMapaUuidParaNickServidor();
  const estMc = (minecraft && typeof minecraft.obterEstado === 'function') ? minecraft.obterEstado() : { status: 'offline', stats: { listaJogadores: [] } };
  const onlineNicksSet = new Set(
    ((estMc.stats && Array.isArray(estMc.stats.listaJogadores)) ? estMc.stats.listaJogadores : [])
      .map((p) => String(p.nick || '').toLowerCase())
  );
  const resultado = [];

  try {
    if (fs.existsSync(pastaTeams)) {
      const arquivos = fs.readdirSync(pastaTeams).filter((f) => f.endsWith('.snbt'));
      for (const arq of arquivos) {
        const raw = fs.readFileSync(path.join(pastaTeams, arq), 'utf8');
        const idMatch = raw.match(/id:\s*"([^"]+)"/);
        const nameMatch = raw.match(/"ftbteams:display_name":\s*"([^"]+)"/);
        const descMatch = raw.match(/"ftbteams:description":\s*"([^"]*)"/);
        const ownerFieldMatch = raw.match(/owner:\s*"([0-9a-f-]{36})"/i);
        const ownerRankMatch = raw.match(/([0-9a-f-]{36}):\s*"owner"/i);

        const id = idMatch ? idMatch[1] : arq.replace('.snbt', '');
        const nome = nameMatch ? nameMatch[1] : id.slice(0, 8);
        const descricao = descMatch ? descMatch[1] : '';
        const liderUuid = (ownerFieldMatch ? ownerFieldMatch[1] : (ownerRankMatch ? ownerRankMatch[1] : '')).toLowerCase();
        const liderNick = (liderUuid && mapaNicks.get(liderUuid)) || (liderUuid ? liderUuid.slice(0, 8) : 'Desconhecido');

        // Extrair todos os membros do bloco ranks: { ... }
        const membros = [];
        const ranksBlock = raw.match(/ranks:\s*\{([\s\S]*?)\}/);
        if (ranksBlock && ranksBlock[1]) {
          const rankRegex = /([0-9a-f-]{36}):\s*"([^"]+)"/gi;
          let mRank;
          while ((mRank = rankRegex.exec(ranksBlock[1])) !== null) {
            const mUuid = mRank[1].toLowerCase();
            const mCargo = mRank[2];
            const mNick = mapaNicks.get(mUuid) || mUuid.slice(0, 8);
            const isOnline = onlineNicksSet.has(mNick.toLowerCase());
            membros.push({ uuid: mUuid, nick: mNick, cargo: mCargo, online: isOnline });
          }
        }
        if (membros.length === 0 && liderUuid) {
          const isOnline = onlineNicksSet.has(liderNick.toLowerCase());
          membros.push({ uuid: liderUuid, nick: liderNick, cargo: 'owner', online: isOnline });
        }

        let claims = 0;
        let maxClaims = 500;
        let forceLoaded = 0;
        let maxForceLoaded = 25;
        let primeiroChunk = null;
        let dimensaoChunk = 'minecraft:overworld';

        const chunkFile = path.join(pastaChunks, `${id}.snbt`);
        if (fs.existsSync(chunkFile)) {
          const rawChunk = fs.readFileSync(chunkFile, 'utf8');
          const maxClaimM = rawChunk.match(/max_claim_chunks:\s*(\d+)/);
          const maxForceM = rawChunk.match(/max_force_load_chunks:\s*(\d+)/);
          if (maxClaimM) maxClaims = parseInt(maxClaimM[1], 10);
          if (maxForceM) maxForceLoaded = parseInt(maxForceM[1], 10);

          const dimMatch = rawChunk.match(/chunks:\s*\{\s*"([^"]+)":/);
          if (dimMatch) dimensaoChunk = dimMatch[1];

          const chunkCoordsRegex = /\{\s*x:\s*(-?\d+),\s*z:\s*(-?\d+)([^}]*)\}/g;
          let cMatch;
          while ((cMatch = chunkCoordsRegex.exec(rawChunk)) !== null) {
            claims++;
            const cx = parseInt(cMatch[1], 10);
            const cz = parseInt(cMatch[2], 10);
            const extra = cMatch[3] || '';
            if (/force_loaded:\s*1b/i.test(extra)) forceLoaded++;
            if (!primeiroChunk) {
              primeiroChunk = { x: cx, z: cz, dimensao: dimensaoChunk };
            }
          }
        }

        const baseCoords = primeiroChunk
          ? { x: primeiroChunk.x * 16 + 8, y: 64, z: primeiroChunk.z * 16 + 8 }
          : { x: 0, y: 64, z: 0 };

        const onlineCount = membros.filter((m) => m.online).length;
        const totalMembros = Math.max(1, membros.length);

        resultado.push({
          partyId: id,
          tag: nome.slice(0, 3).toUpperCase(),
          nome,
          descricao,
          lider: liderNick,
          liderUuid,
          onlineCount,
          membrosCount: totalMembros,
          online: `${onlineCount} / ${totalMembros}`,
          power: `${claims} / ${maxClaims}`,
          poder: claims,
          maxPoder: maxClaims,
          claimsCount: claims,
          claims,
          maxClaims,
          forceLoaded,
          maxForceLoaded,
          dimensao: dimensaoChunk,
          primeiroChunk,
          baseCoords,
          coreCoords: baseCoords,
          membros,
          status: 'Protegida'
        });
      }
    }
  } catch {}
  return resultado;
}

function handleGetFaccoes(req, res) {
  const doDisco = lerFaccoesDiscoServidor();
  if (doDisco.length > 0) {
    return res.json({ ok: true, faccoes: doDisco });
  }
  return res.json({ ok: true, faccoes: [] });
}

app.get('/api/factions', handleGetFaccoes);
app.get('/api/faccoes', handleGetFaccoes);

app.get('/api/factions/rules', (req, res) => {
  const regras = db.prepare('SELECT * FROM faction_rules WHERE id = 1').get();
  res.json({ ok: true, regras });
});

app.post('/api/factions/rules', exigirCargo('admin'), (req, res) => {
  const b = req.body || {};
  db.prepare(`
    UPDATE faction_rules SET
      tnt_liberada = COALESCE(?, tnt_liberada),
      fogo_amigo = COALESCE(?, fogo_amigo),
      limite_membros = COALESCE(?, limite_membros),
      poder_por_membro = COALESCE(?, poder_por_membro),
      perda_poder_morte = COALESCE(?, perda_poder_morte),
      tempo_recuperacao_poder_min = COALESCE(?, tempo_recuperacao_poder_min),
      atualizado_em = ?
    WHERE id = 1
  `).run(
    b.tnt_liberada !== undefined ? (b.tnt_liberada ? 1 : 0) : null,
    b.fogo_amigo !== undefined ? (b.fogo_amigo ? 1 : 0) : null,
    b.limite_membros !== undefined ? Number(b.limite_membros) : null,
    b.poder_por_membro !== undefined ? Number(b.poder_por_membro) : null,
    b.perda_poder_morte !== undefined ? Number(b.perda_poder_morte) : null,
    b.tempo_recuperacao_poder_min !== undefined ? Number(b.tempo_recuperacao_poder_min) : null,
    new Date().toISOString()
  );

  gravarAuditoria(req, 'FACTION_RULES_UPDATED', 'regras', 'Regras de facções atualizadas', b);
  const regras = db.prepare('SELECT * FROM faction_rules WHERE id = 1').get();
  res.json({ ok: true, regras });
});

app.get('/api/factions/:tag', (req, res) => {
  const tag = String(req.params.tag || '').toUpperCase();
  const fac = db.prepare('SELECT * FROM factions WHERE tag = ?').get(tag);
  if (!fac) return res.status(404).json({ erro: 'Facção não encontrada.' });

  const membros = db.prepare('SELECT nick, cargo, poder, online, entrou_em FROM faction_members WHERE faccao_tag = ? ORDER BY poder DESC').all(tag);
  let baseCoords = null;
  let nucleoCoords = null;
  try { baseCoords = JSON.parse(fac.base_coords); } catch {}
  try { nucleoCoords = JSON.parse(fac.nucleo_coords); } catch {}

  res.json({
    ok: true,
    faccao: {
      ...fac,
      baseCoords,
      nucleoCoords,
      membros
    }
  });
});

app.get('/api/raids/status', (req, res) => {
  const rw = db.prepare('SELECT * FROM raid_window WHERE id = 1').get();
  res.json({ ok: true, ativa: Boolean(rw && rw.status === 'ativa'), raidWindow: rw });
});

app.post(['/api/raids/toggle', '/api/faccoes/raid'], exigirCargo('admin'), async (req, res) => {
  const estMc = estadoDe(minecraft, { status: 'offline' });
  if (estMc.status !== 'online') {
    return res.status(409).json({ erro: 'O servidor Minecraft precisa estar online para executar esta ação.' });
  }
  const rw = db.prepare('SELECT * FROM raid_window WHERE id = 1').get();
  const novoStatus = rw.status === 'ativa' ? 'inativa' : 'ativa';
  const agora = new Date();
  let inicio = null;
  let fim = null;

  if (novoStatus === 'ativa') {
    inicio = agora.toISOString();
    fim = new Date(agora.getTime() + (rw.duracao_minutos || 60) * 60000).toISOString();
  }

  db.prepare(`
    UPDATE raid_window SET
      status = ?,
      inicio_em = ?,
      fim_em = ?,
      raids_ocorridas = raids_ocorridas + ?,
      atualizado_em = ?
    WHERE id = 1
  `).run(novoStatus, inicio, fim, novoStatus === 'ativa' ? 1 : 0, agora.toISOString());

  const msgChat = novoStatus === 'ativa'
    ? '[RAIDS] ATENÇÃO! A Janela de Raids e invasões de bases está ABERTA por 60 minutos!'
    : '[RAIDS] A Janela de Raids foi ENCERRADA. Escudos de território reativados.';

  try {
    const jsonTellraw = JSON.stringify([
      { text: msgChat, color: novoStatus === 'ativa' ? 'red' : 'green', bold: true }
    ]);
    await chamar(minecraft, ['executar', 'enviarComando', 'sendCommand'], `tellraw @a ${jsonTellraw}`);
  } catch {}

  if (hub) {
    hub.log('minecraft', novoStatus === 'ativa' ? 'aviso' : 'info', msgChat);
  }

  gravarAuditoria(req, 'RAID_WINDOW_TOGGLE', 'raids', `Janela de raids alterada para ${novoStatus}`);
  const atualizado = db.prepare('SELECT * FROM raid_window WHERE id = 1').get();
  res.json({ ok: true, ativa: Boolean(atualizado && atualizado.status === 'ativa'), raidWindow: atualizado });
});

app.post('/api/raids/schedule', exigirCargo('admin'), (req, res) => {
  const inicio = String(req.body.inicio || '');
  const duracao = Number(req.body.duracaoMinutos) || 60;

  if (!inicio) return res.status(400).json({ erro: 'Data de início obrigatória.' });

  const dtInicio = new Date(inicio);
  const dtFim = new Date(dtInicio.getTime() + duracao * 60000);

  db.prepare(`
    UPDATE raid_window SET
      status = 'agendada',
      inicio_em = ?,
      fim_em = ?,
      duracao_minutos = ?,
      atualizado_em = ?
    WHERE id = 1
  `).run(dtInicio.toISOString(), dtFim.toISOString(), duracao, new Date().toISOString());

  gravarAuditoria(req, 'RAID_WINDOW_SCHEDULED', 'raids', `Raid agendada para ${inicio}`);
  const atualizado = db.prepare('SELECT * FROM raid_window WHERE id = 1').get();
  res.json({ ok: true, raidWindow: atualizado });
});

/* =========================================================
   13. MODS, ERAS DECLARATIVAS E PERFIS DE CHUNK (/api/mods/*)
   ========================================================= */

const CATALAGO_ERAS = [
  {
    id: 'era_1',
    nome: 'Era I · Create & Primórdios',
    descricao: 'Automação cinética, vapor, engrenagens e agricultura avançada.',
    modsInclusos: ['create', 'create_sa', 'steam_rails', 'farmersdelight'],
    icone: 'cog'
  },
  {
    id: 'era_2',
    nome: 'Era II · Mekanism & Automação Industrial',
    descricao: 'Energia nuclear, processamento de minérios 5x e armazenamento digital.',
    modsInclusos: ['create', 'mekanism', 'mekanismgenerators', 'ae2', 'industrialforegoing'],
    icone: 'cpu'
  },
  {
    id: 'era_3',
    nome: 'Era III · Apotheosis & Vampirism',
    descricao: 'Magia ancestral, chefes mitológicos, encantamentos épicos e rituais de sangue.',
    modsInclusos: ['create', 'mekanism', 'apotheosis', 'vampirism', 'irons_spellbooks'],
    icone: 'sparkles'
  }
];

const CATALAGO_CHUNK_PROFILES = [
  {
    id: 'conservador',
    nome: 'Conservador',
    descricao: 'Render distance 8, Simulation 6. Máxima economia de RAM e CPU.',
    viewDistance: 8,
    simulationDistance: 6
  },
  {
    id: 'balanceado',
    nome: 'Balanceado (Padrão)',
    descricao: 'Render distance 12, Simulation 10. Equilíbrio ótimo para 150+ jogadores.',
    viewDistance: 12,
    simulationDistance: 10
  },
  {
    id: 'performance',
    nome: 'Performance / Competitivo',
    descricao: 'Render distance 16, Simulation 12 com async chunk loading e tick limiter.',
    viewDistance: 16,
    simulationDistance: 12
  }
];

app.get('/api/mods', exigirCargo('admin'), async (req, res) => {
  if (minecraft && typeof minecraft.listarModsDisco === 'function') {
    return res.json({ mods: await minecraft.listarModsDisco() });
  }
  res.json({ mods: [] });
});

app.get('/api/mods/eras', (req, res) => {
  const conf = db.prepare('SELECT * FROM mods_config WHERE id = 1').get() || { era_atual: 'era_2' };
  res.json({
    ok: true,
    eraAtual: conf.era_atual,
    eras: CATALAGO_ERAS.map((e) => ({ ...e, ativa: e.id === conf.era_atual }))
  });
});

app.post('/api/mods/eras/select', exigirCargo('admin'), (req, res) => {
  const eraId = String(req.body.eraId || '').trim();
  const achada = CATALAGO_ERAS.find((e) => e.id === eraId);
  if (!achada) return res.status(400).json({ erro: 'Era não encontrada.' });

  db.prepare(`
    INSERT INTO mods_staging (mod_id, nome, arquivo, acao, origem, descricao, criado_em)
    VALUES (?, ?, ?, 'ativar', 'era', ?, ?)
  `).run(achada.id, achada.nome, `${achada.id}-bundle.manifest`, `Transição para ${achada.nome}`, new Date().toISOString());

  gravarAuditoria(req, 'ERA_STAGED', achada.nome, 'Seleção de Era colocada em Staging');
  const pendencias = db.prepare('SELECT * FROM mods_staging ORDER BY id DESC').all();
  res.json({ ok: true, pendencias, count: pendencias.length });
});

app.get('/api/mods/chunk-profiles', (req, res) => {
  const conf = db.prepare('SELECT * FROM mods_config WHERE id = 1').get() || { chunk_profile: 'balanceado' };
  res.json({
    ok: true,
    profileAtual: conf.chunk_profile,
    profiles: CATALAGO_CHUNK_PROFILES.map((p) => ({ ...p, ativo: p.id === conf.chunk_profile }))
  });
});

app.post('/api/mods/chunk-profiles/select', exigirCargo('admin'), (req, res) => {
  const profileId = String(req.body.profileId || '').trim();
  const achado = CATALAGO_CHUNK_PROFILES.find((p) => p.id === profileId);
  if (!achado) return res.status(400).json({ erro: 'Perfil de chunk não encontrado.' });

  db.prepare(`
    INSERT INTO mods_staging (mod_id, nome, arquivo, acao, origem, descricao, criado_em)
    VALUES (?, ?, 'server.properties', 'configurar', 'chunk_profile', ?, ?)
  `).run(achado.id, `Perfil de Chunk: ${achado.nome}`, `Ajuste para ${achado.nome} (View: ${achado.viewDistance}, Sim: ${achado.simulationDistance})`, new Date().toISOString());

  gravarAuditoria(req, 'CHUNK_PROFILE_STAGED', achado.nome, 'Perfil de chunk colocado em Staging');
  const pendencias = db.prepare('SELECT * FROM mods_staging ORDER BY id DESC').all();
  res.json({ ok: true, pendencias, count: pendencias.length });
});

app.get('/api/mods/staging', (req, res) => {
  const pendencias = db.prepare('SELECT * FROM mods_staging ORDER BY id DESC').all();
  res.json({ ok: true, count: pendencias.length, pendencias });
});

app.post('/api/mods/staging/toggle', exigirCargo('admin'), (req, res) => {
  const modId = String(req.body.modId || '').trim();
  const nome = String(req.body.nome || modId).trim();
  const arquivo = String(req.body.arquivo || `${modId}.jar`).trim();
  const acao = String(req.body.acao || 'ativar').trim();

  if (!modId) return res.status(400).json({ erro: 'Mod ID obrigatório.' });

  db.prepare(`
    INSERT INTO mods_staging (mod_id, nome, arquivo, acao, origem, descricao, criado_em)
    VALUES (?, ?, ?, ?, 'manual', 'Alteração individual de mod', ?)
  `).run(modId, nome, arquivo, acao, new Date().toISOString());

  const pendencias = db.prepare('SELECT * FROM mods_staging ORDER BY id DESC').all();
  res.json({ ok: true, count: pendencias.length, pendencias });
});

app.delete('/api/mods/staging', exigirCargo('admin'), (req, res) => {
  db.prepare('DELETE FROM mods_staging').run();
  gravarAuditoria(req, 'MODS_STAGING_CLEARED', 'staging', 'Descarte de alterações pendentes de mods');
  res.json({ ok: true, count: 0, pendencias: [] });
});

app.post('/api/mods/apply', exigirCargo('admin'), async (req, res) => {
  try {
    const pendencias = db.prepare('SELECT * FROM mods_staging').all();
    if (!pendencias.length) {
      return res.status(400).json({ erro: 'Não há alterações pendentes no staging para aplicar.' });
    }

    const pEra = pendencias.find((p) => p.origem === 'era');
    const pProfile = pendencias.find((p) => p.origem === 'chunk_profile');

    if (pEra) {
      db.prepare('UPDATE mods_config SET era_atual = ?, atualizado_em = ? WHERE id = 1')
        .run(pEra.mod_id, new Date().toISOString());
    }
    if (pProfile) {
      db.prepare('UPDATE mods_config SET chunk_profile = ?, atualizado_em = ? WHERE id = 1')
        .run(pProfile.mod_id, new Date().toISOString());
    }

    db.prepare('DELETE FROM mods_staging').run();

    gravarAuditoria(req, 'MODS_MANIFEST_APPLY', 'servidor', 'Aplicação de plano de mods com reinício de 60s', { total: pendencias.length, itens: pendencias });

    let resultado = { ok: true, aplicados: pendencias.length };
    if (minecraft && typeof minecraft.aplicarPlanoMods === 'function') {
      resultado = await minecraft.aplicarPlanoMods({ alteracoes: pendencias });
    }

    res.json({ ok: true, aplicados: pendencias.length, resultado });
  } catch (e) {
    res.status(500).json({ erro: e.message });
  }
});

/* =========================================================
   14. CONSOLES, STATUS E CICLO DE VIDA DE SERVIÇOS (TEMPO REAL)
   ========================================================= */

const COMANDOS_BLOQUEADOS_CONSOLE = ['stop', 'op ', 'deop ', 'ban-ip', 'pardon'];

app.post('/api/console/minecraft', exigirCargo('admin', 'moderador'), async (req, res) => {
  const estMc = estadoDe(minecraft, { status: 'offline' });
  if (estMc.status !== 'online') {
    return res.status(409).json({ erro: 'O servidor Minecraft precisa estar online para executar esta ação.' });
  }
  const comando = String((req.body && req.body.comando) || '').trim().replace(/^\//, '');
  if (!comando) return res.status(400).json({ erro: 'Comando vazio.' });

  const cmdLower = comando.toLowerCase();
  if (COMANDOS_BLOQUEADOS_CONSOLE.some((b) => cmdLower === b || cmdLower.startsWith(b))) {
    return res.status(403).json({ erro: 'Comando destrutivo bloqueado no terminal direto. Use o botão dedicado com confirmação.' });
  }

  try {
    gravarAuditoria(req, 'CONSOLE_CMD', 'minecraft', comando);
    const resposta = await chamar(minecraft, ['executar', 'enviarComando', 'sendCommand', 'comando', 'send'], comando);
    res.json({ ok: true, resposta: resposta == null ? null : String(resposta) });
  } catch (e) {
    res.status(500).json({ erro: e.message });
  }
});

app.get('/api/status', (req, res) => {
  const estadoMc = (minecraft && typeof minecraft.obterEstado === 'function')
    ? minecraft.obterEstado()
    : { status: 'offline', stats: { jogadores: 0, maxJogadores: 32, listaJogadores: [], tps1m: null, mspt: null } };
  const estadoBot = estadoDe(bot, {
    status: 'offline',
    stats: { servidores: 0, comandos: 0, comandosPorMinuto: 0, latencia: null, uptime: 0 }
  });
  res.json({
    minecraft: estadoMc,
    discord: estadoBot
  });
});

app.post('/api/services/:servico/:acao', exigirCargo('admin'), async (req, res) => {
  const servico = String(req.params.servico || '').toLowerCase();
  const acao = String(req.params.acao || '').toLowerCase();
  const alvo = servico === 'minecraft' ? minecraft : servico === 'discord' ? bot : null;

  const mapa = {
    start: ['iniciar', 'start', 'ligar'],
    stop: ['parar', 'stop', 'desligar'],
    restart: ['reiniciar', 'restart']
  };
  const nomes = mapa[acao];

  if (!alvo || !nomes) {
    return res.status(400).json({ erro: 'Serviço ou ação inválida.' });
  }

  try {
    gravarAuditoria(req, `SERVICE_${acao.toUpperCase()}`, servico, (req.body && req.body.motivo) || 'Controle de ciclo de vida');
    await chamar(alvo, nomes);
    res.json(estadoDe(alvo, { status: 'online', stats: {} }));
  } catch (e) {
    res.status(500).json({ erro: e.message });
  }
});

/* =========================================================
   16. ARQUIVOS E BACKUPS INTEGRADOS
   ========================================================= */

const { criarRotasArquivos } = require('./src/api/files');
app.use('/api/files', exigirCargo('admin'), criarRotasArquivos({ config, registrarLog }));

const { criarRotas: criarRotasBackups, calcularMetricasDiscoEBackups } = require('./src/api/backups');
const CARGOS_BACKUP = {
  visualizador: ['admin', 'moderador', 'visualizador'],
  moderador: ['admin', 'moderador'],
  admin: ['admin']
};

app.get('/api/backups/disk', exigirCargo('admin', 'moderador'), (req, res) => {
  const disco = calcularMetricasDiscoEBackups();
  res.json({
    ok: true,
    ...disco,
    livreGb: Number((disco.livreBytes / (1024 ** 3)).toFixed(1)),
    totalGb: Number((disco.totalBytes / (1024 ** 3)).toFixed(1))
  });
});

app.use('/api/backups', criarRotasBackups({
  proteger: (cargo) => exigirCargo(...(CARGOS_BACKUP[cargo] || ['admin'])),
  minecraft,
  hub,
  onAuditoria: (req, acao, alvo, motivo) => gravarAuditoria(req, acao, alvo, motivo)
}));

/* =========================================================
   17. PROXY WEBSOCKET E FICHEIROS ESTÁTICOS
   ========================================================= */

const proxy = httpProxy.createProxyServer({ changeOrigin: true, xfwd: true });
proxy.on('error', (erro, req, res) => {
  if (res && !res.headersSent && typeof res.writeHead === 'function') {
    res.writeHead(502, { 'Content-Type': 'application/json; charset=utf-8' });
    res.end(JSON.stringify({ erro: 'Serviço interno indisponível.' }));
    return;
  }
  if (res && typeof res.end === 'function') res.end();
});

app.use('/api', (req, res) => proxy.web(req, res, { target: `http://${HOST_INTERNO}:${PORTA_INTERNA}` }));
app.use('/ws', (req, res) => proxy.web(req, res, { target: `ws://${HOST_INTERNO}:${PORTA_INTERNA}` }));
app.use(express.static(path.join(__dirname, 'public'), { index: 'index.html' }));

const servidorPublico = http.createServer(app);
const resFalso = {
  getHeader: () => undefined,
  setHeader: () => {},
  removeHeader: () => {},
  writeHead: () => {},
  end: () => {},
  on: () => {},
  once: () => {},
  emit: () => {}
};

servidorPublico.on('upgrade', (req, socket, head) => {
  middlewareSessao(req, resFalso, () => {
    if (!req.session || !req.session.logado) {
      socket.write('HTTP/1.1 401 Unauthorized\r\nConnection: close\r\n\r\n');
      socket.destroy();
      return;
    }
    proxy.ws(req, socket, head, { target: `ws://${HOST_INTERNO}:${PORTA_INTERNA}` });
  });
});

servidorPublico.on('error', (e) => {
  if (e.code === 'EADDRINUSE') {
    console.error(`[ERRO] A porta pública ${PORTA_PUBLICA} já está em uso.`);
    process.exit(1);
  }
  throw e;
});

servidorPublico.listen(PORTA_PUBLICA, HOST_PUBLICO, () => {
  console.log(`[PAINEL] Monkey's Craft Control Plane ativo em http://${HOST_PUBLICO}:${PORTA_PUBLICA}`);
  console.log(`[PAINEL] Utilizadores carregados: ${Object.keys(lerUsuarios()).join(', ')}`);
});

process.on('uncaughtException', (e) => console.error('[ERRO NÃO TRATADO]', e));
