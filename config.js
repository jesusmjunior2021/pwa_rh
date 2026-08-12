/* Portal Auxílio-Bolsa TJMA — config.js
 *
 * O ÚNICO arquivo que muda entre a máquina de teste e a publicação. Ele fica
 * separado do app.js de propósito: assim a atualização do aplicativo nunca
 * sobrescreve o endereço do serviço, e publicar uma versão nova não derruba a
 * conexão de todo mundo.
 *
 * Cole aqui a URL /exec da implantação do portal_api.gs.
 */
window.CONFIG_PORTAL = {
  api: '',   // ex.: https://script.google.com/macros/s/AKfy.../exec

  /* O MESMO valor de SAL_CODIGOS no portal_api.gs. Ele é necessário aqui para
   * o app conferir o código offline contra o acessos.js.
   *
   * Sim, isso deixa o sal visível no navegador — e é inevitável em qualquer
   * verificação que aconteça sem servidor. O que o protege não é o sigilo do
   * sal, é o custo do PBKDF2: 150 mil iterações por tentativa. O sal continua
   * fazendo o trabalho dele, que é impedir tabela pré-calculada servir para
   * duas instalações diferentes. */
  sal: '6lhpKWyeg8CHnzrtlzm-1ERo4yonm8ES',
  unidade: 'Coordenadoria de Acompanhamento e Desenvolvimento na Carreira',
  email: 'cocarreira@tjma.jus.br'
};
