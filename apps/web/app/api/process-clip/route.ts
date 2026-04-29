import { NextRequest, NextResponse } from 'next/server';
import OpenAI from 'openai';
import { createClient } from '@supabase/supabase-js';

export const maxDuration = 300;

const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

function getSupabase() {
  return createClient(
    process.env.SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  );
}

export async function POST(req: NextRequest) {
  try {
    const { sessionId, audioUrl, stamps, duration } = await req.json();

    if (!sessionId || !audioUrl) {
      return NextResponse.json({ error: 'Missing sessionId or audioUrl' }, { status: 400 });
    }

    const supabase = getSupabase();

    // Download audio from Supabase signed URL
    const audioResponse = await fetch(audioUrl);
    if (!audioResponse.ok) {
      return NextResponse.json({ error: 'Failed to download audio' }, { status: 500 });
    }
    const audioBuffer = await audioResponse.arrayBuffer();
    const audioFile = new File([audioBuffer], 'session.m4a', { type: 'audio/m4a' });

    // Transcribe with Whisper
    const transcription = await openai.audio.transcriptions.create({
      file: audioFile,
      model: 'whisper-1',
      response_format: 'verbose_json',
      timestamp_granularities: ['segment'],
    });

    const stampContext = stamps?.length
      ? `\nUser marked these moments during recording (timestamps in seconds): ${JSON.stringify(stamps)}`
      : '';

    // GPT-4o clip detection
    const clipAnalysis = await openai.chat.completions.create({
      model: 'gpt-4o',
      response_format: { type: 'json_object' },
      messages: [
        {
          role: 'system',
          content: `You analyze studio session transcripts for music artists and producers.
Identify distinct clips/moments. For each clip return:
- type: one of "hook" | "bars" | "beat" | "melody" | "vocal" | "convo" | "idea"
- start_time_seconds: float
- end_time_seconds: float
- transcript: the text spoken/described in this segment
- ai_label: a punchy 5-10 word description of what happened

Return JSON: { "clips": [...] }`,
        },
        {
          role: 'user',
          content: `Session duration: ${duration} seconds${stampContext}

Transcript segments: ${JSON.stringify(transcription.segments)}

Full transcript: ${transcription.text}`,
        },
      ],
    });

    const clips: any[] = JSON.parse(clipAnalysis.choices[0].message.content!).clips ?? [];

    // Generate session recap
    const recapResponse = await openai.chat.completions.create({
      model: 'gpt-4o',
      messages: [
        {
          role: 'system',
          content:
            'Write a sharp 3-paragraph studio session debrief for a music artist. Cover: what got made, the vibe/energy, and what to lock in next session. Keep it real, brief, no fluff.',
        },
        {
          role: 'user',
          content: `Transcript: ${transcription.text}\n\nClips: ${JSON.stringify(clips)}`,
        },
      ],
    });

    const recap = recapResponse.choices[0].message.content ?? '';

    // Save everything to Supabase
    if (clips.length > 0) {
      await supabase
        .from('clips')
        .insert(clips.map((c) => ({ ...c, session_id: sessionId })));
    }

    await supabase
      .from('sessions')
      .update({ recap, duration_seconds: duration, status: 'done', updated_at: new Date().toISOString() })
      .eq('id', sessionId);

    return NextResponse.json({ clips, recap });
  } catch (err: any) {
    console.error('process-clip error:', err);
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
