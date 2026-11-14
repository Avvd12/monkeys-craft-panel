'use strict';

// Camada de servico do bot do Discord.
// Responsavel por: ciclo de vida (start/stop/restart), estado observavel,
// envio de mensagens ao canal de console e validacao das acoes do painel.
// O runtime real fica em ./client.js; aqui so existe orquestracao e tolerancia a erro.

const { createBot } = require('./client');

const ESTADO_INICIAL = {
  servico: 'discord',
  status: 'offline',
  stats: { servidores: null, comandos: null, latencia: null }
};

const ACOES_VALIDAS = new Set(['start', 'stop', 'restart']);

function normalizarConfig(cfg) {
  if (!cfg || typeof cfg !== 'object') return {};

  return {
    canalConsole: (cfg.discord && cfg.discord.consoleChannelId) || cfg.consoleChannelId || null,
    canalLogs: (cfg.discord && cfg.discord.logChannelId) || cfg.logChannelId || null,
    minecraft: cfg.minecraft || null
  };
}

function criarServicoDiscord(cfg, hub) {
  if (!hub || typeof hub.log !== 'function') {
    throw new Error('service.js: hub de logs obrigatorio');
  }

  const config = normalizarConfig(cfg);
  const bot = createBot({ hub, minecraft: config.minecraft });

  let estado = {
    ...ESTADO_INICIAL,
    stats: { ...ESTADO_INICIAL.stats }
  };

  let iniciando = null;
  let enviando = false;

  function log(nivel, mensagem) {
    hub.log('bot', nivel, mensagem);
  }

  function atualizar(patch) {
    estado = {
      ...estado,
      ...patch,
      stats: { ...estado.stats, ...((patch && patch.stats) || {}) }
    };

    if (typeof hub.status === 'function') {
      hub.status('discord', estado.status, estado.stats);
    }

    return estado;
  }

  function obterEstado() {
    const bruto = typeof bot.getState === 'function' ? bot.getState() : estado;

    estado = {
      ...estado,
      ...bruto,
      stats: { ...estado.stats, ...((bruto && bruto.stats) || {}) }
    };

    return JSON.parse(JSON.stringify(estado));
  }

  function estaRodando() {
    return estado.status === 'online';
  }

  async function iniciar() {
    // Idempotente: dois cliques no painel nao sobem dois clients.
    if (iniciando) {
      log('aviso', 'Inicializacao do bot ja em andamento');
      return iniciando;
    }

    if (estaRodando()) {
      log('aviso', 'Bot ja esta em execucao');
      return obterEstado();
    }

    iniciando = (async () => {
      try {
        atualizar({ status: 'iniciando' });
        log('sistema', 'Iniciando serviço do Discord...');

        const resultado = await bot.iniciar();

        atualizar({
          status: 'online',
          stats: (resultado && resultado.stats) || {}
        });

        log('sistema', 'Serviço do Discord iniciado');
        return obterEstado();
      } catch (e) {
        atualizar({ status: 'offline' });
        log('erro', `Falha ao iniciar Bot do Discord: ${e.message}`);
        throw e;
      } finally {
        iniciando = null;
      }
    })();

    return iniciando;
  }

  async function parar() {
    if (!estaRodando() && estado.status !== 'iniciando') {
      log('aviso', 'Bot ja esta parado');
      atualizar({ status: 'offline' });
      return obterEstado();
    }

    try {
      atualizar({ status: 'parando' });
      log('sistema', 'Parando serviço do Discord...');

      await bot.parar();

      atualizar({
        status: 'offline',
        stats: { servidores: null, comandos: null, latencia: null }
      });

      log('sistema', 'Serviço do Discord parado');
    } catch (e) {
      atualizar({ status: 'offline' });
      log('erro', `Falha ao parar Bot do Discord: ${e.message}`);
      throw e;
    }

    return obterEstado();
  }

  async function reiniciar() {
    log('sistema', 'Reiniciando serviço do Discord...');
    await parar();
    await new Promise((r) => setTimeout(r, 1500));
    return iniciar();
  }

  async function enviarMensagem(texto) {
    const limpo = String(texto == null ? '' : texto).trim();

    if (!limpo) throw new Error('Mensagem vazia');
    if (!estaRodando()) throw new Error('Bot não está conectado');
    if (enviando) throw new Error('Já existe um envio em andamento');

    enviando = true;

    try {
      const resposta = await bot.enviarMensagem(limpo);
      log('info', 'Mensagem enviada ao canal de console');
      return resposta;
    } catch (e) {
      log('erro', `Falha ao enviar mensagem ao Discord: ${e.message}`);
      throw e;
    } finally {
      enviando = false;
    }
  }

  // Usada por POST /api/services/discord/:acao
  async function executarAcao(acao) {
    const nome = String(acao == null ? '' : acao).toLowerCase();

    if (!ACOES_VALIDAS.has(nome)) {
      throw new Error(`Ação inválida: ${acao}. Use start, stop ou restart.`);
    }

    if (nome === 'start') return iniciar();
    if (nome === 'stop') return parar();
    return reiniciar();
  }

  function obterCanalConsole() {
    return config.canalConsole;
  }

  return {
    // Nomes em portugues
    iniciar,
    parar,
    reiniciar,
    enviarMensagem,
    obterEstado,
    executarAcao,
    estaRodando,
    obterCanalConsole,

    // Aliases usados pelo painel e pela API interna
    start: iniciar,
    stop: parar,
    restart: reiniciar,
    sendMessage: enviarMensagem,
    getState: obterEstado,
    executeAction: executarAcao
  };
}

module.exports = { criarServicoDiscord };