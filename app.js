/* Portal Auxílio-Bolsa TJMA — app.js
 *
 * O aplicativo do servidor. Três responsabilidades, nesta ordem de
 * importância:
 *
 *   1. NÃO DEIXAR PERDER PRAZO. Tudo mais é secundário. Por isso os prazos são
 *      guardados no aparelho assim que chegam, e a contagem é recalculada
 *      localmente a cada abertura — um app que só sabe o prazo quando tem
 *      internet falha exatamente no dia em que a pessoa está no fórum sem sinal.
 *   2. MOSTRAR O PERCURSO. O que já foi cumprido, com carimbo, e o que falta.
 *   3. AVISAR A COORDENADORIA. Envio que sobrevive à falta de rede, em fila.
 *
 * UMA DECISÃO QUE PRECISA ESTAR EXPLÍCITA: OS AVISOS
 * Não existe alarme garantido em PWA sem servidor de push. O `setTimeout` morre
 * junto com a aba; o service worker é reciclado em segundos. O que este app faz
 * é honesto e funciona:
 *
 *   - agenda os avisos com `setTimeout` enquanto o app está aberto;
 *   - registra `periodicSync`, que o Chrome no Android dispara de tempos em
 *     tempos depois que o app é instalado (a periodicidade é do navegador,
 *     não nossa);
 *   - reavalia TUDO na abertura e avisa na hora o que estourou.
 *
 * A tela de ajustes diz isso ao usuário, em vez de prometer alarme de relógio.
 * Num app cuja função é não deixar ninguém perder prazo, prometer confiabilidade
 * que não existe é o defeito mais caro possível.
 */
'use strict';

// ---------------------------------------------------------------------------
// CONFIGURAÇÃO
// ---------------------------------------------------------------------------
/* A URL do App da Web do Apps Script. É o único ponto de rede do app.
 *
 * Por que Apps Script e não a API do Sheets direto: a chave da conta de
 * serviço NÃO PODE viver num app público. Qualquer pessoa abriria o código
 * fonte e teria escrita na planilha institucional inteira. O Apps Script roda
 * como o dono da planilha, do lado do Google, e o navegador só recebe o
 * recorte do próprio servidor. */
const API = (window.CONFIG_PORTAL && window.CONFIG_PORTAL.api) || '';

const CHAVES = {
  sessao: 'bolsa.sessao',
  jornada: 'bolsa.jornada',
  ajustes: 'bolsa.ajustes',
  fila: 'bolsa.fila',
  adiados: 'bolsa.adiados',
  admin: 'bolsa.admin'
};

const AJUSTES_PADRAO = { som: true, vibrar: true, whatsapp: '', consente: false,
                         consentidoEm: '' };

let sessao = null;
let jornada = null;
let ajustes = Object.assign({}, AJUSTES_PADRAO);
let agendamentos = [];
let promptInstalacao = null;

const $ = seletor => document.querySelector(seletor);
const papel = nome => document.querySelector(`[data-papel="${nome}"]`);
const campo = nome => document.querySelector(`[data-campo="${nome}"]`);
const $$ = seletor => Array.from(document.querySelectorAll(seletor));

// ---------------------------------------------------------------------------
// ARMAZENAMENTO
// ---------------------------------------------------------------------------
function guardar(chave, valor) {
  try { localStorage.setItem(chave, JSON.stringify(valor)); }
  catch (erro) { console.warn('Sem espaço para guardar', chave, erro); }
}

function recuperar(chave, padrao) {
  try {
    const bruto = localStorage.getItem(chave);
    return bruto ? JSON.parse(bruto) : padrao;
  } catch (erro) { return padrao; }
}

// ---------------------------------------------------------------------------
// AVISO FLUTUANTE E SOM
// ---------------------------------------------------------------------------
let tempoTorradeira = null;

function torrada(texto, tom, duracao) {
  const alvo = papel('torradeira');
  alvo.textContent = texto;
  alvo.dataset.tom = tom || '';
  alvo.classList.add('visivel');
  clearTimeout(tempoTorradeira);
  tempoTorradeira = setTimeout(() => alvo.classList.remove('visivel'),
                               duracao || 3600);
}

/* O som é sintetizado, não é arquivo: um .mp3 seria mais um recurso para
 * baixar, cachear e falhar. Dois tons curtos ascendentes para confirmação,
 * descendentes para alerta — a diferença é reconhecível sem olhar a tela. */
let contextoAudio = null;

function tocar(tipo) {
  if (!ajustes.som) return;
  try {
    contextoAudio = contextoAudio ||
      new (window.AudioContext || window.webkitAudioContext)();
    if (contextoAudio.state === 'suspended') contextoAudio.resume();

    const notas = tipo === 'alerta' ? [660, 440] : [523.25, 783.99];
    notas.forEach((frequencia, i) => {
      const oscilador = contextoAudio.createOscillator();
      const ganho = contextoAudio.createGain();
      oscilador.type = 'sine';
      oscilador.frequency.value = frequencia;
      const inicio = contextoAudio.currentTime + i * 0.16;
      // Envelope suave: som que começa e termina no talo estala no alto-falante
      // do celular.
      ganho.gain.setValueAtTime(0, inicio);
      ganho.gain.linearRampToValueAtTime(0.22, inicio + 0.02);
      ganho.gain.exponentialRampToValueAtTime(0.001, inicio + 0.28);
      oscilador.connect(ganho).connect(contextoAudio.destination);
      oscilador.start(inicio);
      oscilador.stop(inicio + 0.3);
    });
  } catch (erro) { /* aparelho sem áudio disponível não é falha do app */ }
}

function vibrar(padrao) {
  if (!ajustes.vibrar || !navigator.vibrate) return;
  try { navigator.vibrate(padrao || [140]); } catch (erro) { /* sem motor */ }
}

// ---------------------------------------------------------------------------
// NAVEGAÇÃO
// ---------------------------------------------------------------------------
function irPara(id) {
  $$('.tela').forEach(tela => tela.classList.toggle('ativa', tela.id === id));
  window.scrollTo({ top: 0, behavior: 'instant' in window ? 'instant' : 'auto' });
}

function abrirPainel(id) {
  $$('.aba').forEach(aba => aba.classList.toggle('ativa', aba.dataset.painel === id));
  $$('.painel').forEach(p => p.classList.toggle('ativo', p.id === id));
}

$$('[data-ir]').forEach(botao => {
  botao.addEventListener('click', () => irPara(botao.dataset.ir));
});

$$('.aba').forEach(aba => {
  aba.addEventListener('click', () => abrirPainel(aba.dataset.painel));
});

// ---------------------------------------------------------------------------
// REDE
// ---------------------------------------------------------------------------
/* Apps Script recusa preflight CORS com application/json. `text/plain` é
 * requisição simples, passa sem preflight, e chega igual em e.postData. */
async function chamarApi(acao, corpo) {
  if (!API) {
    return { ok: false, erro: 'O endereço do serviço não foi configurado ' +
                              'neste aplicativo. Avise a Coordenadoria.' };
  }
  const alvo = API + (API.indexOf('?') >= 0 ? '&' : '?') + 'acao=' +
               encodeURIComponent(acao);
  try {
    const resposta = await fetch(alvo, {
      method: 'POST',
      headers: { 'Content-Type': 'text/plain;charset=utf-8' },
      body: JSON.stringify(Object.assign({ acao }, corpo || {})),
      redirect: 'follow'
    });
    if (!resposta.ok) return { ok: false, erro: 'O serviço respondeu ' + resposta.status + '.' };
    return await resposta.json();
  } catch (erro) {
    return { ok: false, offline: true,
             erro: 'Sem conexão com o serviço agora.' };
  }
}

// ---------------------------------------------------------------------------
// ACESSO
// ---------------------------------------------------------------------------
function msgAcesso(texto, tom) {
  const alvo = papel('msg-acesso');
  alvo.textContent = texto;
  alvo.dataset.tom = tom || '';
}

/* ---------------------------------------------------------------------------
 * ENTRADA — planilha primeiro, arquivo local depois
 *
 * A ORDEM NÃO É ARBITRÁRIA. A planilha é a fonte de verdade: é lá que o código
 * é regerado quando alguém perde o acesso, e é lá que um acesso é desativado
 * quando um servidor sai do programa. O arquivo local é uma FOTOGRAFIA do
 * momento em que foi publicado.
 *
 * Se o arquivo fosse consultado primeiro, um código já revogado continuaria
 * entrando até alguém lembrar de republicar o arquivo. Consultando a planilha
 * primeiro, a revogação vale imediatamente sempre que houver internet — e o
 * arquivo só entra quando não há resposta nenhuma.
 *
 * O QUE O FALLBACK DÁ, E O QUE NÃO DÁ
 * Ele deixa ENTRAR. Não traz dado novo: a jornada continua vindo da planilha, e
 * sem ela o app mostra a última cópia guardada NAQUELE aparelho. Quem nunca
 * entrou com internet vai logar e ver uma tela vazia — e o app diz isso, em vez
 * de deixar a pessoa achando que não tem nada registrado a favor dela.
 * ------------------------------------------------------------------------- */

/** Mesmo cálculo da ferramenta que gerou o acessos.js. Se divergirem, nenhum
 *  código confere — e o sintoma seria "código incorreto" para um código certo,
 *  que é dos erros mais difíceis de diagnosticar. */
async function hashLocal(codigo, matricula) {
  const conf = window.ACESSOS_LOCAIS;
  if (!conf || !window.CONFIG_PORTAL || !window.CONFIG_PORTAL.sal) return '';
  try {
    const chave = await crypto.subtle.importKey(
      'raw', new TextEncoder().encode(codigo),
      { name: 'PBKDF2' }, false, ['deriveBits']);
    const bits = await crypto.subtle.deriveBits({
      name: 'PBKDF2',
      salt: new TextEncoder().encode(window.CONFIG_PORTAL.sal + '|' + matricula),
      iterations: conf.iteracoes || 150000,
      hash: 'SHA-256'
    }, chave, 256);
    return [...new Uint8Array(bits)]
      .map(b => b.toString(16).padStart(2, '0')).join('');
  } catch (erro) {
    return '';
  }
}

/** Comparação em tempo constante: um `===` sai no primeiro caractere diferente,
 *  e essa diferença é mensurável. */
function iguais(a, b) {
  a = String(a || ''); b = String(b || '');
  if (a.length !== b.length || !a.length) return false;
  let diferenca = 0;
  for (let i = 0; i < a.length; i++) diferenca |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return diferenca === 0;
}

async function entrarLocalmente(matricula, codigo) {
  const conf = window.ACESSOS_LOCAIS;
  if (!conf || !conf.entradas) {
    return { ok: false, erro: 'Sem conexão com o serviço, e este aplicativo não ' +
                              'tem a lista local de acessos.' };
  }
  const entrada = conf.entradas[matricula];
  if (!entrada) {
    return { ok: false, erro: 'Sem conexão agora, e esta matrícula não está na ' +
                              'lista guardada no aplicativo. Tente de novo com internet.' };
  }
  const calculado = await hashLocal(codigo, matricula);
  if (!calculado || !iguais(calculado, entrada.h)) {
    return { ok: false, erro: 'Código de acesso incorreto.' };
  }
  return { ok: true, nome: entrada.n, local: true,
           // Token só desta sessão: sem a planilha não há como emitir o token
           // real, e inventar um que o backend não reconhece só adiaria o erro.
           token: '' };
}

papel('entrar').addEventListener('click', async () => {
  const matricula = campo('matricula').value.replace(/\D/g, '');
  const codigo = campo('codigo').value.trim().toUpperCase();

  if (!matricula) { msgAcesso('Informe sua matrícula.', 'erro'); return; }
  if (!codigo) { msgAcesso('Informe o código de acesso.', 'erro'); return; }

  msgAcesso('Verificando…', '');
  let saida = await chamarApi('entrar', { matricula, codigo });

  // Só cai no arquivo local quando o serviço não respondeu. Código recusado
  // pelo serviço é código recusado, ponto — tentar de novo localmente
  // ressuscitaria acesso revogado.
  if (!saida.ok && (saida.offline || !navigator.onLine)) {
    msgAcesso('Sem conexão. Conferindo com a lista guardada no aplicativo…', '');
    saida = await entrarLocalmente(matricula, codigo);
  }

  if (!saida.ok) {
    msgAcesso(saida.erro || 'Não consegui entrar.', 'erro');
    vibrar([80, 60, 80]);
    return;
  }

  sessao = { matricula, token: saida.token || '', nome: saida.nome,
             local: Boolean(saida.local),
             entradaEm: new Date().toISOString() };
  if (campo('lembrar').checked) guardar(CHAVES.sessao, sessao);

  msgAcesso('', '');
  campo('codigo').value = '';
  await carregarJornada(true);
  irPara('jornada');
  tocar('ok');

  if (saida.local) {
    const guardada = recuperar(CHAVES.jornada, null);
    torrada(guardada
      ? 'Entrou sem internet. Mostrando a última cópia guardada.'
      : 'Entrou sem internet, e este aparelho ainda não tem seus dados. ' +
        'Abra o app com conexão para carregá-los.', 'alerta', 6000);
  }
});

campo('codigo').addEventListener('keydown', evento => {
  if (evento.key === 'Enter') papel('entrar').click();
});

papel('sair').addEventListener('click', () => {
  if (adminSessao) { sairDoModoAdmin(); return; }
  sessao = null;
  localStorage.removeItem(CHAVES.sessao);
  irPara('abertura');
  torrada('Você saiu. Seus dados guardados neste aparelho continuam aqui.', '');
});

papel('apagar-local').addEventListener('click', () => {
  Object.values(CHAVES).forEach(chave => localStorage.removeItem(chave));
  sessao = null; jornada = null;
  ajustes = Object.assign({}, AJUSTES_PADRAO);
  irPara('abertura');
  torrada('Tudo apagado deste aparelho.', 'ok');
});

// ---------------------------------------------------------------------------
// ACESSO ADMINISTRATIVO (Coordenadoria)
// ---------------------------------------------------------------------------
/* Sessão administrativa fica só na memória — nunca em localStorage. É modo
 * de consulta de qualquer matrícula, então não deve sobreviver a um fechar
 * de aba sem novo login, nem ficar gravado no aparelho de quem entrou. */
let adminSessao = null;      // { token }
let adminAlvo = null;        // { matricula, nome } — servidor sendo consultado

function msgAdmin(papelAlvo, texto, tom) {
  const alvo = papel(papelAlvo);
  alvo.textContent = texto;
  alvo.dataset.tom = tom || '';
}

/* ---------------------------------------------------------------------------
 * ENTRADA DA COORDENADORIA — comodidade sem publicar a senha
 *
 * O usuário vem do config.js e já aparece preenchido. A senha, depois de ser
 * aceita UMA vez, fica guardada naquele aparelho e o app entra sozinho nas
 * próximas aberturas. Você digita uma vez por computador e nunca mais.
 *
 * A senha não vai no config.js por um motivo concreto: esse arquivo é servido
 * aberto pelo Netlify, e o acesso administrativo lê a jornada de QUALQUER
 * servidor. Publicá-la ali equivaleria a deixar a base dos bolsistas legível
 * sem credencial nenhuma. Se ainda assim você quiser, preencha `admin.senha`
 * no config.js — o código abaixo já usa o valor de lá quando existe.
 * ------------------------------------------------------------------------- */
const CONF_ADMIN = (window.CONFIG_PORTAL && window.CONFIG_PORTAL.admin) || {};

function senhaAdminGuardada() {
  if (CONF_ADMIN.senha) return CONF_ADMIN.senha;
  if (CONF_ADMIN.lembrar_no_aparelho === false) return '';
  return recuperar(CHAVES.admin, '') || '';
}

function prepararTelaAdmin() {
  if (CONF_ADMIN.usuario && !campo('admin-usuario').value) {
    campo('admin-usuario').value = CONF_ADMIN.usuario;
  }
  const guardada = senhaAdminGuardada();
  if (guardada && !campo('admin-senha').value) {
    campo('admin-senha').value = guardada;
  }
}

/* Entra sozinho quando já há senha conhecida. Falha em silêncio: senha trocada
 * na Coordenadoria não pode virar uma mensagem de erro na cara de quem só
 * abriu o app. */
async function tentarEntrarAdminAutomatico() {
  const senha = senhaAdminGuardada();
  if (!senha || adminSessao) return false;
  const saida = await chamarApi('entrar_admin',
    { usuario: CONF_ADMIN.usuario || 'BOLSAS', senha });
  if (!saida.ok) {
    if (saida.offline && await senhaAdminConfereLocalmente(senha)) {
      adminSessao = { token: '', local: true };
      return true;
    }
    if (!saida.offline && !CONF_ADMIN.senha) localStorage.removeItem(CHAVES.admin);
    return false;
  }
  adminSessao = { token: saida.token_admin };
  return true;
}

/* ---------------------------------------------------------------------------
 * ENTRADA ADMINISTRATIVA SEM SERVIÇO
 *
 * Enquanto a implantação do Apps Script não estiver aberta, o app inteiro fica
 * inacessível — inclusive para quem precisa OLHAR a interface e decidir o que
 * mudar. Isso é um beco: para consertar é preciso ver, e para ver é preciso
 * que já esteja consertado.
 *
 * A saída é conferir a senha administrativa localmente, contra o hash em
 * config.js (`admin.hash_senha`, o mesmo SHA-256 com sal que o portal_api.gs
 * usa). Aceita, o app entra em MODO LOCAL: navega, lista os servidores do
 * acessos.js e mostra as telas. Não inventa dado nenhum — cada tela diz de
 * onde veio o que está exibindo, e a fita de aviso fica visível o tempo todo.
 *
 * O hash não é segredo: quem tem o arquivo tem o hash, e quebrar SHA-256 de
 * senha curta é viável. Ele não substitui o controle do servidor — o que
 * protege o dado de verdade é o Apps Script, e no modo local não há dado da
 * planilha para proteger, só a casca da interface.
 * ------------------------------------------------------------------------- */
async function sha256Hex(texto) {
  const bits = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(texto));
  return [...new Uint8Array(bits)].map(b => b.toString(16).padStart(2, '0')).join('');
}

async function senhaAdminConfereLocalmente(senha) {
  const esperado = CONF_ADMIN.hash_senha || '';
  const sal = (window.CONFIG_PORTAL && window.CONFIG_PORTAL.sal) || '';
  if (!esperado || !sal) return false;
  try {
    return iguais(await sha256Hex(sal + '|' + String(senha)), esperado);
  } catch (erro) {
    return false;
  }
}

function entrarModoLocalAdmin() {
  adminSessao = { token: '', local: true };
  papel('admin-resultados').innerHTML = '';
  campo('admin-busca').value = '';
  irPara('admin-busca');
  torrada('Entrou em modo local: o serviço não respondeu. A interface funciona, ' +
          'mas os dados da planilha não chegam.', 'alerta', 7000);
}

papel('admin-entrar').addEventListener('click', async () => {
  const usuario = campo('admin-usuario').value.trim();
  const senha = campo('admin-senha').value;

  if (!usuario || !senha) {
    msgAdmin('msg-admin-entrar', 'Informe usuário e senha.', 'erro');
    return;
  }

  msgAdmin('msg-admin-entrar', 'Verificando…', '');
  const saida = await chamarApi('entrar_admin', { usuario, senha });

  /* Só quando o serviço NÃO RESPONDEU. Senha recusada pelo serviço é senha
   * recusada — tentar de novo localmente ressuscitaria acesso revogado. */
  if (!saida.ok && (saida.offline || !navigator.onLine)) {
    if (await senhaAdminConfereLocalmente(senha)) {
      if (CONF_ADMIN.lembrar_no_aparelho !== false && !CONF_ADMIN.senha) {
        guardar(CHAVES.admin, senha);
      }
      msgAdmin('msg-admin-entrar', '', '');
      campo('admin-senha').value = '';
      entrarModoLocalAdmin();
      return;
    }
    msgAdmin('msg-admin-entrar',
      'O serviço não respondeu e a senha não confere com a guardada no aplicativo.',
      'erro');
    return;
  }

  if (!saida.ok) {
    msgAdmin('msg-admin-entrar', saida.erro || 'Não consegui entrar.', 'erro');
    vibrar([80, 60, 80]);
    return;
  }

  adminSessao = { token: saida.token_admin };
  if (CONF_ADMIN.lembrar_no_aparelho !== false && !CONF_ADMIN.senha) {
    guardar(CHAVES.admin, senha);
  }
  campo('admin-senha').value = '';
  msgAdmin('msg-admin-entrar', '', '');
  papel('admin-resultados').innerHTML = '';
  campo('admin-busca').value = '';
  irPara('admin-busca');
});

/* Ao abrir a tela administrativa: preenche o que já se sabe e, se a senha já
 * está conhecida neste aparelho, pula direto para a busca. */
document.querySelectorAll('[data-ir="admin-entrar"]').forEach(botao => {
  botao.addEventListener('click', async () => {
    prepararTelaAdmin();
    if (await tentarEntrarAdminAutomatico()) {
      papel('admin-resultados').innerHTML = '';
      campo('admin-busca').value = '';
      irPara('admin-busca');
    }
  });
});

campo('admin-senha').addEventListener('keydown', evento => {
  if (evento.key === 'Enter') papel('admin-entrar').click();
});

/* Estrutura da jornada com os marcos reais e NENHUM cumprido, porque neste
 * modo não há como saber quais estão. É a interface completa sobre um cadastro
 * em branco — serve para avaliar as telas, nunca para conferir a situação de
 * alguém. A narrativa diz isso na cara, para ninguém confundir tela vazia com
 * servidor em falta. */
const MARCOS_LOCAIS = [
  ['convocacao', 'Convocação no seletivo'],
  ['contrato', 'Contrato / aditivo firmado'],
  ['implantacao', 'Implantação em folha'],
  ['curso', 'Vínculo acadêmico informado'],
  ['comprovacao_2025_2', 'Comprovação semestral 2025.2'],
  ['comprovacao_2026_1', 'Comprovação semestral 2026.1'],
  ['tcc', 'Processo de comprovação do TCC'],
  ['diploma', 'Diploma ou certificado']
];

function jornadaVaziaLocal(matricula, nome) {
  return {
    ok: true,
    matricula: matricula,
    nome: nome || '',
    processo: '', processo_legivel: '',
    curso: '', tipo_bolsa: '', status: '',
    inicio_curso: '', termino_curso: '',
    marcos: MARCOS_LOCAIS.map(([id, titulo]) => ({
      id: id, titulo: titulo, cumprido: false, evidencia: '',
      descricao: 'Etapa prevista no acompanhamento do auxílio-bolsa.',
      como_cumprir: ''
    })),
    prazos: [],
    percurso: { disponivel: false, principal: null, ramos: [], total: 0 },
    conformidade: { cumpridos: 0, total: MARCOS_LOCAIS.length,
                    percentual: 0, nivel: 'CRÍTICO' },
    narrativa: 'MODO LOCAL — o serviço da planilha não respondeu. Esta tela ' +
      'mostra a estrutura da jornada, sem os dados de ' +
      (nome || 'deste servidor') + '. Nada aqui reflete a situação real dele.',
    atualizado_em: 'sem leitura da planilha'
  };
}

function normalizarBusca(texto) {
  return String(texto || '').toUpperCase()
    .normalize('NFD').replace(/[\u0300-\u036f]/g, '');
}

async function buscarServidoresAdmin() {
  if (!adminSessao) { irPara('admin-entrar'); return; }
  const busca = campo('admin-busca').value.trim();

  msgAdmin('msg-admin-busca', 'Buscando…', '');

  /* No modo local a lista vem do acessos.js — que tem matrícula e nome dos 474
   * servidores, e só isso. Não tem curso, status nem prazo: esses moram na
   * planilha. A tela diz isso, em vez de deixar o campo vazio parecendo dado. */
  let saida;
  if (adminSessao.local) {
    const conf = window.ACESSOS_LOCAIS;
    if (!conf || !conf.entradas) {
      msgAdmin('msg-admin-busca',
        'Modo local sem a lista de acessos: o arquivo acessos.js não foi ' +
        'publicado junto com o aplicativo.', 'erro');
      return;
    }
    const termo = normalizarBusca(busca);
    const achados = Object.keys(conf.entradas)
      .map(mat => ({ matricula: mat, nome: conf.entradas[mat].n || '',
                     status: 'sem dados da planilha' }))
      .filter(item => !termo || normalizarBusca(item.nome).indexOf(termo) >= 0 ||
                      item.matricula.indexOf(busca.replace(/\D/g, '')) === 0)
      .sort((a, b) => a.nome.localeCompare(b.nome, 'pt-BR'))
      .slice(0, 60);
    saida = { ok: true, resultados: achados };
  } else {
    saida = await chamarApi('buscar_servidores',
      { token_admin: adminSessao.token, busca });
  }

  if (!saida.ok) {
    msgAdmin('msg-admin-busca', saida.erro || 'Não consegui buscar.', 'erro');
    if (/sess(ã|a)o administrativa expirada/i.test(saida.erro || '')) {
      adminSessao = null;
      irPara('admin-entrar');
    }
    return;
  }

  msgAdmin('msg-admin-busca', '', '');
  const lista = saida.resultados || [];
  papel('admin-resultados').innerHTML = lista.length
    ? lista.map(item => `
        <li>
          <button class="resultado-servidor" data-matricula="${escapar(item.matricula)}"
                  data-nome="${escapar(item.nome)}">
            <span class="nome">${escapar(item.nome || 'Sem nome cadastrado')}</span>
            <span class="meta">mat. ${escapar(item.matricula)}${item.status
              ? ' · ' + escapar(item.status) : ''}</span>
          </button>
        </li>`).join('')
    : '<li class="miudo">Nenhum servidor encontrado com esse termo.</li>';
}

papel('admin-buscar').addEventListener('click', buscarServidoresAdmin);
campo('admin-busca').addEventListener('keydown', evento => {
  if (evento.key === 'Enter') buscarServidoresAdmin();
});

papel('admin-resultados').addEventListener('click', evento => {
  const botao = evento.target.closest('.resultado-servidor');
  if (!botao) return;
  abrirJornadaAdmin(botao.dataset.matricula, botao.dataset.nome);
});

async function abrirJornadaAdmin(matricula, nome) {
  if (!adminSessao) { irPara('admin-entrar'); return; }
  adminAlvo = { matricula, nome };

  // Evita o EVO comparar o estágio de um servidor com o do anterior e
  // disparar a animação de "cresceu" comparando duas pessoas diferentes.
  localStorage.removeItem('bolsa.evo');

  torrada('Carregando…', '');

  let saida;
  if (adminSessao.local) {
    saida = jornadaVaziaLocal(matricula, nome);
  } else {
    saida = await chamarApi('jornada_admin',
      { token_admin: adminSessao.token, matricula });
  }

  if (!saida.ok) {
    torrada(saida.erro || 'Não consegui carregar a jornada desse servidor.', 'erro');
    if (/sess(ã|a)o administrativa expirada/i.test(saida.erro || '')) {
      adminSessao = null;
      irPara('admin-entrar');
    }
    return;
  }

  papel('fita-offline').hidden = true;
  jornada = saida;
  desenharTudo();

  $$('.aba[data-painel="p-enviar"], .aba[data-painel="p-comprovar"], .aba[data-painel="p-ajustes"]')
    .forEach(aba => { aba.hidden = true; });
  abrirPainel('p-trilha');

  const fita = papel('fita-admin');
  fita.hidden = false;
  papel('fita-admin-texto').textContent = adminSessao.local
    ? 'MODO LOCAL, sem a planilha — estrutura da jornada de ' +
      (saida.nome || nome || 'servidor') + ' (mat. ' + matricula +
      '). Os dados reais não foram carregados.'
    : 'Modo consulta administrativa — vendo a jornada de ' +
      (saida.nome || nome || 'servidor') + ' (mat. ' + matricula + ')';

  irPara('jornada');
}

function sairDoModoAdmin() {
  adminSessao = null;
  adminAlvo = null;
  localStorage.removeItem('bolsa.evo');
  papel('fita-admin').hidden = true;
  $$('.aba[data-painel="p-enviar"], .aba[data-painel="p-comprovar"], .aba[data-painel="p-ajustes"]')
    .forEach(aba => { aba.hidden = false; });
  jornada = null;
  irPara('abertura');
}

papel('admin-sair').addEventListener('click', sairDoModoAdmin);
papel('admin-sair-jornada').addEventListener('click', sairDoModoAdmin);

papel('admin-trocar').addEventListener('click', () => {
  papel('fita-admin').hidden = true;
  irPara('admin-busca');
});

// ---------------------------------------------------------------------------
// JORNADA
// ---------------------------------------------------------------------------
async function carregarJornada(forcar) {
  const guardada = recuperar(CHAVES.jornada, null);
  if (guardada && !forcar) {
    jornada = guardada;
    desenharTudo();
  }
  if (!sessao) return;

  const saida = await chamarApi('jornada', {
    matricula: sessao.matricula, token: sessao.token });

  if (!saida.ok) {
    if (guardada) {
      jornada = guardada;
      papel('fita-offline').hidden = false;
      desenharTudo();
      return;
    }
    torrada(saida.erro || 'Não consegui carregar seus dados.', 'erro');
    return;
  }

  papel('fita-offline').hidden = !saida._offline;
  jornada = saida;
  guardar(CHAVES.jornada, saida);
  desenharTudo();
  agendarAvisos();
}

papel('atualizar-dados').addEventListener('click', async () => {
  torrada('Atualizando…', '');
  await carregarJornada(true);
  torrada('Dados atualizados.', 'ok');
});

function desenharTudo() {
  if (!jornada) return;
  desenharCabecalho();
  desenharEvo();
  desenharCartela();
  desenharTrilha();
  desenharPrazos();
  desenharPercurso();
  preencherTiposDeComprovacao();
  preencherTiposDeEnvio();
  desenharFila();
}

function desenharCabecalho() {
  const primeiro = String(jornada.nome || '').trim().split(/\s+/)[0] || '';
  papel('saudacao').textContent = primeiro ? 'Olá, ' + primeiro : 'Olá';
  papel('sub-identificacao').textContent =
    'mat. ' + (jornada.matricula || '—') +
    (jornada.processo_legivel ? ' · proc. ' + jornada.processo_legivel : '');
}

/* ---------------------------------------------------------------------- */
/* EVO                                                                     */
/* ---------------------------------------------------------------------- */
/* O estágio anterior é guardado para detectar CRESCIMENTO. Sem isso, a
 * animação de crescer dispararia a cada abertura do app, e um evento que
 * acontece toda hora deixa de ser evento. */
function desenharEvo(situacao) {
  if (!window.EVO || !jornada) return;

  const anterior = recuperar('bolsa.evo', null);
  const escolha = EVO.paraJornada(jornada, situacao || situacaoAtual());
  const cresceu = anterior && anterior !== escolha.estagio;

  papel('evo-figura').innerHTML = EVO.svg({
    estagio: escolha.estagio,
    expressao: escolha.expressao,
    tamanho: 78,
    animar: true,
    rotulo: 'EVO na fase ' + escolha.dados.nome
  });

  papel('evo-fala').textContent = EVO.fala(jornada, situacao || situacaoAtual());
  papel('evo-estagio').innerHTML =
    'Fase <strong>' + escapar(escolha.dados.nome) + '</strong> · ' +
    escapar(escolha.dados.legenda);

  if (cresceu) {
    const figura = papel('evo-figura').querySelector('.evo');
    if (figura) {
      figura.classList.add('evo-cresceu');
      tocar('ok');
      vibrar([90, 60, 140]);
      torrada('O EVO cresceu: agora ele é ' +
              escolha.dados.nome.toLowerCase() + '.', 'ok', 4200);
    }
  }
  guardar('bolsa.evo', escolha.estagio);
}

/* A situação é derivada do estado real, nunca escolhida na mão em cada
 * chamada — assim o mascote nunca sorri com prazo vencido na tela. */
function situacaoAtual() {
  if (!navigator.onLine) return 'offline';
  const vencido = (jornada.prazos || []).some(p =>
    !p.cumprido && urgenciaDe(p) === 'vencido');
  return vencido ? 'vencido' : '';
}

/* A cartela é o que a pessoa vê primeiro. Ela responde, sem texto, à pergunta
 * "quanto falta". */
function desenharCartela() {
  const marcos = jornada.marcos || [];
  const cumpridos = marcos.filter(m => m.cumprido).length;

  papel('contagem-carimbos').textContent = cumpridos + ' de ' + marcos.length;
  papel('carimbos').innerHTML = marcos.map(m => `
    <div class="carimbo ${m.cumprido ? 'cheio' : 'vazio'}" title="${escapar(m.titulo)}">
      <span>
        <span class="marca">${m.cumprido ? '&#10003;' : '&#9679;'}</span>
        ${escapar(abreviar(m.titulo))}
      </span>
    </div>`).join('');

  const c = jornada.conformidade || {};
  const tons = { 'COMPLETO': '', 'REGULAR': '', 'PARCIAL': 'parcial',
                 'CRÍTICO': 'critico' };
  const rotulos = {
    'COMPLETO': 'Percurso completo',
    'REGULAR': 'Tudo em ordem por aqui',
    'PARCIAL': 'Falta pouco',
    'CRÍTICO': 'Precisa da sua atenção'
  };
  papel('nivel').textContent = rotulos[c.nivel] || '—';
  papel('nivel').dataset.tom = tons[c.nivel] || '';
  papel('nivel-nota').textContent =
    (marcos.length - cumpridos) + ' etapa(s) sem registro';

  papel('narrativa').textContent = jornada.narrativa || '';
}

function abreviar(titulo) {
  const mapa = {
    'Convocação no seletivo': 'Seletivo',
    'Contrato / aditivo firmado': 'Contrato',
    'Implantação em folha': 'Folha',
    'Vínculo acadêmico informado': 'Curso',
    'Comprovação semestral 2025.2': '2025.2',
    'Comprovação semestral 2026.1': '2026.1',
    'Processo de comprovação do TCC': 'TCC',
    'Diploma ou certificado': 'Diploma'
  };
  return mapa[titulo] || titulo.split(' ')[0];
}

function desenharTrilha() {
  papel('trilha').innerHTML = (jornada.marcos || []).map((m, i) => `
    <li class="etapa entra ${m.cumprido ? 'feita' : 'aberta'}">
      <div class="ponto">${m.cumprido ? '&#10003;' : i + 1}</div>
      <h3>${escapar(m.titulo)}</h3>
      <p>${escapar(m.descricao || '')}</p>
      ${m.cumprido
        ? `<p class="registro">Registrado: ${escapar(m.evidencia || 'sim')}</p>`
        : (m.como_cumprir
            ? `<p class="registro" style="color:var(--ambar)">${escapar(m.como_cumprir)}</p>`
            : '')}
    </li>`).join('');
}

// ---------------------------------------------------------------------------
// PERCURSO — a árvore do processo
// ---------------------------------------------------------------------------
/* Mostra o que a Coordenadoria registrou sobre o andamento, e SÓ isso. Quando
 * a árvore ainda não foi ingerida, a tela diz que não há registro — em vez de
 * ficar vazia, que a pessoa leria como "não existe processo meu". */
function cartaoDeNo(no, principal) {
  const parado = no.dias_parado > 0
    ? `<span class="percurso-parado">${no.dias_parado} dia(s) sem movimentação</span>`
    : '';
  return `<article class="percurso-no ${principal ? 'principal' : ''} entra">
      <div class="percurso-topo">
        <h3>${escapar(no.numero_legivel || no.numero || '—')}</h3>
        <span class="percurso-etiqueta">${escapar(principal ? 'Processo de origem'
          : (no.tipo || 'Requisição'))}</span>
      </div>
      ${no.assunto ? `<p>${escapar(no.assunto)}</p>` : ''}
      ${no.unidade ? `<p class="percurso-linha">Onde está:
        <strong>${escapar(no.unidade)}</strong></p>` : ''}
      ${no.situacao ? `<p class="percurso-linha">Situação:
        <strong>${escapar(no.situacao)}</strong></p>` : ''}
      ${no.ultima_mov ? `<p class="percurso-linha">Última movimentação:
        <strong>${escapar(no.ultima_mov)}</strong> ${parado}</p>` : ''}
      ${no.movimentacoes ? `<p class="base-legal">${no.movimentacoes} movimentação(ões)
        registrada(s)</p>` : ''}
    </article>`;
}

function desenharPercurso() {
  const alvo = papel('percurso');
  const nota = papel('percurso-nota');
  if (!alvo) return;

  const p = (jornada && jornada.percurso) || null;
  if (!p || !p.disponivel) {
    alvo.innerHTML = `
      <div class="vazio-bom" style="border-color:var(--cinza)">
        Ainda não há andamento registrado para a sua matrícula.<br>
        ${jornada && jornada.processo_legivel
          ? 'Seu processo de origem é o ' + escapar(jornada.processo_legivel) + '.'
          : ''}
      </div>`;
    nota.textContent = 'O andamento é alimentado pela leitura do Digidoc feita ' +
      'pela Coordenadoria. Se você protocolou algo há pouco tempo, pode ainda ' +
      'não aparecer aqui.';
    return;
  }

  const partes = [];
  if (p.principal) partes.push(cartaoDeNo(p.principal, true));
  (p.ramos || []).forEach(no => partes.push(cartaoDeNo(no, false)));
  alvo.innerHTML = partes.join('');
  nota.textContent = 'Fonte: registro do Digidoc consolidado pela Coordenadoria' +
    (p.atualizado_em ? ' — leitura de ' + p.atualizado_em : '') + '.';
}

// ---------------------------------------------------------------------------
// PRAZOS
// ---------------------------------------------------------------------------
function diasAte(iso) {
  const alvo = new Date(iso);
  if (isNaN(alvo)) return null;
  alvo.setHours(0, 0, 0, 0);
  const hoje = new Date();
  hoje.setHours(0, 0, 0, 0);
  return Math.round((alvo - hoje) / 86400000);
}

function urgenciaDe(prazo) {
  if (prazo.cumprido) return 'cumprido';
  const dias = diasAte(prazo.vence_iso);
  if (dias == null) return 'proximo';
  if (dias < 0) return 'vencido';
  if (dias === 0) return 'hoje';
  if (dias <= 7) return 'proximo';
  return 'tranquilo';
}

function textoContagem(prazo) {
  if (prazo.cumprido) return 'entregue';
  const dias = diasAte(prazo.vence_iso);
  if (dias == null) return 'sem data';
  if (dias < 0) return 'venceu há ' + Math.abs(dias) + 'd';
  if (dias === 0) return 'vence hoje';
  if (dias === 1) return 'falta 1 dia';
  return 'faltam ' + dias + ' dias';
}

function desenharPrazos() {
  const lista = (jornada.prazos || []).slice();

  // Ordem: o que dói primeiro. Vencido no topo, cumprido no fim — quem abre
  // esta tela está procurando problema, não histórico.
  const peso = { vencido: 0, hoje: 1, proximo: 2, tranquilo: 3, cumprido: 4 };
  lista.sort((a, b) => {
    const pa = peso[urgenciaDe(a)], pb = peso[urgenciaDe(b)];
    if (pa !== pb) return pa - pb;
    return (diasAte(a.vence_iso) ?? 9999) - (diasAte(b.vence_iso) ?? 9999);
  });

  const pendentes = lista.filter(p => !p.cumprido);
  if (!pendentes.length) {
    papel('prazos').innerHTML = `
      <div class="vazio-bom">
        <span class="marca">&#10003;</span>
        Nenhum prazo em aberto.<br>Você está em dia com a Coordenadoria.
      </div>`;
  } else {
    papel('prazos').innerHTML = lista.map(prazo => {
      const urgencia = urgenciaDe(prazo);
      return `<article class="prazo entra" data-urgencia="${urgencia}">
        <div class="prazo-topo">
          <h3>${escapar(prazo.titulo)}</h3>
          <span class="contagem">${textoContagem(prazo)}</span>
        </div>
        ${prazo.detalhe ? `<p>${escapar(prazo.detalhe)}</p>` : ''}
        ${prazo.vence ? `<p>Vence em <strong>${escapar(prazo.vence)}</strong></p>` : ''}
        ${prazo.base_legal
          ? `<p class="base-legal">${escapar(prazo.base_legal)}</p>` : ''}
      </article>`;
    }).join('');
  }

  const permissao = ('Notification' in window) ? Notification.permission : 'unsupported';
  papel('cartao-notificacao').hidden = (permissao === 'granted' || !pendentes.length);
}

function escapar(texto) {
  return String(texto == null ? '' : texto)
    .replace(/&/g, '&amp;').replace(/</g, '&lt;')
    .replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

// ---------------------------------------------------------------------------
// AVISOS
// ---------------------------------------------------------------------------
function estadoNotificacao() {
  if (!('Notification' in window)) {
    return 'Este navegador não permite avisos. Instale o app pelo Chrome no ' +
           'Android para receber lembretes.';
  }
  if (Notification.permission === 'granted') {
    return 'Avisos ligados. Você será lembrado com sete, três e um dia de ' +
           'antecedência, e no dia do vencimento. Com o app instalado, o ' +
           'lembrete também chega com ele fechado — o horário exato depende ' +
           'do sistema do celular.';
  }
  if (Notification.permission === 'denied') {
    return 'Os avisos foram bloqueados para este site. Para reativar, abra as ' +
           'configurações do navegador, procure este endereço em Notificações ' +
           'e permita.';
  }
  return 'Avisos desligados.';
}

async function pedirPermissao() {
  if (!('Notification' in window)) {
    torrada('Este navegador não permite avisos.', 'alerta');
    return false;
  }
  const resultado = await Notification.requestPermission();
  papel('estado-notificacao').textContent = estadoNotificacao();
  papel('cartao-notificacao').hidden = (resultado === 'granted');
  if (resultado === 'granted') {
    await registrarSincronizacao();
    agendarAvisos();
    torrada('Pronto. Vou te avisar antes de cada prazo.', 'ok');
    tocar('ok');
    return true;
  }
  torrada('Sem permissão, os avisos só aparecem com o app aberto.', 'alerta');
  return false;
}

papel('ligar-notificacao').addEventListener('click', pedirPermissao);

papel('testar-aviso').addEventListener('click', async () => {
  if (!('Notification' in window) || Notification.permission !== 'granted') {
    const deu = await pedirPermissao();
    if (!deu) return;
  }
  tocar('alerta');
  vibrar([200, 100, 200]);
  await mostrarAviso({
    titulo: 'Assim que vai chegar',
    corpo: 'Este é um aviso de teste do acompanhamento do auxílio-bolsa.',
    urgencia: 'proximo', tag: 'teste'
  });
  torrada('Aviso de teste enviado.', 'ok');
});

async function mostrarAviso(dados) {
  const registro = await navigator.serviceWorker.getRegistration();
  if (registro && registro.active) {
    registro.active.postMessage(Object.assign({ tipo: 'NOTIFICAR' }, dados));
    return;
  }
  if ('Notification' in window && Notification.permission === 'granted') {
    new Notification(dados.titulo, { body: dados.corpo,
                                     icon: './icones/icone-192.png' });
  }
}

/* Agenda o que cabe na sessão atual e avisa NA HORA o que já estourou. O
 * `setTimeout` só cobre o tempo com o app aberto — está aqui porque cobre o
 * caso real de quem deixa o app aberto no dia do vencimento, não porque
 * substitui o push. */
function agendarAvisos() {
  agendamentos.forEach(id => clearTimeout(id));
  agendamentos = [];
  if (!jornada || !('Notification' in window) ||
      Notification.permission !== 'granted') return;

  const adiados = recuperar(CHAVES.adiados, {});
  const agora = Date.now();

  (jornada.prazos || []).forEach(prazo => {
    if (prazo.cumprido) return;
    const dias = diasAte(prazo.vence_iso);
    if (dias == null) return;

    const adiadoAte = adiados[prazo.id];
    if (adiadoAte && new Date(adiadoAte).getTime() > agora) return;

    if (dias <= 0 || dias === 1 || dias === 3 || dias === 7) {
      const urgencia = dias < 0 ? 'vencido' : dias === 0 ? 'hoje' : 'proximo';
      mostrarAviso({
        urgencia, id: prazo.id, tag: 'prazo-' + prazo.id,
        titulo: dias < 0 ? 'Prazo vencido há ' + Math.abs(dias) + ' dia(s)'
              : dias === 0 ? 'Vence hoje' : 'Faltam ' + dias + ' dia(s)',
        corpo: prazo.titulo
      });
      if (dias <= 0) { tocar('alerta'); vibrar([300, 120, 300]); }
    }

    // Se o vencimento cai dentro das próximas 24h e o app ficar aberto, o
    // aviso dispara na virada.
    const vence = new Date(prazo.vence_iso);
    vence.setHours(9, 0, 0, 0);
    const faltaMs = vence.getTime() - agora;
    if (faltaMs > 0 && faltaMs < 86400000) {
      agendamentos.push(setTimeout(() => {
        mostrarAviso({ urgencia: 'hoje', id: prazo.id, tag: 'prazo-' + prazo.id,
                       titulo: 'Vence hoje', corpo: prazo.titulo });
        tocar('alerta'); vibrar([250, 100, 250]);
      }, faltaMs));
    }
  });
}

async function registrarSincronizacao() {
  try {
    const registro = await navigator.serviceWorker.ready;
    if ('periodicSync' in registro) {
      const permissao = await navigator.permissions.query(
        { name: 'periodic-background-sync' });
      if (permissao.state === 'granted') {
        await registro.periodicSync.register('conferir-prazos',
          { minInterval: 12 * 60 * 60 * 1000 });
      }
    }
  } catch (erro) {
    // periodicSync é opcional e não existe em todo navegador. A ausência não
    // quebra nada — só reduz o alcance dos avisos com o app fechado.
  }
}

// ---------------------------------------------------------------------------
// COMPROVAR — foto ou PDF direto do aparelho
// ---------------------------------------------------------------------------
/* O arquivo trafega em base64 dentro do JSON, porque Apps Script não recebe
 * multipart. Base64 incha 33%, e foto de celular hoje sai com 4 a 8 MB — sem
 * reduzir antes, metade dos envios morreria no limite de payload. Por isso a
 * imagem passa por um canvas: 1600px no maior lado, JPEG a 72%. Documento
 * fotografado continua perfeitamente legível nesse tamanho, e o arquivo cai
 * para algo entre 200 e 600 KB.
 *
 * PDF não passa por isso — não há como reduzir sem reescrever o arquivo — e por
 * isso o limite do servidor existe e a mensagem de recusa precisa ser clara. */
let compArquivo = null;

const TETO_LADO = 1600;
const QUALIDADE = 0.72;

function msgComprovar(texto, tom) {
  const alvo = papel('msg-comprovar');
  alvo.textContent = texto;
  alvo.dataset.tom = tom || '';
}

function preencherTiposDeComprovacao() {
  const seletor = campo('comp-tipo');
  if (!seletor) return;
  const marcos = jornada.marcos || [];
  const pendentes = marcos.filter(m => !m.cumprido);
  const opcoes = pendentes.length ? pendentes : marcos;
  seletor.innerHTML = opcoes.map(m =>
    `<option value="${escapar(m.id)}">${escapar(m.titulo)}</option>`).join('') +
    '<option value="carteira_funcional">Carteira funcional (atualizar meus dados)</option>' +
    '<option value="outro">Outro documento</option>';
}

function reduzirImagem(arquivo) {
  return new Promise((resolve, reject) => {
    const leitor = new FileReader();
    leitor.onerror = () => reject(new Error('Não consegui ler o arquivo.'));
    leitor.onload = () => {
      const img = new Image();
      img.onerror = () => reject(new Error('Não consegui abrir a imagem.'));
      img.onload = () => {
        const escala = Math.min(1, TETO_LADO / Math.max(img.width, img.height));
        const tela = document.createElement('canvas');
        tela.width = Math.round(img.width * escala);
        tela.height = Math.round(img.height * escala);
        const ctx = tela.getContext('2d');
        ctx.fillStyle = '#fff';                    // PNG com transparência vira preto sem isto
        ctx.fillRect(0, 0, tela.width, tela.height);
        ctx.drawImage(img, 0, 0, tela.width, tela.height);
        const dados = tela.toDataURL('image/jpeg', QUALIDADE);
        resolve({ b64: dados.split(',')[1], tipo: 'image/jpeg', previa: dados });
      };
      img.src = leitor.result;
    };
    leitor.readAsDataURL(arquivo);
  });
}

function lerComoBase64(arquivo) {
  return new Promise((resolve, reject) => {
    const leitor = new FileReader();
    leitor.onerror = () => reject(new Error('Não consegui ler o arquivo.'));
    leitor.onload = () => resolve({
      b64: String(leitor.result).split(',')[1],
      tipo: arquivo.type || 'application/octet-stream',
      previa: null
    });
    leitor.readAsDataURL(arquivo);
  });
}

function tamanhoLegivel(bytes) {
  return bytes < 1024 * 1024
    ? Math.round(bytes / 1024) + ' KB'
    : (bytes / 1024 / 1024).toFixed(1) + ' MB';
}

campo('comp-arquivo').addEventListener('change', async evento => {
  const arquivo = evento.target.files && evento.target.files[0];
  compArquivo = null;
  papel('comp-previa').hidden = true;
  papel('comp-arquivo-info').textContent = '';
  if (!arquivo) return;

  msgComprovar('Preparando o arquivo…', '');
  try {
    const ehImagem = /^image\//.test(arquivo.type);
    const pronto = ehImagem ? await reduzirImagem(arquivo) : await lerComoBase64(arquivo);
    compArquivo = { nome: arquivo.name, tipo: pronto.tipo, b64: pronto.b64 };

    const bytes = Math.round(pronto.b64.length * 0.75);
    papel('comp-arquivo-info').textContent = arquivo.name + ' · ' + tamanhoLegivel(bytes) +
      (ehImagem ? ' (reduzido para envio)' : '');

    if (pronto.previa) {
      papel('comp-previa').src = pronto.previa;
      papel('comp-previa').hidden = false;
    }
    msgComprovar('', '');
  } catch (erro) {
    msgComprovar(erro.message, 'erro');
  }
});

papel('comp-enviar').addEventListener('click', async () => {
  if (!sessao) { torrada('Entre novamente para enviar.', 'erro'); return; }

  const processo = campo('comp-processo').value.trim();
  if (!campo('comp-aceite').checked) {
    msgComprovar('Marque o aceite do termo antes de enviar.', 'erro'); return;
  }
  if (!compArquivo) {
    msgComprovar('Escolha a foto ou o PDF do documento.', 'erro'); return;
  }
  /* Processo obrigatório de propósito: sem ele o comprovante chega solto, e a
   * Coordenadoria fica com uma foto que não sabe a que autos pertence. */
  if (processo.replace(/\D/g, '').length < 6) {
    msgComprovar('Informe o número do processo no Digidoc. Sem ele o comprovante ' +
                 'não pode ser vinculado.', 'erro');
    return;
  }

  const marco = campo('comp-tipo').selectedOptions[0];
  const envio = {
    id: 'CP-' + Date.now().toString(36),
    matricula: sessao.matricula,
    token: sessao.token,
    nome: jornada.nome || '',
    cargo: jornada.cargo || '',
    comarca: jornada.comarca || '',
    tipo: campo('comp-tipo').value,
    tipo_texto: marco ? marco.textContent : '',
    campos: marco ? marco.textContent : '',
    processo_digidoc: processo,
    arquivo_nome: compArquivo.nome,
    arquivo_tipo: compArquivo.tipo,
    arquivo_b64: compArquivo.b64,
    consentimento: true,
    consentimento_em: new Date().toISOString(),
    criado_em: new Date().toISOString()
  };

  msgComprovar('Enviando o documento…', '');
  const saida = await chamarApi('enviar_comprovacao', envio);

  if (saida.ok) {
    msgComprovar('Recebido. A Coordenadoria vai conferir e você verá o resultado ' +
                 'aqui mesmo. Continue com o protocolo no Digidoc.', 'ok');
    tocar('ok'); vibrar([120]);
    compArquivo = null;
    campo('comp-arquivo').value = '';
    campo('comp-aceite').checked = false;
    papel('comp-previa').hidden = true;
    papel('comp-arquivo-info').textContent = '';
    carregarMinhasComprovacoes();
    return;
  }

  /* Arquivo não vai para a fila offline: guardar vários megabytes de base64 no
   * localStorage estoura a cota e derruba o resto do aplicativo. A pessoa é
   * avisada para repetir com internet, o que é honesto e não perde nada — o
   * documento continua no aparelho dela. */
  msgComprovar(saida.offline
    ? 'Sem conexão agora. O documento não foi enviado — repita quando tiver internet.'
    : (saida.erro || 'Não consegui enviar o documento.'), 'erro');
});

async function carregarMinhasComprovacoes() {
  if (!sessao) return;
  const caixa = papel('comp-lista-caixa');
  const saida = await chamarApi('minhas_comprovacoes',
    { matricula: sessao.matricula, token: sessao.token });

  const envios = (saida.ok && saida.envios) || [];
  if (!envios.length) { caixa.hidden = true; return; }

  caixa.hidden = false;
  papel('comp-lista').innerHTML = envios.map(envio => {
    const tom = /VALIDAD/.test(envio.situacao) ? 'ok'
              : /RECUS/.test(envio.situacao) ? 'erro' : 'espera';
    return `<li data-tom="${tom}">
      <strong>${escapar(envio.tipo_texto || 'Comprovante')}</strong>
      <span class="miudo">enviado em ${escapar(envio.enviado_em)} ·
        processo ${escapar(envio.processo || '—')}</span>
      <span class="situacao-envio">${escapar(envio.situacao || '')}</span>
      ${envio.motivo ? `<span class="miudo">${escapar(envio.motivo)}</span>` : ''}
    </li>`;
  }).join('');
}

// ---------------------------------------------------------------------------
// ENVIO DE AVISO
// ---------------------------------------------------------------------------
function preencherTiposDeEnvio() {
  const seletor = campo('tipo-envio');
  const pendentes = (jornada.marcos || []).filter(m => !m.cumprido);
  const opcoes = pendentes.length ? pendentes : (jornada.marcos || []);
  seletor.innerHTML = opcoes.map(m =>
    `<option value="${escapar(m.id)}">${escapar(m.titulo)}</option>`).join('') +
    '<option value="outro">Outro documento</option>';
}

function msgEnvio(texto, tom) {
  const alvo = papel('msg-envio');
  alvo.textContent = texto;
  alvo.dataset.tom = tom || '';
}

papel('enviar-aviso').addEventListener('click', async () => {
  if (!sessao) { torrada('Entre novamente para enviar.', 'erro'); return; }

  const aviso = {
    id: 'AV-' + Date.now().toString(36),
    matricula: sessao.matricula,
    token: sessao.token,
    tipo: campo('tipo-envio').value,
    tipo_texto: campo('tipo-envio').selectedOptions[0].textContent,
    via: campo('via-envio').value,
    protocolo: campo('protocolo').value.trim(),
    observacao: campo('observacao').value.trim(),
    criado_em: new Date().toISOString()
  };

  msgEnvio('Enviando…', '');
  const saida = await chamarApi('avisar_entrega', aviso);

  if (saida.ok) {
    msgEnvio('Avisado. A Coordenadoria já vê seu registro.', 'ok');
    tocar('ok'); vibrar([120]);
    campo('observacao').value = '';
    campo('protocolo').value = '';
    await carregarJornada(true);
    desenharEvo('comemorar');
    return;
  }

  // Falhou: entra na fila em vez de sumir. Um aviso perdido em silêncio é
  // pior que um aviso que demora — a pessoa acha que avisou e não avisou.
  const fila = recuperar(CHAVES.fila, []);
  fila.push(aviso);
  guardar(CHAVES.fila, fila);
  desenharFila();
  msgEnvio('Sem conexão agora. Guardei o aviso e envio assim que houver ' +
           'internet.', 'alerta');
  tentarSincronizarFila();
});

function desenharFila() {
  const fila = recuperar(CHAVES.fila, []);
  papel('fila-pendente').hidden = !fila.length;
  papel('lista-fila').innerHTML = fila.map(item =>
    `<li>${escapar(item.tipo_texto)} — guardado em ` +
    `${new Date(item.criado_em).toLocaleString('pt-BR')}</li>`).join('');
}

async function tentarSincronizarFila() {
  const fila = recuperar(CHAVES.fila, []);
  if (!fila.length || !navigator.onLine) return;

  const restantes = [];
  for (const aviso of fila) {
    const saida = await chamarApi('avisar_entrega', aviso);
    if (!saida.ok) restantes.push(aviso);
  }
  guardar(CHAVES.fila, restantes);
  desenharFila();
  if (restantes.length < fila.length) {
    const enviados = fila.length - restantes.length;
    torrada(enviados + ' aviso(s) enviados à Coordenadoria.', 'ok');
    tocar('ok');
  }
}

window.addEventListener('online', () => {
  papel('fita-offline').hidden = true;
  tentarSincronizarFila();
});

window.addEventListener('offline', () => {
  papel('fita-offline').hidden = false;
});

// ---------------------------------------------------------------------------
// AJUSTES E CONSENTIMENTO
// ---------------------------------------------------------------------------
function aplicarAjustes() {
  campo('som').checked = ajustes.som;
  campo('vibrar').checked = ajustes.vibrar;
  campo('whatsapp').value = ajustes.whatsapp || '';
  campo('consente-whatsapp').checked = Boolean(ajustes.consente);
  papel('estado-notificacao').textContent = estadoNotificacao();
  papel('registro-consentimento').textContent = ajustes.consentidoEm
    ? 'Autorização registrada em ' +
      new Date(ajustes.consentidoEm).toLocaleString('pt-BR') + '.'
    : '';
}

['som', 'vibrar'].forEach(nome => {
  campo(nome).addEventListener('change', () => {
    ajustes[nome] = campo(nome).checked;
    guardar(CHAVES.ajustes, ajustes);
    if (nome === 'som' && ajustes.som) tocar('ok');
    if (nome === 'vibrar' && ajustes.vibrar) vibrar([120]);
  });
});

papel('salvar-whatsapp').addEventListener('click', async () => {
  const numero = campo('whatsapp').value.replace(/\D/g, '');
  const consente = campo('consente-whatsapp').checked;
  const alvo = papel('msg-whatsapp');

  if (consente && numero.length < 10) {
    alvo.textContent = 'Informe o número com DDD para autorizar.';
    alvo.dataset.tom = 'erro';
    return;
  }

  alvo.textContent = 'Registrando…';
  alvo.dataset.tom = '';

  /* O consentimento vai para a planilha com data, hora e o texto exato que a
   * pessoa aceitou. Guardar só "sim" não serve: em LGPD, a prova é do
   * controlador, e um booleano não demonstra o que foi consentido nem quando. */
  const saida = await chamarApi('consentimento', {
    matricula: sessao ? sessao.matricula : '',
    token: sessao ? sessao.token : '',
    numero, consente,
    texto: 'Autorizo a COCARREIRA a me enviar avisos sobre o auxílio-bolsa por ' +
           'WhatsApp. Sei que posso revogar a qualquer momento.',
    em: new Date().toISOString()
  });

  if (!saida.ok) {
    alvo.textContent = saida.erro || 'Não consegui registrar agora.';
    alvo.dataset.tom = 'erro';
    return;
  }

  ajustes.whatsapp = numero;
  ajustes.consente = consente;
  ajustes.consentidoEm = consente ? new Date().toISOString() : '';
  guardar(CHAVES.ajustes, ajustes);
  aplicarAjustes();

  alvo.textContent = consente
    ? 'Autorização registrada. Você pode revogar aqui a qualquer momento.'
    : 'Autorização revogada. A Coordenadoria não enviará mais WhatsApp.';
  alvo.dataset.tom = 'ok';
  tocar('ok');
});

// ---------------------------------------------------------------------------
// INSTALAÇÃO
// ---------------------------------------------------------------------------
window.addEventListener('beforeinstallprompt', evento => {
  evento.preventDefault();
  promptInstalacao = evento;
  papel('instalar').hidden = false;
  papel('instalar-ajustes').hidden = false;
});

async function instalar() {
  if (!promptInstalacao) {
    torrada('Para instalar, use o menu do navegador e escolha ' +
            '“Adicionar à tela inicial”.', '', 5000);
    return;
  }
  promptInstalacao.prompt();
  const escolha = await promptInstalacao.userChoice;
  if (escolha.outcome === 'accepted') {
    torrada('Instalado. Abra pelo ícone para receber os avisos.', 'ok');
    await registrarSincronizacao();
  }
  promptInstalacao = null;
  papel('instalar').hidden = true;
  papel('instalar-ajustes').hidden = true;
}

papel('instalar').addEventListener('click', instalar);
papel('instalar-ajustes').addEventListener('click', instalar);

window.addEventListener('appinstalled', () => {
  papel('instalar').hidden = true;
  papel('instalar-ajustes').hidden = true;
  registrarSincronizacao();
});

// ---------------------------------------------------------------------------
// SERVICE WORKER
// ---------------------------------------------------------------------------
if ('serviceWorker' in navigator) {
  window.addEventListener('load', async () => {
    try {
      const registro = await navigator.serviceWorker.register('./sw.js');
      papel('info-versao').textContent =
        'Aplicativo instalado neste aparelho. Atualiza sozinho quando há versão nova.';
      registro.addEventListener('updatefound', () => {
        const novo = registro.installing;
        if (!novo) return;
        novo.addEventListener('statechange', () => {
          if (novo.state === 'installed' && navigator.serviceWorker.controller) {
            torrada('Nova versão disponível. Feche e abra o app para aplicar.',
                    '', 5000);
          }
        });
      });
    } catch (erro) {
      console.warn('Service worker não registrou:', erro);
    }
  });

  navigator.serviceWorker.addEventListener('message', evento => {
    const dados = evento.data || {};
    if (dados.tipo === 'IR') {
      irPara('jornada');
      abrirPainel('p-prazos');
    }
    if (dados.tipo === 'ADIAR' && dados.id) {
      const adiados = recuperar(CHAVES.adiados, {});
      const amanha = new Date();
      amanha.setDate(amanha.getDate() + 1);
      amanha.setHours(9, 0, 0, 0);
      adiados[dados.id] = amanha.toISOString();
      guardar(CHAVES.adiados, adiados);
    }
  });
}

// ---------------------------------------------------------------------------
// PARTIDA
// ---------------------------------------------------------------------------
(function iniciar() {
  ajustes = Object.assign({}, AJUSTES_PADRAO, recuperar(CHAVES.ajustes, {}));
  aplicarAjustes();
  desenharFila();

  sessao = recuperar(CHAVES.sessao, null);
  const parametros = new URLSearchParams(location.search);

  if (sessao && sessao.token) {
    irPara('jornada');
    carregarJornada(false);
    tentarSincronizarFila();
    if (parametros.get('ir') === 'prazos') abrirPainel('p-prazos');
    if (parametros.get('ir') === 'enviar') abrirPainel('p-enviar');
  } else {
    irPara('abertura');
  }

  // O primeiro toque libera o áudio: navegador móvel bloqueia som sem gesto do
  // usuário, e descobrir isso na hora do alarme seria tarde.
  document.addEventListener('pointerdown', function liberar() {
    try {
      contextoAudio = contextoAudio ||
        new (window.AudioContext || window.webkitAudioContext)();
      if (contextoAudio.state === 'suspended') contextoAudio.resume();
    } catch (erro) { /* sem áudio */ }
    document.removeEventListener('pointerdown', liberar);
  }, { once: true });

  // Voltar ao app depois de horas fechado precisa reavaliar prazo: a data
  // mudou, a contagem não.
  document.addEventListener('visibilitychange', () => {
    if (!document.hidden && jornada) {
      desenharPrazos();
      agendarAvisos();
      tentarSincronizarFila();
    }
  });
})();
