import { randomBytes } from 'crypto';
import { NextResponse } from 'next/server';
import { RESEARCH_CONSENT_VERSION, RESEARCH_QUESTIONNAIRE_VERSION } from '@/lib/research-versions';
import { getResearchSupabase, hashResearchToken } from '@/lib/research-server';

const MAX_TEXT_LENGTH = 4_000;

function stringOrNull(value: unknown, maxLength = MAX_TEXT_LENGTH): string | null {
    return typeof value === 'string' && value.length <= maxLength ? value.trim() || null : null;
}

export async function POST(request: Request) {
    const supabase = getResearchSupabase();
    if (!supabase) return NextResponse.json({ logging: 'disabled' }, { status: 503 });

    let body: Record<string, unknown>;
    try {
        body = await request.json() as Record<string, unknown>;
    } catch {
        return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 });
    }

    const locale = body.locale === 'en' ? 'en' : body.locale === 'ja' ? 'ja' : null;
    const required = ['visitorType', 'origin', 'preImage', 'age', 'yokaiPerception'];
    if (body.consentAccepted !== true || body.consentVersion !== RESEARCH_CONSENT_VERSION || !locale || required.some(key => !stringOrNull(body[key])) || !Number.isInteger(body.familiarity)) {
        return NextResponse.json({ error: 'Invalid study entry' }, { status: 400 });
    }

    const rawToken = randomBytes(32).toString('base64url');
    const survey = {
        visitor_type: stringOrNull(body.visitorType),
        pre_origin: stringOrNull(body.origin),
        pre_familiarity: body.familiarity,
        pre_image: stringOrNull(body.preImage),
        pre_age: stringOrNull(body.age, 32),
        pre_gender: stringOrNull(body.gender, 128),
        pre_yokai_perception: stringOrNull(body.yokaiPerception, 128),
        pre_ai_experience: Number.isInteger(body.aiExperience) ? body.aiExperience : null,
        survey_declined: false,
    };

    const { data: insertedSurvey, error: surveyError } = await supabase
        .from('surveys')
        .insert(survey)
        .select('id')
        .single();
    if (surveyError || !insertedSurvey?.id) {
        console.error('research-session survey creation failed', surveyError);
        return NextResponse.json({ error: 'Could not create entry' }, { status: 500 });
    }

    const { error: sessionError } = await supabase.from('research_sessions').insert({
        survey_id: insertedSurvey.id,
        consent_version: RESEARCH_CONSENT_VERSION,
        questionnaire_version: RESEARCH_QUESTIONNAIRE_VERSION,
        initial_locale: locale,
        token_hash: hashResearchToken(rawToken),
    });
    if (sessionError) {
        console.error('research-session creation failed', sessionError);
        // The survey remains usable, but the caller must not receive a token.
        return NextResponse.json({ id: insertedSurvey.id, logging: 'disabled' }, { status: 200 });
    }

    return NextResponse.json({ id: insertedSurvey.id, token: rawToken, logging: 'enabled' });
}
