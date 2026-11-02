#!/usr/bin/env python3
"""Construit public/app.html (version en ligne) à partir de l'application assemblée.
Usage : python3 tools/build_app.py [chemin/vers/carnet-memb.html]"""
import sys, re, pathlib
ROOT = pathlib.Path(__file__).resolve().parent.parent
src = pathlib.Path(sys.argv[1] if len(sys.argv) > 1 else '/home/claude/carnet-memb.html').read_text(encoding='utf-8')
online = (ROOT / 'app-src' / 'online.js').read_text(encoding='utf-8') + '\n' + (ROOT / 'app-src' / 'v14.js').read_text(encoding='utf-8') + '\n' + (ROOT / 'app-src' / 'v15.js').read_text(encoding='utf-8') + '\n' + (ROOT / 'app-src' / 'v16.js').read_text(encoding='utf-8')

anchor = '(async function boot(){'
assert src.count(anchor) == 1, 'point d’insertion introuvable'
src = src.replace(anchor, online + '\n' + anchor, 1)
# le méta « claude » ne sert plus ; les icônes pointent vers les fichiers du serveur
src = src.replace('<meta name="claude:viewport-fit-sides" content="cover">\n', '')
head = ('<!DOCTYPE html>\n<html lang="fr">\n<head>\n<meta charset="utf-8">\n'
        '<meta name="viewport" content="width=device-width,initial-scale=1,viewport-fit=cover">\n'
        '<meta name="apple-mobile-web-app-capable" content="yes">\n<meta name="mobile-web-app-capable" content="yes">\n'
        '<meta name="apple-mobile-web-app-status-bar-style" content="default">\n'
        '<link rel="manifest" href="/manifest.webmanifest">\n'
        '<script src="/static/shim.js"></script>\n')
# on sépare l'en-tête (title, meta, link, style) du corps
m = re.search(r'</style>\s*', src)
head_part, body_part = src[:m.end()], src[m.end():]
out = head + head_part + '\n</head>\n<body>\n' + body_part + '\n</body>\n</html>\n'
(ROOT / 'public' / 'app.html').write_text(out, encoding='utf-8')
print('public/app.html', len(out), 'octets')
