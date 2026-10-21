'use strict';

const { EmbedBuilder } = require('discord.js');

const CORES = {
  ok: 0x22c55e,
  info: 0x38bdf8,
  aviso: 0xfbbf24,
  erro: 0xef4444,
  neutro: 0x9a9aa2,
  minecraft: 0xffc629,
  discord: 0xc2185b
};

function embed({ cor = 'info', titulo, descricao, campos = [], autor, rodape, miniatura } = {}) {
  const e = new EmbedBuilder()
    .setColor(CORES[cor] ?? CORES.info)
    .setTimestamp();

  if (titulo) e.setTitle(titulo);
  if (descricao) e.setDescription(descricao);
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

const sucesso = (titulo, campos, autor) => embed({ cor: 'ok', titulo, campos, autor });
const falha = (titulo, descricao) => embed({ cor: 'erro', titulo, descricao });
const aviso = (titulo, campos, autor) => embed({ cor: 'aviso', titulo, campos, autor });

module.exports = { embed, sucesso, falha, aviso, CORES };