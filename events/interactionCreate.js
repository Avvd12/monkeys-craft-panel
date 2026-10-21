'use strict';

module.exports = {
  name: 'interactionCreate',
  async execute(interaction) {
    if (!interaction.isChatInputCommand()) return;

    const comando = interaction.client.commands?.get(interaction.commandName);
    if (!comando) return;

    const executar = comando.execute || comando.run;

    try {
      await executar.call(comando, interaction);
    } catch (erro) {
      console.error(erro);
      const aviso = { content: 'Erro ao executar o comando.', ephemeral: true };
      if (interaction.replied || interaction.deferred) await interaction.followUp(aviso);
      else await interaction.reply(aviso);
    }
  }
};