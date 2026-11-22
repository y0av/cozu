# Flags visible text the design kit's guard (system.js) would outline as a placeholder: "[...]" in one text node.
import re, sys, pathlib
from html.parser import HTMLParser
RX = re.compile(r'\[[^\]\n]{1,60}\]|\((?:sample|placeholder|example)[^)]{0,30}\)|\bplaceholder\b', re.I)
class P(HTMLParser):
    def __init__(s): super().__init__(); s.skip = 0; s.hits = []
    def handle_starttag(s, t, a):
        if t in ('script', 'style', 'template', 'noscript'): s.skip += 1
    def handle_endtag(s, t):
        if t in ('script', 'style', 'template', 'noscript'): s.skip -= 1
    def handle_data(s, d):
        if not s.skip and RX.search(d): s.hits.append(d.strip()[:90])
bad = 0
for f in sorted(pathlib.Path(sys.argv[1]).rglob('*.html')):
    p = P(); p.feed(f.read_text())
    for h in p.hits: print(f'{f}: {h}'); bad += 1
sys.exit(1 if bad else 0)
