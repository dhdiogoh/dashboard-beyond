import { describe, expect, test } from "vitest";
import { calcularTotal, resumoPainel, type Pedido, type Status } from "../src/pedidos.js";

function pedido(status: Status, qtd: number, precoUnitarioCentavos: number): Pedido {
  return { id: status + qtd, cliente: "Ana", produto: "Brinco", qtd, precoUnitarioCentavos, status, data: null, formaPgto: "", obs: "" };
}

describe("calcularTotal", () => {
  test("multiplica quantidade pelo preço unitário", () => {
    expect(calcularTotal({ qtd: 1, precoUnitarioCentavos: 4500 })).toBe(4500);
    expect(calcularTotal({ qtd: 3, precoUnitarioCentavos: 8990 })).toBe(26970);
  });

  test("não tem erro de float (centavos inteiros)", () => {
    // 3 x 0,10 em float daria 0.30000000000000004
    expect(calcularTotal({ qtd: 3, precoUnitarioCentavos: 10 })).toBe(30);
  });

  test("brinde grátis tem total zero", () => {
    expect(calcularTotal({ qtd: 1, precoUnitarioCentavos: 0 })).toBe(0);
  });
});

describe("resumoPainel", () => {
  test("separa pendentes, a receber e faturado; cancelado não conta", () => {
    const pedidos = [
      pedido("novo", 2, 5500), // 110,00 a receber
      pedido("novo", 1, 4200), // 42,00 a receber
      pedido("pago", 1, 15000), // 150,00 faturado
      pedido("enviado", 2, 3500), // 70,00 faturado
      pedido("cancelado", 1, 99900), // ignorado
    ];
    expect(resumoPainel(pedidos)).toEqual({
      pendentes: 2,
      aReceberCentavos: 15200,
      faturadoCentavos: 22000,
    });
  });

  test("lista vazia zera tudo", () => {
    expect(resumoPainel([])).toEqual({ pendentes: 0, aReceberCentavos: 0, faturadoCentavos: 0 });
  });
});
