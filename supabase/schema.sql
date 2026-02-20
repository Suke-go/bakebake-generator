-- BAKEBAKE_XR: Surveys Table Schema for Supabase

-- Create the surveys table
CREATE TABLE public.surveys (
    id uuid NOT NULL DEFAULT gen_random_uuid(),
    created_at timestamp with time zone NOT NULL DEFAULT now(),
    
    -- Pre-Survey (Entrance)
    visitor_type text NULL,
    pre_origin text NULL,
    pre_familiarity integer NULL,
    pre_image text NULL,
    
    -- Post-Survey (Exit)
    post_completed boolean NOT NULL DEFAULT false,
    post_completed_at timestamp with time zone NULL,
    post_theme text NULL,
    post_impression text NULL,
    post_selections text[] NULL,
    post_action integer NULL,
    
    -- Print & Generation Data
    print_triggered boolean NOT NULL DEFAULT false,
    printed boolean NOT NULL DEFAULT false,
    yokai_name text NULL,
    yokai_desc text NULL,
    yokai_image_b64 text NULL,
    
    CONSTRAINT surveys_pkey PRIMARY KEY (id)
);

-- Row Level Security (RLS)
ALTER TABLE public.surveys ENABLE ROW LEVEL SECURITY;

-- Allow anonymous inserts (for the pre-survey)
CREATE POLICY "Enable insert for anonymous users" ON public.surveys
    FOR INSERT WITH CHECK (true);

-- Allow anonymous updates (for the post-survey and print trigger)
-- In a stricter environment, you might restrict updates using a token or ensuring they only update their own row.
-- For an exhibition, this open update is generally acceptable given the opaque UUIDs.
CREATE POLICY "Enable update for anonymous users" ON public.surveys
    FOR UPDATE USING (true) WITH CHECK (true);

-- Allow anonymous selects (so the print server and exit survey can read the data via the API key)
CREATE POLICY "Enable select for anonymous users" ON public.surveys
    FOR SELECT USING (true);

-- Enable Realtime for the surveys table (required for the print daemon)
-- Note: You may also need to enable Realtime for this table in the Supabase Dashboard UI (Database -> Publications -> supabase_realtime)
ALTER PUBLICATION supabase_realtime ADD TABLE public.surveys;
