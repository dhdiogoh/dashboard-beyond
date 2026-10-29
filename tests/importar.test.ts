import { readFile } from "node:fs/promises";
import { describe, expect, test } from "vitest";
import { importarCsv, importarXlsx, mapStatus, parseData, parseValor } from "../src/importar.js";
import { calcularTotal, resumoPainel } from "../src/pedidos.js";

describe("parseValor", () => {
  test.each([
    ["R$ 45.00", 4500],
    ["R$ 55,00", 5500],
    ["R$43,20", 4320],
    ["150,00", 15000],
    ["45.0", 4500],
    ["86", 8600],
    ["80.91000000000001", 8091],
    ["R$ 1.234,56", 123456],
    ["GRÁTIS", 0],
  ])("%s -> %i centavos", (texto, esperado) => {
    expect(parseValor(texto)).toBe(esperado);
  });

  test("vazio ou lixo -> null", () => {
    expect(parseValor("")).toBeNull();
    expect(parseValor("abc")).toBeNull();
  });
});

describe("mapStatus", () => {
  test.each([
    ["Pago", "pago"], ["pago!", "pago"], ["pago - confirmado", "pago"], ["Pago via PIX", "pago"],
    ["pg", "pago"], ["OK", "pago"], ["✅", "pago"],
    ["enviado correios", "enviado"], ["postado", "enviado"], ["saiu hj", "enviado"], ["ENVIADO", "enviado"],
    ["PENDENTE", "novo"], ["aguardando pix", "novo"], ["falta pagar", "novo"], ["⏳", "novo"], ["", "novo"],
    ["Cancelado", "cancelado"], ["cancelou", "cancelado"], ["desistiu", "cancelado"], ["devolvido", "cancelado"],
  ])("%s -> %s", (texto, esperado) => {
    expect(mapStatus(texto)).toBe(esperado);
  });
});

describe("parseData", () => {
  test.each([
    ["02/02/2025", "2025-02-02"],
    ["09-02-2025", "2025-02-09"],
    ["2025-02-11", "2025-02-11"],
    ["22 Feb 2025", "2025-02-22"],
    ["5/3/2025", "2025-03-05"],
    ["08/04/25", "2025-04-08"],
  ])("%s -> %s", (texto, esperado) => {
    expect(parseData(texto)).toBe(esperado);
  });

  test("sem ano assume o ano atual", () => {
    expect(parseData("03/02")).toBe(`${new Date().getFullYear()}-02-03`);
    expect(parseData("03/02", 2026)).toBe("2026-02-03");
  });

  test("inválida -> null", () => {
    expect(parseData("ontem")).toBeNull();
    expect(parseData("40/13/2025")).toBeNull();
  });
});

describe("importarCsv", () => {
  const cabecalho = "Nome do cliente;produto;Qtd;VALOR;Status do Pedido;Data;Forma pgto;Observações";

  test("converte linhas, recalcula total e ignora lixo", () => {
    const csv = [
      cabecalho,
      "Felipe Araújo;Colar Pérolas;2;240.0;pago!;20/03/2025;Pix;mandou msg no zap",
      "JOÃO PEDRO;Presilha Cabelo Luxo;1;55;Pendente;09 Feb 2025;;",
      ";Colar Dourado Lua;1;R$ 89,90;pago;15/02/2025;pix;",
      "Teste;teste;;;;;;ignorar essa linha",
      "Sem Valor;Brinco;1;;pago;;;",
    ].join("\n");

    const { pedidos, ignorados } = importarCsv(csv);

    expect(ignorados).toBe(2);
    expect(pedidos).toHaveLength(3);
    // VALOR da planilha é o total da linha: 240 / 2 = 120 por unidade
    expect(pedidos[0]).toMatchObject({ cliente: "Felipe Araújo", qtd: 2, precoUnitarioCentavos: 12000, status: "pago", data: "2025-03-20" });
    expect(calcularTotal(pedidos[0])).toBe(24000);
    expect(pedidos[1]).toMatchObject({ cliente: "João Pedro", status: "novo", data: "2025-02-09" });
    expect(pedidos[2].cliente).toBe("Sem Nome");
  });

  test("importa a planilha-loja.xlsx real e o painel bate", async () => {
    const { pedidos, ignorados } = await importarXlsx(await readFile("planilha-loja.xlsx"));

    expect(pedidos).toHaveLength(192);
    expect(ignorados).toBe(1); // linha "Teste"
    expect(pedidos[0]).toMatchObject({ cliente: "Bianca Dias", produto: "Brinco Argola Prata", precoUnitarioCentavos: 4500, status: "pago", data: "2025-02-02" });
    expect(resumoPainel(pedidos)).toEqual({ pendentes: 38, aReceberCentavos: 348492, faturadoCentavos: 1357951 });
  });

  test("aceita CSV separado por vírgula com valores entre aspas", () => {
    const csv = 'Nome do cliente,produto,Qtd,VALOR,Status do Pedido,Data,Forma pgto,Observações\nBianca Dias,Brinco,1,"R$ 55,00",Pago,02/02/2025,pix,"2a compra, VIP"';
    const { pedidos } = importarCsv(csv);
    expect(pedidos[0]).toMatchObject({ precoUnitarioCentavos: 5500, obs: "2a compra, VIP" });
  });
});
