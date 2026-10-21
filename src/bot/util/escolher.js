'use strict';

const { SlashCommandBuilder } = require('discord.js');
const { embed } = require('../../util/embeds');

module.exports = {
  categoria: 'Utilidade',

  dados: new SlashCommandBuilder()
    .setName('escolher')
    .setDescription('Sorteia uma opcao entre as que voce informar')
    .addStringOption((o) => o.setName('opcoes').setDescription('Separe por barra vertical. Ex: pizza|hamburguer|sushi').setRequired(true)),

  async executar(interacao) {
    const opcoes = interacao.options.getString('opcoes')
      .split('|')
      .map((o) => o.trim())
      .filter(Boolean);

    if (opcoes.length < 2) {
      return interacao.reply({
        embeds: [embed('erro', 'Opcoes insuficientes', 'Informe pelo menos duas opcoes separadas por barra vertical.')],
        ephemeral: true
      });
    }

    const escolhida = opcoes[Math.floor(Math.random() * opcoes.length)];

    await interacao.reply({
      embeds: [embed('info', 'Minha escolha', `Entre ${opcoes.length} opcoes, eu escolho:\n\n**${escolhida}**`)]
    });
  }
};