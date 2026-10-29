import { randomUUID } from "node:crypto";
import { parse } from "csv-parse/sync";
import ExcelJS from "exceljs";
import { pedidoSchema, type Pedido, type Status } from "./pedidos.js";

// "R$ 45.00", "R$ 55,00", "150,00", "45.0", "80.91000000000001", "GRÁTIS" -> centavos
export function parseValor(texto: string): number | null {
  let s = texto.trim().toLowerCase();
  if (s === "") return null;
  if (s === "grátis" || s === "gratis") return 0;
  s = s.replace("r$", "").replace(/\s/g, "");
  // Com vírgula, a vírgula é o decimal e o ponto é milhar (padrão BR)
  if (s.includes(",")) s = s.replace(/\./g, "").replace(",", ".");
  const n = Number(s);
  if (!Number.isFinite(n) || n < 0) return null;
  return Math.round(n * 100);
}

// Status desconhecido vira "novo": aparece como pendente para alguém revisar, em vez de sumir
export function mapStatus(texto: string): Status {
  const s = texto.trim().toLowerCase();
  if (/cancel|desist|devolv/.test(s)) return "cancelado";
  if (/envia|postado|saiu/.test(s)) return "enviado";
  if (/^pago|^pg$|^ok$|✅/.test(s)) return "pago";
  return "novo"; // pendente, aguardando, falta pagar, ⏳, vazio
}

const MESES: Record<string, number> = {
  jan: 1, feb: 2, fev: 2, mar: 3, apr: 4, abr: 4, may: 5, mai: 5, jun: 6,
  jul: 7, aug: 8, ago: 8, sep: 9, set: 9, oct: 10, out: 10, nov: 11, dec: 12, dez: 12,
};

// Vários formatos -> "yyyy-mm-dd". Data sem ano assume o ano atual. Não reconhecida -> null.
export function parseData(texto: string, anoPadrao = new Date().getFullYear()): string | null {
  const s = texto.trim().toLowerCase();
  let d: number, m: number, y: number;
  let r: RegExpMatchArray | null;
  if ((r = s.match(/^(\d{4})-(\d{1,2})-(\d{1,2})$/))) {
    [y, m, d] = [+r[1], +r[2], +r[3]];
  } else if ((r = s.match(/^(\d{1,2})[/-](\d{1,2})(?:[/-](\d{2}|\d{4}))?$/))) {
    [d, m] = [+r[1], +r[2]];
    y = r[3] ? (r[3].length === 2 ? 2000 + +r[3] : +r[3]) : anoPadrao;
  } else if ((r = s.match(/^(\d{1,2}) ([a-z]{3}) (\d{4})$/)) && MESES[r[2]]) {
    [d, m, y] = [+r[1], MESES[r[2]], +r[3]];
  } else {
    return null;
  }
  if (m < 1 || m > 12 || d < 1 || d > 31) return null;
  return `${y}-${String(m).padStart(2, "0")}-${String(d).padStart(2, "0")}`;
}

function titleCase(nome: string): string {
  return nome
    .trim()
    .toLocaleLowerCase("pt-BR")
    .split(/\s+/)
    .map((p) => p.charAt(0).toLocaleUpperCase("pt-BR") + p.slice(1))
    .join(" ");
}

type ResultadoImport = { pedidos: Pedido[]; ignorados: number };

export function importarCsv(texto: string): ResultadoImport {
  const primeiraLinha = texto.split(/\r?\n/, 1)[0];
  const delimiter = primeiraLinha.split(";").length > primeiraLinha.split(",").length ? ";" : ",";
  const linhas: string[][] = parse(texto, {
    delimiter,
    bom: true,
    skip_empty_lines: true,
    relax_column_count: true,
    trim: true,
  });
  return importarLinhas(linhas);
}

// Lê a aba "Pedidos" (ou a primeira, se não existir). cell.text devolve o valor como aparece na planilha.
export async function importarXlsx(arquivo: Buffer): Promise<ResultadoImport> {
  const workbook = new ExcelJS.Workbook();
  await workbook.xlsx.load(arquivo as unknown as ArrayBuffer);
  const aba = workbook.getWorksheet("Pedidos") ?? workbook.worksheets[0];
  if (!aba) return { pedidos: [], ignorados: 0 };

  const linhas: string[][] = [];
  aba.eachRow((row) => {
    const linha: string[] = [];
    for (let col = 1; col <= 8; col++) linha.push(row.getCell(col).text.trim());
    linhas.push(linha);
  });
  return importarLinhas(linhas);
}

// Colunas da aba Pedidos (primeira linha é o cabeçalho):
// Nome do cliente | produto | Qtd | VALOR | Status do Pedido | Data | Forma pgto | Observações
function importarLinhas(linhas: string[][]): ResultadoImport {
  const pedidos: Pedido[] = [];
  let ignorados = 0;
  for (const linha of linhas.slice(1)) {
    const [cliente = "", produto = "", qtdTxt = "", valorTxt = "", statusTxt = "", dataTxt = "", formaPgto = "", obs = ""] = linha;
    if (linha.every((celula) => !celula)) continue; // linha totalmente vazia
    const valor = parseValor(valorTxt);
    if (!produto || produto.toLowerCase() === "teste" || valor === null) {
      ignorados++;
      continue;
    }
    // VALOR na planilha é o total da linha; guardamos o unitário e o sistema recalcula o total
    const qtd = Math.max(1, parseInt(qtdTxt, 10) || 1);
    const resultado = pedidoSchema.safeParse({
      id: randomUUID(),
      cliente: titleCase(cliente) || "Sem Nome",
      produto,
      qtd,
      precoUnitarioCentavos: Math.round(valor / qtd),
      status: mapStatus(statusTxt),
      data: parseData(dataTxt),
      formaPgto,
      obs,
    });
    if (resultado.success) pedidos.push(resultado.data);
    else ignorados++;
  }
  return { pedidos, ignorados };
}
