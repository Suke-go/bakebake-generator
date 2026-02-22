"""
BAKEBAKE_XR Printer Test
========================
Quick test to verify TM-T90II connection via EPSON APD.
Run this before starting the full print daemon.

Usage:
    python test_print.py
    python test_print.py "カスタムプリンタ名"
"""

import sys


def list_printers():
    """List all Windows printers."""
    try:
        import win32print
        flags = win32print.PRINTER_ENUM_LOCAL | win32print.PRINTER_ENUM_CONNECTIONS
        printers = win32print.EnumPrinters(flags)
        print("Available printers:")
        for i, p in enumerate(printers):
            print(f"  [{i}] {p[2]}")
        return [p[2] for p in printers]
    except ImportError:
        print("Error: pywin32 is not installed. Run: pip install pywin32")
        return []


def _raw_text(p, text):
    """Send text encoded as CP932 (Shift_JIS) for Japanese support."""
    p._raw(text.encode("cp932", errors="replace"))


def test_print(printer_name):
    """Send a test receipt to the printer using raw ESC/POS with Kanji mode."""
    from escpos.printer import Win32Raw

    print(f"\nConnecting to: {printer_name}")
    p = Win32Raw(printer_name)

    print("Sending test print...")

    # ESC @ — Initialize printer
    p._raw(b"\x1b\x40")
    # FS & — Select Kanji character mode
    p._raw(b"\x1c\x26")
    # FS C 1 — Select Kanji code system: Shift_JIS
    p._raw(b"\x1c\x43\x01")

    # Center align
    p._raw(b"\x1b\x61\x01")
    # Bold ON + double width/height
    p._raw(b"\x1b\x45\x01")
    p._raw(b"\x1d\x21\x11")
    _raw_text(p, "BAKEBAKE_XR\n")

    # Normal size, bold OFF
    p._raw(b"\x1d\x21\x00")
    p._raw(b"\x1b\x45\x00")
    _raw_text(p, "━━━━━━━━━━━━━━━━━━\n")
    _raw_text(p, "Printer Test OK\n")
    _raw_text(p, "TM-T90II via APD\n")
    _raw_text(p, "━━━━━━━━━━━━━━━━━━\n\n")

    # Test Japanese text
    _raw_text(p, "日本語テスト: 妖怪観測記録\n")
    _raw_text(p, "感熱紙に印刷されています。\n\n\n")

    # Cut
    p._raw(b"\x1d\x56\x00")

    print("Test print sent successfully!")
    print("Check the printer for output.")


if __name__ == "__main__":
    names = list_printers()

    if len(sys.argv) > 1:
        printer_name = sys.argv[1]
    else:
        # Try common APD names
        candidates = [
            "EPSON TM-T90II Receipt",
            "EPSON TM-T90II Receipt5",
            "EPSON TM-T90II",
        ]
        printer_name = None
        for c in candidates:
            if c in names:
                printer_name = c
                break

        if not printer_name and names:
            # Ask user to pick
            print("\nNo known EPSON printer found automatically.")
            print("Enter the number of the printer to test, or the full name:")
            choice = input("> ").strip()
            if choice.isdigit() and int(choice) < len(names):
                printer_name = names[int(choice)]
            else:
                printer_name = choice

    if printer_name:
        try:
            test_print(printer_name)
        except Exception as e:
            print(f"\nError: {e}")
            print("\nTroubleshooting:")
            print("  1. Is the TM-T90II powered on and connected via USB-B?")
            print("  2. Does the printer name match exactly?")
            print("  3. Is EPSON APD installed correctly?")
            print("  4. Try printing a test page from Windows Settings first.")
    else:
        print("\nNo printer selected. Exiting.")
