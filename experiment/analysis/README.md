BAKEBAKE_XR Python Analysis Scripts
===================================

This directory contains the pipeline for analyzing exhibition data for the SIGGRAPH 2026 Art Paper submission.

## Setup Requirements

```bash
pip install pandas numpy matplotlib seaborn supabase
```

## Scripts

### 1. `01_extract_data.py`
Connects to Supabase and downloads the raw survey data.
- **Requires Environment Variables**: `SUPABASE_URL` and `SUPABASE_KEY` (use the `service_role` key or `anon` key if RLS allows reading).
- **Output**: `../data/surveys_raw.csv` and `../data/surveys_valid.csv` (filtered by `post_completed == True`).

### 2. `02_analyze_data.py`
Reads the `surveys_valid.csv` and performs standard descriptive statistics and plotting.
- Generates `post_theme_distribution.png` (Useful for the paper's quantitative evaluation).
- Extracts `qualitative_pairs.csv` mapping `pre_image` directly to `post_impression` for easy input into an LLM for Braun & Clarke Reflexive Thematic Analysis.
- Prints a ready-to-use LLM prompt mapping qualitative responses to our SIGGRAPH Research Questions (C1-C4 coding framework).
