def lum(hexstr):
    hexstr = hexstr.lstrip("#")
    r, g, b = [int(hexstr[i:i+2], 16) / 255 for i in (0, 2, 4)]
    def f(c):
        return c / 12.92 if c <= 0.03928 else ((c + 0.055) / 1.055) ** 2.4
    r, g, b = f(r), f(g), f(b)
    return 0.2126*r + 0.7152*g + 0.0722*b

def contrast(h1, h2):
    l1, l2 = lum(h1), lum(h2)
    hi, lo = max(l1, l2), min(l1, l2)
    return (hi + 0.05) / (lo + 0.05)

pairs = [
    ("#f9fafb", "#111827", "fg/bg"),
    ("#9ca3af", "#1f2937", "muted/surface"),
    ("#f9fafb", "#1f2937", "fg/surface"),
    ("#3b82f6", "#111827", "primary/bg (secondary btn text)"),
    ("#ffffff", "#3b82f6", "primary-fg/primary (primary btn text)"),
]
for a, b, label in pairs:
    print(label, contrast(a, b))
