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
  api: 'https://script.google.com/macros/s/AKfycbyRwQ2D4ehR7brT31u46rt9XjIQhsmht7gpE9b3XUO3MyNQ8Hn77f6b0opGLuad19jz4Q/exec',   // ex.: https://script.google.com/macros/s/AKfy.../exec
  unidade: 'Coordenadoria de Acompanhamento e Desenvolvimento na Carreira',
  email: 'cocarreira@tjma.jus.br'
};
