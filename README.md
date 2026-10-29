# Pedidos em ordem

App web para uma loja de acessórios do Instagram que controlava os pedidos numa planilha, perdia pedidos e errava as contas.

O app importa a planilha, lista os pedidos com status, **calcula o total no sistema** e mostra um painel com o que está pendente, a receber e faturado.

## Funcionalidades

- **Import da planilha** `.xlsx` (aba `Pedidos`) ou `.csv`. Normaliza a sujeira da planilha original:
  - valores como `R$ 45.00`, `55,00`, `45.0` e `GRÁTIS`;
  - status como ✅, `pg`, `OK`, ⏳, `postado` e `desistiu`;
  - datas em vários formatos.
- **Total sempre calculado** pelo sistema (`qtd × preço unitário`), em centavos inteiros, sem erro de float.
- **Lista de pedidos** com filtro e troca de status: `novo`, `pago`, `enviado` e `cancelado`.
- **Painel**:
  - **Pendentes:** quantidade de pedidos `novo`.
  - **A receber:** soma dos pedidos `novo`.
  - **Faturado:** soma dos pedidos `pago` + `enviado`.
  - Cancelados não entram em nenhum dos números.
- **Pedido por mensagem:** cole uma mensagem do Direct ou do WhatsApp e a IA (Groq, `openai/gpt-oss-120b`) extrai cliente, produto, quantidade e pagamento. A resposta é validada com Zod, e você revisa antes de salvar. O preço vem do histórico do produto, não da IA.

## Por que a planilha errava as contas

A aba oculta `NÃO MEXER` somava a coluna VALOR com `SUMIF`, mas os valores estavam guardados como texto (`R$ 45.00`, `150,00`…). Por isso o faturamento sempre dava R$ 0. Com a planilha real, o app calcula **R$ 13.579,51 faturado** e **R$ 3.484,92 a receber**.

## Stack

TypeScript, Express, Zod, Vitest, ExcelJS e csv-parse. A interface é em HTML/CSS/JS puro (`public/`) e os dados ficam em `data/pedidos.json`.

## Como rodar

Requer Node 22+.

```bash
npm install
cp .env.example .env   # coloque sua GROQ_API_KEY (só necessária para o pedido por mensagem)
npm run dev            # http://localhost:3000
npm test
```

Depois, clique em **Importar planilha** e escolha o `planilha-loja.xlsx`.

## API

| Rota | Descrição |
|---|---|
| `POST /api/importar` | Recebe `.xlsx` (binário) ou CSV (`text/csv`) e substitui os pedidos |
| `GET /api/pedidos?status=` | Lista os pedidos com o total calculado |
| `POST /api/pedidos` | Cria um pedido (`cliente`, `produto`, `qtd`, `precoUnitarioCentavos`, `formaPgto`) |
| `PATCH /api/pedidos/:id` | Altera o status |
| `GET /api/painel` | Devolve pendentes, a receber e faturado |
| `POST /api/extrair` | Recebe `{ mensagem }` e devolve o pedido extraído pela IA, sem salvar |

## Estrutura

```
src/
  pedidos.ts   # modelo, calcularTotal, resumoPainel
  importar.ts  # xlsx/csv -> pedidos (normalização)
  store.ts     # leitura e gravação do data/pedidos.json
  ia.ts        # extração de pedido com a Groq
  server.ts    # rotas Express
public/        # interface
tests/         # Vitest
```
