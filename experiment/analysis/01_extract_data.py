import os
import pandas as pd
from supabase import create_client, Client

def extract_surveys():
    """
    Supabaseのsurveysテーブルから全データを抽出し、
    分析用のCSVとして保存するスクリプト。
    """
    url = os.environ.get("SUPABASE_URL")
    key = os.environ.get("SUPABASE_KEY")
    
    if not url or not key:
        print("Error: SUPABASE_URL and SUPABASE_KEY environment variables must be set.")
        print("Example: export SUPABASE_URL='https://xxx.supabase.co' SUPABASE_KEY='ey...'")
        return

    print("Connecting to Supabase...")
    supabase: Client = create_client(url, key)
    
    # 全データを取得 (1000件制限を考慮して必要に応じてページネーションを追加してください)
    print("Fetching survey data...")
    response = supabase.table('surveys').select('*').execute()
    
    data = response.data
    if not data:
        print("No data found or error occurred.")
        return
        
    df = pd.DataFrame(data)
    print(f"Extracted {len(df)} records.")
    
    # 完了したもの (post_completed == True) だけを分析対象として分離
    df_valid = df[df['post_completed'] == True]
    print(f"Valid completed records: {len(df_valid)}")
    
    # 保存
    raw_path = 'data/surveys_raw.csv'
    valid_path = 'data/surveys_valid.csv'
    
    df.to_csv(raw_path, index=False, encoding='utf-8-sig')
    df_valid.to_csv(valid_path, index=False, encoding='utf-8-sig')
    
    print(f"Saved raw data to {raw_path}")
    print(f"Saved valid data to {valid_path}")
    print("\nNext steps: Run analysis_script.py on surveys_valid.csv")

if __name__ == "__main__":
    extract_surveys()
