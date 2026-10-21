'use strict';

const { SlashCommandBuilder } = require('discord.js');
const { embed } = require('../../util/embeds');

function calcular(a, b) {
  const par = [a, b].sort().join('-');
  let soma = 0;
  for (let i = 0; i < par.length; i++) soma = (soma * 31 + par.charCodeAt(i)) % 100000;
  return soma % 101;
}

function barra(porcentagem) {
  const cheios = Math.round(porcentagem / 10);
  return '█'.repeat(cheios) + '░'.repeat(10 - cheios);
}

module.exports = {
  categoria: 'Social',

  dados: new SlashCommandBuilder()
    .setName('ship')
    .setDescription('Calcula a compatibilidade entre dois membros')
    .addUserOption((o) => o.setName('primeiro').setDescription('Primeiro membro').setRequired(true))
    .addUserOption((o) => o.setName('segundo').setDescription('Segundo membro').setRequired(true)),

  async executar(interacao) {
    const a = interacao.options.getUser('primeiro');
    const b = interacao.options.getUser('segundo');

    const porcentagem = calcular(a.id, b.id);

    let veredito = 'Melhor cada um no seu canto.';
    if (porcentagem >= 90) veredito = 'Casal perfeito! Ja pode marcar o casamento.';
    else if (porcentagem >= 70) veredito = 'Combinam muito. Vale investir.';
    else if (porcentagem >= 50) veredito = 'Tem potencial, mas precisa de esforco.';
    else if (porcentagem >= 30) veredito = 'Amizade talvez funcione melhor.';

    const e = embed('engajamento', 'Calculadora do amor', null)
      .setDescription(`${a} 💚 ${b}\n\n\`${barra(porcentagem)}\` **${porcentagem}%**\n\n${veredito}`);

    await interacao.reply({ embeds: [e] });
  }
};