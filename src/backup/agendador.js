'use strict';

const cronBruto = require('node-cron');
const cron = (typeof cronBruto.schedule === 'function')
  ? cronBruto
  : (cronBruto.default || cronBruto);

const backup = require('../minecraft/backup');
const config = require('../../config.json');

let tarefa = null;
let monitor = null;

function log(hub, nivel, mensagem) {
  if (!hub || typeof hub.log !== 'function') return;
  try {
    hub.log('backup', nivel, mensagem);
  } catch (e) {
    // silencioso
  }
}

function agendamento() {
  return (config.backups && config.backups.agendamento) || null;
}

// Reagenda do zero. Aceita expressao cron ou null para desligar.
function aplicar(expressao, { minecraft = null, hub = null } = {}) {
  if (tarefa) {
    tarefa.stop();
    tarefa = null;
  }

  if (!expressao) {
    log(hub, 'info', 'Agendamento de backup desativado.');
    return { ativo: false };
  }

  if (!cron.validate(expressao)) {
    log(hub, 'erro', `Expressao cron invalida: ${expressao}`);
    return { ativo: false, erro: 'Expressao invalida' };
  }

  const fuso = (config.backups && config.backups.timezone) || 'America/Sao_Paulo';

  tarefa = cron.schedule(
    expressao,
    () => {
      backup
        .criar({ tipo: 'auto', origem: 'cron', minecraft, hub })
        .catch((e) => log(hub, 'erro', `Backup agendado falhou: ${e.message}`));
    },
    { timezone: fuso }
  );

  log(hub, 'info', `Backup agendado: ${expressao} (${fuso})`);
  return { ativo: true, expressao, timezone: fuso };
}

// Tenta descobrir a contagem de jogadores online por tres caminhos.
// Retorna null quando nenhum esta disponivel.
async function contarJogadores(minecraft) {
  if (!minecraft) return null;

  try {
    if (typeof minecraft.obterJogadores === 'function') {
      const lista = await minecraft.obterJogadores();
      if (Array.isArray(lista)) return lista.length;
    }
  } catch (e) {
    // tenta o proximo
  }

  try {
    if (typeof minecraft.executar === 'function') {
      const resposta = await minecraft.executar('list');
      const texto = typeof resposta === 'string' ? resposta : JSON.stringify(resposta || '');
      const casou = texto.match(/There are (\d+) of a max/);
      if (casou) return Number(casou[1]);
    }
  } catch (e) {
    return null;
  }

  return null;
}

// Gatilho por momento: servidor sem jogadores por N minutos.
function iniciarMonitor({ minecraft = null, hub = null } = {}) {
  pararMonitor();

  const cfg = config.backups || {};
  if (cfg.backupComJogadoresZerados === false) return;

  const intervaloMin = Number(cfg.intervaloMonitorMin) || 10;
  const minimoHoras = Number(cfg.minimoHorasEntreBackups) || 6;

  let zeradoDesde = null;

  monitor = setInterval(async () => {
    if (backup.estado().operacao) return;

    const online = await backup.garantirAutosave({ minecraft, hub: null });

    if (!online) {
      zeradoDesde = null;
      return;
    }

    const jogadores = await contarJogadores(minecraft);

    if (jogadores === null) {
      zeradoDesde = null;
      return;
    }

    if (jogadores > 0) {
      zeradoDesde = null;
      return;
    }

    if (!zeradoDesde) zeradoDesde = Date.now();

    const minutosZerado = (Date.now() - zeradoDesde) / 60000;

    if (minutosZerado < intervaloMin) return;

    const itens = await backup.listar();
    const ultimo = itens.find((b) => b.tipo === 'auto');

    if (ultimo) {
      const horas = (Date.now() - new Date(ultimo.criadoEm).getTime()) / 3600000;
      if (horas < minimoHoras) return;
    }

    zeradoDesde = null;

    backup
      .criar({ tipo: 'auto', origem: 'servidor-vazio', minecraft, hub })
      .catch((e) => log(hub, 'erro', `Backup por servidor vazio falhou: ${e.message}`));
  }, intervaloMin * 60000);

  log(hub, 'info', `Monitor de servidor vazio ativo (${intervaloMin} min de espera).`);
}

function pararMonitor() {
  if (monitor) {
    clearInterval(monitor);
    monitor = null;
  }
}

function iniciar({ minecraft = null, hub = null } = {}) {
  const resultado = aplicar(agendamento(), { minecraft, hub });
  iniciarMonitor({ minecraft, hub });
  return resultado;
}

function parar() {
  if (tarefa) {
    tarefa.stop();
    tarefa = null;
  }
  pararMonitor();
}

module.exports = { iniciar, parar, aplicar, iniciarMonitor, pararMonitor };