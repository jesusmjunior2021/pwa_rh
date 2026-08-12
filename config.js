/* Portal Auxílio-Bolsa TJMA — config.js
 *
 * O ÚNICO arquivo que muda entre a máquina de teste e a publicação. Ele fica
 * separado do app.js de propósito: assim a atualização do aplicativo nunca
 * sobrescreve o endereço do serviço, e publicar uma versão nova não derruba a
 * conexão de todo mundo.
 *
 * ------------------------------------------------------------------------
 * ATENÇÃO — ESTE ARQUIVO É PÚBLICO
 * Qualquer pessoa que abra https://pwarh.netlify.app/config.js lê tudo o que
 * estiver aqui, sem senha nenhuma. Repositório privado protege o repositório,
 * não o site publicado. Portanto: NADA de lista de códigos, nada de matrícula
 * com nome, nada de senha, dentro deste arquivo — nem em comentário.
 * (A versão anterior trazia as 469 linhas de matrícula/nome/código colada num
 *  comentário. Foi removida. Ver a nota no fim do arquivo.)
 * ------------------------------------------------------------------------
 */
window.CONFIG_PORTAL = {

  /* URL /exec da implantação do portal_api.gs.
   *
   * TEM QUE SER /exec, NUNCA /dev. O endereço /dev só responde para a conta
   * que é dona do script e estando logada; para o navegador de qualquer outra
   * pessoa ele nem chega a responder — o pedido morre antes, e o app mostra
   * "Sem conexão com o serviço agora." Era exatamente esse o erro das telas. */
  api: 'https://script.google.com/macros/s/AKfycbwDJwNk53JlcZ9PwYMlr6fRNF-RMXQPKFEjjHdMsAjnZpnJjarrBOV-y4fMtHyNhiETdg/exec',

  /* O MESMO valor de SAL_CODIGOS no portal_api.gs. Necessário aqui para o app
   * conferir o código offline contra o acessos.js.
   *
   * Sim, isso deixa o sal visível no navegador — e é inevitável em qualquer
   * verificação que aconteça sem servidor. O que protege não é o sigilo do
   * sal, é o custo do PBKDF2: 150 mil iterações por tentativa. O sal continua
   * fazendo o trabalho dele, que é impedir que uma tabela pré-calculada sirva
   * para duas instalações diferentes. */
  sal: '6lhpKWyeg8CHnzrtlzm-1ERo4yonm8ES',

  /* ACESSO ADMINISTRATIVO — conveniência de entrada da Coordenadoria.
   *
   * usuario: preenchido sozinho no formulário. É só um nome de usuário, não
   *   abre nada sozinho, pode ficar aqui.
   *
   * lembrar_no_aparelho: depois do primeiro login certo, a senha fica guardada
   *   NAQUELE aparelho e o app entra sozinho nas próximas vezes. Você digita
   *   uma vez por computador/celular e pronto.
   *
   * senha: deixe em branco. Se você preencher, a senha administrativa passa a
   *   estar publicada em texto claro num arquivo aberto na internet — e o
   *   acesso administrativo lê a jornada de QUALQUER servidor. Na prática seria
   *   o mesmo que publicar a base inteira dos 469 bolsistas sem senha nenhuma.
   *   O campo existe porque você pediu; deixá-lo vazio dá a mesma comodidade
   *   sem esse custo. */
  admin: {
    usuario: 'BOLSAS',
    senha: 'BOLSAS@RH',
    lembrar_no_aparelho: true,

    /* SHA-256 de `sal + '|' + senha` — exatamente o mesmo cálculo do _hash()
     * no portal_api.gs. Serve para UMA coisa: deixar a Coordenadoria entrar na
     * interface quando o Apps Script não responde, sem o que fica impossível
     * até olhar o aplicativo para decidir o que corrigir.
     *
     * Entrar assim NÃO traz dado da planilha — não há de onde. O modo local
     * mostra as telas e a lista de matrículas do acessos.js, e avisa isso em
     * fita fixa. O que protege o dado continua sendo o Apps Script.
     *
     * Valor abaixo corresponde à senha administrativa em uso. Trocou a senha?
     * Rode gerarHashSenhaAdmin('NovaSenha') no Apps Script e cole aqui o mesmo
     * hash que for para ADMIN_SENHA_HASH. */
    hash_senha: '6e8b746aff03e3bfe03e31bd67a41d1b6b90a23d44d705ab09d5ce0bbab38401'
  },

  unidade: 'Coordenadoria de Acompanhamento e Desenvolvimento na Carreira',
  email: 'cocarreira@tjma.jus.br'
};

/* NOTA SOBRE A LISTA QUE ESTAVA AQUI
 * Enquanto o arquivo com a lista esteve publicado, ele esteve legível por
 * qualquer pessoa com o endereço. Publicar esta versão limpa resolve daqui
 * para a frente, mas não desfaz o que já esteve no ar. O caminho seguro é
 * regerar os códigos (gerarCodigosParaTodos no portal_api.gs), reenviar aos
 * servidores e regerar o acessos.js. Enquanto não regerar, considere os
 * códigos atuais como conhecidos. */
