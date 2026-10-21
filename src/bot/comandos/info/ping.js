'use strict';

const { SlashCommandBuilder } = require('discord.js');
const { embed } = require('../../util/embeds');

module.exports = {
  categoria: 'Informacao',

  dados: new SlashCommandBuilder()
    .setName('ping')
    .setDescription('Mostra a latencia do bot e do painel'),

  async executar(interacao) {
    const inicio = Date.now();
    await interacao.deferReply();

    let painel = 'sem resposta';
    try {
      const r = await fetch('http://127.0.0.1:3001/api/status');
      painel = r.ok ? `${Date.now() - inicio} ms` : `erro ${r.status}`;
    } catch (e) {
      painel = 'offline';
    }

    const e = embed('info', 'Latencia', null)
      .addFields(
        { name: 'Discord', value: `${Math.round(interacao.client.ws.ping)} ms`, inline: true },
        { name: 'Painel', value: painel, inline: true }
      );

    await interacao.editReply({ embeds: [e] });
  }
};