import { randomUUID } from "node:crypto";
import express from "express";
import { z } from "zod";
import { ErroIa, extrairPedido } from "./ia.js";
import { importarCsv, importarXlsx } from "./importar.js";
import { calcularTotal, pedidoSchema, resumoPainel, statusSchema, type Pedido } from "./pedidos.js";
import { lerPedidos, salvarPedidos } from "./store.js";

const XLSX = "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet";

const app = express();
app.use(express.json({ limit: "1mb" }));
app.use(express.text({ type: "text/csv", limit: "1mb" }));
app.use(express.raw({ type: XLSX, limit: "10mb" }));
app.use(express.static("public"));

// O total sai sempre do sistema, nunca da planilha
const comTotal = (p: Pedido) => ({ ...p, totalCentavos: calcularTotal(p) });

// Aceita o .xlsx (binário), o CSV puro (text/csv) ou JSON { csv }
app.post("/api/importar", async (req, res) => {
  let resultado;
  if (Buffer.isBuffer(req.body) && req.body.length > 0) {
    try {
      resultado = await importarXlsx(req.body);
    } catch {
      res.status(400).json({ erro: "Não consegui ler a planilha .xlsx" });
      return;
    }
  } else {
    const csv = z.string().min(1).safeParse(typeof req.body === "string" ? req.body : req.body?.csv);
    if (!csv.success) {
      res.status(400).json({ erro: "Envie a planilha .xlsx ou um CSV" });
      return;
    }
    resultado = importarCsv(csv.data);
  }
  const { pedidos, ignorados } = resultado;
  await salvarPedidos(pedidos);
  res.json({ importados: pedidos.length, ignorados });
});

app.get("/api/pedidos", async (req, res) => {
  const status = statusSchema.optional().safeParse(req.query.status || undefined);
  if (!status.success) {
    res.status(400).json({ erro: "Status inválido" });
    return;
  }
  const pedidos = await lerPedidos();
  res.json(pedidos.filter((p) => !status.data || p.status === status.data).map(comTotal));
});

app.patch("/api/pedidos/:id", async (req, res) => {
  const corpo = z.object({ status: statusSchema }).safeParse(req.body);
  if (!corpo.success) {
    res.status(400).json({ erro: "Status inválido" });
    return;
  }
  const pedidos = await lerPedidos();
  const pedido = pedidos.find((p) => p.id === req.params.id);
  if (!pedido) {
    res.status(404).json({ erro: "Pedido não encontrado" });
    return;
  }
  pedido.status = corpo.data.status;
  await salvarPedidos(pedidos);
  res.json(comTotal(pedido));
});

// Extrai o pedido da mensagem, mas não salva: o usuário revisa antes
app.post("/api/extrair", async (req, res) => {
  const corpo = z.object({ mensagem: z.string().trim().min(1) }).safeParse(req.body);
  if (!corpo.success) {
    res.status(400).json({ erro: "Cole a mensagem do cliente" });
    return;
  }
  const pedidos = await lerPedidos();
  const produtos = [...new Set(pedidos.map((p) => p.produto))];
  try {
    const extracao = await extrairPedido(corpo.data.mensagem, produtos);
    // Preço sugerido = o do pedido mais recente desse produto (editável na revisão)
    const ultimo = pedidos
      .filter((p) => p.produto.toLowerCase() === extracao.produto.toLowerCase())
      .sort((a, b) => (b.data ?? "").localeCompare(a.data ?? ""))[0];
    res.json({ ...extracao, precoUnitarioCentavos: ultimo?.precoUnitarioCentavos ?? null });
  } catch (erro) {
    if (erro instanceof ErroIa) {
      res.status(422).json({ erro: erro.message });
      return;
    }
    throw erro;
  }
});

app.post("/api/pedidos", async (req, res) => {
  const corpo = pedidoSchema.pick({ cliente: true, produto: true, qtd: true, precoUnitarioCentavos: true, formaPgto: true }).safeParse(req.body);
  if (!corpo.success) {
    res.status(400).json({ erro: "Preencha cliente, produto, quantidade e preço" });
    return;
  }
  const pedido: Pedido = {
    ...corpo.data,
    id: randomUUID(),
    status: "novo",
    data: new Date().toISOString().slice(0, 10),
    obs: "via mensagem",
  };
  const pedidos = await lerPedidos();
  pedidos.push(pedido);
  await salvarPedidos(pedidos);
  res.status(201).json(comTotal(pedido));
});

app.get("/api/painel", async (_req, res) => {
  res.json(resumoPainel(await lerPedidos()));
});

const PORT = Number(process.env.PORT ?? 3000);
app.listen(PORT, () => console.log(`http://localhost:${PORT}`));
