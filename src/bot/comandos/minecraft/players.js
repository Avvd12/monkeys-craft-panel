'use strict';

const { SlashCommandBuilder } = require('discord.js');
const { embed } = require('../../util/embeds');

module.exports = {
  categoria: 'Minecraft',

  dados: new SlashCommandBuilder()
    .setName('players')
    .setDescription('Lista quem esta online no servidor de Minecraft'),

  async executar(interacao) {
    await interacao.deferReply();

    try {
      const r = await fetch('http://127.0.0.1:3001/api/status');
      const dados = await r.json();
      const mc = dados.minecraft || dados.mc || {};
      const stats = mc.stats || {};

      const lista = stats.jogadoresOnline || stats.lista || null;
      const texto = Array.isArray(lista) && lista.length
        ? lista.join(', ')
        : 'Nenhum jogador online.';

      await interacao.editReply({
        embeds: [embed('minecraft', 'Jogadores online', texto)]
      });
    } catch (e) {
      await interacao.editReply({
        embeds: [embed('erro', 'Falha', 'Nao consegui consultar o servidor.')]
      });
    }
  }
};