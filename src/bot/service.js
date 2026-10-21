'use strict';

const fs = require('fs');
const path = require('path');
const { Client, Collection, GatewayIntentBits, Events } = require('discord.js');

// Controla o bot do Discord: login/logout, carrega commands/ e events/ existentes e emite logs
function criarServicoDiscord(cfg, hub) {
  const estado = {
    servico: 'discord',
    status: 'offline',
    stats: { servidores: null, comandos: null, latencia: null },
    iniciadoEm: null
  };

  let client = null;
  let contadorComandos = 0;

  function definirStatus(status, stats = estado.stats) {
    estado.status = status;
    if (stats) estado.stats = stats;
    hub.status('discord', status, estado.stats);
  }

  // Log do "Console do Discord" (eventos do servidor)
  function logDiscord(nivel, mensagem) {
    hub.log('discord', nivel, mensagem);
  }

  // Log do "Console do Bot do Discord" (runtime do bot)
  function logBot(nivel, mensagem) {
    hub.log('bot', nivel, mensagem);
  }

  // Carrega os comandos da pasta ./commands (padrão discord.js v14)
  function carregarComandos(c, pasta) {
    c.commands = new Collection();
    for (const arquivo of fs.readdirSync(pasta).filter((f) => f.endsWith('.js'))) {
      const comando = require(path.join(pasta, arquivo));
      if (comando?.data?.name) c.commands.set(comando.data.name, comando);
    }
  }

  // Carrega os eventos da pasta ./events (padrão discord.js v14)
  function carregarEventos(c, pasta) {
    for (const arquivo of fs.readdirSync(pasta).filter((f) => f.endsWith('.js'))) {
      const evento = require(path.join(pasta, arquivo));
      if (evento.once) c.once(evento.name, (...args) => evento.execute(...args));
      else c.on(evento.name, (...args) => evento.execute(...args));
    }
  }

  // Ponte de logs: escuta os eventos e emite para o hub
  function conectarPonteDeLogs() {
    client.on(Events.ClientReady, (c) => {
      estado.stats.servidores = c.guilds.cache.size;
      estado.stats.latencia = c.ws.ping;
      definirStatus('online');
      logBot('sistema', `Bot conectado como ${c.user.tag} em ${estado.stats.servidores} servidores`);
    });

    client.on(Events.MessageCreate, (msg) => {
      if (msg.author.bot) return;
      logDiscord('info', `[${msg.guild?.name ?? 'DM'}] ${msg.author.tag}: ${msg.content.slice(0, 120)}`);
    });

    client.on(Events.GuildMemberAdd, (membro) => {
      logDiscord('sucesso', `Membro entrou: ${membro.user.tag} em ${membro.guild.name}`);
    });

    client.on(Events.GuildMemberRemove, (membro) => {
      logDiscord('info', `Membro saiu: ${membro.user.tag} de ${membro.guild.name}`);
    });

    client.on(Events.InteractionCreate, async (interacao) => {
      if (!interacao.isChatInputCommand()) return;
      contadorComandos++;
      estado.stats.comandos = contadorComandos;
      logBot('info', `Comando /${interacao.commandName} executado por ${interacao.user.tag}`);
    });

    client.on(Events.Error, (erro) => logBot('erro', `Erro: ${erro.message}`));
    client.on(Events.Warn, (aviso) => logBot('aviso', String(aviso)));
    client.on(Events.Invalidated, () => {
      logBot('erro', 'Sessão do Discord invalidada');
      definirStatus('offline');
    });
  }

  async function iniciar() {
    if (client) throw new Error('Bot do Discord já está em execução');
    definirStatus('iniciando');
    logBot('sistema', 'Conectando ao Discord...');

    const token = process.env[cfg.variavelToken];
    if (!token) throw new Error(`Token não encontrado na variável ${cfg.variavelToken}`);

    client = new Client({
      intents: [
        GatewayIntentBits.Guilds,
        GatewayIntentBits.GuildMessages,
        GatewayIntentBits.MessageContent,
        GatewayIntentBits.GuildMembers
      ]
    });

    // Reaproveita os comandos e eventos que você já tem
    carregarComandos(client, './commands');
    carregarEventos(client, './events');
    conectarPonteDeLogs();

    await client.login(token);
    return estado;
  }

  async function parar() {
    if (!client) return estado;
    definirStatus('parando');
    logBot('sistema', 'Desconectando do Discord...');
    await client.destroy();
    client = null;
    definirStatus('offline');
    return estado;
  }

  function obterEstado() {
    return JSON.parse(JSON.stringify(estado));
  }

  return { iniciar, parar, obterEstado };
}

module.exports = { criarServicoDiscord };