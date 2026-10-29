import { z } from "zod";

// A IA só extrai o que está na mensagem. Preço e total ficam com o sistema.
export const extracaoSchema = z.object({
  cliente: z.string().trim().min(1),
  produto: z.string().trim().min(1),
  qtd: z.coerce.number().int().min(1),
  formaPgto: z.string().trim().default(""),
});
export type Extracao = z.infer<typeof extracaoSchema>;

export class ErroIa extends Error {}

function prompt(produtos: string[]): string {
  return `Você extrai pedidos de mensagens de clientes de uma loja de acessórios (Instagram/WhatsApp).
Responda APENAS um JSON com as chaves:
{"cliente": string, "produto": string, "qtd": inteiro >= 1, "formaPgto": string}
- cliente: nome de quem está comprando (se não aparecer, use "").
- produto: se corresponder a um destes, use o nome exato: ${produtos.join(", ")}.
- qtd: quantidade pedida; se não for dita, 1.
- formaPgto: pix, cartão, dinheiro etc.; se não for dita, "".
Não invente dados que não estão na mensagem.`;
}

export async function extrairPedido(mensagem: string, produtos: string[]): Promise<Extracao> {
  const chave = process.env.GROQ_API_KEY;
  if (!chave) throw new ErroIa("GROQ_API_KEY não configurada no .env");

  const resposta = await fetch("https://api.groq.com/openai/v1/chat/completions", {
    method: "POST",
    headers: { Authorization: `Bearer ${chave}`, "Content-Type": "application/json" },
    body: JSON.stringify({
      model: "openai/gpt-oss-120b",
      temperature: 0,
      response_format: { type: "json_object" },
      messages: [
        { role: "system", content: prompt(produtos) },
        { role: "user", content: mensagem },
      ],
    }),
  });
  if (!resposta.ok) throw new ErroIa(`Groq respondeu ${resposta.status}`);

  const dados = await resposta.json();
  let json: unknown;
  try {
    json = JSON.parse(dados.choices?.[0]?.message?.content ?? "");
  } catch {
    throw new ErroIa("A IA não devolveu um JSON válido");
  }
  const resultado = extracaoSchema.safeParse(json);
  if (!resultado.success) throw new ErroIa("A IA não encontrou cliente e produto na mensagem");
  return resultado.data;
}
