# Estrutura do PWA — Portal Auxílio-Bolsa TJMA

Documento de referência do aplicativo: o que ele é, como está montado, e por que
cada decisão foi tomada. Serve para quem for manter o código depois e para quem
precisar aprovar o produto.

---

## 1. O que o app é

Um acompanhamento do auxílio-bolsa de estudos, na mão do servidor bolsista.
Instalável no Android, funciona offline, e alimenta a planilha da COCARREIRA.

**A função central é uma só: não deixar ninguém perder prazo.** Tudo mais é
secundário e serve a isso. Quando houver conflito entre uma funcionalidade e
essa função, ela perde.

### O que o app faz

- mostra o percurso do benefício, etapa por etapa;
- mostra os prazos, ordenados pelo que dói primeiro;
- avisa antes de vencer, com som e vibração;
- recebe o aviso de entrega e joga na planilha;
- registra o consentimento de WhatsApp com data e texto.

### O que o app não faz

- não substitui o protocolo no Digidoc — e diz isso na tela de envio;
- não recebe arquivo (upload de documento é próxima etapa, exige antivírus e
  armazenamento);
- não mostra valor de contrato, observação interna nem anotação de análise.

---

## 2. Arquitetura

```
CELULAR DO SERVIDOR                    NUVEM DO GOOGLE
┌──────────────────────┐              ┌─────────────────────────┐
│  PWA (HTML/CSS/JS)   │              │  Apps Script            │
│  ├── index.html      │  HTTPS POST  │  portal_api.gs          │
│  ├── app.js          │─────────────▶│  roda como o DONO       │
│  ├── evo.js          │◀─────────────│  da planilha            │
│  ├── estilo.css      │    JSON      │                         │
│  ├── sw.js  ─────────┼─ cache ─┐    └───────────┬─────────────┘
│  └── config.js       │         │                │
│                      │         │                ▼
│  localStorage:       │         │    ┌─────────────────────────┐
│   sessão, jornada,   │◀────────┘    │  Planilha BOLSASRH      │
│   fila, ajustes      │              │  SERVIDORES CAEDNC      │
└──────────────────────┘              │  PORTAL_ACESSO          │
                                      │  PORTAL_AVISOS          │
                                      │  PORTAL_CONSENTIMENTO   │
                                      └─────────────────────────┘
                                                  ▲
                                      ┌───────────┴─────────────┐
                                      │  MAT-DIGIDOC-EXT-003    │
                                      │  (extensão da COCARREIRA)│
                                      └─────────────────────────┘
```

**Por que o PWA não fala com a API do Sheets direto.** A extensão fala, porque
roda na máquina de um servidor autorizado. Este app roda no celular de qualquer
bolsista, e código de front-end é público por definição. A chave da conta de
serviço ali daria escrita na planilha institucional inteira para quem abrisse
"ver código fonte".

**A planilha é a fronteira.** A extensão escreve o que vem do Digidoc; o PWA lê
o que interessa ao servidor e escreve os avisos dele. Nenhum dos dois conhece o
outro — e é isso que permite mudar um sem quebrar o outro.

---

## 3. Telas

### 3.1 Abertura (landing)

Precisa explicar o app sem ninguém explicar o app: quem chega aqui recebeu um
link por e-mail e não sabe o que é.

- **Manchete** que nomeia o problema, não o produto: *"Sua bolsa tem prazos.
  Aqui eles não passam batido."*
- **Quatro passos** numerados — a numeração carrega informação (é sequência
  real), não é adorno.
- **Bloco de dados** dizendo o que é tratado e sob qual base.
- Botão de instalar aparece **só quando o navegador oferece** o evento.

### 3.2 Acesso

Matrícula + código. Nada de senha criada pelo usuário: senha nova é senha
esquecida, e o suporte disso cai na Coordenadoria.

### 3.3 Jornada — quatro abas

| Aba | O que responde |
|---|---|
| **Trilha** | "Onde eu estou?" — EVO, cartela de carimbos, etapas |
| **Prazos** | "O que vence primeiro?" |
| **Enviar** | "Entreguei, e agora?" |
| **Ajustes** | Avisos, WhatsApp, aparelho |

**Ordem das abas = ordem de urgência.** Trilha primeiro porque é o contexto;
Prazos em segundo porque é a ação.

---

## 4. Dados

### 4.1 O que vem do backend

```json
{
  "ok": true,
  "matricula": "114272",
  "nome": "ACAYENE SANTOS LOPES",
  "processo_legivel": "27588/2023",
  "curso": "Doutorado em Direito",
  "status": "SUSPENSO",
  "marcos": [
    { "id": "convocacao", "titulo": "Convocação no seletivo",
      "descricao": "...", "como_cumprir": "...",
      "cumprido": true, "evidencia": "7º SELETIVO" }
  ],
  "prazos": [
    { "id": "comprovacao_2026_1", "titulo": "Comprovação semestral 2026.1",
      "detalhe": "...", "vence": "31/08/2026",
      "vence_iso": "2026-08-31T12:00:00",
      "base_legal": "Resolução-GP nº 1/2023", "cumprido": false }
  ],
  "conformidade": { "cumpridos": 5, "total": 8, "percentual": 63,
                    "nivel": "PARCIAL" },
  "narrativa": "Acayene, você já cumpriu 5 de 8 etapas..."
}
```

### 4.2 Os oito marcos

Os mesmos em três lugares: `portal_api.gs`, `lib/planilha_bolsas.js` da extensão
e o BOLSASRH. **Se divergirem, o servidor vê no celular uma etapa que a
Coordenadoria não vê na planilha** — e não há conversa que conserte isso depois.

1. Convocação no seletivo
2. Contrato / aditivo firmado
3. Implantação em folha
4. Vínculo acadêmico informado
5. Comprovação semestral 2025.2
6. Comprovação semestral 2026.1
7. Processo de comprovação do TCC
8. Diploma ou certificado

Cada marco é **campo preenchido**, não julgamento de mérito. "O comprovante não
consta" é verificável; "o comprovante é inválido" é do analista.

### 4.3 O que fica no aparelho

| Chave | Conteúdo | Por quê |
|---|---|---|
| `bolsa.sessao` | matrícula + token | não pedir código toda vez |
| `bolsa.jornada` | última resposta | ver prazos offline |
| `bolsa.fila` | avisos não enviados | não perder o envio |
| `bolsa.ajustes` | som, vibração, WhatsApp | preferência local |
| `bolsa.adiados` | "lembrar amanhã" | o worker morre, isso não |
| `bolsa.evo` | fase anterior do EVO | detectar crescimento |

---

## 5. Prazos e avisos

### 5.1 De onde vem cada data

Nenhum prazo é inventado. Cada um aponta a norma, e a data sai do que já está
registrado.

| Prazo | Data | Base |
|---|---|---|
| Comprovação 2025.2 | 28/02/2026 | Resolução-GP nº 1/2023 |
| Comprovação 2026.1 | 31/08/2026 | Resolução-GP nº 1/2023 |
| Diploma | término + 90 dias | Resolução-GP nº 1/2023 |
| Pendência da ficha | coluna `PRAZO`, ou 15 dias estimados | processo |

Quando não há base normativa, o app **diz isso** ("Prazo estimado de 15 dias.
Confirme com a Coordenadoria") em vez de afirmar com falsa segurança.

> **Confira as duas primeiras datas** contra o ato que a COCARREIRA aplica hoje.
> Prazo errado num app de prazo é pior que app nenhum.

### 5.2 Régua de avisos

7 dias · 3 dias · 1 dia · no dia · e depois de vencido.

### 5.3 O que é garantido

| Situação | Funciona? |
|---|---|
| Ver prazos offline | **Sim** |
| Avisar ao abrir com prazo vencendo | **Sim**, som e vibração |
| Avisar com app aberto, às 9h | **Sim** |
| Avisar com app fechado, no dia | **Provável** — `periodicSync` |
| Avisar em **hora exata**, app fechado | **Não** — exige Web Push |

Não existe alarme garantido em PWA sem servidor de push. `setTimeout` morre com
a aba; o service worker é reciclado em segundos. Web Push com VAPID é a próxima
etapa e é o que transforma "provável" em "garantido".

A tela de Ajustes diz isso ao servidor em linguagem comum.

---

## 6. Design

### 6.1 Paleta

| Cor | Hex | Função — e só ela |
|---|---|---|
| Branco | `#FFFFFF` | superfície dominante |
| Azul | `#1B4F8A` | a instituição: cabeçalho, identidade, ação |
| Oliva | `#6B7A3F` | o crescimento: EVO, etapas cumpridas |
| Oliva claro | `#97A667` | folhagem, apoio |
| Laranja | `#D4762A` | a atenção: prazo chegando. Nada mais |
| Cinza | `#8A9098` | estrutura: traço, texto secundário |
| Terracota | `#A8452F` | o vencido. Só isso |

**O branco domina por decisão.** Documento oficial se lê em papel branco, e um
app de acompanhamento processual que chega colorido perde a credibilidade que
precisa ter.

**Cor de alerta usada em decoração deixa de alertar.** Por isso o laranja não
aparece em botão comum nem em título — só onde há ação a tomar.

> Os hexadecimais seguem a descrição da paleta, **não o manual de marca do
> TJMA** — não tenho o arquivo. Antes de publicar, troque `--azul`, `--oliva` e
> `--laranja` pelos oficiais. Estão isolados no `:root` para a troca ser de uma
> linha cada.

### 6.2 Tipografia

Pilha de sistema, sóbria e moderna, em três pesos: 400 corpo, 600 rótulo, 700
título. Monoespaçada **só** onde alinhamento de dígito importa — número de
processo e contagem de dias, que se comparam entre linhas.

Campos de formulário em **16px**: abaixo disso o iOS dá zoom automático ao focar
e a pessoa perde o botão de enviar de vista.

### 6.3 Espaçamento

Escala de 4px (`--e1` a `--e7`), com 24 a 32px entre blocos. A tela é lida de
pé, no corredor do fórum, e densidade alta cobra atenção que a pessoa não tem
naquele momento.

Botões com **46px de altura mínima**: abaixo disso o dedo erra.

### 6.4 Iconografia

Traço vetorial de 1,8px, uniforme, cantos arredondados, **sem preenchimento
sólido**. É a linguagem de brasão e de selo — clássica, reconhecível, e que não
compete com o conteúdo.

### 6.5 Animação

Uma curva só para tudo (`cubic-bezier(.22,.8,.3,1)`). Curvas diferentes na mesma
tela parecem defeito antes de parecerem variedade.

| Animação | Duração | Por quê |
|---|---|---|
| Entrada de cartão | 260ms, 12px | mostra ordem de leitura sem atrasar |
| Respiração do EVO | 4,2s, 2,2% | não parecer adesivo colado |
| Carimbo batendo | 550ms | dá a sensação de impacto |
| Crescimento do EVO | 1,1s, **uma vez** | evento raro continua sendo evento |

A cascata de entrada para em seis itens: além disso, o último cartão demoraria
mais que a paciência de quem rolou até ele.

`prefers-reduced-motion` desliga tudo — o conteúdo continua idêntico.

### 6.6 A cartela de carimbos

O elemento assinatura. Oito círculos: cumpridos em oliva e levemente tortos como
carimbo batido à mão, pendentes em contorno tracejado.

Escolhi isso em vez de uma rosca com "63%" de propósito: a rosca diz o número e
esconde exatamente o que interessa — **qual** etapa falta.

### 6.7 EVO

Ver `DESIGN-EVO.md`.

---

## 7. Segurança

**Código de acesso, não só matrícula.** Matrícula de servidor é semipública —
consta de portaria, diário oficial, lista de ramal. Aceitá-la sozinha
significaria que qualquer pessoa consultaria o histórico de qualquer colega.

**Códigos guardados em SHA-256 com sal**, nunca em texto. Comparação em **tempo
constante**: um `===` sai no primeiro caractere diferente, e essa diferença de
tempo é mensurável pela rede — permitiria descobrir o código caractere a
caractere.

**Alfabeto sem ambiguidade:** sem `0/O`, `1/I/L`, `5/S`, `8/B`. Quem lê o código
num papel e digita no celular erra nesses pares, e o erro vira chamado que a
Coordenadoria vai atender.

**Token derivado**, não sessão em tabela: expira sozinho em 30 dias.

**Isto não é autenticação forte.** É proporcional a dado funcional de baixa
sensibilidade, adequado a um piloto. Para dado sensível — CPF, conta bancária,
saúde — o caminho é gov.br ou o login institucional do TJMA.

---

## 8. LGPD

**Ver os próprios dados** se apoia no exercício de competência legal da
Coordenadoria (art. 7º, II e III) — não em consentimento, e por isso não há
caixa a marcar.

**O WhatsApp é diferente**: é conveniência, não obrigação legal, e depende de
consentimento expresso. Registrado em `PORTAL_CONSENTIMENTO` com número, o
**texto exato** aceito, data/hora e data de revogação.

Cada mudança vira **linha nova**. A revogação não apaga a autorização anterior —
o que se demonstra em LGPD é o histórico, e sobrescrever destruiria justamente a
prova que o registro existe para produzir.

Guardar só um `sim` não serve: não demonstra o que foi consentido nem quando.

---

## 9. Arquivos

```
portal-bolsa/
├── index.html              landing + app
├── estilo.css              identidade, componentes, animações
├── app.js                  acesso, jornada, prazos, alarmes, fila
├── evo.js                  o mascote em SVG
├── sw.js                   cache, notificações, periodicSync
├── config.js               ← o único arquivo a editar
├── manifest.webmanifest    instalação, atalhos, ícones
├── icones/                 192, 512, maskable, apple-touch
├── apps_script/
│   └── portal_api.gs       backend na planilha
├── LEIAME.md               instalação e publicação
├── DESIGN-EVO.md           o mascote
└── ESTRUTURA-PWA.md        este documento
```

---

## 10. O que falta

Por ordem do que mais muda o produto:

1. **Web Push com VAPID** — transforma o aviso de "provável" em "garantido".
   Precisa de um servidor pequeno guardando inscrições; não cabe em Apps Script.
2. **Upload de documento** — exige armazenamento e verificação de arquivo.
   Hoje o servidor avisa que entregou; não entrega pelo app.
3. **Login gov.br** — quando entrar dado sensível.
4. **Disparo de WhatsApp** — o consentimento já é coletado e registrado; falta o
   lado que envia, na COCARREIRA.
5. **Módulo Teletrabalho** — a mesma estrutura, outra base.

O consentimento ser coletado antes do disparo existir é de propósito: quando o
disparo entrar, a base de autorizações já estará formada e com prova.
