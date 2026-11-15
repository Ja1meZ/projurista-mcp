/**
 * Normalizações usadas na comparação de enunciados. Três níveis, do mais ao menos estrito:
 *  - comparavel: só iguala o que é tipografia (aspas, travessões, espaços). É o critério de "literal".
 *  - chaveForma: ignora também pontuação, caixa, acentos, hífen e a forma de "nº". Duas redações com a
 *    mesma chave têm as mesmas palavras, na mesma ordem.
 *  - semAcento: para busca textual.
 */

export function comparavel(s: string): string {
	return s
		.normalize("NFC")
		.replace(/[“”„«»"]/g, '"')
		.replace(/[‘’'`´]/g, "'")
		.replace(/[\u2010-\u2015\u2212]/g, "-")
		.replace(/[\u00a0\u2000-\u200b\u202f]/g, " ")
		.replace(/\s+([,;:.!?)])/g, "$1")
		.replace(/\(\s+/g, "(")
		.replace(/\s+/g, " ")
		.trim();
}

export function tirarAcentos(s: string): string {
	return s.normalize("NFD").replace(/[̀-ͯ]/g, "");
}

function minusculoSemForma(s: string): string {
	return tirarAcentos(
		comparavel(s)
			.toLowerCase()
			.replace(/\bn\s*[ºo°.]\s*(?=\d)/g, "n"),
	);
}

export function chaveForma(s: string): string {
	return minusculoSemForma(s).replace(/[^0-9a-z]/g, "");
}

/** Palavras para o cotejo: sem pontuação, caixa e acentos; "nº 10" e "n. 10" viram "n 10". */
export function palavras(s: string): string[] {
	return minusculoSemForma(s)
		.replace(/(?<=\d)[.](?=\d)/g, "")
		.replace(/\bn(?=\d)/g, "n ")
		.match(/[0-9a-z]+/g) ?? [];
}

/** Palavras como aparecem no texto (com pontuação colada), para mostrar diferenças. */
export function palavrasVisiveis(s: string): string[] {
	const t = comparavel(s);
	return t.length ? t.split(" ") : [];
}

export function semAcento(s: string): string {
	return tirarAcentos(s.normalize("NFC").toLowerCase()).replace(/\s+/g, " ").trim();
}

export interface Diferenca {
	citado: string;
	oficial: string;
}

/** Diferenças palavra a palavra entre o texto citado e o oficial (maior subsequência comum). */
export function diferencas(citado: string[], oficial: string[], igual: (a: string, b: string) => boolean = (a, b) => a === b): Diferenca[] {
	const n = citado.length;
	const m = oficial.length;
	const t: Uint16Array[] = [];
	for (let i = 0; i <= n; i++) t.push(new Uint16Array(m + 1));
	for (let i = n - 1; i >= 0; i--) {
		for (let j = m - 1; j >= 0; j--) {
			t[i][j] = igual(citado[i], oficial[j]) ? t[i + 1][j + 1] + 1 : Math.max(t[i + 1][j], t[i][j + 1]);
		}
	}
	const saida: Diferenca[] = [];
	let i = 0;
	let j = 0;
	let c: string[] = [];
	let o: string[] = [];
	const fechar = () => {
		if (c.length || o.length) saida.push({ citado: c.join(" "), oficial: o.join(" ") });
		c = [];
		o = [];
	};
	while (i < n || j < m) {
		if (i < n && j < m && igual(citado[i], oficial[j])) {
			fechar();
			i++;
			j++;
		} else if (j < m && (i === n || t[i][j + 1] >= t[i + 1][j])) {
			o.push(oficial[j++]);
		} else {
			c.push(citado[i++]);
		}
	}
	fechar();
	return saida;
}

/** Proporção de palavras em comum (0 a 1), pela maior subsequência comum. */
export function semelhanca(a: string[], b: string[]): number {
	if (a.length === 0 || b.length === 0) return 0;
	let anterior = new Uint16Array(b.length + 1);
	for (let i = a.length - 1; i >= 0; i--) {
		const atual = new Uint16Array(b.length + 1);
		for (let j = b.length - 1; j >= 0; j--) {
			atual[j] = a[i] === b[j] ? anterior[j + 1] + 1 : Math.max(anterior[j], atual[j + 1]);
		}
		anterior = atual;
	}
	return (2 * anterior[0]) / (a.length + b.length);
}
