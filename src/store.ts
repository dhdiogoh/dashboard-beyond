import { readFile, writeFile } from "node:fs/promises";
import { z } from "zod";
import { pedidoSchema, type Pedido } from "./pedidos.js";

const ARQUIVO = process.env.ARQUIVO_PEDIDOS ?? "data/pedidos.json";

export async function lerPedidos(): Promise<Pedido[]> {
  try {
    return z.array(pedidoSchema).parse(JSON.parse(await readFile(ARQUIVO, "utf8")));
  } catch (erro) {
    if ((erro as NodeJS.ErrnoException).code === "ENOENT") return [];
    throw erro;
  }
}

export async function salvarPedidos(pedidos: Pedido[]): Promise<void> {
  await writeFile(ARQUIVO, JSON.stringify(pedidos, null, 2));
}
