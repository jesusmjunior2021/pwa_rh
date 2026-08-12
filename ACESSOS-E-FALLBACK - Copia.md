# Códigos de acesso — organizar, distribuir e o fallback offline

## O que você pediu, e o que eu fiz diferente

Você pediu os códigos dentro do app, como fallback, num repositório privado.

**Repositório privado protege o repositório, não o site publicado.** O PWA é
servido ao navegador: quem abre o aplicativo baixa todos os arquivos dele.
Um `acessos.js` com os 469 códigos em texto claro seria a lista completa de
credenciais — matrícula, nome e código — legível no DevTools por qualquer
pessoa com o endereço. Isso é incidente de segurança com dado pessoal,
comunicável à ANPD, e independe de o Git ser privado.

**O que faz o mesmo trabalho sem esse problema:** o arquivo leva o *hash* de
cada código, não o código. O app calcula o hash do que a pessoa digita e
compara localmente. Login offline funciona exatamente igual, e o arquivo não
serve para ninguém.

### O quanto isso protege, medido

| | |
|---|---|
| Algoritmo | PBKDF2-SHA256, 150.000 iterações, matrícula no sal |
| Combinações possíveis | 387.420.489 (27 caracteres, 6 posições) |
| Custo por tentativa | 37 ms (medido) |
| Força bruta contra **um** servidor | ~166 dias de CPU, um núcleo |

Não é inquebrável — **nenhum arquivo verificável offline é**. Com GPU dedicada,
o ataque contra um alvo específico cai para horas. A diferença que importa: com
texto claro, qualquer curioso lê os 469 em dez segundos; com isto, é preciso
esforço dirigido e caro contra uma pessoa por vez.

Se essa margem não for suficiente para a Coordenadoria, a saída não é reforçar o
hash — é **não ter fallback offline** e aceitar que sem internet não se entra.

---

## Como gerar

Abra `ferramenta-codigos.html` **direto do disco** (duplo clique). Ela não faz
nenhuma requisição de rede — nada sai do seu computador.

1. Cole o log de *Execuções → Registros* do Apps Script.
2. Informe o sal (o mesmo `SAL_CODIGOS` do `portal_api.gs`).
3. Processar.

Saem dois arquivos:

| Arquivo | Onde vai | Contém |
|---|---|---|
| `codigos-portal-RESTRITO.csv` | pasta restrita da Coordenadoria | os códigos em texto claro |
| `acessos.js` | repositório do PWA | só hashes |

**O CSV não vai para o Git, nem para o Drive compartilhado, nem em anexo para
lista.** É o material de trabalho de quem faz os envios.

Depois de baixar, substitua o `acessos.js` do repositório e preencha em
`config.js`:

```js
window.CONFIG_PORTAL = {
  api: 'https://script.google.com/macros/s/AKfy.../exec',
  sal: 'o mesmo segredo do portal_api.gs'
};
```

O sal fica visível no navegador — inevitável em qualquer verificação sem
servidor. O que protege não é o sigilo dele, é o custo do PBKDF2. O sal continua
fazendo seu trabalho: impedir que tabela pré-calculada sirva para duas
instalações.

---

## Como o login funciona agora

```
digita matrícula + código
        │
        ▼
   tenta a PLANILHA ─── respondeu ──▶ vale a resposta dela (sempre)
        │
   não respondeu
        │
        ▼
   confere no acessos.js ──▶ entra, mostrando a última cópia guardada
```

**A ordem não é arbitrária.** A planilha é a fonte de verdade: é lá que o código
é regerado e é lá que um acesso é desativado. O arquivo local é uma *fotografia*
do momento em que foi publicado.

Se o arquivo fosse consultado primeiro, um código já revogado continuaria
entrando até alguém republicar. Consultando a planilha primeiro, a revogação
vale imediatamente sempre que houver internet.

E: **código recusado pela planilha não tenta o arquivo.** Só a ausência de
resposta aciona o fallback. Tentar de novo localmente ressuscitaria acesso
revogado.

### O que o fallback dá, e o que não dá

Dá **entrar**. Não dá dado novo: jornada, prazos e percurso continuam vindo da
planilha. Sem ela, o app mostra a última cópia guardada *naquele aparelho*.
Quem nunca entrou com internet loga e vê tela vazia — e o app avisa isso, em vez
de deixar a pessoa achando que não há nada registrado a favor dela.

### Quando um código é regerado

O `acessos.js` fica desatualizado para aquele servidor até você republicar.
Nesse intervalo: o código **novo** funciona online, o **antigo** funciona
offline. É mais um motivo para a planilha ser consultada primeiro.

---

## O que a ferramenta encontrou no seu log

Além de gerar os arquivos, ela confere a base. No log que você colou há
registros que **já estão errados na planilha** — o log só os revelou:

| Linha do log | Problema |
|---|---|
| `26959 Q3UMWU` | sem nome — a coluna NOME está vazia |
| `6 6XFCUM` | matrícula de 1 dígito — lixo na célula |
| `1 166058 HPMDAJ` | matrícula "1" e o nome é um número |
| `99978 163949 JGG4D6` | o nome é "163949" — colunas trocadas |
| `130047 165308 34N2P8` | idem |
| `16452025 MARIA MARTHA…` | 8 dígitos — parece número de processo |
| `116798` e `116789` DILCE PAIXÃO DOS SANTOS | mesmo nome, duas matrículas |
| `139840 PATRÍCIA FONSECA… - AUXÍLIO BOLSA SUSPENSO ATÉ AGOSTO DE 2026. PROCESSO 163972026` | anotação inteira dentro do campo NOME |

Os quatro primeiros **não entram no fallback** e esses servidores não conseguem
entrar no app. O último é o mais insidioso: esse texto vai aparecer no e-mail e
no WhatsApp que a pessoa receber — *"Prezado(a) Patrícia Fonseca Pereira dos
Santos - Auxílio Bolsa Suspenso Até Agosto De 2026…"*.

Corrija na planilha e regere o código só para essas linhas.

---

## As três pontas, agora conversando

| Onde | O que faz com `PORTAL_ACESSO` |
|---|---|
| **portal_api.gs** | autentica: confere o hash do código digitado |
| **BOLSASRH** → aba 🔑 Acessos ao app | **escreve**: gera, regera, desativa, registra envio |
| **MAT-DIGIDOC-EXT-003** | **só lê**: mostra no cartão se o bolsista tem acesso e se já entrou |
| **PWA** | fallback offline, via hash |

**Só o BOLSASRH escreve códigos.** Se a extensão também escrevesse, os dois
acabariam discordando sobre qual código vale.

A tela do BOLSASRH também cria as colunas `EMAIL` e `WHATSAPP` na base — ao
**fim** do cabeçalho, nunca intercaladas, para não deslocar fórmula nem filtro
salvo da planilha institucional.

---

## Uma coisa que não dá para fazer

**Não é possível consultar o código de um servidor.** Nem no BOLSASRH, nem no
Apps Script, nem abrindo a planilha.

Isso é o desenho, não uma limitação a contornar. Na `PORTAL_ACESSO` fica só o
hash. Se fosse possível consultar, bastaria alguém com acesso de leitura à
planilha — estagiário, prestador, quem recebeu o link compartilhado sem querer —
para entrar no app como qualquer bolsista e ver a situação processual dele.

O fluxo de código perdido é **regerar e enviar**, não consultar e reenviar.
Mesmo número de cliques para a Coordenadoria. A diferença aparece só no dia em
que a planilha vazar.
