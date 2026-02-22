"""
BAKEBAKE_XR Manual Receipt Generator
=====================================
妖怪画像の生成がうまくいかなかったユーザー向けに、
写真ファイルと伝承テキストから手動でレシートを印刷するスクリプト。

Usage:
    python manual_receipt.py photo.jpg --name "夜泣き石" --desc "山中に佇む石の妖怪。"
    python manual_receipt.py photo.png --name "座敷わらし" --desc "古い屋敷に住む子供の妖怪。" --printer "EPSON TM-T90II Receipt5"
    python manual_receipt.py photo.jpg --name "河童" --desc "川に棲む水妖。" --no-cut

Requirements:
    pip install python-escpos pillow pywin32
"""

import sys
import argparse
from pathlib import Path

from PIL import Image

# ──────────────────────────────────────────────
# Configuration (same as print_daemon.py)
# ──────────────────────────────────────────────
DEFAULT_PRINTER = "EPSON TM-T90II Receipt"
PRINTER_PROFILE = "TM-L90"
PRINT_WIDTH_PX = 576  # 80mm paper at 180dpi


# ──────────────────────────────────────────────
# Printer
# ──────────────────────────────────────────────
def open_printer(printer_name):
    """Create a fresh printer connection."""
    try:
        from escpos.printer import Win32Raw
        return Win32Raw(printer_name, profile=PRINTER_PROFILE)
    except ImportError:
        print("[ERROR] python-escpos が見つかりません。")
        print("  pip install python-escpos pywin32")
        sys.exit(1)
    except Exception as e:
        print(f"[ERROR] プリンタ '{printer_name}' に接続できません: {e}")
        try:
            import win32print
            names = [p[2] for p in win32print.EnumPrinters(
                win32print.PRINTER_ENUM_LOCAL | win32print.PRINTER_ENUM_CONNECTIONS)]
            print("\n利用可能なプリンタ:")
            for n in names:
                print(f"  - {n}")
        except Exception:
            pass
        sys.exit(1)


# ──────────────────────────────────────────────
# Image Processing
# ──────────────────────────────────────────────
def prepare_image(img):
    """Resize to print width and convert to 1-bit for thermal output."""
    ratio = PRINT_WIDTH_PX / img.width
    new_h = int(img.height * ratio)
    img = img.resize((PRINT_WIDTH_PX, new_h), Image.LANCZOS)
    img = img.convert("L").convert("1")
    return img


# ──────────────────────────────────────────────
# Text Output
# ──────────────────────────────────────────────
def _raw_text(p, text):
    """Encode text as CP932 (Shift_JIS) and send to printer."""
    p._raw(text.encode("cp932", errors="replace"))


# ──────────────────────────────────────────────
# Print Receipt
# ──────────────────────────────────────────────
def print_receipt(printer_name, image_path, name, desc, do_cut=True):
    """
    Print a receipt with the given photo, yokai name, and description.
    Uses the same layout as print_daemon.py.
    """
    # Load image
    print(f"[IMAGE] 読み込み中: {image_path}")
    try:
        img = Image.open(image_path)
        img = prepare_image(img)
        print(f"[IMAGE] リサイズ完了: {PRINT_WIDTH_PX}x{img.height}px (1-bit)")
    except Exception as e:
        print(f"[ERROR] 画像の読み込みに失敗: {e}")
        sys.exit(1)

    # Connect to printer
    print(f"[PRINTER] 接続中: {printer_name}")
    p = open_printer(printer_name)

    try:
        # ESC @ — Initialize printer
        p._raw(b"\x1b\x40")
        # FS & — Select Kanji character mode
        p._raw(b"\x1c\x26")
        # FS C 1 — Shift_JIS code system
        p._raw(b"\x1c\x43\x01")

        # Header: center, bold, double size
        p._raw(b"\x1b\x61\x01")  # center
        p._raw(b"\x1b\x45\x01")  # bold ON
        p._raw(b"\x1d\x21\x11")  # double width+height
        _raw_text(p, "BAKEBAKE_XR\n")

        # Normal size
        p._raw(b"\x1d\x21\x00")
        p._raw(b"\x1b\x45\x00")  # bold OFF
        _raw_text(p, "━━━━━━━━━━━━━━━━━━\n")
        _raw_text(p, "【 観測記録 】\n\n")

        # Image
        p.image(img)
        _raw_text(p, "\n")
        # Re-enable Kanji mode after image
        p._raw(b"\x1c\x26")
        p._raw(b"\x1c\x43\x01")

        # Name: center, bold, double size
        p._raw(b"\x1b\x61\x01")
        p._raw(b"\x1b\x45\x01")
        p._raw(b"\x1d\x21\x11")
        _raw_text(p, f"{name}\n")
        p._raw(b"\x1d\x21\x00")
        p._raw(b"\x1b\x45\x00")
        _raw_text(p, "\n")

        # Description: left align
        if desc:
            p._raw(b"\x1b\x61\x00")  # left align
            _raw_text(p, f"{desc}\n\n")

        # Footer: center
        p._raw(b"\x1b\x61\x01")
        _raw_text(p, "━━━━━━━━━━━━━━━━━━\n")
        _raw_text(p, "この記録は感熱紙に印刷されています。\n")
        _raw_text(p, "時間が経てば、この記憶も消えます。\n\n\n\n")

        # Cut
        if do_cut:
            p._raw(b"\x1d\x56\x00")

        p.close()
        print("[DONE] 印刷完了！")

    except Exception as e:
        print(f"[ERROR] 印刷中にエラーが発生: {e}")
        try:
            p.close()
        except Exception:
            pass
        sys.exit(1)


# ──────────────────────────────────────────────
# Lore File Reader
# ──────────────────────────────────────────────
def read_lore(lore_path):
    """Read lore.txt: line 1 = name, line 2+ = description."""
    text = Path(lore_path).read_text(encoding="utf-8").strip()
    lines = text.splitlines()
    name = lines[0].strip() if lines else "名無しの妖"
    desc = "\n".join(l.strip() for l in lines[1:]).strip() if len(lines) > 1 else ""
    return name, desc


def find_image_in_dir(dir_path):
    """Find the first image file in a directory."""
    exts = (".jpg", ".jpeg", ".png", ".bmp", ".gif", ".webp")
    for f in sorted(Path(dir_path).iterdir()):
        if f.suffix.lower() in exts:
            return f
    return None


# ──────────────────────────────────────────────
# Main
# ──────────────────────────────────────────────
def main():
    parser = argparse.ArgumentParser(
        description="BAKEBAKE_XR 手動レシート生成 - 写真と伝承からレシートを印刷",
        formatter_class=argparse.RawDescriptionHelpFormatter,
        epilog="""
例:
  # 写真 + 名前 + 伝承を直接指定
  python manual_receipt.py photo.jpg --name "夜泣き石" --desc "山中に佇む石の妖怪。"

  # lore.txt から名前と伝承を読み取り
  python manual_receipt.py photo.jpg --lore lore.txt

  # ディレクトリを指定 (photo.* + lore.txt を自動検出)
  python manual_receipt.py --dir manual-data/001
""",
    )
    parser.add_argument("image", type=str, nargs="?", help="写真ファイルのパス (JPEG/PNG)")
    parser.add_argument("--dir", type=str, help="データディレクトリ (photo.* + lore.txt を自動検出)")
    parser.add_argument("--lore", type=str, help="lore.txt パス (1行目=名前, 2行目以降=伝承)")
    parser.add_argument("--name", type=str, help="妖怪の名前")
    parser.add_argument("--desc", type=str, default="", help="伝承テキスト（妖怪の説明）")
    parser.add_argument("--printer", type=str, default=DEFAULT_PRINTER, help=f"プリンタ名 (デフォルト: {DEFAULT_PRINTER})")
    parser.add_argument("--no-cut", action="store_true", help="用紙カットをスキップ（テスト用）")

    args = parser.parse_args()

    # --dir mode: auto-detect image and lore.txt
    if args.dir:
        dir_path = Path(args.dir)
        if not dir_path.is_dir():
            print(f"[ERROR] ディレクトリが見つかりません: {dir_path}")
            sys.exit(1)

        img = find_image_in_dir(dir_path)
        if not img:
            print(f"[ERROR] 画像ファイルが見つかりません: {dir_path}")
            sys.exit(1)
        image_path = img

        lore_file = dir_path / "lore.txt"
        if lore_file.exists():
            name, desc = read_lore(lore_file)
        elif args.name:
            name, desc = args.name, args.desc
        else:
            print(f"[ERROR] lore.txt がなく、--name も指定されていません")
            sys.exit(1)
    else:
        # Manual mode
        if not args.image:
            print("[ERROR] 画像パスか --dir を指定してください")
            parser.print_usage()
            sys.exit(1)

        image_path = Path(args.image)
        if not image_path.exists():
            print(f"[ERROR] ファイルが見つかりません: {image_path}")
            sys.exit(1)

        # Read from --lore or --name/--desc
        if args.lore:
            lore_path = Path(args.lore)
            if not lore_path.exists():
                print(f"[ERROR] lore.txt が見つかりません: {lore_path}")
                sys.exit(1)
            name, desc = read_lore(lore_path)
        elif args.name:
            name, desc = args.name, args.desc
        else:
            print("[ERROR] --name か --lore を指定してください")
            sys.exit(1)

    if not image_path.suffix.lower() in (".jpg", ".jpeg", ".png", ".bmp", ".gif", ".webp"):
        print(f"[WARNING] 非対応の拡張子かもしれません: {image_path.suffix}")

    print("=" * 40)
    print("BAKEBAKE_XR 手動レシート生成")
    print(f"  画像    : {image_path}")
    print(f"  妖怪名  : {name}")
    print(f"  伝承    : {desc[:40]}{'...' if len(desc) > 40 else ''}")
    print(f"  プリンタ : {args.printer}")
    print(f"  カット   : {'OFF' if args.no_cut else 'ON'}")
    print("=" * 40)

    print_receipt(args.printer, image_path, name, desc, do_cut=not args.no_cut)


if __name__ == "__main__":
    main()
