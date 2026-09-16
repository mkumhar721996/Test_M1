import json

d = json.load(open("tokens.json"))
print("tokens:", len(d))


def lum(hexstr):
    hexstr = hexstr.lstrip("#")
    r, g, b = [int(hexstr[i:i + 2], 16) / 255 for i in (0, 2, 4)]

    def f(c):
        return c / 12.92 if c <= 0.03928 else ((c + 0.055) / 1.055) ** 2.4

    r, g, b = f(r), f(g), f(b)
    return 0.2126 * r + 0.7152 * g + 0.0722 * b


def contrast(hex1, hex2):
    l1, l2 = lum(hex1), lum(hex2)
    hi, lo = max(l1, l2), min(l1, l2)
    return (hi + 0.05) / (lo + 0.05)


fg = d["color-fg"]["$value"]["hex"]
bg = d["color-bg"]["$value"]["hex"]
print("fg/bg contrast:", contrast(fg, bg))

pf = d["color-primary"]["$value"]["hex"]
pfg = d["color-primary-fg"]["$value"]["hex"]
print("primary/primary-fg contrast:", contrast(pf, pfg))
