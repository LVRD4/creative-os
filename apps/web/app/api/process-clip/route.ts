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
    const bytes = new Uint8Array(audioBuffer.slice(0, 12));

    // Detect actual format from magic bytes
    const isWav = bytes[0] === 0x52 && bytes[1] === 0x49 && bytes[2] === 0x46 && bytes[3] === 0x46;
    const isMp3 = (bytes[0] === 0xFF && (bytes[1] & 0xE0) === 0xE0) || (bytes[0] === 0x49 && bytes[1] === 0x44 && bytes[2] === 0x33);
    const isMp4 = bytes[4] === 0x66 && bytes[5] === 0x74 && bytes[6] === 0x79 && bytes[7] === 0x70;

    const ext = isWav ? 'wav' : isMp3 ? 'mp3' : isMp4 ? 'mp4' : 'mp4';
    const mimeType = isWav ? 'audio/wav' : isMp3 ? 'audio/mpeg' : 'audio/mp4';

    console.log(`Audio: ${audioBuffer.byteLength} bytes, detected=${ext}, header=${Array.from(bytes.slice(0,8)).map(b=>b.toString(16).padStart(2,'0')).join(' ')}`);

    // Use raw fetch — more reliable than SDK in serverless for binary uploads
    const formData = new FormData();
    formData.append('file', new Blob([audioBuffer], { type: mimeType }), `session.${ext}`);
    formData.append('model', 'whisper-1');
    formData.append('response_format', 'verbose_json');
    formData.append('timestamp_granularities[]', 'segment');

    const whisperRes = await fetch('https://api.openai.com/v1/audio/transcriptions', {
      method: 'POST',
      headers: { Authorization: `Bearer ${process.env.OPENAI_API_KEY}` },
      body: formData,
    });

    if (!whisperRes.ok) {
      const errText = await whisperRes.text();
      console.error('Whisper error:', whisperRes.status, errText);
      throw new Error(`Whisper ${whisperRes.status}: ${errText}`);
    }

    const transcription = await whisperRes.json();

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
