#!/usr/bin/env python3
"""i18n JSON uch tomonlama birlashtirish (git merge konflikti uchun).

  python3 scripts/i18n-merge.py packages/i18n/src/locales/uz.json [...]

Har fayl uchun `:1:` (base), `:2:` (ours), `:3:` (theirs) git index bosqichlaridan
o'qiladi; kalitlar rekursiv birlashtiriladi. Bir kalit ikkala tomonda turlicha
o'zgargan bo'lsa — xato (exit 1), qo'lda hal qilinadi. Natija 2 bo'shliqli
JSON bo'lib yoziladi va `git add` qilinadi.
"""
import json
import subprocess
import sys


def stage(path: str, n: int):
    r = subprocess.run(["git", "show", f":{n}:{path}"], capture_output=True, text=True)
    return json.loads(r.stdout) if r.returncode == 0 and r.stdout.strip() else {}


def merge(base, ours, theirs, where, conflicts):
    if isinstance(ours, dict) and isinstance(theirs, dict):
        b = base if isinstance(base, dict) else {}
        out = {}
        for k in list(ours.keys()) + [k for k in theirs.keys() if k not in ours]:
            if k in ours and k in theirs:
                out[k] = merge(b.get(k), ours[k], theirs[k], f"{where}.{k}", conflicts)
            elif k in ours:
                # theirs o'chirgan bo'lsa (base'da bor edi) — o'chirishni qabul qilamiz
                if k in b and k not in theirs and ours[k] == b[k]:
                    continue
                out[k] = ours[k]
            else:
                if k in b and k not in ours and theirs[k] == b[k]:
                    continue
                out[k] = theirs[k]
        return out
    if ours == theirs:
        return ours
    if ours == base:
        return theirs
    if theirs == base:
        return ours
    conflicts.append(where)
    return ours


def main() -> int:
    bad = 0
    for path in sys.argv[1:]:
        # Konflikt bo'lmagan (git o'zi birlashtirgan) faylga TEGMAYMIZ — aks holda
        # index bosqichlari yo'q va natija bo'sh `{}` bo'lardi (UI-2 da shunday bo'ldi).
        unmerged = subprocess.run(
            ["git", "ls-files", "-u", "--", path], capture_output=True, text=True
        ).stdout.strip()
        if not unmerged:
            print(f"{path}: konflikt yo'q — o'tkazildi")
            continue
        conflicts: list[str] = []
        res = merge(stage(path, 1), stage(path, 2), stage(path, 3), "", conflicts)
        if conflicts:
            print(f"{path}: {len(conflicts)} ta haqiqiy konflikt: {conflicts[:10]}")
            bad = 1
            continue
        with open(path, "w", encoding="utf-8") as f:
            json.dump(res, f, ensure_ascii=False, indent=2)
            f.write("\n")
        subprocess.run(["git", "add", path], check=True)
        print(f"{path}: birlashtirildi")
    return bad


if __name__ == "__main__":
    sys.exit(main())
