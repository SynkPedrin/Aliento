# Ajuda a montar tabelas i18n: lê um arquivo de traduções (blocos separados por linha "===",
# cada bloco = 6 linhas: es, en, fr, de, pt-BR, pt-PT; "\n" literal vira quebra de linha) e grava JSON.
import json, sys
src, out = sys.argv[1], sys.argv[2]
rows = []
for block in open(src, encoding='utf-8').read().split('\n===\n'):
    lines = [l for l in block.strip('\n').split('\n')]
    if not lines or lines == ['']: continue
    assert len(lines) == 6, (len(lines), lines[0][:60])
    rows.append([l.replace('\\n', '\n') for l in lines])
json.dump(rows, open(out, 'w', encoding='utf-8'), ensure_ascii=False, indent=0)
print(len(rows), 'linhas →', out)
