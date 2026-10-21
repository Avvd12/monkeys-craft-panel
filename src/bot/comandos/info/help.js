'use strict';

const { SlashCommandBuilder } = require('discord.js');
const { embed } = require('../../util/embeds');

module.exports = {
  categoria: 'Informacao',

  dados: new SlashCommandBuilder()
    .setName('help')
    .setDescription('Lista todos os comandos disponiveis'),

  async executar(interacao, ctx) {
    const grupos = new Map();

    for (const cmd of ctx.comandos.values()) {
      const json = cmd.dados.toJSON();
      const categoria = cmd.categoria || 'Geral';
      if (!grupos.has(categoria)) grupos.set(categoria, []);
      grupos.get(categoria).push(`/${json.name} · ${json.description}`);
    }

    const e = embed('info', 'Comandos disponiveis', `Total: ${ctx.comandos.size}`);

    for (const [categoria, linhas] of grupos) {
      e.addFields({ name: categoria, value: linhas.join('\n').slice(0, 1024) });
    }

    await interacao.reply({ embeds: [e], ephemeral: true });
  }
};