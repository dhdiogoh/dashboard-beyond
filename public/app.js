const STATUS = ["novo", "pago", "enviado", "cancelado"];
let pedidos = [];
let filtro = "";

const reais = (centavos) =>
  (centavos / 100).toLocaleString("pt-BR", { style: "currency", currency: "BRL" });

const dataBr = (iso) => (iso ? iso.split("-").reverse().join("/") : "—");

let timerAviso;
function avisar(texto, erro = false) {
  const el = document.getElementById("aviso");
  const modal = document.getElementById("dialogMensagem");
  (modal.open ? modal : document.body).append(el); // modal aberto fica por cima de tudo
  el.textContent = texto;
  el.classList.toggle("erro", erro);
  el.hidden = false;
  clearTimeout(timerAviso);
  timerAviso = setTimeout(() => (el.hidden = true), 4000);
}

async function api(url, opcoes) {
  const resposta = await fetch(url, opcoes);
  const corpo = await resposta.json();
  if (!resposta.ok) throw new Error(corpo.erro ?? "Erro na requisição");
  return corpo;
}

// O painel vem pronto do backend; o front só exibe
async function carregarPainel() {
  const painel = await api("/api/painel");
  document.getElementById("pendentes").textContent = painel.pendentes;
  document.getElementById("aReceber").textContent = reais(painel.aReceberCentavos);
  document.getElementById("faturado").textContent = reais(painel.faturadoCentavos);
}

function celula(texto, classe) {
  const td = document.createElement("td");
  td.textContent = texto; // textContent: dados da planilha nunca viram HTML
  if (classe) td.className = classe;
  return td;
}

function selectStatus(pedido) {
  const select = document.createElement("select");
  select.className = `status status-${pedido.status}`;
  select.setAttribute("aria-label", `Status do pedido de ${pedido.cliente}`);
  for (const s of STATUS) select.add(new Option(s, s, false, s === pedido.status));
  select.addEventListener("change", async () => {
    try {
      await api(`/api/pedidos/${pedido.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ status: select.value }),
      });
      await atualizar();
    } catch (erro) {
      avisar(erro.message, true);
      select.value = pedido.status;
    }
  });
  const td = document.createElement("td");
  td.append(select);
  return td;
}

function renderizarLista() {
  for (const botao of document.querySelectorAll("#filtros button")) {
    const s = botao.dataset.status;
    botao.classList.toggle("ativo", s === filtro);
    botao.querySelector("span").textContent = s ? pedidos.filter((p) => p.status === s).length : pedidos.length;
  }

  const visiveis = filtro ? pedidos.filter((p) => p.status === filtro) : pedidos;
  document.getElementById("pedidos").replaceChildren(
    ...visiveis.map((p) => {
      const tr = document.createElement("tr");
      if (p.status === "cancelado") tr.className = "cancelado";
      tr.append(
        celula(dataBr(p.data), "data"),
        celula(p.cliente, "cliente"),
        celula(p.produto),
        celula(p.qtd, "num"),
        celula(reais(p.precoUnitarioCentavos), "num suave"),
        celula(reais(p.totalCentavos), "num total"),
        celula(p.formaPgto, "suave"),
        selectStatus(p),
        celula(p.obs, "obs"),
      );
      return tr;
    }),
  );
  document.getElementById("vazio").hidden = visiveis.length > 0;
}

async function carregarPedidos() {
  pedidos = await api("/api/pedidos");
  pedidos.sort((a, b) => (b.data ?? "").localeCompare(a.data ?? ""));
  renderizarLista();
}

async function atualizar() {
  await Promise.all([carregarPainel(), carregarPedidos()]);
}

const XLSX = "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet";

// .xlsx vai como binário. CSV vai como texto: Excel em português costuma salvar
// em Windows-1252, então tenta UTF-8 e cai para ele.
async function corpoDoArquivo(arquivo) {
  const bytes = await arquivo.arrayBuffer();
  if (arquivo.name.toLowerCase().endsWith(".xlsx")) return { tipo: XLSX, corpo: bytes };
  try {
    return { tipo: "text/csv", corpo: new TextDecoder("utf-8", { fatal: true }).decode(bytes) };
  } catch {
    return { tipo: "text/csv", corpo: new TextDecoder("windows-1252").decode(bytes) };
  }
}

document.getElementById("arquivo").addEventListener("change", async (evento) => {
  const arquivo = evento.target.files[0];
  if (!arquivo) return;
  try {
    const { tipo, corpo } = await corpoDoArquivo(arquivo);
    const resultado = await api("/api/importar", {
      method: "POST",
      headers: { "Content-Type": tipo },
      body: corpo,
    });
    avisar(`${resultado.importados} pedidos importados · ${resultado.ignorados} linhas ignoradas`);
    filtro = "";
    await atualizar();
  } catch (erro) {
    avisar(erro.message, true);
  }
  evento.target.value = ""; // permite importar o mesmo arquivo de novo
});

document.getElementById("filtros").addEventListener("click", (evento) => {
  const botao = evento.target.closest("button");
  if (!botao) return;
  filtro = botao.dataset.status;
  renderizarLista();
});

// Pedido por mensagem: IA extrai, usuário revisa, sistema salva e calcula o total
const dialogo = document.getElementById("dialogMensagem");
const form = document.getElementById("formPedido");
const botaoExtrair = document.getElementById("extrair");

document.getElementById("abrirMensagem").addEventListener("click", () => {
  document.getElementById("mensagem").value = "";
  form.reset();
  form.hidden = true;
  dialogo.showModal();
});
document.getElementById("fecharMensagem").addEventListener("click", () => dialogo.close());

botaoExtrair.addEventListener("click", async () => {
  botaoExtrair.disabled = true;
  botaoExtrair.textContent = "Extraindo…";
  try {
    const pedido = await api("/api/extrair", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ mensagem: document.getElementById("mensagem").value }),
    });
    form.cliente.value = pedido.cliente;
    form.produto.value = pedido.produto;
    form.qtd.value = pedido.qtd;
    form.preco.value = pedido.precoUnitarioCentavos === null ? "" : (pedido.precoUnitarioCentavos / 100).toFixed(2);
    form.formaPgto.value = pedido.formaPgto;
    form.hidden = false;
  } catch (erro) {
    avisar(erro.message, true);
  } finally {
    botaoExtrair.disabled = false;
    botaoExtrair.textContent = "Extrair com IA";
  }
});

form.addEventListener("submit", async (evento) => {
  evento.preventDefault();
  try {
    const pedido = await api("/api/pedidos", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        cliente: form.cliente.value.trim(),
        produto: form.produto.value.trim(),
        qtd: Number(form.qtd.value),
        precoUnitarioCentavos: Math.round(Number(form.preco.value) * 100),
        formaPgto: form.formaPgto.value.trim(),
      }),
    });
    dialogo.close();
    avisar(`Pedido de ${pedido.cliente} salvo · total ${reais(pedido.totalCentavos)}`);
    filtro = "";
    await atualizar();
  } catch (erro) {
    avisar(erro.message, true);
  }
});

atualizar().catch((erro) => avisar(erro.message, true));
