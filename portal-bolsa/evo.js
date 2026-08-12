/* Portal Auxílio-Bolsa TJMA — evo.js
 *
 * EVO, o mascote da COCARREIRA. Desenhado aqui em SVG, não importado como
 * imagem, por três motivos concretos:
 *
 *   1. ESCALA. Vetor em traço fino no ícone de 40px e na ilustração de 240px é
 *      o mesmo arquivo. PNG exigiria seis exportações e ainda ficaria borrado
 *      no aparelho de densidade alta.
 *   2. ESTADO. O EVO precisa mudar de expressão conforme o que acontece com o
 *      servidor — comemorar um carimbo, alertar um prazo vencido. Isso é
 *      atributo, não arquivo novo.
 *   3. PESO. Os quatro estágios inteiros custam menos que um único PNG de 512px,
 *      e o app é usado em rede 3G no interior do Maranhão.
 *
 * A IDEIA DO PERSONAGEM
 * "Evo" de evolução. Ele NÃO é um mascote fixo que aparece do lado do texto —
 * ele CRESCE junto com a jornada do servidor. Semente, broto, muda, árvore.
 * A escolha resolve um problema real de gamificação institucional: pontos de
 * experiência e troféus infantilizam um benefício público, mas uma planta que
 * cresce porque a pessoa cumpriu etapas é uma metáfora que o adulto aceita —
 * e que diz a verdade sobre o que está acontecendo (formação é crescimento).
 *
 * O estágio é derivado da conformidade, nunca inventado: 0–24% semente,
 * 25–49% broto, 50–74% muda, 75–100% árvore.
 *
 * SOBRE A CONSTRUÇÃO DA FORMA
 * O personagem segue os princípios clássicos de mascote animado — silhueta
 * legível em preto no tamanho de um polegar, olhos grandes e baixos no rosto,
 * formas arredondadas sem quina, assimetria leve para não parecer ícone de
 * sistema. Não copia nenhum personagem existente: é construção própria a partir
 * das mesmas regras de ofício.
 */
(function (raiz) {
  'use strict';

  // As cores saem das variáveis CSS quando disponíveis, para o mascote seguir
  // o tema sem duplicar a paleta em dois lugares.
  const COR = {
    oliva: 'var(--oliva, #6B7A3F)',
    olivaClaro: 'var(--oliva-claro, #97A667)',
    azul: 'var(--azul, #1B4F8A)',
    laranja: 'var(--laranja, #D4762A)',
    cinza: 'var(--cinza, #8A9098)',
    terra: 'var(--terra, #B9A88A)',
    branco: 'var(--superficie, #FFFFFF)',
    tinta: 'var(--tinta, #22272B)'
  };

  const ESTAGIOS = [
    { id: 'semente', minimo: 0, nome: 'Semente',
      legenda: 'Tudo começa aqui.' },
    { id: 'broto', minimo: 25, nome: 'Broto',
      legenda: 'Começou a crescer.' },
    { id: 'muda', minimo: 50, nome: 'Muda',
      legenda: 'Firme, mais da metade do caminho.' },
    { id: 'arvore', minimo: 75, nome: 'Árvore',
      legenda: 'Percurso maduro.' }
  ];

  function estagioDe(percentual) {
    const p = Number(percentual) || 0;
    let escolhido = ESTAGIOS[0];
    for (const estagio of ESTAGIOS) if (p >= estagio.minimo) escolhido = estagio;
    return escolhido;
  }

  // ---------------------------------------------------------------------------
  // ROSTO
  // ---------------------------------------------------------------------------
  /* Os olhos ficam BAIXOS no corpo e bem separados. É a regra que faz um
   * personagem parecer simpático em vez de vigilante: olho alto e junto lê
   * como ameaça, mesmo em traço mínimo. */
  function rosto(expressao, cx, cy, escala) {
    const e = escala || 1;
    const r = 5.2 * e;
    const dx = 9 * e;

    const olho = (x, fechado) => fechado
      ? `<path d="M${x - r} ${cy} q ${r} ${r * 0.85} ${r * 2} 0"
           fill="none" stroke="${COR.tinta}" stroke-width="${2 * e}"
           stroke-linecap="round"/>`
      : `<circle cx="${x}" cy="${cy}" r="${r}" fill="${COR.tinta}"/>
         <circle cx="${x + r * 0.32}" cy="${cy - r * 0.36}" r="${r * 0.34}"
                 fill="${COR.branco}"/>`;

    const bocas = {
      neutro: `<path d="M${cx - 5 * e} ${cy + 11 * e} q ${5 * e} ${3.4 * e} ${10 * e} 0"
                 fill="none" stroke="${COR.tinta}" stroke-width="${2.1 * e}"
                 stroke-linecap="round"/>`,
      feliz: `<path d="M${cx - 7 * e} ${cy + 9 * e} q ${7 * e} ${8 * e} ${14 * e} 0"
                fill="${COR.tinta}" stroke="none"/>`,
      alerta: `<ellipse cx="${cx}" cy="${cy + 12 * e}" rx="${3.6 * e}" ry="${4.4 * e}"
                 fill="${COR.tinta}"/>`,
      dormindo: `<path d="M${cx - 4 * e} ${cy + 12 * e} h ${8 * e}"
                   fill="none" stroke="${COR.tinta}" stroke-width="${2 * e}"
                   stroke-linecap="round"/>`
    };

    // Sobrancelha só no alerta. Personagem com sobrancelha permanente fica com
    // uma emoção fixa que briga com todas as outras expressões.
    const sobrancelha = expressao === 'alerta'
      ? `<path d="M${cx - dx - r} ${cy - r * 2.2} l ${r * 1.7} ${-r * 0.5}"
           stroke="${COR.tinta}" stroke-width="${2 * e}" stroke-linecap="round"/>
         <path d="M${cx + dx + r} ${cy - r * 2.2} l ${-r * 1.7} ${-r * 0.5}"
           stroke="${COR.tinta}" stroke-width="${2 * e}" stroke-linecap="round"/>`
      : '';

    // Bochecha só quando feliz: o rubor é o que diferencia "sorrindo" de
    // "sorriso educado".
    const bochecha = expressao === 'feliz'
      ? `<ellipse cx="${cx - dx - r * 1.5}" cy="${cy + 6 * e}" rx="${3.4 * e}"
           ry="${2.2 * e}" fill="${COR.laranja}" opacity=".42"/>
         <ellipse cx="${cx + dx + r * 1.5}" cy="${cy + 6 * e}" rx="${3.4 * e}"
           ry="${2.2 * e}" fill="${COR.laranja}" opacity=".42"/>`
      : '';

    const fechado = expressao === 'dormindo';
    return sobrancelha + bochecha +
      olho(cx - dx, fechado) + olho(cx + dx, fechado) +
      (bocas[expressao] || bocas.neutro);
  }

  // ---------------------------------------------------------------------------
  // ESTÁGIOS
  // ---------------------------------------------------------------------------
  /* O vaso é o mesmo nos quatro estágios, e é de propósito: é a âncora que faz
   * o olho reconhecer que semente e árvore são o MESMO personagem em momentos
   * diferentes, e não quatro desenhos distintos. */
  function vaso(traco) {
    return `
      <path d="M30 92 h40 l-4.5 22 a6 6 0 0 1 -6 5 h-19 a6 6 0 0 1 -6 -5 z"
            fill="${COR.terra}" stroke="${COR.tinta}" stroke-width="${traco}"
            stroke-linejoin="round"/>
      <path d="M27 86 h46 a3 3 0 0 1 3 3 v3 a3 3 0 0 1 -3 3 h-46
               a3 3 0 0 1 -3 -3 v-3 a3 3 0 0 1 3 -3 z"
            fill="${COR.terra}" stroke="${COR.tinta}" stroke-width="${traco}"/>`;
  }

  function corpoSemente(expressao, traco) {
    return `
      ${vaso(traco)}
      <ellipse cx="50" cy="66" rx="21" ry="24" fill="${COR.olivaClaro}"
               stroke="${COR.tinta}" stroke-width="${traco}"/>
      <path d="M50 42 q 3 -8 10 -10 q -2 8 -10 10 z" fill="${COR.oliva}"
            stroke="${COR.tinta}" stroke-width="${traco}" stroke-linejoin="round"/>
      ${rosto(expressao, 50, 64, 0.9)}`;
  }

  function corpoBroto(expressao, traco) {
    return `
      ${vaso(traco)}
      <path d="M50 86 v -30" fill="none" stroke="${COR.oliva}"
            stroke-width="${traco * 2.4}" stroke-linecap="round"/>
      <path d="M50 62 q -16 -3 -20 -15 q 15 -1 20 15 z" fill="${COR.oliva}"
            stroke="${COR.tinta}" stroke-width="${traco}" stroke-linejoin="round"/>
      <path d="M50 68 q 16 -4 21 -16 q -16 0 -21 16 z" fill="${COR.olivaClaro}"
            stroke="${COR.tinta}" stroke-width="${traco}" stroke-linejoin="round"/>
      <ellipse cx="50" cy="42" rx="17" ry="16" fill="${COR.olivaClaro}"
               stroke="${COR.tinta}" stroke-width="${traco}"/>
      ${rosto(expressao, 50, 42, 0.78)}`;
  }

  function corpoMuda(expressao, traco) {
    return `
      ${vaso(traco)}
      <path d="M50 86 v -34" fill="none" stroke="${COR.oliva}"
            stroke-width="${traco * 2.6}" stroke-linecap="round"/>
      <path d="M50 72 q -19 -2 -24 -14 q 18 -2 24 14 z" fill="${COR.oliva}"
            stroke="${COR.tinta}" stroke-width="${traco}" stroke-linejoin="round"/>
      <path d="M50 78 q 19 -2 24 -14 q -18 -2 -24 14 z" fill="${COR.oliva}"
            stroke="${COR.tinta}" stroke-width="${traco}" stroke-linejoin="round"/>
      <ellipse cx="50" cy="38" rx="23" ry="21" fill="${COR.olivaClaro}"
               stroke="${COR.tinta}" stroke-width="${traco}"/>
      <path d="M38 24 q 12 -10 24 0" fill="none" stroke="${COR.oliva}"
            stroke-width="${traco}" stroke-linecap="round"/>
      ${rosto(expressao, 50, 38, 0.92)}`;
  }

  function corpoArvore(expressao, traco) {
    return `
      ${vaso(traco)}
      <path d="M50 86 v -30" fill="none" stroke="${COR.oliva}"
            stroke-width="${traco * 3}" stroke-linecap="round"/>
      <path d="M50 70 l -13 -9 M50 76 l 13 -9" fill="none" stroke="${COR.oliva}"
            stroke-width="${traco * 1.6}" stroke-linecap="round"/>
      <ellipse cx="30" cy="46" rx="14" ry="12" fill="${COR.oliva}"
               stroke="${COR.tinta}" stroke-width="${traco}"/>
      <ellipse cx="70" cy="46" rx="14" ry="12" fill="${COR.oliva}"
               stroke="${COR.tinta}" stroke-width="${traco}"/>
      <ellipse cx="50" cy="36" rx="26" ry="23" fill="${COR.olivaClaro}"
               stroke="${COR.tinta}" stroke-width="${traco}"/>
      <circle cx="34" cy="22" r="3.4" fill="${COR.laranja}"
              stroke="${COR.tinta}" stroke-width="${traco * 0.8}"/>
      <circle cx="66" cy="24" r="3" fill="${COR.laranja}"
              stroke="${COR.tinta}" stroke-width="${traco * 0.8}"/>
      ${rosto(expressao, 50, 37, 1)}`;
  }

  const CORPOS = { semente: corpoSemente, broto: corpoBroto,
                   muda: corpoMuda, arvore: corpoArvore };

  // ---------------------------------------------------------------------------
  // MONTAGEM
  // ---------------------------------------------------------------------------
  /**
   * @param opcoes { estagio, expressao, tamanho, animar, rotulo }
   */
  function svg(opcoes) {
    const o = opcoes || {};
    const estagio = o.estagio || 'broto';
    const expressao = o.expressao || 'neutro';
    const tamanho = o.tamanho || 120;
    const traco = 2.4;
    const corpo = (CORPOS[estagio] || corpoBroto)(expressao, traco);

    // Faíscas de comemoração: só existem no estado 'feliz'. Elemento decorativo
    // permanente vira ruído; aparecendo só no momento certo, vira sinal.
    const faiscas = expressao === 'feliz' ? `
      <g class="evo-faiscas">
        <path d="M14 30 l0 -7 M10.5 26.5 l7 0" stroke="${COR.laranja}"
              stroke-width="2" stroke-linecap="round"/>
        <path d="M86 40 l0 -6 M83 37 l6 0" stroke="${COR.laranja}"
              stroke-width="2" stroke-linecap="round"/>
        <circle cx="20" cy="52" r="2.2" fill="${COR.laranja}"/>
      </g>` : '';

    // Zzz do estado offline.
    const sono = expressao === 'dormindo' ? `
      <g class="evo-sono" fill="${COR.cinza}" font-family="system-ui, sans-serif"
         font-weight="700">
        <text x="72" y="28" font-size="11">z</text>
        <text x="80" y="19" font-size="8">z</text>
      </g>` : '';

    return `<svg class="evo ${o.animar ? 'evo-anima' : ''}"
      data-estagio="${estagio}" data-expressao="${expressao}"
      viewBox="0 0 100 124" width="${tamanho}" height="${tamanho * 1.24}"
      xmlns="http://www.w3.org/2000/svg" role="img"
      aria-label="${o.rotulo || 'EVO, mascote da Coordenadoria'}">
      <g class="evo-corpo">${corpo}</g>
      ${faiscas}${sono}
    </svg>`;
  }

  /** Decide estágio e expressão a partir do estado real do servidor. */
  function paraJornada(dados, situacao) {
    const c = (dados && dados.conformidade) || {};
    const estagio = estagioDe(c.percentual).id;

    let expressao = 'neutro';
    if (situacao === 'offline') expressao = 'dormindo';
    else if (situacao === 'comemorar') expressao = 'feliz';
    else if (situacao === 'vencido') expressao = 'alerta';
    else if (c.nivel === 'COMPLETO' || c.nivel === 'REGULAR') expressao = 'feliz';

    return { estagio, expressao, dados: estagioDe(c.percentual) };
  }

  /** A fala do EVO. Curta, em primeira pessoa, nunca repreendendo o servidor —
   *  quem está com prazo vencido já sabe que está, e mascote cobrando é o
   *  caminho mais rápido para a pessoa desinstalar o app. */
  function fala(dados, situacao) {
    const c = (dados && dados.conformidade) || {};
    const nome = String((dados && dados.nome) || '').split(' ')[0];
    const estagio = estagioDe(c.percentual);

    if (situacao === 'offline') return 'Sem internet agora. Mostro o que guardei.';
    if (situacao === 'vencido') return 'Tem prazo vencido. Dá pra resolver — olha ali embaixo.';
    if (situacao === 'comemorar') return 'Mais uma etapa! Eu cresci junto.';
    if (c.nivel === 'COMPLETO') return 'Percurso completo. Virei árvore com você.';
    if (c.nivel === 'CRÍTICO') return 'Estou na fase ' + estagio.nome.toLowerCase() +
                                     '. Cada documento entregue me faz crescer.';
    return (nome ? nome + ', e' : 'E') + 'stou virando ' +
           estagio.nome.toLowerCase() + '. ' + estagio.legenda;
  }

  raiz.EVO = { svg, estagioDe, paraJornada, fala, ESTAGIOS, COR };
})(typeof self !== 'undefined' ? self : globalThis);
