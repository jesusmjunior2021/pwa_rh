/* Portal Auxílio-Bolsa TJMA — sw.js
 *
 * O service worker existe aqui por dois motivos, e é honesto separar o que ele
 * consegue fazer do que não consegue.
 *
 * O QUE ELE FAZ BEM
 *   1. Abre offline. O servidor que consulta o app no fórum, sem sinal, ainda
 *      vê seus prazos e o que já entregou — porque a última resposta ficou em
 *      cache. Um app de prazo que só funciona com internet falha exatamente no
 *      momento em que a pessoa mais precisa dele.
 *   2. Dispara a notificação com som e vibração quando o alarme chega, mesmo
 *      com o app fechado, DESDE QUE o navegador acorde o worker.
 *
 * O QUE ELE NÃO FAZ, E POR QUE ISSO PRECISA ESTAR ESCRITO
 * Um PWA sem servidor de push NÃO tem alarme garantido em segundo plano. Não
 * existe `setTimeout` que sobreviva ao worker ser reciclado — o Chrome mata o
 * service worker em segundos de ociosidade. O que existe é:
 *
 *   - `periodicSync`: o Chrome no Android acorda o app de tempos em tempos,
 *     mas SÓ depois de o app ser instalado e usado com alguma frequência, e a
 *     periodicidade é decidida pelo navegador, não por nós. Serve para "avisar
 *     no dia", não para "avisar às 9h em ponto".
 *   - reforço na abertura: toda vez que o app abre, os prazos são reavaliados
 *     e o que estourou vira notificação na hora.
 *
 * Alarme com hora exata e garantido exige Web Push com servidor VAPID. Está
 * previsto no LEIAME como a próxima etapa. Prometer alarme exato sem push
 * seria o pior tipo de defeito num app cuja função é justamente não deixar
 * ninguém perder prazo.
 */
'use strict';

const VERSAO = 'v1.2.0'; // MAT-PWA-ADMIN-002: URL /exec, login por SAL_CODIGOS, painel de percurso
const CACHE_CASCA = 'bolsa-casca-' + VERSAO;
const CACHE_DADOS = 'bolsa-dados-' + VERSAO;

const CASCA = [
  './',
  './index.html',
  './estilo.css',
  './app.js',
  './config.js',
  './evo.js',
  './acessos.js',
  './manifest.webmanifest',
  './icones/icone-192.png',
  './icones/icone-512.png',
  './icones/favicon-32.png'
];

// ---------------------------------------------------------------------------
// CICLO DE VIDA
// ---------------------------------------------------------------------------
self.addEventListener('install', evento => {
  evento.waitUntil((async () => {
    const cache = await caches.open(CACHE_CASCA);
    // addAll falha inteiro se um arquivo faltar; individual sobrevive à falta
    // de um ícone e ainda deixa o app abrir.
    await Promise.all(CASCA.map(url =>
      cache.add(url).catch(erro => console.warn('Sem cache para', url, erro))));
    self.skipWaiting();
  })());
});

self.addEventListener('activate', evento => {
  evento.waitUntil((async () => {
    const nomes = await caches.keys();
    await Promise.all(nomes
      .filter(nome => nome !== CACHE_CASCA && nome !== CACHE_DADOS)
      .map(nome => caches.delete(nome)));
    if (self.registration.navigationPreload) {
      await self.registration.navigationPreload.enable();
    }
    await self.clients.claim();
  })());
});

// ---------------------------------------------------------------------------
// REDE
// ---------------------------------------------------------------------------
/* Duas estratégias, porque os dois tipos de conteúdo têm exigências opostas:
 *
 *   casca (HTML/CSS/JS) → cache primeiro. Precisa abrir instantâneo e offline.
 *   dados (API)         → rede primeiro, cache como rede de segurança. Prazo
 *                         desatualizado é pior que prazo demorado, mas prazo
 *                         nenhum é pior que os dois.
 */
self.addEventListener('fetch', evento => {
  const requisicao = evento.request;
  if (requisicao.method !== 'GET') return;

  const url = new URL(requisicao.url);
  const ehApi = /script\.google(usercontent)?\.com/.test(url.hostname);

  if (ehApi) {
    evento.respondWith((async () => {
      try {
        const resposta = await fetch(requisicao);
        const cache = await caches.open(CACHE_DADOS);
        cache.put(requisicao, resposta.clone());
        return resposta;
      } catch (erro) {
        const guardado = await caches.match(requisicao);
        if (guardado) {
          // O cliente precisa SABER que está vendo cópia guardada, ou vai
          // tomar decisão de prazo com dado de três dias atrás achando que é
          // de agora.
          const corpo = await guardado.json().catch(() => null);
          if (corpo) {
            corpo._offline = true;
            return new Response(JSON.stringify(corpo),
              { headers: { 'Content-Type': 'application/json' } });
          }
          return guardado;
        }
        return new Response(JSON.stringify({
          ok: false, offline: true,
          erro: 'Sem conexão e sem cópia guardada desta consulta.'
        }), { status: 503, headers: { 'Content-Type': 'application/json' } });
      }
    })());
    return;
  }

  /* config.js é EXCEÇÃO à regra da casca. Ele guarda o endereço do serviço, o
   * único valor que muda depois da publicação. Se ficasse em cache-primeiro,
   * trocar a URL /exec não teria efeito nenhum em quem já abriu o aplicativo
   * uma vez: o navegador continuaria servindo a cópia antiga (vazia) e a
   * pessoa continuaria vendo "o endereço do serviço não foi configurado".
   * Rede primeiro, cache só quando não há rede. */
  if (url.origin === location.origin && /\/config\.js$/.test(url.pathname)) {
    evento.respondWith((async () => {
      try {
        const resposta = await fetch(requisicao, { cache: 'no-store' });
        if (resposta && resposta.ok) {
          const cache = await caches.open(CACHE_CASCA);
          cache.put(requisicao, resposta.clone());
        }
        return resposta;
      } catch (erro) {
        return (await caches.match(requisicao)) ||
               new Response('', { status: 504 });
      }
    })());
    return;
  }

  if (requisicao.mode === 'navigate') {
    evento.respondWith((async () => {
      try {
        const preload = await evento.preloadResponse;
        if (preload) return preload;
        return await fetch(requisicao);
      } catch (erro) {
        return (await caches.match('./index.html')) ||
               new Response('Offline', { status: 503 });
      }
    })());
    return;
  }

  evento.respondWith((async () => {
    const guardado = await caches.match(requisicao);
    if (guardado) return guardado;
    try {
      const resposta = await fetch(requisicao);
      if (resposta.ok && url.origin === location.origin) {
        const cache = await caches.open(CACHE_CASCA);
        cache.put(requisicao, resposta.clone());
      }
      return resposta;
    } catch (erro) {
      return new Response('', { status: 504 });
    }
  })());
});

// ---------------------------------------------------------------------------
// NOTIFICAÇÕES
// ---------------------------------------------------------------------------
const TONS = {
  vencido: { titulo: 'Prazo vencido', vibrar: [300, 120, 300, 120, 300] },
  hoje: { titulo: 'Vence hoje', vibrar: [250, 100, 250] },
  proximo: { titulo: 'Prazo chegando', vibrar: [180, 90, 180] },
  aviso: { titulo: 'Auxílio-Bolsa', vibrar: [120] }
};

async function notificar(dados) {
  const tom = TONS[dados.urgencia] || TONS.aviso;
  return self.registration.showNotification(dados.titulo || tom.titulo, {
    body: dados.corpo || '',
    icon: './icones/icone-192.png',
    badge: './icones/icone-192.png',
    vibrate: tom.vibrar,
    // `tag` faz a notificação nova SUBSTITUIR a do mesmo prazo em vez de
    // empilhar. Cinco avisos do mesmo documento na barra é o caminho mais
    // rápido para a pessoa desligar as notificações do app.
    tag: dados.tag || 'bolsa-geral',
    renotify: dados.urgencia === 'vencido' || dados.urgencia === 'hoje',
    requireInteraction: dados.urgencia === 'vencido',
    silent: false,
    timestamp: Date.now(),
    data: { url: dados.url || './index.html?ir=prazos', id: dados.id || '' },
    actions: [
      { action: 'abrir', title: 'Ver o prazo' },
      { action: 'depois', title: 'Lembrar amanhã' }
    ]
  });
}

self.addEventListener('message', evento => {
  const dados = evento.data || {};
  if (dados.tipo === 'NOTIFICAR') evento.waitUntil(notificar(dados));
  if (dados.tipo === 'PULAR_ESPERA') self.skipWaiting();
});

self.addEventListener('notificationclick', evento => {
  evento.notification.close();
  const destino = (evento.notification.data || {}).url || './index.html';

  if (evento.action === 'depois') {
    evento.waitUntil((async () => {
      // "Lembrar amanhã" precisa PERSISTIR o adiamento, não confiar num timer:
      // o worker morre antes. O app relê isso na próxima abertura.
      const clientes = await self.clients.matchAll({ type: 'window' });
      clientes.forEach(cliente => cliente.postMessage({
        tipo: 'ADIAR', id: (evento.notification.data || {}).id
      }));
    })());
    return;
  }

  evento.waitUntil((async () => {
    const clientes = await self.clients.matchAll({
      type: 'window', includeUncontrolled: true });
    for (const cliente of clientes) {
      if ('focus' in cliente) {
        cliente.postMessage({ tipo: 'IR', destino });
        return cliente.focus();
      }
    }
    if (self.clients.openWindow) return self.clients.openWindow(destino);
  })());
});

// ---------------------------------------------------------------------------
// SINCRONIZAÇÃO PERIÓDICA
// ---------------------------------------------------------------------------
/* O navegador decide QUANDO acordar; nós só decidimos o que fazer ao acordar.
 * Aqui: reler os prazos guardados e notificar o que está vencendo. Sem rede,
 * usa o que está no cache — a data de vencimento não muda por falta de sinal. */
self.addEventListener('periodicsync', evento => {
  if (evento.tag !== 'conferir-prazos') return;
  evento.waitUntil(conferirPrazos());
});

self.addEventListener('sync', evento => {
  if (evento.tag === 'conferir-prazos') evento.waitUntil(conferirPrazos());
});

async function conferirPrazos() {
  const cache = await caches.open(CACHE_DADOS);
  const chaves = await cache.keys();
  const alvo = chaves.find(k => /acao=jornada/.test(k.url));
  if (!alvo) return;

  const resposta = await cache.match(alvo);
  const dados = await resposta.json().catch(() => null);
  if (!dados || !dados.ok || !Array.isArray(dados.prazos)) return;

  const hoje = new Date();
  hoje.setHours(0, 0, 0, 0);

  for (const prazo of dados.prazos) {
    if (prazo.cumprido) continue;
    const vence = new Date(prazo.vence_iso);
    if (isNaN(vence)) continue;
    vence.setHours(0, 0, 0, 0);
    const dias = Math.round((vence - hoje) / 86400000);

    let urgencia = null;
    if (dias < 0) urgencia = 'vencido';
    else if (dias === 0) urgencia = 'hoje';
    else if (dias === 1 || dias === 3 || dias === 7) urgencia = 'proximo';
    if (!urgencia) continue;

    await notificar({
      urgencia,
      id: prazo.id,
      tag: 'prazo-' + prazo.id,
      titulo: dias < 0 ? 'Prazo vencido há ' + Math.abs(dias) + ' dia(s)'
            : dias === 0 ? 'Vence hoje'
            : 'Faltam ' + dias + ' dia(s)',
      corpo: prazo.titulo + (prazo.detalhe ? ' — ' + prazo.detalhe : ''),
      url: './index.html?ir=prazos'
    });
  }
}
