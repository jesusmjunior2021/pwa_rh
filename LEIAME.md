# Portal Auxílio-Bolsa TJMA — PWA instalável

Aplicativo do servidor bolsista: mostra o percurso do benefício, os prazos e
avisa antes de vencer. Instalável no Android pelo Chrome, funciona offline,
alimenta a planilha da COCARREIRA.

---

## Publicar em 4 passos

### 1. O backend

Abra a planilha do BOLSASRH → **Extensões → Apps Script** → cole
`apps_script/portal_api.gs`.

Troque `SAL_CODIGOS` por um segredo seu (qualquer cadeia longa e aleatória).
Esse valor protege os códigos de acesso — se ele vazar junto com a planilha,
os códigos deixam de estar protegidos.

Rode uma vez, no editor:

```
criarEstrutura()          → cria PORTAL_ACESSO, PORTAL_AVISOS, PORTAL_CONSENTIMENTO
gerarCodigosParaTodos()   → gera o código de cada bolsista
```

Os códigos aparecem **uma única vez** em *Execuções → Registros*, em texto
claro. Copie e guarde: na planilha fica só o hash. Para quem perder o código,
use `regerarCodigo('114272')`.

### 2. Implantar

**Implantar → Nova implantação → App da Web**

| Campo | Valor |
|---|---|
| Executar como | **Eu** |
| Quem pode acessar | **Qualquer pessoa** |

"Qualquer pessoa" aqui significa *qualquer pessoa pode chamar o endereço* — não
que qualquer pessoa vê dados. Sem matrícula e código válidos, toda ação é
recusada. É o mesmo modelo de qualquer API pública com autenticação.

Copie a URL que termina em `/exec`.

### 3. Configurar o app

Cole a URL em `config.js`:

```js
window.CONFIG_PORTAL = { api: 'https://script.google.com/macros/s/AKfy.../exec' };
```

### 4. Hospedar

Qualquer hospedagem estática com **HTTPS** — é requisito do PWA, não
preferência. GitHub Pages, Netlify, Cloudflare Pages ou o próprio servidor web
do TJMA. Suba a pasta inteira. Sem HTTPS, não instala e não notifica.

---

## O que o app garante — e o que não garante

Esta seção existe porque a promessa central do app é *não deixar perder prazo*,
e prometer confiabilidade que não existe seria o defeito mais caro possível.

| Situação | Funciona? |
|---|---|
| Abrir sem internet e ver prazos | **Sim** — última cópia fica em cache |
| Aviso ao abrir o app com prazo vencendo | **Sim**, com som e vibração |
| Aviso enquanto o app está aberto | **Sim**, agendado para as 9h |
| Aviso com o app fechado, no mesmo dia | **Provável** — via `periodicSync`, depois de instalado |
| Aviso com o app fechado, **em hora exata** | **Não** — exige Web Push com servidor |
| Envio de aviso sem internet | **Sim** — vai para fila e sai quando voltar |

Não existe alarme garantido em PWA sem servidor de push. O `setTimeout` morre
com a aba; o service worker é reciclado em segundos de ociosidade. O
`periodicSync` funciona, mas quem decide a periodicidade é o Chrome, não nós —
serve para "avisar no dia", não para "avisar às 9h em ponto".

**Web Push com VAPID é a próxima etapa**, e é o que transforma "provável" em
"garantido". Precisa de um servidor pequeno guardando as inscrições — não cabe
em Apps Script.

A tela de Ajustes diz isso ao servidor, em linguagem comum, em vez de prometer
alarme de relógio.

---

## Decisões de segurança

**Por que o app não fala com a API do Sheets direto.** A extensão MAT-DIGIDOC
fala, porque roda na máquina de um servidor autorizado. Este app roda no
celular de qualquer bolsista, e código de front-end é público por definição.
A chave da conta de serviço ali daria escrita na planilha institucional inteira
para quem abrisse "ver código fonte". O Apps Script roda do lado do Google e
devolve ao navegador só o recorte do próprio servidor.

**Por que matrícula sozinha não entra.** Matrícula de servidor é semipública:
consta de portaria, diário oficial, lista de ramal. Aceitá-la sozinha
significaria que qualquer pessoa consultaria o histórico acadêmico de qualquer
colega. Por isso o código de acesso.

**Como os códigos são guardados.** SHA-256 com sal, nunca em texto. A
comparação é em tempo constante — um `===` comum sai no primeiro caractere
diferente, e essa diferença de tempo é mensurável pela rede, o que permitiria
descobrir o código caractere a caractere.

**Os códigos evitam caractere ambíguo.** Sem `0/O`, `1/I/L`, `5/S`, `8/B`. Quem
lê o código num papel e digita no celular erra nesses pares, e o erro vira
chamado que a Coordenadoria vai atender.

**O que o app NÃO mostra ao bolsista.** Valor de contrato, observação interna e
anotação de análise ficam fora. São campos de trabalho da Coordenadoria, e
expor tudo "porque é dado dele" é exatamente como as coisas vazam.

**Este não é um controle de autenticação forte.** É proporcional a dado
funcional de baixa sensibilidade, adequado a um piloto. Para dado sensível —
CPF, conta bancária, saúde — o caminho é gov.br ou o login institucional do
TJMA.

---

## LGPD e o WhatsApp

O tratamento dos dados funcionais se apoia no **exercício de competência legal**
da Coordenadoria (art. 7º, II e III da LGPD) — não em consentimento, e por isso
não há caixa a marcar para ver os próprios dados.

O **WhatsApp é diferente**: é canal de conveniência, não obrigação legal, e por
isso depende de consentimento expresso. O app registra na aba
`PORTAL_CONSENTIMENTO`:

- número informado;
- o **texto exato** que a pessoa aceitou;
- data e hora;
- data da revogação, quando houver.

Cada mudança vira **linha nova**. A revogação não apaga a autorização anterior —
em LGPD o que se demonstra é o histórico, e sobrescrever destruiria justamente
a prova que o registro existe para produzir.

Guardar só um `sim` não serve: não demonstra o que foi consentido nem quando.

---

## Prazos: de onde vem cada data

Nenhum prazo é inventado. Cada um aponta a norma que o institui, e as datas
saem do que já está registrado.

| Prazo | Data | Base |
|---|---|---|
| Comprovação 2025.2 | 28/02/2026 | Resolução-GP nº 1/2023 |
| Comprovação 2026.1 | 31/08/2026 | Resolução-GP nº 1/2023 |
| Diploma | término do curso + 90 dias | Resolução-GP nº 1/2023 |
| Pendência da ficha | coluna `PRAZO`, ou 15 dias estimados | registrado no processo |

**Confira as duas primeiras datas** contra o ato que a Coordenadoria aplica
hoje — coloquei o que consta da Resolução, mas se a prática interna usa outra
data, ela precisa ser corrigida em `_prazos()` no `portal_api.gs`. Prazo errado
num app de prazo é pior que app nenhum.

Quando um prazo não tem base normativa citada, o app diz isso ao servidor
("Prazo estimado de 15 dias. Confirme com a Coordenadoria") em vez de afirmar
com falsa segurança.

---

## O desenho

A metáfora é a **caderneta de carimbos** — o objeto que o servidor já conhece
do mundo real, o carimbo do protocolo. Ela dá à gamificação uma forma que não
infantiliza: pontos de experiência e troféus ficariam deslocados num benefício
institucional; carimbo conquistado não fica.

O elemento assinatura é a cartela no topo da tela: oito círculos, os cumpridos
em dourado e levemente tortos como carimbo batido à mão, os pendentes em
contorno tracejado. A pessoa abre o app e vê, em meio segundo e sem ler,
quantos faltam.

Escolhi isso em vez de uma rosca com "63%" de propósito: a rosca diz o número e
esconde exatamente o que interessa — *qual* etapa falta.

Outras decisões: altura mínima de 46px nos botões (o app é usado de pé, no
corredor do fórum); `font-size: 16px` nos campos (abaixo disso o iOS dá zoom
automático e a pessoa perde o botão de enviar); som sintetizado em vez de `.mp3`
(um arquivo a menos para baixar, cachear e falhar); `prefers-reduced-motion`
respeitado.

---

## Arquivos

```
portal-bolsa/
├── index.html              landing autoexplicativa + app
├── estilo.css              caderneta de carimbos
├── app.js                  acesso, jornada, prazos, alarmes, fila offline
├── sw.js                   cache, notificações, periodicSync
├── config.js               ← o único arquivo a editar
├── manifest.webmanifest    instalação, atalhos, ícones
├── icones/                 192, 512, maskable, apple-touch
└── apps_script/
    └── portal_api.gs       backend na planilha
```

## Testar antes de publicar

```bash
python3 -m http.server 8080
```

Abra `http://localhost:8080`. O service worker funciona em `localhost` sem
HTTPS — é a única exceção da regra. Para testar no celular, use o
encaminhamento de porta do Chrome DevTools (`chrome://inspect`).
