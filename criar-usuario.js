'use strict';

const fs = require('fs');
const path = require('path');
const bcrypt = require('bcrypt');
const readline = require('readline');

const ARQUIVO = path.join(__dirname, 'usuarios.json');
const CARGOS = ['admin', 'moderador', 'visualizador'];

function lerUsuarios() {
  try {
    const dados = JSON.parse(fs.readFileSync(ARQUIVO, 'utf8'));
    return dados && typeof dados === 'object' ? dados : {};
  } catch {
    return {};
  }
}

function salvar(usuarios) {
  fs.writeFileSync(ARQUIVO, JSON.stringify(usuarios, null, 2), 'utf8');
}

function perguntar(texto) {
  return new Promise((resolve) => {
    const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
    rl.question(texto, (resposta) => {
      rl.close();
      resolve(resposta.trim());
    });
  });
}

function lerSenhaOculta(pergunta) {
  return new Promise((resolve) => {
    process.stdout.write(pergunta);

    const stdin = process.stdin;
    const eraRaw = stdin.isRaw;
    stdin.setRawMode(true);
    stdin.resume();
    stdin.setEncoding('utf8');

    let senha = '';

    function aoReceber(ch) {
      if (ch === '\r' || ch === '\n') {
        stdin.setRawMode(eraRaw || false);
        stdin.pause();
        stdin.removeListener('data', aoReceber);
        process.stdout.write('\n');
        return resolve(senha);
      }

      if (ch === '\u0003') {
        process.stdout.write('\n');
        process.exit(130);
      }

      if (ch === '\u007f' || ch === '\b') {
        if (senha.length > 0) {
          senha = senha.slice(0, -1);
          process.stdout.write('\b \b');
        }
        return;
      }

      if (ch >= ' ') {
        senha += ch;
        process.stdout.write('*');
      }
    }

    stdin.on('data', aoReceber);
  });
}

async function main() {
  let usuario = String(process.argv[2] || '').trim().toLowerCase();
  let senha = String(process.argv[3] || '');
  let cargo = String(process.argv[4] || '').trim().toLowerCase();

  if (!usuario) usuario = (await perguntar('Usuario: ')).toLowerCase();

  if (!/^[a-z0-9._-]{3,24}$/.test(usuario)) {
    console.error('Usuario invalido. Use de 3 a 24 caracteres: letras minusculas, numeros, ponto, underline ou hifen.');
    process.exit(1);
  }

  if (!senha) {
    senha = await lerSenhaOculta('Senha: ');
    const confirma = await lerSenhaOculta('Confirme a senha: ');
    if (senha !== confirma) {
      console.error('As senhas nao batem.');
      process.exit(1);
    }
  }

  if (senha.length < 8) {
    console.error('A senha precisa ter pelo menos 8 caracteres.');
    process.exit(1);
  }

  if (!cargo) {
    console.log('Cargos disponiveis: ' + CARGOS.join(', '));
    cargo = (await perguntar('Cargo (padrao admin): ')).toLowerCase() || 'admin';
  }

  if (!CARGOS.includes(cargo)) {
    console.error('Cargo invalido. Use: ' + CARGOS.join(', '));
    process.exit(1);
  }

  const usuarios = lerUsuarios();
  const jaExiste = Boolean(usuarios[usuario]);

  usuarios[usuario] = {
    nome: usuario,
    hash: await bcrypt.hash(senha, 12),
    cargo,
    criadoEm: usuarios[usuario]?.criadoEm || new Date().toISOString(),
    atualizadoEm: new Date().toISOString()
  };

  salvar(usuarios);

  console.log(
    jaExiste
      ? `Senha de "${usuario}" atualizada. Cargo: ${cargo}.`
      : `Usuario "${usuario}" criado. Cargo: ${cargo}.`
  );
}

main().catch((e) => {
  console.error('Falha ao cadastrar:', e.message);
  process.exit(1);
});