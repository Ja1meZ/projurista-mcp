#!/usr/bin/env python3
"""Gera dados/precedentes-stj.json a partir da planilha exportada do site do STJ.

Fonte: https://processo.stj.jus.br/repetitivos/temas_repetitivos/ (botão de exportação, formato XLSX).

    python3 scripts/exportar-base-precedentes-stj.py <planilha.xlsx> --data-fonte AAAA-MM-DD

Só biblioteca padrão. O texto da questão, da tese e das anotações é copiado como está na planilha
(apenas os espaços das pontas são retirados). Nada é reescrito, resumido ou normalizado: a
classificação da situação e os alertas são campos à parte, derivados por regra.

Sai com código 2, sem gravar, se a planilha não tiver a estrutura esperada.
"""
import argparse
import collections
import datetime
import hashlib
import json
import pathlib
import re
import sys
import xml.etree.ElementTree as ET
import zipfile

M = "{http://schemas.openxmlformats.org/spreadsheetml/2006/main}"

CABECALHO = [
    "Tipo de precedente", "Número", "Questão", "Órgão julgador", "Primeiro relator", "Relator atual",
    "Anotações", "Tese", "Processos paradigma", "Situação atual", "Data da situação", "Suspensão",
    "N. únicos paradigma", "N. Registros paradigma", "Quantidade",
]

TIPOS = {"Tema": "TEMA", "IAC": "IAC", "Controvérsia": "CONTROVERSIA", "Relevância": "RELEVANCIA", "SIRDR": "SIRDR"}

# Situação do STJ (minúsculas, sem espaços nas pontas) -> classe usada pelas ferramentas.
# Só "transitado" é tratado como tese firme. Situação desconhecida vira "outro" e entra no relatório.
SITUACOES = {
    "trânsito em julgado": "transitado",
    "acórdão publicado": "tese_sem_transito",
    "acórdão publicado - re pendente": "tese_sem_transito",
    "mérito julgado": "tese_sem_transito",
    "sobrestado": "tese_sem_transito",
    "relevância reconhecida com reafirmação de jurisprudência": "tese_sem_transito",
    "não cabimento do recurso especial, com fixação de tese negativa": "tese_sem_transito",
    "afetado": "afetado",
    "afetado - possível revisão de tese": "afetado",
    "em julgamento": "afetado",
    "em afetação": "afetado",
    "admitido": "afetado",
    "relevância reconhecida": "afetado",
    "revisado": "revisado",
    "cancelado": "cancelado",
    "cancelada": "cancelado",
    "pendente": "outro",
    "sobrestada": "outro",
    "vinculada a tema": "outro",
    "vinculada a tema repetitivo": "outro",
    "sem processo vinculado": "outro",
    "suspensão indeferida": "outro",
    "suspensão deferida": "outro",
    "prejudicada": "outro",
    "finalizada determinação de suspensão": "outro",
}

ESPACOS = " \t\r\n "
RE_ESCAPE_XLSX = re.compile(r"_x([0-9A-Fa-f]{4})_")


def erro(mensagem):
    sys.stderr.write(f"ERRO: {mensagem}\n")
    sys.exit(2)


def ler_planilha(caminho):
    """Linhas da primeira aba, como listas de texto (None para célula vazia)."""
    with zipfile.ZipFile(caminho) as z:
        compartilhadas = []
        if "xl/sharedStrings.xml" in z.namelist():
            for si in ET.parse(z.open("xl/sharedStrings.xml")).getroot().findall(M + "si"):
                compartilhadas.append("".join(t.text or "" for t in si.iter(M + "t")))
        abas = sorted(n for n in z.namelist() if re.fullmatch(r"xl/worksheets/sheet\d+\.xml", n))
        if not abas:
            erro("a planilha não tem abas.")
        linhas = []
        for row in ET.parse(z.open(abas[0])).getroot().iter(M + "row"):
            linha = {}
            for c in row.findall(M + "c"):
                letras = re.match(r"[A-Z]+", c.get("r")).group()
                coluna = 0
                for ch in letras:
                    coluna = coluna * 26 + ord(ch) - 64
                v = c.find(M + "v")
                if c.get("t") == "s":
                    valor = compartilhadas[int(v.text)]
                elif c.get("t") == "inlineStr":
                    valor = "".join(t.text or "" for t in c.iter(M + "t"))
                else:
                    valor = v.text if v is not None else None
                linha[coluna - 1] = valor
            largura = max(linha) + 1 if linha else 0
            linhas.append([linha.get(i) for i in range(largura)])
    return linhas


def literal(valor):
    """Texto como na planilha: desfaz o escape _xHHHH_ do formato XLSX e tira os espaços das pontas."""
    if valor is None:
        return ""
    return RE_ESCAPE_XLSX.sub(lambda m: chr(int(m.group(1), 16)), valor).strip(ESPACOS)


def lista(valor):
    return [p.strip() for p in literal(valor).split(",") if p.strip()]


RE_BOILERPLATE = re.compile(r"aplica[çc][ãa]o,\s*revis[ãa]o ou distin[çc][ãa]o", re.I)
RE_MODULACAO = re.compile(r"modula[çc][ãaõo]|modular\s+os\s+efeitos|modulad[oa]s?\s+os\s+efeitos", re.I)
RE_TEMA_STF = re.compile(r"\bTemas?\s*(?:n\.?[ºo]?\s*)?(\d[\d.]*)\s*(?:/\s*STF|d[oa]\s+STF|d[ae]\s+Repercuss[ãa]o\s+Geral)", re.I)
RE_REPERCUSSAO = re.compile(r"repercuss[ãa]o\s+geral", re.I)
RE_SUPERACAO = re.compile(r"superad|revis[ãa]o\s+d[ae]\s+tese|tese\s+revisada|revisad[oa]|cancelamento\s+d[ae]\s+tese|tese\s+cancelada|revog", re.I)
RE_EMBARGOS = re.compile(r"reda[çc][ãa]o\s+alterada|tese\s+(?:alterada|modificada|complementada|integrada)", re.I)
RE_REDACOES = re.compile(r"\btese\s+(?:firmada|fixada|revisada|definida)\b", re.I)
RE_VIDE = re.compile(r"\bVide\s+(?:Temas?|Controv[ée]rsias?|IAC|SIRDR)(?:[^.\n;]|(?<=\bn)\.|\.(?=\d)){0,90}", re.I)


def alertas_de(registro):
    anot = registro["anotacoes"]
    tese = registro["tese"]
    junto = anot + "\n" + tese
    saida = []
    if not tese and registro["situacao"] in ("transitado", "tese_sem_transito", "revisado"):
        saida.append({"codigo": "SEM_TESE_NA_FONTE"})
    if "possível revisão" in registro["situacao_original"].lower():
        saida.append({"codigo": "POSSIVEL_REVISAO_DE_TESE"})
    if RE_MODULACAO.search(junto):
        saida.append({"codigo": "MODULACAO_DE_EFEITOS"})
    temas_stf = sorted({int(n.replace(".", "")) for n in RE_TEMA_STF.findall(junto) if n.replace(".", "").isdigit()})
    if temas_stf:
        saida.append({"codigo": "REFERE_TEMA_STF", "detalhe": ", ".join(str(n) for n in temas_stf)})
    elif RE_REPERCUSSAO.search(junto):
        saida.append({"codigo": "MENCIONA_REPERCUSSAO_GERAL"})
    if RE_SUPERACAO.search(RE_BOILERPLATE.sub(" ", junto)):
        saida.append({"codigo": "MENCIONA_SUPERACAO_OU_REVISAO"})
    if RE_EMBARGOS.search(anot):
        saida.append({"codigo": "REDACAO_ALTERADA"})
    if len(RE_REDACOES.findall(tese)) >= 2:
        saida.append({"codigo": "TESE_COM_MULTIPLAS_REDACOES"})
    vides = []
    for m in RE_VIDE.finditer(anot):
        trecho = re.sub(r"\s+", " ", m.group(0)).strip()
        if trecho not in vides:
            vides.append(trecho)
    if vides:
        saida.append({"codigo": "VIDE", "detalhe": "; ".join(vides)})
    return saida


def montar(linhas):
    if not linhas:
        erro("planilha vazia.")
    cabecalho = [(c or "").strip() for c in linhas[0]]
    if cabecalho != CABECALHO:
        erro(f"cabeçalho diferente do esperado.\n  esperado: {CABECALHO}\n  lido:     {cabecalho}")
    registros = []
    vistos = set()
    desconhecidas = collections.Counter()
    for n, bruta in enumerate(linhas[1:], start=2):
        linha = list(bruta) + [None] * (len(CABECALHO) - len(bruta))
        if not any(linha):
            continue
        tipo_bruto = (linha[0] or "").strip()
        if tipo_bruto not in TIPOS:
            erro(f"linha {n}: tipo de precedente desconhecido: {tipo_bruto!r}")
        try:
            numero_f = float(linha[1])
        except (TypeError, ValueError):
            erro(f"linha {n}: número inválido: {linha[1]!r}")
        if numero_f != int(numero_f) or numero_f < 1:
            erro(f"linha {n}: número não inteiro: {linha[1]!r}")
        tipo, numero = TIPOS[tipo_bruto], int(numero_f)
        chave = (tipo, numero)
        if chave in vistos:
            erro(f"linha {n}: registro duplicado: {tipo} {numero}")
        vistos.add(chave)
        situacao_original = literal(linha[9])
        situacao = SITUACOES.get(situacao_original.lower())
        if situacao is None:
            desconhecidas[situacao_original] += 1
            situacao = "outro"
        tese = literal(linha[7])
        data = literal(linha[10])[:10]
        if data and not re.fullmatch(r"\d{4}-\d{2}-\d{2}", data):
            erro(f"linha {n}: data da situação em formato inesperado: {linha[10]!r}")
        registro = {
            "id": f"STJ:{tipo}:{numero}",
            "tipo": tipo,
            "numero": numero,
            "situacao": situacao,
            "situacao_original": situacao_original,
            "data_situacao": data,
            "orgao_julgador": literal(linha[3]),
            "primeiro_relator": literal(linha[4]),
            "relator_atual": literal(linha[5]),
            "questao": literal(linha[2]),
            "tese": tese,
            "sha256_tese": hashlib.sha256(tese.encode("utf-8")).hexdigest() if tese else "",
            "anotacoes": literal(linha[6]),
            "paradigmas": lista(linha[8]),
            "suspensao": literal(linha[11]),
            "numeros_unicos": lista(linha[12]),
            "registros": lista(linha[13]),
        }
        registro["alertas"] = alertas_de(registro)
        registros.append(registro)
    ordem = {t: i for i, t in enumerate(["TEMA", "IAC", "RELEVANCIA", "SIRDR", "CONTROVERSIA"])}
    registros.sort(key=lambda r: (ordem[r["tipo"]], r["numero"]))
    return registros, desconhecidas


def cobertura(registros):
    saida = {}
    for r in registros:
        c = saida.setdefault(r["tipo"], {"de": r["numero"], "ate": r["numero"], "total": 0, "com_tese": 0, "situacao": {}})
        c["de"] = min(c["de"], r["numero"])
        c["ate"] = max(c["ate"], r["numero"])
        c["total"] += 1
        c["com_tese"] += 1 if r["tese"] else 0
        c["situacao"][r["situacao"]] = c["situacao"].get(r["situacao"], 0) + 1
    return saida


def diferencas(anterior, registros):
    antes = {r["id"]: r for r in anterior.get("precedentes", [])}
    agora = {r["id"]: r for r in registros}
    linhas = []
    novos = [i for i in agora if i not in antes]
    sumidos = [i for i in antes if i not in agora]
    situacao = [(i, antes[i]["situacao_original"], agora[i]["situacao_original"]) for i in agora if i in antes and antes[i]["situacao_original"] != agora[i]["situacao_original"]]
    tese = [i for i in agora if i in antes and antes[i]["tese"] != agora[i]["tese"]]
    linhas.append(f"- Registros novos: {len(novos)}" + (": " + ", ".join(novos[:60]) + (" …" if len(novos) > 60 else "") if novos else ""))
    linhas.append(f"- Registros que saíram da planilha: {len(sumidos)}" + (": " + ", ".join(sumidos[:60]) if sumidos else ""))
    linhas.append(f"- Mudança de situação: {len(situacao)}")
    linhas += [f"  - {i}: {a} → {b}" for i, a, b in situacao]
    linhas.append(f"- Tese alterada: {len(tese)}" + (": " + ", ".join(tese) if tese else ""))
    return linhas


def main():
    ap = argparse.ArgumentParser(description=__doc__.split("\n")[0])
    ap.add_argument("planilha")
    ap.add_argument("--data-fonte", required=True, help="data em que a planilha foi exportada do site do STJ (AAAA-MM-DD)")
    ap.add_argument("--saida", default=str(pathlib.Path(__file__).resolve().parent.parent / "dados" / "precedentes-stj.json"))
    args = ap.parse_args()
    if not re.fullmatch(r"\d{4}-\d{2}-\d{2}", args.data_fonte):
        erro("--data-fonte deve estar no formato AAAA-MM-DD.")
    planilha = pathlib.Path(args.planilha)
    saida = pathlib.Path(args.saida)

    registros, desconhecidas = montar(ler_planilha(planilha))
    cob = cobertura(registros)
    base = {
        "versao_base": args.data_fonte.replace("-", "."),
        "gerado_em": datetime.datetime.now().astimezone().isoformat(timespec="seconds"),
        "aviso": "Base gerada por script a partir da planilha oficial de precedentes qualificados do STJ. Não edite à mão: regenere com scripts/exportar-base-precedentes-stj.py.",
        "fonte": {
            "orgao": "Superior Tribunal de Justiça — Precedentes Qualificados",
            "url": "https://processo.stj.jus.br/repetitivos/temas_repetitivos/",
            "data_fonte": args.data_fonte,
            "arquivo": planilha.name,
            "sha256_arquivo": hashlib.sha256(planilha.read_bytes()).hexdigest(),
        },
        "cobertura": cob,
    }

    anterior = json.loads(saida.read_text(encoding="utf-8")) if saida.exists() else None

    # um registro por linha: o diff do git mostra exatamente o que mudou
    cab = json.dumps(base, ensure_ascii=False, indent=1)
    corpo = ",\n".join("  " + json.dumps(r, ensure_ascii=False, separators=(",", ":")) for r in registros)
    saida.parent.mkdir(parents=True, exist_ok=True)
    saida.write_text(cab[:-2] + ',\n "precedentes": [\n' + corpo + "\n ]\n}\n", encoding="utf-8")
    json.loads(saida.read_text(encoding="utf-8"))  # confere que o arquivo gravado é JSON válido

    nomes = {"TEMA": "Temas repetitivos", "IAC": "IAC", "RELEVANCIA": "Relevância", "SIRDR": "SIRDR", "CONTROVERSIA": "Controvérsias"}
    rel = [f"# Ingestão dos precedentes qualificados do STJ — fonte de {args.data_fonte}", "",
           f"- Planilha: `{planilha.name}` (sha256 `{base['fonte']['sha256_arquivo']}`)",
           f"- Registros: {len(registros)}; com tese: {sum(1 for r in registros if r['tese'])}; transitados em julgado: {sum(1 for r in registros if r['situacao'] == 'transitado')}", "",
           "## Cobertura", ""]
    for tipo, c in cob.items():
        sit = "; ".join(f"{k} {v}" for k, v in sorted(c["situacao"].items()))
        rel.append(f"- {nomes[tipo]}: {c['de']} a {c['ate']}, {c['total']} registros, {c['com_tese']} com tese ({sit})")
    rel += ["", "## Situações do STJ e classe atribuída", ""]
    pares = collections.Counter((r["situacao_original"], r["situacao"]) for r in registros)
    rel += [f"- {o or '(vazia)'} → {s}: {n}" for (o, s), n in sorted(pares.items(), key=lambda x: (x[0][1], -x[1]))]
    if desconhecidas:
        rel += ["", "## ATENÇÃO — situações não mapeadas (classificadas como \"outro\")", ""]
        rel += [f"- {s!r}: {n}" for s, n in desconhecidas.items()]
    rel += ["", "## Alertas derivados", ""]
    cont = collections.Counter(a["codigo"] for r in registros for a in r["alertas"])
    cont_t = collections.Counter(a["codigo"] for r in registros if r["situacao"] == "transitado" for a in r["alertas"])
    rel += [f"- {k}: {v} (entre os transitados: {cont_t.get(k, 0)})" for k, v in cont.most_common()]
    sem = [r["id"] for r in registros if any(a["codigo"] == "SEM_TESE_NA_FONTE" for a in r["alertas"])]
    rel += ["", f"Sem tese na fonte: {', '.join(sem) or 'nenhum'}"]
    if anterior:
        rel += ["", f"## Diferenças contra a base anterior ({anterior.get('versao_base', '?')})", ""] + diferencas(anterior, registros)
    relatorio = saida.with_suffix(".relatorio.md")
    relatorio.write_text("\n".join(rel) + "\n", encoding="utf-8")

    print(f"{len(registros)} registros gravados em {saida} ({saida.stat().st_size / 1e6:.2f} MB)")
    print(f"Relatório: {relatorio}")
    if desconhecidas:
        print(f"ATENÇÃO: {sum(desconhecidas.values())} registro(s) com situação não mapeada; veja o relatório.")


if __name__ == "__main__":
    main()
