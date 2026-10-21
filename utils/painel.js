'use strict';

const { EmbedBuilder } = require('discord.js');

const COR = {
  ok: 0x22c55e,
  aviso: 0xfbbf24,
  erro: 0xef4444,
  offline: 0x6a6a72,
  info: 0x38bdf8,
  minecraft: 0xffc629,
  discord: 0xc2185b
};

const MARCA = {
  ok: '🟢',
  aviso: '🟡',
  erro: '🔴',
  offline: '⚫',
  info: '🔵',
  minecraft: '🟩',
  discord: '🟪'
};

const RODAPE = "Monkey's Craft · Painel";

class ErroPainel extends Error {
  constructor(estado, motivo) {
    super(motivo);
    this.name = 'ErroPainel';
    this.estado = estado;
    this.motivo = motivo;
  }
}

function painel({ estado = 'info', titulo, motivo, campos = [], rodape = RODAPE, autor, miniatura } = {}) {
  const e = new EmbedBuilder()
    .setColor(COR[estado] ?? COR.info)
    .setTimestamp();

  e.setTitle(`${MARCA[estado] ?? ''} ${titulo}`.trim());
  if (motivo) e.setDescription(motivo);
  if (campos.length) e.setFields(campos.filter(Boolean));
  if (autor) {
    e.setAuthor({
      name: autor.tag || autor.username || String(autor),
      iconURL: typeof autor.displayAvatarURL === 'function' ? autor.displayAvatarURL() : undefined
    });
  }
  if (rodape) e.setFooter({ text: rodape });
  if (miniatura) e.setThumbnail(miniatura);

  return e;
}

function linha(rotulo, valor) {
  return { name: `▸ ${rotulo}`, value: String(valor), inline: true };
}

// Traduz qualquer erro para uma frase limpa. Nunca expõe código, número ou stack.
function motivoDeErro(erro) {
  if (erro instanceof ErroPainel) return erro.motivo;

  const texto = String(erro?.message || erro || '');

  if (/ECONNREFUSED/i.test(texto)) return 'O servidor não está respondendo. Ele pode estar desligado ou ainda iniciando.';
  if (/ETIMEDOUT|timed?\s?out/i.test(texto)) return 'O servidor demorou demais para responder.';
  if (/ECONNRESET|socket hang up/i.test(texto)) return 'A conexão com o servidor foi interrompida.';
  if (/ENOTFOUND|EAI_AGAIN/i.test(texto)) return 'O endereço do servidor não foi encontrado.';
  if (/ENOENT/i.test(texto)) return 'O arquivo ou a pasta configurada não foi encontrada.';
  if (/EACCES|EPERM/i.test(texto)) return 'Sem permissão para acessar o arquivo ou a pasta.';
  if (/senha|password|auth/i.test(texto)) return 'A senha do RCON não foi aceita pelo servidor.';
  if (/Missing Permissions/i.test(texto)) return 'O bot não tem permissão para executar esta ação.';
  if (/Missing Access/i.test(texto)) return 'O bot não tem acesso a este canal.';
  if (/Unknown Message|Unknown Channel/i.test(texto)) return 'O canal ou a mensagem não existe mais.';
  if (/Unknown Member/i.test(texto)) return 'Esse membro não está mais no servidor.';

  return 'Não foi possível concluir a ação.';
}

function estadoDeErro(erro) {
  if (erro instanceof ErroPainel) return erro.estado;

  const texto = String(erro?.message || erro || '');
  if (/ECONNREFUSED|ETIMEDOUT|ECONNRESET|ENOTFOUND/i.test(texto)) return 'offline';

  return 'erro';
}

async function responderErro(interaction, erro, titulo = 'Ação não concluída') {
  const payload = {
    embeds: [painel({
      estado: estadoDeErro(erro),
      titulo,
      motivo: motivoDeErro(erro)
    })]
  };

  if (interaction.deferred || interaction.replied) return interaction.editReply(payload).catch(() => {});
  return interaction.reply({ ...payload, ephemeral: true }).catch(() => {});
}

module.exports = { painel, linha, ErroPainel, motivoDeErro, responderErro, COR, MARCA, RODAPE };