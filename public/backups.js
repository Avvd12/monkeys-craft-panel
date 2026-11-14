'use strict';

(function () {
  const API = '/api/backups';

  const el = (id) => document.getElementById(id);

  const secao = el('sec-backups');
  if (!secao) return;

  const corpo = el('bk-corpo');
  const resumo = el('bk-resumo');
  const botaoCriar = el('bk-criar');
  const progresso = el('bk-progresso');
  const barraFill = el('bk-barra-fill');
  const progressoTxt = el('bk-progresso-txt');
  const seletor = el('bk-seletor');
  const arvore = el('bk-arvore');
  const filtro = el('bk-filtro');
  const consoleEl = el('bk-console');
  const modal = el('bk-modal');
  const modalTitulo = el('bk-modal-titulo');
  const modalCorpo = el('bk-modal-corpo');

  let cache = [];
  let timer = null;
  let idAberto = null;

  function tamanho(bytes) {
    const n = Number(bytes) || 0;
    if (n < 1024) return n + ' B';
    if (n < 1048576) return (n / 1024).toFixed(1) + ' KB';
    if (n < 1073741824) return (n / 1048576).toFixed(1) + ' MB';
    return (n / 1073741824).toFixed(2) + ' GB';
  }

  function dataCurta(iso) {
    try {
      return new Date(iso).toLocaleString('pt-BR');
    } catch (e) {
      return iso;
    }
  }

  function escreverConsole(linha) {
    if (!consoleEl) return;
    const agora = new Date().toLocaleTimeString('pt-BR');
    consoleEl.textContent += `[${agora}] ${linha}\n`;
    consoleEl.scrollTop = consoleEl.scrollHeight;
  }

  async function pedir(url, opcoes) {
    const resposta = await fetch(url, opcoes);

    if (!resposta.ok) {
      let detalhe = `HTTP ${resposta.status}`;
      try {
        const corpo = await resposta.json();
        if (corpo && corpo.erro) detalhe = corpo.erro;
      } catch (e) {
        // resposta sem JSON
      }
      throw new Error(detalhe);
    }

    return resposta.json();
  }

  function renderizar() {
    if (!cache.length) {
      corpo.innerHTML = '<tr><td colspan="6" class="bk-vazio">Nenhum backup ainda.</td></tr>';
      return;
    }

    corpo.innerHTML = cache
      .map((b) => {
        const status = b.arquivoPresente
          ? b.verificado
            ? '<span class="bk-ok">ok</span>'
            : '<span class="bk-alerta">nao verificado</span>'
          : '<span class="bk-erro">arquivo ausente</span>';

        return `<tr>
          <td class="bk-mono">${b.id}</td>
          <td>${dataCurta(b.criadoEm)}</td>
          <td>${b.tipo}</td>
          <td>${tamanho(b.bytes)}</td>
          <td>${status}</td>
          <td class="bk-acoes">
            <button class="bk-btn" data-ver="${b.id}">Ver</button>
            <button class="bk-btn" data-restaurar="${b.id}">Restaurar</button>
            <button class="bk-btn bk-perigo" data-excluir="${b.id}">Excluir</button>
          </td>
        </tr>`;
      })
      .join('');
  }

  function renderizarResumo(dados) {
    const ultimo = dados.ultimo
      ? `ultimo em ${dataCurta(dados.ultimo.criadoEm)}`
      : 'nenhum backup';

    resumo.textContent = `${dados.quantidade} backup(s) · ${tamanho(dados.totalBytes)} ocupados · ${tamanho(
      dados.livreBytes
    )} livres · ${ultimo}`;
  }

  async function carregar() {
    try {
      const [lista, dados] = await Promise.all([
        pedir(API),
        pedir(`${API}/resumo`)
      ]);

      cache = lista;
      renderizar();
      renderizarResumo(dados);
      preencherSeletor();
    } catch (e) {
      corpo.innerHTML = `<tr><td colspan="6" class="bk-vazio">Erro ao carregar: ${e.message}</td></tr>`;
    }
  }

  function preencherSeletor() {
    if (!seletor) return;
    const anterior = seletor.value;

    seletor.innerHTML = cache
      .map((b) => `<option value="${b.id}">${b.id} · ${tamanho(b.bytes)}</option>`)
      .join('');

    if (anterior && cache.some((b) => b.id === anterior)) {
      seletor.value = anterior;
    }
  }

  function iniciarProgresso() {
    if (timer) clearInterval(timer);
    progresso.hidden = false;
    barraFill.style.width = '0%';

    timer = setInterval(async () => {
      try {
        const estado = await pedir(`${API}/estado`);

        if (!estado.operacao) {
          pararProgresso();
          await carregar();
          escreverConsole('Operacao concluida.');
          return;
        }

        const faixa = ['pausando-autosave', 'salvando', 'compactando', 'verificando'];
        const indice = faixa.indexOf(estado.etapa);
        const base = indice >= 0 ? (indice / faixa.length) * 100 : 0;
        const fracao = estado.progresso ? 5 : 0;

        barraFill.style.width = `${Math.min(95, base + fracao)}%`;
        progressoTxt.textContent = `${estado.operacao} · ${estado.etapa || 'iniciando'}`;
      } catch (e) {
        pararProgresso();
      }
    }, 2000);
  }

  function pararProgresso() {
    if (timer) {
      clearInterval(timer);
      timer = null;
    }
    barraFill.style.width = '100%';
    progresso.hidden = true;
  }

  async function criarAgora() {
    botaoCriar.disabled = true;
    escreverConsole('Iniciando backup...');
    iniciarProgresso();

    try {
      const dados = await pedir(API, { method: 'POST' });
      escreverConsole(`Backup ${dados.id} criado (${tamanho(dados.bytes)}).`);
    } catch (e) {
      escreverConsole(`Falha: ${e.message}`);
    } finally {
      botaoCriar.disabled = false;
      pararProgresso();
      await carregar();
    }
  }

  async function excluir(id) {
    if (!confirm(`Excluir o backup ${id}? Essa acao nao pode ser desfeita.`)) return;

    try {
      await pedir(`${API}/${encodeURIComponent(id)}`, { method: 'DELETE' });
      escreverConsole(`Backup ${id} excluido.`);
      await carregar();
    } catch (e) {
      escreverConsole(`Falha ao excluir: ${e.message}`);
    }
  }

  async function restaurar(id) {
    const texto = [
      `Restaurar o backup ${id}?`,
      '',
      'O servidor precisa estar desligado.',
      'Os mundos atuais vao para a pasta de rollback e um backup de seguranca e criado antes.',
      '',
      'Digite RESTAURAR para confirmar.'
    ].join('\n');

    const resposta = prompt(texto);
    if (!resposta || resposta.trim().toUpperCase() !== 'RESTAURAR') {
      escreverConsole('Restauracao cancelada.');
      return;
    }

    escreverConsole(`Restaurando ${id}...`);
    iniciarProgresso();

    try {
      await pedir(`${API}/${encodeURIComponent(id)}/restaurar`, { method: 'POST' });
      escreverConsole(`Restauracao de ${id} concluida. Inicie o servidor para validar.`);
    } catch (e) {
      escreverConsole(`Falha: ${e.message}`);
    } finally {
      pararProgresso();
      await carregar();
    }
  }

  async function abrirConteudo(id) {
    idAberto = id;
    arvore.innerHTML = '<span class="bk-vazio">Carregando...</span>';

    try {
      const itens = await pedir(`${API}/${encodeURIComponent(id)}/conteudo`);
      const termo = (filtro && filtro.value ? filtro.value : '').toLowerCase();
      const lista = termo ? itens.filter((i) => i.nome.toLowerCase().includes(termo)) : itens;

      if (!lista.length) {
        arvore.innerHTML = '<span class="bk-vazio">Nada encontrado.</span>';
        return;
      }

      const limite = 500;
      const html = lista
        .slice(0, limite)
        .map(
          (i) =>
            `<div class="bk-item" data-arquivo="${i.nome}">
              <span class="bk-caminho">${i.nome}</span>
              <span class="bk-tam">${tamanho(i.bytes)}</span>
            </div>`
        )
        .join('');

      const aviso =
        lista.length > limite
          ? `<div class="bk-vazio">Mostrando ${limite} de ${lista.length}. Refine o filtro.</div>`
          : '';

      arvore.innerHTML = html + aviso;
    } catch (e) {
      arvore.innerHTML = `<span class="bk-vazio">Erro: ${e.message}</span>`;
    }
  }

  async function abrirArquivo(nome) {
    if (!idAberto) return;

    modalTitulo.textContent = nome;
    modalCorpo.textContent = 'Carregando...';
    modal.hidden = false;

    try {
      const url = `${API}/${encodeURIComponent(idAberto)}/arquivo?nome=${encodeURIComponent(nome)}`;
      const resposta = await fetch(url);

      if (!resposta.ok) {
        const corpo = await resposta.json().catch(() => ({}));
        throw new Error(corpo.erro || `HTTP ${resposta.status}`);
      }

      modalCorpo.textContent = await resposta.text();
    } catch (e) {
      modalCorpo.textContent = `Nao foi possivel abrir: ${e.message}`;
    }
  }

  // Eventos
  if (botaoCriar) botaoCriar.addEventListener('click', criarAgora);

  corpo.addEventListener('click', (ev) => {
    const ver = ev.target.getAttribute('data-ver');
    const rest = ev.target.getAttribute('data-restaurar');
    const exc = ev.target.getAttribute('data-excluir');

    if (ver) {
      document.querySelectorAll('.bk-tab').forEach((b) => b.classList.remove('ativo'));
      document.querySelector('.bk-tab[data-tab="arquivos"]').classList.add('ativo');
      el('bk-tab-lista').hidden = true;
      el('bk-tab-arquivos').hidden = false;
      if (seletor) seletor.value = ver;
      abrirConteudo(ver);
    }

    if (rest) restaurar(rest);
    if (exc) excluir(exc);
  });

  document.querySelectorAll('.bk-tab').forEach((botao) => {
    botao.addEventListener('click', () => {
      document.querySelectorAll('.bk-tab').forEach((b) => b.classList.remove('ativo'));
      botao.classList.add('ativo');

      ['lista', 'arquivos', 'console'].forEach((nome) => {
        el(`bk-tab-${nome}`).hidden = nome !== botao.dataset.tab;
      });

      if (botao.dataset.tab === 'arquivos' && seletor && seletor.value) {
        abrirConteudo(seletor.value);
      }
    });
  });

  if (seletor) {
    seletor.addEventListener('change', () => abrirConteudo(seletor.value));
  }

  if (filtro) {
    filtro.addEventListener('input', () => {
      if (idAberto) abrirConteudo(idAberto);
    });
  }

  arvore.addEventListener('click', (ev) => {
    const item = ev.target.closest('[data-arquivo]');
    if (item) abrirArquivo(item.getAttribute('data-arquivo'));
  });

  el('bk-modal-fechar').addEventListener('click', () => {
    modal.hidden = true;
  });

  modal.addEventListener('click', (ev) => {
    if (ev.target === modal) modal.hidden = true;
  });

  carregar();
  escreverConsole('Console de backups pronto.');
})();