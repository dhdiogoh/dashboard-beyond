import { z } from "zod";

export const statusSchema = z.enum(["novo", "pago", "enviado", "cancelado"]);
export type Status = z.infer<typeof statusSchema>;

export const pedidoSchema = z.object({
  id: z.string(),
  cliente: z.string().min(1),
  produto: z.string().min(1),
  qtd: z.number().int().min(1),
  precoUnitarioCentavos: z.number().int().min(0),
  status: statusSchema,
  data: z.string().nullable(), // ISO yyyy-mm-dd
  formaPgto: z.string(),
  obs: z.string(),
});
export type Pedido = z.infer<typeof pedidoSchema>;

// O total nunca é armazenado nem vem da planilha: é sempre calculado aqui.
export function calcularTotal(p: Pick<Pedido, "qtd" | "precoUnitarioCentavos">): number {
  return p.qtd * p.precoUnitarioCentavos;
}

export type Painel = {
  pendentes: number;
  aReceberCentavos: number;
  faturadoCentavos: number;
};

export function resumoPainel(pedidos: Pedido[]): Painel {
  const painel: Painel = { pendentes: 0, aReceberCentavos: 0, faturadoCentavos: 0 };
  for (const p of pedidos) {
    if (p.status === "novo") {
      painel.pendentes++;
      painel.aReceberCentavos += calcularTotal(p);
    } else if (p.status === "pago" || p.status === "enviado") {
      painel.faturadoCentavos += calcularTotal(p);
    }
    // cancelado não entra em nada
  }
  return painel;
}
