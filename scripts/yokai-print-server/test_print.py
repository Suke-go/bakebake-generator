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


def test_print(printer_name):
    """Send a test receipt to the printer."""
    from escpos.printer import Win32Raw

    print(f"\nConnecting to: {printer_name}")
    p = Win32Raw(printer_name)

    print("Sending test print...")
    p.set(align="center", text_type="B", width=2, height=2)
    p.text("BAKEBAKE_XR\n")
    p.set(align="center", text_type="NORMAL", width=1, height=1)
    p.text("━━━━━━━━━━━━━━━━━━\n")
    p.text("Printer Test OK\n")
    p.text("TM-T90II via APD\n")
    p.text("━━━━━━━━━━━━━━━━━━\n\n")

    # Test Japanese text
    p.text("日本語テスト: 妖怪観測記録\n")
    p.text("感熱紙に印刷されています。\n\n\n")
    p.cut()

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
