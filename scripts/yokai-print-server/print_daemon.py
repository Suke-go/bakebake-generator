"""
BAKEBAKE_XR Print Daemon (Dual-Mode)
=====================================
Supports two operational modes:

  Mode A (Online):  iPad → Vercel → Supabase → this daemon polls/subscribes → prints
  Mode B (Offline): iPad → local Next.js dev server → POST to this daemon's HTTP API → prints

Usage:
    # Online mode (Supabase polling, default)
    python print_daemon.py

    # Offline mode (local HTTP server on port 5555)
    python print_daemon.py --offline

    # Both modes simultaneously
    python print_daemon.py --both

    # Override printer name
    python print_daemon.py --printer "EPSON TM-T90II Receipt"

Requirements:
    pip install python-escpos pillow python-dotenv supabase pywin32 flask flask-cors
"""

import os
import sys
import json
import time
import base64
import argparse
import threading
from io import BytesIO
from pathlib import Path

from PIL import Image
from dotenv import load_dotenv

load_dotenv()

# ──────────────────────────────────────────────
# Configuration
# ──────────────────────────────────────────────
SUPABASE_URL = os.environ.get("SUPABASE_URL")
SUPABASE_KEY = os.environ.get("SUPABASE_KEY")
PRINTER_NAME = os.environ.get("PRINTER_NAME", "EPSON TM-T90II Receipt")
PRINT_WIDTH_PX = 576        # 80mm paper at 180dpi
POLL_INTERVAL = 10           # seconds
LOCAL_PORT = 5555            # HTTP API port for offline mode


# ──────────────────────────────────────────────
# Printer Initialization
# ──────────────────────────────────────────────
def init_printer():
    """
    Try Win32Raw (APD on Windows) first.
    Fall back to Dummy for testing on macOS/Linux.
    """
    try:
        from escpos.printer import Win32Raw
        printer = Win32Raw(PRINTER_NAME)
        print(f"[PRINTER] Connected: {PRINTER_NAME} (Win32Raw via APD)")
        return printer
    except ImportError:
        print("[PRINTER] Win32Raw not available. Using Dummy printer.")
        from escpos.printer import Dummy
        return Dummy()
    except Exception as e:
        print(f"[PRINTER] Could not open '{PRINTER_NAME}': {e}")
        try:
            import win32print
            names = [p[2] for p in win32print.EnumPrinters(
                win32print.PRINTER_ENUM_LOCAL | win32print.PRINTER_ENUM_CONNECTIONS)]
            print("[PRINTER] Available printers:")
            for n in names:
                print(f"  - {n}")
        except Exception:
            pass
        print("[PRINTER] Falling back to Dummy printer.")
        from escpos.printer import Dummy
        return Dummy()


printer = init_printer()
# Thread lock so two modes don't print at the same time.
print_lock = threading.Lock()

# ──────────────────────────────────────────────
# Persistent Print Queue
# ──────────────────────────────────────────────
QUEUE_FILE = Path(__file__).parent / "print_queue.json"
MAX_PRINT_RETRIES = 3
_recent_jobs: list = []  # last N completed job IDs for /status

def _load_queue() -> list:
    """Load pending print queue from disk."""
    try:
        if QUEUE_FILE.exists():
            return json.loads(QUEUE_FILE.read_text(encoding="utf-8"))
    except Exception as e:
        print(f"[QUEUE] Error loading queue: {e}")
    return []

def _save_queue(queue: list):
    """Persist pending queue to disk."""
    try:
        QUEUE_FILE.write_text(json.dumps(queue, ensure_ascii=False), encoding="utf-8")
    except Exception as e:
        print(f"[QUEUE] Error saving queue: {e}")

def enqueue_job(data: dict):
    """Add a print job to the persistent queue."""
    queue = _load_queue()
    queue.append(data)
    _save_queue(queue)
    print(f"[QUEUE] Enqueued job (queue size: {len(queue)})")

def process_queue():
    """Process all pending jobs in the queue."""
    queue = _load_queue()
    if not queue:
        return
    print(f"[QUEUE] Processing {len(queue)} pending job(s)...")
    remaining = []
    for job in queue:
        success = print_yokai(job)
        if not success:
            retries = job.get("_retries", 0)
            if retries < MAX_PRINT_RETRIES:
                job["_retries"] = retries + 1
                remaining.append(job)
                print(f"[QUEUE] Job {job.get('id', '?')} failed, retry {retries+1}/{MAX_PRINT_RETRIES}")
            else:
                print(f"[QUEUE] Job {job.get('id', '?')} failed after {MAX_PRINT_RETRIES} retries, discarding.")
    _save_queue(remaining)

# Process any jobs left from a previous crash on startup
process_queue()


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


def decode_image(image_b64):
    """Decode a base64-encoded image string into a PIL Image."""
    if "," in image_b64:
        image_b64 = image_b64.split(",")[1]
    return Image.open(BytesIO(base64.b64decode(image_b64)))


# ──────────────────────────────────────────────
# Print Function
# ──────────────────────────────────────────────
def _raw_text(text):
    """Encode text as CP932 (Shift_JIS) and send to printer."""
    printer._raw(text.encode("cp932", errors="replace"))


def print_yokai(data):
    """
    Print a yokai receipt.
    `data` is a dict with keys: yokai_name, yokai_desc, yokai_image_b64 (optional).
    Thread-safe via print_lock.
    Uses raw ESC/POS with Kanji mode for Japanese text support.
    """
    name = data.get("yokai_name", "名無しの妖")
    desc = data.get("yokai_desc", "")
    image_b64 = data.get("yokai_image_b64")
    record_id = data.get("id", "local")

    with print_lock:
        print(f"[PRINT] Job {record_id}: {name}")
        try:
            # ESC @ — Initialize printer
            printer._raw(b"\x1b\x40")
            # FS & — Select Kanji character mode
            printer._raw(b"\x1c\x26")
            # FS C 1 — Shift_JIS code system
            printer._raw(b"\x1c\x43\x01")

            # Header: center, bold, double size
            printer._raw(b"\x1b\x61\x01")  # center
            printer._raw(b"\x1b\x45\x01")  # bold ON
            printer._raw(b"\x1d\x21\x11")  # double width+height
            _raw_text("BAKEBAKE_XR\n")

            # Normal size
            printer._raw(b"\x1d\x21\x00")
            printer._raw(b"\x1b\x45\x00")  # bold OFF
            _raw_text("━━━━━━━━━━━━━━━━━━\n")
            _raw_text("【 観測記録 】\n\n")

            # Image
            if image_b64:
                try:
                    img = decode_image(image_b64)
                    img = prepare_image(img)
                    printer.image(img)
                    _raw_text("\n")
                    # Re-enable Kanji mode after image (image command may reset)
                    printer._raw(b"\x1c\x26")
                    printer._raw(b"\x1c\x43\x01")
                except Exception as img_err:
                    print(f"[PRINT] Image error (skipping): {img_err}")

            # Name: center, bold, double size
            printer._raw(b"\x1b\x61\x01")
            printer._raw(b"\x1b\x45\x01")
            printer._raw(b"\x1d\x21\x11")
            _raw_text(f"{name}\n")
            printer._raw(b"\x1d\x21\x00")
            printer._raw(b"\x1b\x45\x00")
            _raw_text("\n")

            # Description: left align
            if desc:
                printer._raw(b"\x1b\x61\x00")  # left align
                _raw_text(f"{desc}\n\n")

            # Footer: center
            printer._raw(b"\x1b\x61\x01")
            _raw_text("━━━━━━━━━━━━━━━━━━\n")
            _raw_text("この記録は感熱紙に印刷されています。\n")
            _raw_text("時間が経てば、この記憶も消えます。\n\n\n\n")

            # Cut
            printer._raw(b"\x1d\x56\x00")

            print(f"[PRINT] Done: {record_id}")
            _recent_jobs.append({"id": record_id, "name": name, "time": time.strftime("%H:%M:%S")})
            if len(_recent_jobs) > 20:
                _recent_jobs.pop(0)
            return True

        except Exception as e:
            print(f"[PRINT] Error: {e}")
            return False


# ──────────────────────────────────────────────
# Mode A: Online (Supabase)
# ──────────────────────────────────────────────
def start_online_mode():
    """Poll Supabase for print_triggered records and print them."""
    if not SUPABASE_URL or not SUPABASE_KEY:
        print("[ONLINE] SUPABASE_URL / SUPABASE_KEY not set. Skipping online mode.")
        return

    from supabase import create_client
    supabase = create_client(SUPABASE_URL, SUPABASE_KEY)

    # Try Realtime subscription
    try:
        channel = supabase.channel("surveys-changes")
        channel.on(
            "postgres_changes",
            event="UPDATE",
            schema="public",
            table="surveys",
            callback=lambda resp: _handle_online_job(supabase, resp.get("record", {})),
        )
        channel.subscribe()
        print("[ONLINE] Realtime subscription active.")
    except Exception as e:
        print(f"[ONLINE] Realtime failed (polling only): {e}")

    # Polling loop
    print(f"[ONLINE] Polling every {POLL_INTERVAL}s...")
    while True:
        try:
            time.sleep(POLL_INTERVAL)
            resp = (
                supabase.table("surveys")
                .select("*")
                .eq("print_triggered", True)
                .eq("printed", False)
                .execute()
            )
            if resp.data:
                print(f"[ONLINE] {len(resp.data)} pending job(s).")
                for record in resp.data:
                    _handle_online_job(supabase, record)
        except KeyboardInterrupt:
            break
        except Exception as e:
            print(f"[ONLINE] Poll error: {e}")


def _handle_online_job(supabase, record):
    """Process a Supabase record and mark as printed."""
    if not record or not record.get("print_triggered") or record.get("printed"):
        return
    success = print_yokai(record)
    if success:
        try:
            supabase.table("surveys").update({"printed": True}).eq("id", record["id"]).execute()
            print(f"[ONLINE] Marked {record['id']} as printed.")
        except Exception as e:
            print(f"[ONLINE] DB update failed: {e}")


# ──────────────────────────────────────────────
# Mode B: Offline (Local HTTP API)
# ──────────────────────────────────────────────
def start_offline_mode():
    """
    Run a local Flask server that accepts print jobs via POST.
    The Next.js app (running locally) can POST to this endpoint.

    Endpoints:
        POST /print   — Send a JSON body with yokai_name, yokai_desc, yokai_image_b64
        GET  /health  — Check if the daemon is running
        GET  /status  — Get printer status info
    """
    try:
        from flask import Flask, request, jsonify
        from flask_cors import CORS
    except ImportError:
        print("[OFFLINE] Flask not installed. Run: pip install flask flask-cors")
        return

    app = Flask(__name__)
    CORS(app)  # Allow cross-origin from Next.js dev server

    @app.route("/health", methods=["GET"])
    def health():
        return jsonify({"status": "ok", "printer": PRINTER_NAME})

    @app.route("/status", methods=["GET"])
    def status():
        queue = _load_queue()
        return jsonify({
            "status": "ok",
            "printer": PRINTER_NAME,
            "mode": "offline",
            "port": LOCAL_PORT,
            "queue_length": len(queue),
            "recent_jobs": _recent_jobs[-10:],
        })

    @app.route("/print", methods=["POST"])
    def handle_print():
        data = request.get_json()
        if not data:
            return jsonify({"error": "No JSON body"}), 400

        name = data.get("yokai_name", "")
        if not name:
            return jsonify({"error": "yokai_name is required"}), 400

        print(f"[OFFLINE] Print request received: {name}")
        success = print_yokai(data)

        if success:
            return jsonify({"status": "printed", "yokai_name": name})
        else:
            # Enqueue for retry on next daemon cycle
            enqueue_job(data)
            return jsonify({"error": "Print failed, job queued for retry"}), 500

    print(f"[OFFLINE] HTTP API starting on http://0.0.0.0:{LOCAL_PORT}")
    print(f"[OFFLINE] POST http://localhost:{LOCAL_PORT}/print")
    print(f"[OFFLINE] GET  http://localhost:{LOCAL_PORT}/health")
    app.run(host="0.0.0.0", port=LOCAL_PORT, debug=False)


# ──────────────────────────────────────────────
# Main
# ──────────────────────────────────────────────
def main():
    global PRINTER_NAME, LOCAL_PORT

    parser = argparse.ArgumentParser(description="BAKEBAKE_XR Print Daemon")
    parser.add_argument("--offline", action="store_true", help="Run in offline mode (local HTTP API only)")
    parser.add_argument("--both", action="store_true", help="Run both online (Supabase) and offline (HTTP) modes")
    parser.add_argument("--printer", type=str, help="Override printer name")
    parser.add_argument("--port", type=int, default=LOCAL_PORT, help="HTTP API port for offline mode")
    args = parser.parse_args()

    if args.printer:
        PRINTER_NAME = args.printer
    LOCAL_PORT = args.port

    print("=" * 50)
    print("BAKEBAKE_XR Print Daemon")
    print(f"Printer : {PRINTER_NAME}")
    if args.offline:
        print(f"Mode    : OFFLINE (HTTP on port {LOCAL_PORT})")
    elif args.both:
        print(f"Mode    : BOTH (Supabase + HTTP on port {LOCAL_PORT})")
    else:
        print(f"Mode    : ONLINE (Supabase polling)")
    print("=" * 50)

    if args.both:
        # Run online mode in a background thread, offline in the main thread
        online_thread = threading.Thread(target=start_online_mode, daemon=True)
        online_thread.start()
        start_offline_mode()
    elif args.offline:
        start_offline_mode()
    else:
        start_online_mode()


if __name__ == "__main__":
    main()
