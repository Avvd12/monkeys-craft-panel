'use strict';

const { SlashCommandBuilder } = require('discord.js');
const { embed } = require('../../util/embeds');

module.exports = {
  categoria: 'Minecraft',

  dados: new SlashCommandBuilder()
    .setName('status')
    .setDescription('Mostra o estado do servidor de Minecraft'),

  async executar(interacao) {
    await interacao.deferReply();

    let dados;
    try {
      const r = await fetch('http://127.0.0.1:3001/api/status');
      dados = await r.json();
    } catch (e) {
      return interacao.editReply({ embeds: [embed('erro', 'Servidor inacessivel', 'Nao consegui falar com o painel.')] });
    }

    const mc = dados.minecraft || dados.mc || {};
    const online = String(mc.status || '').toLowerCase() === 'online';
    const stats = mc.stats || {};

    const e = embed('minecraft', online ? 'Servidor online' : 'Servidor offline', null)
      .addFields(
        { name: 'Jogadores', value: `${stats.jogadores ?? '--'}/${stats.maxJogadores ?? '--'}`, inline: true },
        { name: 'Versao', value: stats.versao || '--', inline: true },
        { name: 'Latencia', value: stats.latencia != null ? `${stats.latencia} ms` : '--', inline: true }
      );

    await interacao.editReply({ embeds: [e] });
  }
};