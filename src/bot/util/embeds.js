'use strict';

const { EmbedBuilder } = require('discord.js');

const CORES = {
  moderacao: 0xef4444,
  minecraft: 0xffc629,
  info: 0x9a9aa2,
  sucesso: 0x22c55e,
  erro: 0xef4444,
  ticket: 0x38bdf8,
  engajamento: 0x9d4edd
};

const RODAPE = { text: "Monkey's Craft" };

function embed(tipo, titulo, descricao) {
  return new EmbedBuilder()
    .setColor(CORES[tipo] || CORES.info)
    .setTitle(titulo)
    .setDescription(descricao || null)
    .setFooter(RODAPE)
    .setTimestamp();
}

function erro(titulo, descricao) {
  return embed('erro', titulo, descricao);
}

function sucesso(titulo, descricao) {
  return embed('sucesso', titulo, descricao);
}

function bloco(texto) {
  const cerca = String.fromCharCode(96).repeat(3);
  return cerca + '\n' + String(texto == null ? '' : texto).slice(0, 1900) + '\n' + cerca;
}

module.exports = { CORES, embed, erro, sucesso, bloco };