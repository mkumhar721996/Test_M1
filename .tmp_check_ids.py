import re
html = open('.arc/designs/TEST-M1-STORY-136-design.html').read()
ids_defined = re.findall(r'id="([^"]+)"', html)
dupes = [i for i in set(ids_defined) if ids_defined.count(i) > 1]
print("Duplicate IDs:", dupes)
refs = re.findall(r"getElementById\(['\"]([^'\"]+)['\"]\)", html)
missing = [r for r in set(refs) if r not in ids_defined]
print("Missing direct refs:", missing)
dynamic_refs = re.findall(r"getElementById\(`([^`]*)`\)", html)
print("Dynamic ref patterns:", sorted(set(dynamic_refs)))

# count open/close div tags roughly
opens = len(re.findall(r'<div\b', html))
closes = len(re.findall(r'</div>', html))
print("div opens:", opens, "div closes:", closes)
