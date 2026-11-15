"""Leitura de planilhas XLSX e gravação das bases de precedentes. Só biblioteca padrão."""
import json
import re
import sys
import xml.etree.ElementTree as ET
import zipfile

M = "{http://schemas.openxmlformats.org/spreadsheetml/2006/main}"
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


def gravar_base(saida, cabecalho, registros):
    """Um registro por linha: o diff do git mostra exatamente o que mudou."""
    cab = json.dumps(cabecalho, ensure_ascii=False, indent=1)
    corpo = ",\n".join("  " + json.dumps(r, ensure_ascii=False, separators=(",", ":")) for r in registros)
    saida.parent.mkdir(parents=True, exist_ok=True)
    saida.write_text(cab[:-2] + ',\n "precedentes": [\n' + corpo + "\n ]\n}\n", encoding="utf-8")
    json.loads(saida.read_text(encoding="utf-8"))  # confere que o arquivo gravado é JSON válido
