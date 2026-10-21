'use strict';

const fs = require('fs');
const path = require('path');
const {
  Client,
  Collection,
  GatewayIntentBits,
  Events,
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  ChannelType
} = require('discord.js');
const config = require('../../config.json');
const { carregarComandos } = require('./comandos');
const { embed } = require('./util/embeds');
const banco = require('./util/banco');
const { iniciarAgendador } = require('./util/agendador');

function createBot(hubOuCtx, minecraftArg) {
  const ctx = (hubOuCtx && typeof hubOuCtx === 'object' && hubOuCtx.hub)
    ? hubOuCtx
    : { hub: hubOuCtx, minecraft: minecraftArg };

  const hub = ctx.hub;
  const minecraft = ctx.minecraft || null;

  const estado = {
    servico: 'discord',
    status: 'offline',
    stats: { servidores: null, comandos: null, latencia: null }
  };

  let client = null;
  let timerLatencia = null;
  let execucoes = 0;

  const contexto = {
    comandos: null,
    hub,
    minecraft,
    config,
    banco
  };

  function definirStatus(s, stats = estado.stats) {
    estado.status = s;
    estado.stats = stats;
    hub.status('discord', s, estado.stats);
  }

  function logBot(nivel, mensagem) {
    hub.log('bot', nivel, mensagem);
  }

  function carregarTodosComandos(c) {
    c.commands = new Collection();

    try {
      const novos = carregarComandos();
      for (const [nome, cmd] of novos) c.commands.set(nome, cmd);
    } catch (e) {
      logBot('erro', `Falha ao carregar comandos: ${e.message}`);
    }

    estado.stats.comandos = c.commands.size;
    logBot('sistema', `${c.commands.size} comandos carregados`);
  }

  function carregarEventos(c) {
    const dir = path.join(__dirname, '..', 'events');
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

  async function tratarBotao(interacao) {
    if (interacao.customId === 'restart:confirmar') {
      await interacao.update({
        embeds: [embed('minecraft', 'Reiniciando', 'O servidor esta sendo reiniciado.')],
        components: []
      });

      try {
        if (minecraft && typeof minecraft.reiniciar === 'function') {
          await minecraft.reiniciar();
        } else if (minecraft && typeof minecraft.executar === 'function') {
          await minecraft.executar('restart');
        } else {
          throw new Error('Gerenciador do Minecraft indisponivel.');
        }
      } catch (e) {
        await interacao.followUp({
          embeds: [embed('erro', 'Falha ao reiniciar', e.message)],
          ephemeral: true
        });
      }
      return;
    }

    if (interacao.customId === 'restart:cancelar') {
      await interacao.update({
        embeds: [embed('info', 'Cancelado', 'O reinicio foi cancelado.')],
        components: []
      });
      return;
    }

    if (interacao.customId === 'ticket:abrir') {
      await interacao.deferReply({ ephemeral: true });

      const nomeCanal = `ticket-${interacao.user.username.toLowerCase()}`;
      const existente = interacao.guild.channels.cache.find(
        (ch) => ch.name === nomeCanal && ch.type === ChannelType.GuildText
      );

      if (existente) {
        return interacao.editReply({
          embeds: [embed('info', 'Ticket ja aberto', `Voce ja tem um ticket: ${existente}`)]
        });
      }

      const canal = await interacao.guild.channels.create({
        name: nomeCanal,
        type: ChannelType.GuildText,
        permissionOverwrites: [
          { id: interacao.guild.roles.everyone.id, deny: ['ViewChannel'] },
          { id: interacao.user.id, allow: ['ViewChannel', 'SendMessages', 'ReadMessageHistory'] }
        ]
      });

      banco.criarTicket(interacao.guildId, canal.id, interacao.user.id, null);

      const linha = new ActionRowBuilder().addComponents(
        new ButtonBuilder().setCustomId('ticket:fechar').setLabel('Fechar ticket').setStyle(ButtonStyle.Danger)
      );

      await canal.send({
        content: `${interacao.user}`,
        embeds: [embed('ticket', 'Ticket aberto', 'Descreva sua duvida ou problema. A equipe respondera em breve.')],
        components: [linha]
      });

      return interacao.editReply({
        embeds: [embed('sucesso', 'Ticket criado', `Seu atendimento esta em ${canal}.`)]
      });
    }

    if (interacao.customId === 'ticket:fechar') {
      const ticket = banco.ticketPorCanal(interacao.channelId);

      if (!ticket) {
        return interacao.reply({
          embeds: [embed('erro', 'Nao e um ticket', 'Este canal nao esta registrado.')],
          ephemeral: true
        });
      }

      banco.fecharTicket(interacao.channelId);
      await interacao.reply({
        embeds: [embed('sucesso', 'Ticket fechado', 'Este canal sera apagado em 10 segundos.')]
      });

      setTimeout(() => interacao.channel.delete().catch(() => {}), 10000);
    }
  }

  function ligarRuntime(c) {
    c.on(Events.ClientReady, async (ready) => {
      banco.abrir();
      iniciarAgendador(c);

      estado.stats.servidores = ready.guilds.cache.size;
      estado.stats.comandos = c.commands ? c.commands.size : null;
      const ping = ready.ws ? ready.ws.ping : -1;
      estado.stats.latencia = (typeof ping === 'number' && ping >= 0) ? Math.round(ping) : null;
      definirStatus('online');
      logBot('sistema', `Bot conectado como ${ready.user.tag} em ${estado.stats.servidores} servidores`);

      try {
        const corpo = [...c.commands.values()].map((cmd) => {
          const dados = cmd.dados || cmd.data;
          return dados && typeof dados.toJSON === 'function' ? dados.toJSON() : dados;
        });

        await c.application.commands.set(corpo);
        logBot('sistema', `${corpo.length} comandos registrados no Discord`);
      } catch (e) {
        logBot('erro', `Falha ao registrar comandos: ${e.message}`);
      }

      pararMetricas();
      timerLatencia = setInterval(atualizarMetricas, 15000);
    });

    c.on(Events.Error, (e) => logBot('erro', e.message));
    c.on(Events.Warn, (w) => logBot('aviso', String(w)));

    c.on(Events.InteractionCreate, async (interacao) => {
      if (interacao.isChatInputCommand()) {
        const cmd = c.commands.get(interacao.commandName);
        if (!cmd) return;

        execucoes++;
        logBot('info', `/${interacao.commandName} executado por ${interacao.user.tag} (total: ${execucoes})`);

        try {
          const acao = cmd.executar || cmd.execute;
          await acao.call(cmd, interacao, contexto);
        } catch (e) {
          logBot('erro', `Erro em /${interacao.commandName}: ${e.message}`);

          const resposta = {
            embeds: [embed('erro', 'Algo deu errado', 'O comando falhou. Tente novamente em instantes.')],
            ephemeral: true
          };

          if (interacao.deferred || interacao.replied) {
            await interacao.editReply(resposta).catch(() => {});
          } else {
            await interacao.reply(resposta).catch(() => {});
          }
        }
        return;
      }

      if (interacao.isButton()) {
        try {
          await tratarBotao(interacao);
        } catch (e) {
          logBot('erro', `Erro no botao ${interacao.customId}: ${e.message}`);
        }
      }
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

    carregarTodosComandos(client);
    contexto.comandos = client.commands;
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