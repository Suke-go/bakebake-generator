import os
import time
import base64
import json
from io import BytesIO
from PIL import Image
from dotenv import load_dotenv
from supabase import create_client, Client
from escpos.printer import Dummy # Dummy printer for development. Replace with Usb for production.

# Optional: User might use Usb(vendor_id, product_id) in production.
# from escpos.printer import Usb

load_dotenv()

# 1. Environment Configuration
SUPABASE_URL = os.environ.get("SUPABASE_URL")
SUPABASE_KEY = os.environ.get("SUPABASE_KEY")

if not SUPABASE_URL or not SUPABASE_KEY:
    print("Error: SUPABASE_URL and SUPABASE_KEY must be set in .env")
    exit(1)

supabase: Client = create_client(SUPABASE_URL, SUPABASE_KEY)

# 2. Printer Initialization
# Using Dummy printer for now so development doesn't crash without the physical printer.
print("Initializing dummy printer. Replace with `Usb(0x04b8, 0x0202)` in production.")
p = Dummy()

# 3. Print Function
def print_yokai(record):
    name = record.get('yokai_name', '名無しの妖')
    description = record.get('yokai_desc', '')
    image_b64 = record.get('yokai_image_b64')
    
    p.set(align='center')
    p.text("====================\n")
    p.text("【 観測記録 】\n\n")
    
    if image_b64:
        try:
            # Decode the base64 string
            if "," in image_b64:
                image_b64 = image_b64.split(",")[1]
            img_data = base64.b64decode(image_b64)
            img = Image.open(BytesIO(img_data))
            # Optional: Resize/Process image for thermal printer if needed
            # img = img.resize((512, 512))
            p.image(img)
        except Exception as img_err:
            print(f"Error printing image: {img_err}")

    p.text(f"\n名称: {name}\n\n")
    p.set(align='left')
    p.text(f"{description}\n")
    p.text("\n====================\n")
    p.text("時間が経てば、この記憶も消えます。\n\n\n\n")
    p.cut()
    
    # In Dummy mode, we can just print the output representation
    print(f"--- Printer Output for ID: {record.get('id')} ---")
    
    # Update Supabase flag to prevent double printing
    try:
        supabase.table('surveys').update({'printed': True}).eq('id', record['id']).execute()
        print(f"Successfully marked record {record.get('id')} as printed.")
    except Exception as update_err:
        print(f"Failed to update printed flag for DB: {update_err}")

# 4. Job Processor
def process_job(record):
    if record.get('print_triggered') and not record.get('printed'):
        print(f"Printing job received for ID: {record.get('id')}")
        try:
            print_yokai(record)
        except Exception as e:
            print(f"Printer Error: {e}")

# 5. Realtime Subscription Handler
def handle_db_change(response):
    payload = response.get('record', {})
    if payload:
        process_job(payload)

def start_realtime_subscription():
    try:
        channel = supabase.channel('surveys-changes')
        channel.on('postgres_changes', event='UPDATE', schema='public', table='surveys', callback=handle_db_change)
        channel.subscribe()
        print("Connected to Supabase Realtime channel.")
    except Exception as e:
        print(f"Failed to subscribe to Realtime: {e}")

if __name__ == "__main__":
    print("Starting Print Daemon...")
    start_realtime_subscription()
    
    # 6. Fallback Polling Loop
    print("Daemon is running and polling for pending jobs...")
    while True:
        try:
            time.sleep(10) # Poll every 10 seconds
            response = supabase.table('surveys').select('*').eq('print_triggered', True).eq('printed', False).execute()
            if response.data:
                for record in response.data:
                    process_job(record)
        except Exception as e:
            print(f"Polling error: {e}")
            # If the token expires or connection drops, you might need to re-init supabase here
