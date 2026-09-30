import re
content = open('.arc/designs/TEST-M1-STORY-141-design.html').read()
for tag in ['div','form','table','thead','tbody','tr','td','th','select','label','span','button','p','h1','h2','h3']:
    opens = len(re.findall(r'<' + tag + r'(\s|>)', content))
    closes = len(re.findall(r'</' + tag + r'>', content))
    print(tag, opens, closes, 'OK' if opens==closes else 'MISMATCH')
