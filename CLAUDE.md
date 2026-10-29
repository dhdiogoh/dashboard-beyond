# CLAUDE.md

Live coding de entrevista, **30 minutos**. A prioridade é ter o mínimo funcionando e mostrar cada passo. Nada de over-engineering.

## Problema

Loja de acessórios do Instagram controla pedidos numa planilha ([planilha-loja.xlsx](planilha-loja.xlsx)), perde pedidos e erra contas. O app web importa a planilha em CSV, lista os pedidos com status, **calcula o total no sistema** e mostra um painel.

## Definição de pronto

1. Importa a planilha `.xlsx` direto (aba `Pedidos`). CSV também é aceito.
2. O total de cada pedido é **sempre calculado pelo sistema** (`qtd × preço unitário`). O valor que vem da planilha nunca é a fonte da verdade.
3. Dá para mudar o status de um pedido (`novo` → `pago` → `enviado`) e filtrar a lista por status.
4. O painel mostra **pendentes**, **a receber** e **faturado**, e os números batem com a lista.
5. Há teste Vitest do cálculo do total (e do painel).

**Extra, só se sobrar tempo:** colar uma mensagem do Direct ou do WhatsApp, e a IA extrai o pedido em JSON validado com Zod.

## Stack

- TypeScript + Express, rodando com `tsx` (sem build).
- Zod para validar a entrada da API, o CSV e a resposta da IA.
- Vitest para os testes.
- Front em HTML/CSS/JS puro em `public/`, servido pelo `express.static`. Sem framework e sem bundler.
- Persistência num arquivo JSON (`data/pedidos.json`), lido e gravado inteiro a cada alteração.
- Planilha: `exceljs` lê o `.xlsx` (aba `Pedidos`); CSV via `csv-parse/sync`. Os dois viram `string[][]` e passam pela mesma normalização.
- `.env` carregado com `node --env-file=.env` (Node 24), sem `dotenv`.

## Estrutura alvo

```
src/
  server.ts      # Express: rotas + static public/
  pedidos.ts     # tipos, schema Zod, calcularTotal, resumoPainel
  importar.ts    # XLSX/CSV -> Pedido[] (normalização)
  store.ts       # ler/gravar data/pedidos.json
  ia.ts          # (extra) Groq -> JSON -> Zod
public/
  index.html  app.js  style.css
data/pedidos.json
tests/pedidos.test.ts
```

## Modelo

```ts
type Status = "novo" | "pago" | "enviado" | "cancelado";
type Pedido = {
  id: string;
  cliente: string;
  produto: string;
  qtd: number;               // inteiro >= 1
  precoUnitarioCentavos: number;
  status: Status;
  data: string | null;       // ISO yyyy-mm-dd, ou null se não der para interpretar
  formaPgto: string;
  obs: string;
};
// total NÃO é armazenado: calcularTotal(p) = p.qtd * p.precoUnitarioCentavos
```

- Dinheiro sempre em **centavos inteiros**. A planilha tem `80.91000000000001`, o que mostra o problema de usar float.
- `cancelado` existe para não perder as linhas canceladas/devolvidas da planilha. Fica fora de todos os números do painel.

## Regras do painel

- **Pendentes**: quantidade de pedidos `novo`.
- **A receber**: soma dos totais dos pedidos `novo`.
- **Faturado**: soma dos totais dos pedidos `pago` + `enviado` (enviado pressupõe pago).
- `cancelado` não entra em nada.
- O painel é calculado no backend pela mesma função `resumoPainel(pedidos)` que o teste usa. O front só exibe.

## A planilha é suja: o que o import precisa tratar

Colunas: `Nome do cliente | produto | Qtd | VALOR | Status do Pedido | Data | Forma pgto | Observações` (~190 linhas).

- **VALOR é o total da linha, não o preço unitário** (ex.: Colar Pérolas, qtd 2, `240.0`). No import: `precoUnitarioCentavos = round(valorCentavos / qtd)`. Depois disso o sistema recalcula o total.
- Formatos de valor misturados: `R$ 45.00`, `R$ 55,00`, `150,00`, `45.0`, `86`, `80.91000000000001`, `GRÁTIS` (→ 0). Uma função `parseValor` com teste.
- Mapeamento de status (minúsculo e trim antes):
  - `pago`: pago, pago!, pago - confirmado, pago via pix, pg, ok, ✅
  - `enviado`: enviado, enviado correios, postado, saiu hj
  - `novo`: pendente, aguardando, aguardando pix, falta pagar, ⏳, vazio
  - `cancelado`: cancelado, cancelou, desistiu, devolvido
- Datas em vários formatos (`02/02/2025`, `09-02-2025`, `2025-02-11`, `22 Feb 2025`, `5/3/2025`, `08/04/25`, `03/02` sem ano → assumir o ano atual). Se não der, `null`. Não travar o import por causa de data.
- Pular linhas sem produto, e a linha `Teste | teste | ignorar essa linha`.
- Há linhas duplicadas (ex.: `João Pedro` e `JOÃO PEDRO`, mesmo produto e data) e uma linha sem nome de cliente. Normalizar o nome (trim + Title Case). Deduplicar só se sobrar tempo; por ora, apenas não quebrar.
- A aba oculta `NÃO MEXER` usava `SUMIF` em cima de texto e por isso dava 0. É o bug de "erra contas" que o app resolve. A aba `Contatos clientes` fica fora do escopo.
- O CSV exportado pode vir com `;` ou `,` como separador. Detectar pela primeira linha.

## API

- `POST /api/importar`: corpo com o `.xlsx` binário (content-type do xlsx) ou o CSV (`text/csv` ou `{ csv }`). Substitui os pedidos e devolve a contagem de importados e ignorados.
- `GET /api/pedidos?status=pago`: lista já com `total` calculado na resposta.
- `PATCH /api/pedidos/:id`: `{ status }`, validado com Zod.
- `GET /api/painel`: `{ pendentes, aReceberCentavos, faturadoCentavos }`.
- (extra) `POST /api/extrair`: `{ mensagem }` → pedido validado (não salva sozinho; o usuário confirma).

## IA (extra)

- Groq, modelo `openai/gpt-oss-120b`, endpoint OpenAI-compatível `https://api.groq.com/openai/v1/chat/completions` via `fetch`, sem SDK.
- Chave em `.env` como `GROQ_API_KEY`. Nunca logar nem commitar (`.env` no `.gitignore`).
- Pedir JSON (`response_format: { type: "json_object" }`), passar por `JSON.parse` e validar com o schema Zod. Se a validação falhar, devolver 422 com o erro, sem inventar campos.
- O preço também passa pelo cálculo do sistema; a IA não decide o total.

## Comandos

```bash
npm run dev    # tsx watch --env-file=.env src/server.ts  (porta 3000)
npm test       # vitest run
```

## Forma de trabalhar

- **Plano antes de codar.** Mostrar o plano curto e só então implementar.
- **Passos pequenos.** Cada passo termina com algo rodando ou um teste passando. Ordem sugerida:
  1. Setup (package.json, tsconfig, Express servindo `public/`).
  2. `pedidos.ts` com `calcularTotal` e `resumoPainel`, mais o teste Vitest.
  3. `importar.ts` (`parseValor`, `mapStatus`, `parseData`) e `POST /api/importar`, gravando no JSON.
  4. `GET /api/pedidos` e `GET /api/painel`.
  5. Front: botão de importar, tabela, filtro de status, select para mudar o status, cards do painel.
  6. `PATCH` de status ligado no front e no painel.
  7. (extra) IA.
- **Código simples.** Funções pequenas e puras para a lógica (testáveis), sem classes nem camadas extras, sem abstração "para o futuro".
- **Mínimo funcional primeiro.** Se o tempo apertar, cortar dedup, datas sofisticadas e o extra de IA. Nunca cortar o total calculado nem o teste.
- Nomes de domínio em português (`pedido`, `status`, `faturado`), como na planilha.
