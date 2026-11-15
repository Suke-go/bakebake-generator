-- Records from /hyakki/exp: one anonymous row per finished study play.
-- Written only by the server (service role); row level security is on and no policy is given, so nobody else can read or write.
create table if not exists hyakki_exp_responses (
    id uuid primary key default gen_random_uuid(),
    created_at timestamptz not null default now(),
    version text not null,
    payload jsonb not null
);
alter table hyakki_exp_responses enable row level security;
