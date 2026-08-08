/* Portal Auxílio-Bolsa TJMA — config.js
 *
 * O ÚNICO arquivo que muda entre a máquina de teste e a publicação. Ele fica
 * separado do app.js de propósito: assim a atualização do aplicativo nunca
 * sobrescreve o endereço do serviço, e publicar uma versão nova não derruba a
 * conexão de todo mundo.
 *
 * Cole aqui a URL /exec da implantação do portal_api.gs.
 *
 * COMO TESTAR SE A URL ESTÁ CERTA, ANTES DE COLAR AQUI:
 * abra SUA_URL_AQUI/exec?acao=ping direto no navegador (não precisa ser no
 * celular, pode ser no computador). Tem que responder um JSON assim:
 *   {"ok":true,"servico":"portal-auxilio-bolsa","versao":"1.0.0","agora":"..."}
 * Se em vez disso abrir uma tela de login do Google, ou der erro 401/403, a
 * implantação está com "Quem pode acessar" errado — tem que ser
 * "Qualquer pessoa", não "Qualquer pessoa com uma Conta do Google".
 */
window.CONFIG_PORTAL = {
  api: 'https://script.google.com/macros/s/AKfycbwWq5q8ihvqP8O6oPymC0mx5QRSwmN-OcRZTekRBQ-23g17xLFmM2VedYFPId96clyrYA/exec',   // ex.: https://script.google.com/macros/s/AKfy.../exec — COLE AQUI
  unidade: 'Coordenadoria de Acompanhamento e Desenvolvimento na Carreira',
  email: 'cocarreira@tjma.jus.br'
};
