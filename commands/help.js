


const { SlashCommandBuilder, EmbedBuilder } = require('discord.js');

module.exports = {
  data: new SlashCommandBuilder()
    .setName('help')
    .setDescription('Mostra todos os comandos disponíveis do bot'),

  async execute(interaction) {
    const embed = new EmbedBuilder()
      .setColor('#00AAFF')
      .setTitle('📖 Central de Ajuda')
      .setDescription('Aqui estão todos os comandos disponíveis, organizados por categoria.')
      .addFields(
        {
          name: '👥 Comandos para Todos',
          value:
            '`/status` — Mostra se o servidor está online e quantos jogadores estão conectados\n' +
            '`/players` — Lista os nomes dos jogadores online\n' +
            '`/serverinfo` — Informações gerais do servidor\n' +
            '`/userinfo [usuário]` — Informações sobre um membro do Discord\n' +
            '`/help` — Mostra esta mensagem',
        },
        {
          name: '🛠️ Comandos de Administração',
          value:
            '`/restart` — Reinicia o servidor Minecraft (avisa na tela do jogo antes)\n' +
            '`/whitelist add|remove [jogador]` — Gerencia a whitelist\n' +
            '`/ban add|remove [jogador] [motivo]` — Bane ou desbane um jogador\n' +
            '`/kick [membro] [motivo]` — Expulsa um membro do servidor Discord\n' +
            '`/mute [membro] [tempo] [motivo]` — Silencia um membro no Discord\n' +
            '`/unmute [membro]` — Remove o silenciamento de um membro\n' +
            '`/warn [membro] [motivo]` — Aplica uma advertência formal\n' +
            '`/clear [quantidade]` — Limpa mensagens do canal\n' +
            '`/announce [titulo] [mensagem] [cor]` — Anuncia no Discord e na tela do jogo\n' +
            '`/slowmode [segundos]` — Ativa modo lento no canal',
        }
      )
      .setFooter({ text: 'Comandos de administração exigem permissão de administrador.' })
      .setTimestamp();

    await interaction.reply({ embeds: [embed] });
  },
};


