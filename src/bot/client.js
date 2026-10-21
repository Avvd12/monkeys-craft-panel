'use strict';

const fs = require('fs');
const path = require('path');
const { Client, Collection, GatewayIntentBits, Events } = require('discord.js');
const config = require('../../config.json');

function createBot(hub) {
  const estado = {
    servico: 'discord',
    status: 'offline',
    stats: { servidores: null, comandos: null, latencia: null }
  };

  let client = null;
  let timerLatencia = null;
  let execucoes = 0;

  function definirStatus(s, stats = estado.stats) {
    estado.status = s;
    estado.stats = stats;
    hub.status('discord', s, estado.stats);
  }

  function logBot(nivel, mensagem) {
    hub.log('bot', nivel, mensagem);
  }

  function carregarComandos(c) {
    c.commands = new Collection();
    const dir = path.join(__dirname, '..', '..', 'commands');
    if (!fs.existsSync(dir)) return;

    for (const arquivo of fs.readdirSync(dir).filter((f) => f.endsWith('.js'))) {
      try {
        const cmd = require(path.join(dir, arquivo));
        if (cmd?.data?.name && (cmd.execute || cmd.run)) {
          c.commands.set(cmd.data.name, cmd);
        } else {
          logBot('aviso', `Comando ignorado (formato inválido): ${arquivo}`);
        }
      } catch (e) {
        logBot('erro', `Falha ao carregar ${arquivo}: ${e.message}`);
      }
    }

    estado.stats.comandos = c.commands.size;
    logBot('sistema', `${c.commands.size} comandos carregados`);
  }

  function carregarEventos(c) {
    const dir = path.join(__dirname, '..', '..', 'events');
    if (!fs.existsSync(dir)) return;

    for (const arquivo of fs.readdirSync(dir).filter((f) => f.endsWith('.js'))) {
      try {
        const evt = require(path.join(dir, arquivo));
        if (!evt.name) continue;
        if (evt.once) c.once(evt.name, (...args) => evt.execute(...args));
        else c.on(evt.name, (...args) => evt.execute(...args));
      } catch (e) {
        logBot('erro', `Falha ao carregar evento ${arquivo}: ${e.message}`);
      }
    }
  }

  // Ping negativo significa que o primeiro heartbeat ainda não voltou.
  // Nesse caso o valor vira null e o painel mostra "--" em vez de "-1".
  function atualizarMetricas() {
    if (!client) return;

    const ping = client.ws ? client.ws.ping : -1;
    estado.stats.latencia = (typeof ping === 'number' && ping >= 0) ? Math.round(ping) : null;

    if (client.guilds) estado.stats.servidores = client.guilds.cache.size;
    if (client.commands) estado.stats.comandos = client.commands.size;

    if (estado.status === 'online') definirStatus('online', estado.stats);
  }

  function pararMetricas() {
    if (timerLatencia) {
      clearInterval(timerLatencia);
      timerLatencia = null;
    }
  }

  function ligarRuntime(c) {
    c.on(Events.ClientReady, (ready) => {
      estado.stats.servidores = ready.guilds.cache.size;
      estado.stats.comandos = c.commands ? c.commands.size : null;

      const ping = ready.ws ? ready.ws.ping : -1;
      estado.stats.latencia = (typeof ping === 'number' && ping >= 0) ? Math.round(ping) : null;

      definirStatus('online');
      logBot('sistema', `Bot conectado como ${ready.user.tag} em ${estado.stats.servidores} servidores`);

      pararMetricas();
      timerLatencia = setInterval(atualizarMetricas, 15000);
    });

    c.on(Events.Error, (e) => logBot('erro', e.message));
    c.on(Events.Warn, (w) => logBot('aviso', String(w)));

    c.on(Events.InteractionCreate, (i) => {
      if (!i.isChatInputCommand()) return;
      execucoes++;
      logBot('info', `/${i.commandName} executado por ${i.user.tag} (total: ${execucoes})`);
    });
  }

  async function iniciar() {
    if (client) throw new Error('Bot já está em execução');

    definirStatus('iniciando');
    logBot('sistema', 'Conectando ao Discord...');

    const token = process.env.DISCORD_TOKEN;
    if (!token) throw new Error('DISCORD_TOKEN não definido no .env');

    client = new Client({
      intents: [
        GatewayIntentBits.Guilds,
        GatewayIntentBits.GuildMessages,
        GatewayIntentBits.MessageContent,
        GatewayIntentBits.GuildMembers
      ]
    });

    client.hub = hub;
    carregarComandos(client);
    carregarEventos(client);
    ligarRuntime(client);

    await client.login(token);
    return estado;
  }

  async function parar() {
    if (!client) return estado;

    definirStatus('parando');
    logBot('sistema', 'Desconectando do Discord...');

    pararMetricas();
    await client.destroy();
    client = null;

    estado.stats = { servidores: null, comandos: null, latencia: null };
    definirStatus('offline');
    return estado;
  }

  async function reiniciar() {
    logBot('sistema', 'Reiniciando bot do Discord...');
    await parar();
    await new Promise((r) => setTimeout(r, 1500));
    return iniciar();
  }

  async function enviarMensagem(texto) {
    if (!client) throw new Error('Bot não está conectado');
    const canal = await client.channels.fetch(config.discord.consoleChannelId);
    if (!canal || !canal.isTextBased()) throw new Error('Canal inválido');
    await canal.send(texto);
    logBot('info', `Mensagem enviada ao canal: ${texto}`);
  }

  function obterEstado() {
    return JSON.parse(JSON.stringify(estado));
  }

  return {
    start: iniciar,
    stop: parar,
    restart: reiniciar,
    sendMessage: enviarMensagem,
    getState: obterEstado,
    iniciar,
    parar,
    reiniciar,
    enviarMensagem,
    obterEstado
  };
}

module.exports = { createBot };