/**
 * Portal Auxílio-Bolsa TJMA — portal_api.gs
 *
 * O backend do PWA. Roda como App da Web do Apps Script, dentro da conta que é
 * dona da planilha.
 *
 * POR QUE ESTA CAMADA EXISTE, EM VEZ DE O APP FALAR COM O SHEETS DIRETO
 * A extensão MAT-DIGIDOC fala direto com a API do Sheets porque ela roda na
 * máquina de um servidor autorizado da Coordenadoria. Este app roda no celular
 * de qualquer bolsista, e o código fonte é público por definição. Colocar a
 * chave da conta de serviço aqui daria escrita na planilha institucional
 * inteira para quem abrisse o "ver código fonte". O Apps Script resolve isso:
 * a credencial nunca sai do Google, e o navegador só recebe o recorte do
 * próprio servidor.
 *
 * COMO O ACESSO FUNCIONA — E POR QUE NÃO É SÓ MATRÍCULA
 * Matrícula de servidor é semipública: consta de portaria, de diário oficial,
 * de lista de ramal. Aceitar matrícula sozinha significaria que qualquer
 * pessoa consultaria o histórico acadêmico e financeiro de qualquer colega.
 * Por isso o acesso exige um CÓDIGO que a Coordenadoria gera e entrega.
 *
 * O código é guardado na planilha em forma de HASH (SHA-256 com sal), não em
 * texto. Se a planilha vazar, os códigos não vazam junto. A comparação é feita
 * em tempo constante, para não permitir descobrir o código medindo o tempo de
 * resposta.
 *
 * ISTO NÃO É AUTENTICAÇÃO FORTE. É um controle proporcional a dado funcional
 * de baixa sensibilidade, adequado a um piloto. Para produção com dado
 * sensível — CPF, conta bancária, saúde — o caminho é integração com o gov.br
 * ou com o login institucional do TJMA, e está anotado no LEIAME como a
 * próxima etapa.
 *
 * INSTALAÇÃO
 *   1. Abra a planilha do BOLSASRH → Extensões → Apps Script.
 *   2. Cole este arquivo, troque SAL_CODIGOS por um valor secreto seu.
 *   3. Rode `criarEstrutura()` uma vez.
 *   4. Rode `gerarCodigosParaTodos()` para criar os códigos de acesso.
 *   5. Implantar → Nova implantação → App da Web:
 *        Executar como: EU
 *        Quem pode acessar: QUALQUER PESSOA
 *      Copie a URL /exec para o config.js do PWA.
 */

// ===========================================================================
// CONFIGURAÇÃO
// ===========================================================================
var SAL_CODIGOS = '6lhpKWyeg8CHnzrtlzm-1ERo4yonm8ES';

/* ACESSO ADMINISTRATIVO (Coordenadoria)
 * Login único, não por servidor — quem tem a senha entra e consulta a
 * jornada de QUALQUER servidor cadastrado, em modo só-leitura (o app do
 * bolsista some com as abas Enviar/Ajustes quando está em modo admin).
 *
 * A senha não fica em texto claro aqui: ADMIN_SENHA_HASH guarda o hash dela.
 * Para trocar a senha, rode gerarHashSenhaAdmin('NovaSenha') uma vez, veja o
 * hash em Execuções → Registros e cole abaixo. */
var ADMIN_USUARIO = 'BOLSAS';
var ADMIN_SENHA_HASH = _hash('BOLSAS@RH');

var FUSO = 'America/Fortaleza';
var ABA_BOLSISTAS = 'SERVIDORES CAEDNC';

/* Nomes já usados para a mesma aba em versões diferentes da planilha. O nome
 * da aba principal é escolhido na tela do BOLSASRH, então ele varia — e uma
 * constante errada aqui produz o pior sintoma possível: login funciona, e a
 * jornada volta "Não achei seu cadastro na base". Se nenhum destes existir, o
 * _abaBolsistas() procura pelo CABEÇALHO, que é estável. */
var ABA_BOLSISTAS_ALTERNATIVAS = [
  'BOLSISTAS', 'AUXILIO BOLSA', 'AUXÍLIO BOLSA', 'PLANILHA GERAL AUXÍLIO BOLSA',
  'GERAL', 'Página1', 'Sheet1'
];

/* Aba com os códigos em TEXTO (Matrícula | Nome completo | Código SAL). É a
 * que a Coordenadoria mantém à mão e a que foi efetivamente populada. O
 * PORTAL_ACESSO, com hash, continua valendo — o login aceita os dois. */
var ABA_SAL = 'SAL_CODIGOS';

/* Espelho calculado da árvore de processos, gravado pela ingestão do Digidoc. */
var ABA_ARVORE = 'ARVORE_PROCESSOS';

var ABA_ACESSO = 'PORTAL_ACESSO';
var ABA_AVISOS = 'PORTAL_AVISOS';
var ABA_CONSENTIMENTO = 'PORTAL_CONSENTIMENTO';
var ABA_MOV = 'MOVIMENTACOES_DIGIDOC';

var COL_ACESSO = ['MATRICULA', 'NOME', 'CODIGO_HASH', 'CRIADO_EM', 'ULTIMO_ACESSO',
                  'ACESSOS', 'ATIVO', 'OBSERVACAO'];

var COL_AVISOS = ['ID', 'MATRICULA', 'NOME', 'TIPO', 'TIPO_TEXTO', 'VIA',
                  'PROTOCOLO', 'OBSERVACAO', 'CRIADO_EM_APP', 'RECEBIDO_EM',
                  'SITUACAO', 'CONFERIDO_POR', 'CONFERIDO_EM'];

var COL_CONSENTIMENTO = ['MATRICULA', 'NOME', 'NUMERO', 'CONSENTE', 'TEXTO',
                         'REGISTRADO_EM', 'REVOGADO_EM', 'ORIGEM'];

/* Os marcos são os MESMOS da extensão e do BOLSASRH. Se divergirem, o servidor
 * vê no celular uma etapa que a Coordenadoria não vê na planilha — e não há
 * conversa que conserte isso depois. */
var MARCOS = [
  { id: 'convocacao', titulo: 'Convocação no seletivo',
    colunas: ['SELETIVO DE CONVOCAÇÃO'],
    descricao: 'Você foi convocado em processo seletivo do auxílio-bolsa.',
    comoCumprir: '' },
  { id: 'contrato', titulo: 'Contrato / aditivo firmado',
    colunas: ['VALOR EXPRESSO EM CONTRATO / ADITIVO CONTRATUAL (sem descontos)',
              'VALOR EXPRESSO EM CONTRATO / ADITIVO CONTRATUAL (com descontos)'],
    descricao: 'Há valor de contrato ou aditivo registrado.',
    comoCumprir: 'Procure a Coordenadoria para assinar o contrato ou aditivo.' },
  { id: 'implantacao', titulo: 'Implantação em folha',
    colunas: ['DOCUMENTO DE IMPLANTAÇÃO', 'DATA DE IMPLANTAÇÃO'],
    descricao: 'O benefício foi implantado na folha de pagamento.',
    comoCumprir: 'Aguarde a Coordenadoria de Pagamento. Se passar de 60 dias, avise.' },
  { id: 'curso', titulo: 'Vínculo acadêmico informado',
    colunas: ['CURSO', 'INÍCIO DO CURSO'],
    descricao: 'Curso e início da formação constam do seu cadastro.',
    comoCumprir: 'Envie o comprovante de matrícula com o nome do curso e a data de início.' },
  { id: 'comprovacao_2025_2', titulo: 'Comprovação semestral 2025.2',
    colunas: ['COMPROVAÇÃO SEMESTRAL 2025.2'],
    descricao: 'Comprovação de frequência e aproveitamento do semestre.',
    comoCumprir: 'Protocole no Digidoc o histórico ou declaração do semestre 2025.2.' },
  { id: 'comprovacao_2026_1', titulo: 'Comprovação semestral 2026.1',
    colunas: ['COMPROVAÇÃO SEMESTRAL 2026.1'],
    descricao: 'Comprovação de frequência e aproveitamento do semestre.',
    comoCumprir: 'Protocole no Digidoc o histórico ou declaração do semestre 2026.1.' },
  { id: 'tcc', titulo: 'Processo de comprovação do TCC',
    colunas: ['PROCESSO COMPROVAÇÃO TCC'],
    descricao: 'Trabalho de conclusão apresentado à Coordenadoria.',
    comoCumprir: 'Ao concluir o trabalho, protocole a cópia no Digidoc.' },
  { id: 'diploma', titulo: 'Diploma ou certificado',
    colunas: ['DIPLOMA/CERTIFICADO'],
    descricao: 'Conclusão do curso comprovada documentalmente.',
    comoCumprir: 'Após a colação, protocole o diploma ou certificado.' }
];

// ===========================================================================
// UTILITÁRIOS
// ===========================================================================
function _agora() {
  return Utilities.formatDate(new Date(), FUSO, 'dd/MM/yyyy HH:mm:ss');
}

function _digitos(v) {
  return String(v == null ? '' : v).replace(/\D/g, '');
}

function _texto(v) {
  return String(v == null ? '' : v).replace(/\s+/g, ' ').trim();
}

function _normalizar(v) {
  return _texto(v).toUpperCase()
    .normalize('NFD').replace(/[\u0300-\u036f]/g, '')
    .replace(/[^A-Z0-9]/g, '');
}

function _hash(valor) {
  var bytes = Utilities.computeDigest(
    Utilities.DigestAlgorithm.SHA_256, SAL_CODIGOS + '|' + valor,
    Utilities.Charset.UTF_8);
  return bytes.map(function (b) {
    return ('0' + (b & 0xFF).toString(16)).slice(-2);
  }).join('');
}

/* Comparação em tempo constante. Um `===` sai no primeiro caractere diferente,
 * e a diferença de tempo entre "errou no primeiro" e "errou no último" é
 * mensurável pela rede — dá para descobrir o código caractere a caractere. */
function _iguais(a, b) {
  a = String(a || ''); b = String(b || '');
  if (a.length !== b.length) return false;
  var diferenca = 0;
  for (var i = 0; i < a.length; i++) {
    diferenca |= a.charCodeAt(i) ^ b.charCodeAt(i);
  }
  return diferenca === 0;
}

function _planilha() {
  return SpreadsheetApp.getActiveSpreadsheet();
}

/* ---------------------------------------------------------------------------
 * A ABA DE BOLSISTAS, ENCONTRADA PELO CABEÇALHO
 *
 * Procura, nesta ordem: o nome configurado, os nomes já usados antes, e por
 * fim qualquer aba cujo cabeçalho tenha MATRÍCULA junto de uma coluna que só
 * existe na ficha do bolsista. O SAL_CODIGOS não passa nesse teste (tem
 * matrícula e nome, mas não tem curso nem seletivo), então não há risco de
 * confundir as duas.
 * ------------------------------------------------------------------------- */
var _cacheBolsistas = null;

function _cabecalhoNormalizado(aba) {
  var largura = Math.max(aba.getLastColumn(), 1);
  return aba.getRange(1, 1, 1, largura).getValues()[0].map(_normalizar);
}

function _pareceFichaDeBolsista(aba) {
  try {
    if (!aba || aba.getLastRow() < 2) return false;
    var cab = _cabecalhoNormalizado(aba);
    if (cab.indexOf('MATRICULA') < 0) return false;
    return cab.indexOf('CURSO') >= 0 ||
           cab.indexOf('SELETIVODECONVOCACAO') >= 0 ||
           cab.indexOf('TIPODEBOLSA') >= 0;
  } catch (erro) {
    return false;
  }
}

function _abaBolsistas() {
  if (_cacheBolsistas) return _cacheBolsistas;
  var planilha = _planilha();
  var candidatos = [ABA_BOLSISTAS].concat(ABA_BOLSISTAS_ALTERNATIVAS);
  for (var i = 0; i < candidatos.length; i++) {
    var aba = planilha.getSheetByName(candidatos[i]);
    if (_pareceFichaDeBolsista(aba)) { _cacheBolsistas = aba; return aba; }
  }
  var todas = planilha.getSheets();
  for (var j = 0; j < todas.length; j++) {
    if (_pareceFichaDeBolsista(todas[j])) {
      _cacheBolsistas = todas[j];
      return todas[j];
    }
  }
  return null;
}

function _aba(nome, colunas) {
  var planilha = _planilha();
  var aba = planilha.getSheetByName(nome);
  if (!aba) {
    aba = planilha.insertSheet(nome);
    aba.getRange(1, 1, 1, colunas.length).setValues([colunas]);
    aba.setFrozenRows(1);
    return aba;
  }
  var largura = Math.max(aba.getLastColumn(), 1);
  var cabecalho = aba.getRange(1, 1, 1, largura).getValues()[0]
    .map(function (c) { return _texto(c); });
  var faltando = colunas.filter(function (c) { return cabecalho.indexOf(c) < 0; });
  if (faltando.length) {
    // Coluna nova sempre ao FIM: reordenar quebraria fórmula e filtro salvo
    // da planilha institucional.
    aba.getRange(1, cabecalho.length + 1, 1, faltando.length)
       .setValues([faltando]);
  }
  return aba;
}

function _indices(aba) {
  var largura = Math.max(aba.getLastColumn(), 1);
  var cabecalho = aba.getRange(1, 1, 1, largura).getValues()[0];
  var mapa = {};
  cabecalho.forEach(function (nome, i) {
    var limpo = _texto(nome);
    if (limpo) { mapa[limpo] = i; mapa[_normalizar(limpo)] = i; }
  });
  return { mapa: mapa, largura: largura };
}

function _valor(linha, indices, coluna) {
  var i = indices.mapa[coluna];
  if (i == null) i = indices.mapa[_normalizar(coluna)];
  if (i == null) return '';
  return _texto(linha[i]);
}

function _resposta(objeto) {
  return ContentService
    .createTextOutput(JSON.stringify(objeto))
    .setMimeType(ContentService.MimeType.JSON);
}

// ===========================================================================
// ESTRUTURA E CÓDIGOS
// ===========================================================================
function criarEstrutura() {
  _aba(ABA_ACESSO, COL_ACESSO);
  _aba(ABA_AVISOS, COL_AVISOS);
  _aba(ABA_CONSENTIMENTO, COL_CONSENTIMENTO);
  return 'Abas do portal criadas ou conferidas.';
}

/* Códigos sem caractere ambíguo: some com 0/O, 1/I/L, 5/S, 8/B. Quem lê o
 * código num papel e digita no celular erra nesses pares, e o erro vira
 * chamado de suporte que a Coordenadoria vai atender. */
var ALFABETO = 'ACDEFGHJKMNPQRTUVWXY2346789';

function _novoCodigo() {
  var saida = '';
  for (var i = 0; i < 6; i++) {
    saida += ALFABETO.charAt(Math.floor(Math.random() * ALFABETO.length));
  }
  return saida;
}

/**
 * Gera código para quem ainda não tem. Devolve a lista EM TEXTO CLARO uma
 * única vez — é a única oportunidade de entregar ao servidor. Na planilha só
 * fica o hash.
 */
function gerarCodigosParaTodos() {
  var abaBase = _abaBolsistas();
  if (!abaBase) throw new Error('Não achei a aba ' + ABA_BOLSISTAS + '.');

  var base = abaBase.getDataRange().getValues();
  var iBase = { mapa: {} };
  base[0].forEach(function (nome, i) {
    var limpo = _texto(nome);
    if (limpo) { iBase.mapa[limpo] = i; iBase.mapa[_normalizar(limpo)] = i; }
  });

  var abaAcesso = _aba(ABA_ACESSO, COL_ACESSO);
  var indices = _indices(abaAcesso);
  var existentes = {};
  if (abaAcesso.getLastRow() > 1) {
    abaAcesso.getRange(2, 1, abaAcesso.getLastRow() - 1, indices.largura)
      .getValues().forEach(function (linha) {
        var matricula = _digitos(_valor(linha, indices, 'MATRICULA'));
        if (matricula) existentes[matricula] = true;
      });
  }

  var novas = [];
  var entregar = [];
  for (var i = 1; i < base.length; i++) {
    var matricula = _digitos(_valor(base[i], iBase, 'MATRÍCULA') ||
                             _valor(base[i], iBase, 'MATRICULA'));
    var nome = _valor(base[i], iBase, 'NOME');
    if (!matricula || existentes[matricula]) continue;

    var codigo = _novoCodigo();
    entregar.push({ matricula: matricula, nome: nome, codigo: codigo });
    var linha = new Array(indices.largura).fill('');
    linha[indices.mapa.MATRICULA] = matricula;
    linha[indices.mapa.NOME] = nome;
    linha[indices.mapa.CODIGO_HASH] = _hash(codigo);
    linha[indices.mapa.CRIADO_EM] = _agora();
    linha[indices.mapa.ACESSOS] = 0;
    linha[indices.mapa.ATIVO] = 'SIM';
    novas.push(linha);
  }

  if (novas.length) {
    abaAcesso.getRange(abaAcesso.getLastRow() + 1, 1, novas.length,
                       indices.largura).setValues(novas);
  }

  Logger.log('Códigos gerados: ' + entregar.length);
  entregar.forEach(function (item) {
    Logger.log(item.matricula + '\t' + item.nome + '\t' + item.codigo);
  });
  return 'Gerados ' + entregar.length + ' código(s). Veja em Execuções → Registros. ' +
         'Esta é a ÚNICA vez que eles aparecem em texto claro.';
}

/** Recria o código de um servidor específico (perdeu, pediu novo). */
function regerarCodigo(matricula) {
  var alvo = _digitos(matricula);
  var aba = _aba(ABA_ACESSO, COL_ACESSO);
  var indices = _indices(aba);
  var ultima = aba.getLastRow();
  for (var linha = 2; linha <= ultima; linha++) {
    var valores = aba.getRange(linha, 1, 1, indices.largura).getValues()[0];
    if (_digitos(_valor(valores, indices, 'MATRICULA')) !== alvo) continue;
    var codigo = _novoCodigo();
    aba.getRange(linha, indices.mapa.CODIGO_HASH + 1).setValue(_hash(codigo));
    aba.getRange(linha, indices.mapa.ATIVO + 1).setValue('SIM');
    Logger.log('Novo código para ' + alvo + ': ' + codigo);
    return codigo;
  }
  throw new Error('Matrícula não encontrada em ' + ABA_ACESSO + '.');
}

/** Rode manualmente para trocar a senha administrativa (ADMIN_SENHA_HASH).
 *  Ex.: gerarHashSenhaAdmin('NovaSenhaForte123') — copie o hash impresso em
 *  Execuções → Registros e cole em ADMIN_SENHA_HASH no topo do arquivo. */
function gerarHashSenhaAdmin(senha) {
  Logger.log(_hash(_texto(senha)));
  return 'Hash gerado. Veja em Execuções → Registros e cole em ADMIN_SENHA_HASH.';
}

// ===========================================================================
// AUTENTICAÇÃO
// ===========================================================================
/* O token é derivado do hash do código com a matrícula e o dia de emissão.
 * Não é JWT nem sessão de servidor: é um segredo derivado que o app reapresenta
 * e que o backend recalcula. Expira sozinho em 30 dias, sem precisar de tabela
 * de sessões. */
function _token(matricula, codigoHash) {
  var epoca = Math.floor(Date.now() / (30 * 24 * 60 * 60 * 1000));
  return _hash('T|' + matricula + '|' + codigoHash + '|' + epoca);
}

function _buscarAcesso(matricula) {
  var alvo = _digitos(matricula);
  if (!alvo) return null;
  var aba = _aba(ABA_ACESSO, COL_ACESSO);
  if (aba.getLastRow() < 2) return null;
  var indices = _indices(aba);
  var valores = aba.getRange(2, 1, aba.getLastRow() - 1, indices.largura).getValues();
  for (var i = 0; i < valores.length; i++) {
    if (_digitos(_valor(valores[i], indices, 'MATRICULA')) === alvo) {
      return { linha: i + 2, valores: valores[i], indices: indices, aba: aba };
    }
  }
  return null;
}

/* ---------------------------------------------------------------------------
 * SAL_CODIGOS — a aba com o código em texto
 *
 * É a lista que a Coordenadoria mantém e distribui. O código fica legível para
 * quem abre a planilha, e isso é uma decisão consciente: a planilha está
 * restrita no Drive, o dado do programa não é sensível a ponto de exigir mais,
 * e o ganho é que regerar ou conferir um código de um servidor no telefone é
 * imediato, sem rodar script.
 *
 * O que NÃO muda: o código nunca sai daqui para o navegador. O PWA manda o que
 * a pessoa digitou, o Apps Script compara, e devolve só sim ou não.
 * ------------------------------------------------------------------------- */
function _buscarSal(matricula) {
  var alvo = _digitos(matricula);
  if (!alvo) return null;
  var aba = _planilha().getSheetByName(ABA_SAL);
  if (!aba || aba.getLastRow() < 2) return null;

  var largura = Math.max(aba.getLastColumn(), 3);
  var valores = aba.getRange(1, 1, aba.getLastRow(), largura).getValues();
  var cab = valores[0].map(_normalizar);

  /* Descobre as colunas pelo cabeçalho e cai para A/B/C se ele não bater —
   * a aba é mantida à mão e uma coluna pode ser inserida no meio sem aviso. */
  var cMat = cab.indexOf('MATRICULA'); if (cMat < 0) cMat = 0;
  var cNome = -1, cCod = -1;
  for (var c = 0; c < cab.length; c++) {
    if (cNome < 0 && cab[c].indexOf('NOME') === 0) cNome = c;
    if (cCod < 0 && (cab[c].indexOf('CODIGO') === 0 || cab[c] === 'SAL')) cCod = c;
  }
  if (cNome < 0) cNome = 1;
  if (cCod < 0) cCod = 2;

  for (var i = 1; i < valores.length; i++) {
    if (_digitos(valores[i][cMat]) !== alvo) continue;
    var codigo = _texto(valores[i][cCod]).toUpperCase();
    if (!codigo) continue;
    return { linha: i + 1, nome: _texto(valores[i][cNome]), codigo: codigo };
  }
  return null;
}

/* Aceita o código do PORTAL_ACESSO (hash) OU o do SAL_CODIGOS (texto). Ter as
 * duas fontes é o que evita a situação em que a Coordenadoria regera o código
 * numa aba e o servidor continua sendo recusado pela outra. */
function _autenticar(dados) {
  var mat = _digitos(dados.matricula);
  var acesso = _buscarAcesso(dados.matricula);
  var sal = _buscarSal(dados.matricula);

  if (!acesso && !sal) {
    return { ok: false, erro: 'Matrícula não encontrada no cadastro do portal.' };
  }
  if (acesso && _valor(acesso.valores, acesso.indices, 'ATIVO') === 'NAO') {
    return { ok: false, erro: 'Este acesso está desativado. Procure a Coordenadoria.' };
  }

  var guardado = acesso ? _valor(acesso.valores, acesso.indices, 'CODIGO_HASH') : '';
  var doSal = sal ? _hash(sal.codigo) : '';
  var referencia = guardado || doSal;

  if (dados.token) {
    var vale = (guardado && _iguais(dados.token, _token(mat, guardado))) ||
               (doSal && _iguais(dados.token, _token(mat, doSal)));
    if (!vale) {
      return { ok: false, erro: 'Sua sessão expirou. Entre novamente com o código.' };
    }
    return { ok: true, acesso: acesso, sal: sal, referencia: referencia };
  }

  var digitado = _hash(_texto(dados.codigo).toUpperCase());
  var confere = (guardado && _iguais(digitado, guardado)) ||
                (doSal && _iguais(digitado, doSal));
  if (!confere) return { ok: false, erro: 'Código de acesso incorreto.' };

  return { ok: true, acesso: acesso, sal: sal, referencia: referencia, novo: true };
}

/* Token administrativo: renova sozinho a cada 12h, sem precisar de tabela de
 * sessão — mesma ideia do _token() do servidor, só que a "época" é mais curta
 * porque um acesso que enxerga qualquer matrícula pede sessão mais curta. */
function _tokenAdmin() {
  var epoca = Math.floor(Date.now() / (12 * 60 * 60 * 1000));
  return _hash('ADMIN|' + ADMIN_SENHA_HASH + '|' + epoca);
}

function _autenticarAdmin(dados) {
  if (dados.token_admin) {
    if (!_iguais(dados.token_admin, _tokenAdmin())) {
      return { ok: false, erro: 'Sessão administrativa expirada. Entre novamente.' };
    }
    return { ok: true };
  }
  if (_normalizar(dados.usuario) !== _normalizar(ADMIN_USUARIO) ||
      !_iguais(_hash(_texto(dados.senha)), ADMIN_SENHA_HASH)) {
    return { ok: false, erro: 'Usuário ou senha administrativa incorretos.' };
  }
  return { ok: true };
}

// ===========================================================================
// JORNADA
// ===========================================================================
function _fichaDoServidor(matricula) {
  var aba = _abaBolsistas();
  if (!aba) return null;
  var valores = aba.getDataRange().getValues();
  var indices = { mapa: {} };
  valores[0].forEach(function (nome, i) {
    var limpo = _texto(nome);
    if (limpo) { indices.mapa[limpo] = i; indices.mapa[_normalizar(limpo)] = i; }
  });
  var alvo = _digitos(matricula);
  for (var i = 1; i < valores.length; i++) {
    var mat = _digitos(_valor(valores[i], indices, 'MATRÍCULA') ||
                       _valor(valores[i], indices, 'MATRICULA'));
    if (mat !== alvo) continue;
    var campos = {};
    valores[0].forEach(function (nome, c) {
      var limpo = _texto(nome);
      if (limpo) campos[limpo] = _texto(valores[i][c]);
    });
    return campos;
  }
  return null;
}

function _preenchido(campos, colunas) {
  for (var i = 0; i < colunas.length; i++) {
    var valor = _texto(campos[colunas[i]]);
    if (valor && !/^(-|—|n[aã]o|nada|pendente)$/i.test(valor)) return valor;
  }
  return '';
}

/* Os prazos NÃO são inventados aqui. Cada um aponta a norma que o institui, e
 * a data vem do que já está registrado (início do curso, data de implantação).
 * Prazo sem base normativa citada é palpite, e palpite sobre prazo é a única
 * coisa pior que não avisar. */
function _prazos(campos, marcos) {
  var lista = [];
  var hoje = new Date();

  function acrescentar(id, titulo, detalhe, vence, base, cumprido) {
    if (!vence) return;
    lista.push({
      id: id, titulo: titulo, detalhe: detalhe,
      vence: Utilities.formatDate(vence, FUSO, 'dd/MM/yyyy'),
      vence_iso: Utilities.formatDate(vence, FUSO, "yyyy-MM-dd'T'12:00:00"),
      base_legal: base, cumprido: Boolean(cumprido)
    });
  }

  // Comprovação semestral: prazo fixado pela Coordenadoria dentro do semestre.
  var semestres = [
    { id: 'comprovacao_2025_2', rotulo: '2025.2', mes: 2, dia: 28, ano: 2026 },
    { id: 'comprovacao_2026_1', rotulo: '2026.1', mes: 8, dia: 31, ano: 2026 }
  ];
  semestres.forEach(function (semestre) {
    var marco = marcos.filter(function (m) { return m.id === semestre.id; })[0];
    acrescentar(
      semestre.id,
      'Comprovação semestral ' + semestre.rotulo,
      'Histórico ou declaração de frequência e aproveitamento do semestre, ' +
      'protocolado no Digidoc.',
      new Date(semestre.ano, semestre.mes - 1, semestre.dia),
      'Resolução-GP nº 1/2023 — obrigação de comprovação periódica.',
      marco && marco.cumprido);
  });

  // Diploma: exigível após o término previsto do curso.
  var termino = _texto(campos['TÉRMINO DO CURSO']);
  if (termino) {
    var partes = termino.match(/(\d{2})\/(\d{2})\/(\d{4})/);
    if (partes) {
      var fim = new Date(+partes[3], +partes[2] - 1, +partes[1]);
      fim.setDate(fim.getDate() + 90);
      var marcoDiploma = marcos.filter(function (m) { return m.id === 'diploma'; })[0];
      acrescentar('diploma', 'Entrega do diploma ou certificado',
        'Prazo de 90 dias após o término previsto do curso.',
        fim, 'Resolução-GP nº 1/2023 — comprovação da conclusão.',
        marcoDiploma && marcoDiploma.cumprido);
    }
  }

  var pendencia = _texto(campos['PENDÊNCIA'] || campos['PENDENCIA']);
  var prazoFicha = _texto(campos['PRAZO']);
  if (pendencia) {
    var data = prazoFicha.match(/(\d{2})\/(\d{2})\/(\d{4})/);
    acrescentar('pendencia_ficha', 'Pendência apontada pela Coordenadoria',
      pendencia,
      data ? new Date(+data[3], +data[2] - 1, +data[1])
           : new Date(hoje.getTime() + 15 * 86400000),
      data ? 'Prazo registrado no processo.'
           : 'Prazo estimado de 15 dias. Confirme com a Coordenadoria.',
      false);
  }

  return lista;
}

function _narrativa(nome, conformidade, prazos) {
  var primeiro = _texto(nome).split(' ')[0] || 'Você';
  var vencidos = prazos.filter(function (p) {
    return !p.cumprido && new Date(p.vence_iso) < new Date();
  }).length;

  if (conformidade.nivel === 'COMPLETO') {
    return primeiro + ', seu percurso está completo: todas as etapas previstas ' +
           'têm registro na Coordenadoria. Não há nada pendente do seu lado.';
  }
  if (vencidos) {
    return primeiro + ', há ' + vencidos + ' prazo(s) vencido(s). Regularizar ' +
           'agora evita a suspensão do benefício — veja a aba Prazos.';
  }
  if (conformidade.nivel === 'CRÍTICO') {
    return primeiro + ', a maior parte das etapas ainda não tem registro. ' +
           'Vale procurar a Coordenadoria para acertar o que falta.';
  }
  return primeiro + ', você já cumpriu ' + conformidade.cumpridos + ' de ' +
         conformidade.total + ' etapas. Falta pouco — confira o que ainda está ' +
         'em aberto.';
}

/* ---------------------------------------------------------------------------
 * PERCURSO — a árvore de processos do servidor
 *
 * Lê ARVORE_PROCESSOS, o espelho calculado que a ingestão do Digidoc grava.
 * Nada é recalculado aqui: se a árvore está desatualizada, o problema é de
 * ingestão, e inventar um percurso plausível a partir de outra fonte só
 * mascararia isso.
 *
 * O QUE O SERVIDOR VÊ: número, assunto, unidade onde está, situação, data da
 * última movimentação. O QUE FICA DE FORA: o nome de quem está com o processo
 * na mão. É servidor de outro setor, não é dado do bolsista, e mostrar isso
 * transforma consulta de andamento em cobrança pessoal a um colega.
 * ------------------------------------------------------------------------- */
function _percurso(matricula, processoPrincipal) {
  var vazio = { disponivel: false, principal: null, ramos: [], total: 0 };
  var aba = _planilha().getSheetByName(ABA_ARVORE);
  if (!aba || aba.getLastRow() < 2) return vazio;

  var valores = aba.getDataRange().getValues();
  var mapa = {};
  valores[0].forEach(function (nome, i) {
    var limpo = _normalizar(nome);
    if (limpo) mapa[limpo] = i;
  });
  function ler(linha, coluna) {
    var i = mapa[coluna];
    return i === undefined ? '' : _texto(linha[i]);
  }

  var alvo = _digitos(matricula);
  var raiz = _digitos(processoPrincipal);
  var nos = [];
  for (var i = 1; i < valores.length; i++) {
    var linha = valores[i];
    var mat = _digitos(ler(linha, 'MATRICULA'));
    var principal = _digitos(ler(linha, 'PROCESSOPRINCIPAL'));
    var numero = _digitos(ler(linha, 'NUMERO'));
    var meu = (alvo && mat === alvo) ||
              (raiz && (principal === raiz || numero === raiz));
    if (!meu) continue;

    nos.push({
      numero: numero,
      numero_legivel: ler(linha, 'NUMEROLEGIVEL') ||
        (numero.length >= 5 ? numero.slice(0, -4) + '/' + numero.slice(-4) : numero),
      nivel: parseInt(ler(linha, 'NIVEL'), 10) || 1,
      tipo: ler(linha, 'TIPONO'),
      assunto: ler(linha, 'ASSUNTO'),
      unidade: ler(linha, 'UNIDADEATUAL'),
      situacao: ler(linha, 'STATUSATUAL') || ler(linha, 'TIPOULTIMAMOV'),
      primeira_mov: ler(linha, 'DTPRIMEIRAMOV'),
      ultima_mov: ler(linha, 'DTULTIMAMOV'),
      dias_parado: parseInt(ler(linha, 'DIASPARADO'), 10) || 0,
      movimentacoes: parseInt(ler(linha, 'QTDMOVIMENTACOES'), 10) || 0,
      principal: principal
    });
  }
  if (!nos.length) return vazio;

  /* Nível 1 é o processo de origem; o resto são as requisições que saíram
   * dele, mais recentes primeiro — é essa a ordem em que a pessoa procura. */
  var principais = nos.filter(function (no) { return no.nivel <= 1; });
  var ramos = nos.filter(function (no) { return no.nivel > 1; });
  ramos.sort(function (a, b) {
    return String(b.ultima_mov).split('/').reverse().join('')
         < String(a.ultima_mov).split('/').reverse().join('') ? -1 : 1;
  });

  return {
    disponivel: true,
    principal: principais[0] || null,
    ramos: ramos,
    total: nos.length,
    atualizado_em: _agora()
  };
}

function _jornada(matricula) {
  var campos = _fichaDoServidor(matricula);
  if (!campos) return { ok: false, erro: 'Não achei seu cadastro na base.' };

  var marcos = MARCOS.map(function (marco) {
    var evidencia = _preenchido(campos, marco.colunas);
    return {
      id: marco.id, titulo: marco.titulo, descricao: marco.descricao,
      como_cumprir: marco.comoCumprir,
      cumprido: Boolean(evidencia), evidencia: evidencia
    };
  });

  var cumpridos = marcos.filter(function (m) { return m.cumprido; }).length;
  var conformidade = {
    cumpridos: cumpridos, total: marcos.length,
    percentual: Math.round((cumpridos / marcos.length) * 100),
    nivel: cumpridos === marcos.length ? 'COMPLETO'
         : cumpridos >= marcos.length * 0.7 ? 'REGULAR'
         : cumpridos >= marcos.length * 0.4 ? 'PARCIAL' : 'CRÍTICO'
  };

  var prazos = _prazos(campos, marcos);
  var processo = _digitos(campos['PROCESSO ORIGEM']);

  /* O app do bolsista mostra o que é DELE. Valor de contrato, observação
   * interna e anotação de análise ficam de fora: são campos de trabalho da
   * Coordenadoria, e expor tudo "porque é dado dele" é como as coisas vazam. */
  return {
    ok: true,
    matricula: _digitos(matricula),
    nome: campos['NOME'] || '',
    processo: processo,
    processo_legivel: processo.length >= 5
      ? processo.slice(0, -4) + '/' + processo.slice(-4) : processo,
    curso: campos['CURSO'] || '',
    tipo_bolsa: campos['TIPO DE BOLSA'] || '',
    status: campos['STATUS'] || '',
    inicio_curso: campos['INÍCIO DO CURSO'] || '',
    termino_curso: campos['TÉRMINO DO CURSO'] || '',
    marcos: marcos,
    prazos: prazos,
    percurso: _percurso(matricula, processo),
    conformidade: conformidade,
    narrativa: _narrativa(campos['NOME'], conformidade, prazos),
    atualizado_em: _agora()
  };
}

// ===========================================================================
// ROTEAMENTO
// ===========================================================================
function doGet(e) {
  var parametros = (e && e.parameter) || {};
  if (parametros.acao === 'ping') {
    return _resposta({ ok: true, servico: 'portal-auxilio-bolsa',
                       versao: '1.0.0', agora: _agora() });
  }
  return _resposta({ ok: false,
                     erro: 'Use POST. Este endereço serve o aplicativo do servidor.' });
}

function doPost(e) {
  var dados = {};
  try {
    dados = JSON.parse((e && e.postData && e.postData.contents) || '{}');
  } catch (erro) {
    return _resposta({ ok: false, erro: 'Requisição malformada.' });
  }

  var acao = dados.acao || ((e && e.parameter) || {}).acao || '';

  // Uma trava por matrícula evita que dois envios simultâneos do mesmo celular
  // gravem por cima. Trava global seria pior: serializaria a Coordenadoria
  // inteira num horário de pico.
  var trava = LockService.getScriptLock();
  try {
    trava.waitLock(15000);
  } catch (erro) {
    return _resposta({ ok: false, erro: 'O serviço está ocupado. Tente de novo.' });
  }

  try {
    if (acao === 'entrar') return _resposta(_acaoEntrar(dados));
    if (acao === 'jornada') return _resposta(_acaoJornada(dados));
    if (acao === 'avisar_entrega') return _resposta(_acaoAvisar(dados));
    if (acao === 'consentimento') return _resposta(_acaoConsentimento(dados));
    if (acao === 'entrar_admin') return _resposta(_acaoEntrarAdmin(dados));
    if (acao === 'jornada_admin') return _resposta(_acaoJornadaAdmin(dados));
    if (acao === 'buscar_servidores') return _resposta(_acaoBuscarServidores(dados));
    if (acao === 'diagnostico') return _resposta(_acaoDiagnostico(dados));
    return _resposta({ ok: false, erro: 'Ação desconhecida: ' + acao });
  } catch (erro) {
    return _resposta({ ok: false, erro: 'Falha no serviço: ' + erro.message });
  } finally {
    trava.releaseLock();
  }
}

function _acaoEntrar(dados) {
  var conferencia = _autenticar(dados);
  if (!conferencia.ok) return conferencia;

  var acesso = conferencia.acesso;
  var nome = '';

  /* Quem entrou pelo SAL_CODIGOS pode não ter linha no PORTAL_ACESSO. Isso não
   * pode impedir a entrada: a contagem de acessos é registro de uso, não parte
   * da autenticação. Falhar aqui derrubaria um login legítimo por causa de uma
   * estatística. */
  if (acesso) {
    var indices = acesso.indices;
    nome = _valor(acesso.valores, indices, 'NOME');
    try {
      acesso.aba.getRange(acesso.linha, indices.mapa.ULTIMO_ACESSO + 1)
        .setValue(_agora());
      acesso.aba.getRange(acesso.linha, indices.mapa.ACESSOS + 1)
        .setValue((parseInt(_valor(acesso.valores, indices, 'ACESSOS'), 10) || 0) + 1);
    } catch (erro) { /* registro de uso é acessório */ }
  }
  if (!nome && conferencia.sal) nome = conferencia.sal.nome;

  return {
    ok: true,
    nome: nome,
    token: _token(_digitos(dados.matricula), conferencia.referencia)
  };
}

function _acaoJornada(dados) {
  var conferencia = _autenticar(dados);
  if (!conferencia.ok) return conferencia;
  return _jornada(dados.matricula);
}

// ===========================================================================
// ADMINISTRATIVO (Coordenadoria) — consulta a jornada de qualquer servidor
// ===========================================================================
function _acaoEntrarAdmin(dados) {
  var conferencia = _autenticarAdmin(dados);
  if (!conferencia.ok) return conferencia;
  return { ok: true, token_admin: _tokenAdmin() };
}

function _acaoJornadaAdmin(dados) {
  var conferencia = _autenticarAdmin(dados);
  if (!conferencia.ok) return conferencia;
  if (!_digitos(dados.matricula)) {
    return { ok: false, erro: 'Informe a matrícula do servidor.' };
  }
  var saida = _jornada(dados.matricula);
  saida.admin = true;
  return saida;
}

/** Busca por matrícula (prefixo) ou nome (substring), só para o modo admin.
 *  Sem termo, devolve os 25 primeiros cadastrados — o suficiente para
 *  conferir que a base está lendo, sem despejar a planilha inteira no app. */
/* Diz em uma resposta só o que o serviço está enxergando: qual aba virou a
 * ficha do bolsista, se o SAL_CODIGOS foi achado, se a árvore existe. É o
 * atalho para não caçar "não achei seu cadastro" no escuro. Exige senha
 * administrativa porque a lista de abas descreve a planilha inteira. */
function _acaoDiagnostico(dados) {
  var conferencia = _autenticarAdmin(dados);
  if (!conferencia.ok) return conferencia;

  var planilha = _planilha();
  var ficha = _abaBolsistas();
  var sal = planilha.getSheetByName(ABA_SAL);
  var arvore = planilha.getSheetByName(ABA_ARVORE);
  var acesso = planilha.getSheetByName(ABA_ACESSO);

  return {
    ok: true,
    planilha: planilha.getName(),
    abas: planilha.getSheets().map(function (a) { return a.getName(); }),
    ficha_bolsistas: ficha ? { aba: ficha.getName(), linhas: ficha.getLastRow() - 1 }
                           : { aba: null, aviso: 'Nenhuma aba com MATRÍCULA + CURSO/SELETIVO/TIPO DE BOLSA.' },
    sal_codigos: sal ? { aba: sal.getName(), linhas: sal.getLastRow() - 1 } : null,
    portal_acesso: acesso ? { aba: acesso.getName(), linhas: acesso.getLastRow() - 1 } : null,
    arvore: arvore ? { aba: arvore.getName(), linhas: arvore.getLastRow() - 1 } : null,
    agora: _agora()
  };
}

function _acaoBuscarServidores(dados) {
  var conferencia = _autenticarAdmin(dados);
  if (!conferencia.ok) return conferencia;

  var aba = _abaBolsistas();
  if (!aba) return { ok: true, resultados: [] };

  var valores = aba.getDataRange().getValues();
  var indices = { mapa: {} };
  valores[0].forEach(function (nome, i) {
    var limpo = _texto(nome);
    if (limpo) { indices.mapa[limpo] = i; indices.mapa[_normalizar(limpo)] = i; }
  });

  var termoNome = _normalizar(dados.busca || '');
  var termoMatricula = _digitos(dados.busca || '');
  var resultados = [];
  for (var i = 1; i < valores.length && resultados.length < 25; i++) {
    var matricula = _digitos(_valor(valores[i], indices, 'MATRÍCULA') ||
                             _valor(valores[i], indices, 'MATRICULA'));
    var nome = _valor(valores[i], indices, 'NOME');
    if (!matricula) continue;
    var bate = (!termoNome && !termoMatricula) ||
      (termoMatricula && matricula.indexOf(termoMatricula) === 0) ||
      (termoNome && _normalizar(nome).indexOf(termoNome) >= 0);
    if (bate) {
      resultados.push({ matricula: matricula, nome: nome,
                        status: _valor(valores[i], indices, 'STATUS') });
    }
  }
  return { ok: true, resultados: resultados };
}

function _acaoAvisar(dados) {
  var conferencia = _autenticar(dados);
  if (!conferencia.ok) return conferencia;

  var aba = _aba(ABA_AVISOS, COL_AVISOS);
  var indices = _indices(aba);

  // Aviso repetido (o app reenviou da fila) não vira linha duplicada.
  if (aba.getLastRow() > 1) {
    var existentes = aba.getRange(2, indices.mapa.ID + 1, aba.getLastRow() - 1, 1)
      .getValues();
    for (var i = 0; i < existentes.length; i++) {
      if (_texto(existentes[i][0]) === _texto(dados.id)) {
        return { ok: true, repetido: true };
      }
    }
  }

  var nome = _valor(conferencia.acesso.valores, conferencia.acesso.indices, 'NOME');
  var linha = new Array(indices.largura).fill('');
  linha[indices.mapa.ID] = _texto(dados.id);
  linha[indices.mapa.MATRICULA] = _digitos(dados.matricula);
  linha[indices.mapa.NOME] = nome;
  linha[indices.mapa.TIPO] = _texto(dados.tipo);
  linha[indices.mapa.TIPO_TEXTO] = _texto(dados.tipo_texto);
  linha[indices.mapa.VIA] = _texto(dados.via);
  linha[indices.mapa.PROTOCOLO] = _texto(dados.protocolo);
  linha[indices.mapa.OBSERVACAO] = _texto(dados.observacao);
  linha[indices.mapa.CRIADO_EM_APP] = _texto(dados.criado_em);
  linha[indices.mapa.RECEBIDO_EM] = _agora();
  linha[indices.mapa.SITUACAO] = 'A CONFERIR';

  aba.getRange(aba.getLastRow() + 1, 1, 1, indices.largura).setValues([linha]);
  return { ok: true };
}

function _acaoConsentimento(dados) {
  var conferencia = _autenticar(dados);
  if (!conferencia.ok) return conferencia;

  var aba = _aba(ABA_CONSENTIMENTO, COL_CONSENTIMENTO);
  var indices = _indices(aba);
  var nome = _valor(conferencia.acesso.valores, conferencia.acesso.indices, 'NOME');

  /* Cada mudança vira uma LINHA NOVA, e a revogação não apaga a autorização
   * anterior. Em LGPD o que se precisa demonstrar é o histórico: o que foi
   * consentido, quando, e quando deixou de valer. Sobrescrever a linha
   * destruiria exatamente a prova que o registro existe para produzir. */
  var linha = new Array(indices.largura).fill('');
  linha[indices.mapa.MATRICULA] = _digitos(dados.matricula);
  linha[indices.mapa.NOME] = nome;
  linha[indices.mapa.NUMERO] = _digitos(dados.numero);
  linha[indices.mapa.CONSENTE] = dados.consente ? 'SIM' : 'NAO';
  linha[indices.mapa.TEXTO] = _texto(dados.texto);
  linha[indices.mapa.REGISTRADO_EM] = _agora();
  linha[indices.mapa.REVOGADO_EM] = dados.consente ? '' : _agora();
  linha[indices.mapa.ORIGEM] = 'PWA';

  aba.getRange(aba.getLastRow() + 1, 1, 1, indices.largura).setValues([linha]);
  return { ok: true };
}
