


// Monta comandos RCON de título na tela (title) e mensagem colorida no chat (tellraw)

function buildTitleCommands(text, subtitle, color = 'gold') {
  const commands = [];
  commands.push('title @a times 10 100 20');
  if (subtitle) {
    commands.push(`title @a subtitle ${JSON.stringify({ text: subtitle, color: 'white' })}`);
  }
  commands.push(`title @a title ${JSON.stringify({ text, color, bold: true })}`);
  return commands;
}

function buildChatMessage(text, color = 'yellow', bold = false) {
  return `tellraw @a ${JSON.stringify({ text, color, bold })}`;
}

module.exports = { buildTitleCommands, buildChatMessage };


