'use strict';

require('dotenv').config();

const { Client, GatewayIntentBits, Events } = require('discord.js');

const client = new Client({ intents: [GatewayIntentBits.Guilds] });

client.once(Events.ClientReady, async () => {
  console.log(`Conectado como ${client.user.tag}\n`);

  console.log('--- ANTES ---');

  const globais = await client.application.commands.fetch();
  console.log(`\nGlobais (${globais.size}):`);
  for (const c of globais.values()) {
    console.log(`  /${c.name}  ·  ${c.description}`);
  }

  for (const guild of client.guilds.cache.values()) {
    const locais = await guild.commands.fetch();
    console.log(`\n${guild.name} (${locais.size}):`);
    for (const c of locais.values()) {
      console.log(`  /${c.name}  ·  ${c.description}`);
    }
  }

  console.log('\n--- LIMPANDO ---');

  await client.application.commands.set([]);
  console.log('Comandos globais removidos.');

  for (const guild of client.guilds.cache.values()) {
    await guild.commands.set([]);
    console.log(`Comandos de ${guild.name} removidos.`);
  }

  console.log('\n--- DEPOIS ---');

  const restantesGlobais = await client.application.commands.fetch();
  console.log(`Globais restantes: ${restantesGlobais.size}`);

  for (const guild of client.guilds.cache.values()) {
    const restantes = await guild.commands.fetch();
    console.log(`${guild.name}: ${restantes.size}`);
  }

  console.log('\nPronto. Agora suba o bot com npm start.');
  client.destroy();
  process.exit(0);
});

client.login(process.env.DISCORD_TOKEN);