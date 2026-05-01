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
    const bytes = new Uint8Array(audioBuffer.slice(0, 16));
    const hex = Array.from(bytes).map(b => b.toString(16).padStart(2, '0')).join(' ');
    const ascii = Array.from(bytes).map(b => b >= 32 && b < 127 ? String.fromCharCode(b) : '.').join('');

    // Detect actual format from magic bytes
    const isWav = bytes[0] === 0x52 && bytes[1] === 0x49 && bytes[2] === 0x46 && bytes[3] === 0x46;
    const isMp3 = (bytes[0] === 0xFF && (bytes[1] & 0xE0) === 0xE0) || (bytes[0] === 0x49 && bytes[1] === 0x44 && bytes[2] === 0x33);
    const isMp4 = bytes[4] === 0x66 && bytes[5] === 0x74 && bytes[6] === 0x79 && bytes[7] === 0x70;
    const isCaf = bytes[0] === 0x63 && bytes[1] === 0x61 && bytes[2] === 0x66 && bytes[3] === 0x66;

    console.error(`AUDIO_DEBUG size=${audioBuffer.byteLength} wav=${isWav} mp3=${isMp3} mp4=${isMp4} caf=${isCaf}`);
    console.error(`AUDIO_DEBUG hex: ${hex}`);
    console.error(`AUDIO_DEBUG ascii: ${ascii}`);

    if (isCaf) {
      return NextResponse.json({ error: 'iOS recorded in CAF format. This is a known Expo Go limitation — please test with a development build instead, or we can add server-side conversion.' }, { status: 422 });
    }

    const ext = isWav ? 'wav' : isMp3 ? 'mp3' : isMp4 ? 'mp4' : 'm4a';
    const mimeType = isWav ? 'audio/wav' : isMp3 ? 'audio/mpeg' : 'audio/mp4';

    // Manually construct multipart/form-data body using Node.js Buffers.
    // Web FormData+Blob and OpenAI SDK file handling both corrupt binary in
    // Next.js serverless. Buffer.concat is the only encoding-safe path.
    const boundary = `AudioBoundary${Date.now()}`;
    const CRLF = '\r\n';

    const textPart = (name: string, value: string) =>
      Buffer.from(
        `--${boundary}${CRLF}Content-Disposition: form-data; name="${name}"${CRLF}${CRLF}${value}${CRLF}`,
        'utf8'
      );

    const audioBytes = Buffer.from(audioBuffer);
    const fileHeader = Buffer.from(
      `--${boundary}${CRLF}Content-Disposition: form-data; name="file"; filename="audio.m4a"${CRLF}Content-Type: audio/mp4${CRLF}${CRLF}`,
      'utf8'
    );

    const multipartBody = Buffer.concat([
      textPart('model', 'whisper-1'),
      textPart('response_format', 'verbose_json'),
      textPart('timestamp_granularities[]', 'segment'),
      fileHeader,
      audioBytes,
      Buffer.from(`${CRLF}--${boundary}--${CRLF}`, 'utf8'),
    ]);

    console.error(`WHISPER_DEBUG sending ${multipartBody.byteLength} bytes, audio=${audioBytes.byteLength}`);

    const whisperRes = await fetch('https://api.openai.com/v1/audio/transcriptions', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${process.env.OPENAI_API_KEY}`,
        'Content-Type': `multipart/form-data; boundary=${boundary}`,
      },
      body: multipartBody,
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

    // Save everything to Supabase — use .select() to get back rows with IDs
    let savedClips = clips;
    if (clips.length > 0) {
      const { data } = await supabase
        .from('clips')
        .insert(clips.map((c) => ({ ...c, session_id: sessionId })))
        .select();
      if (data) savedClips = data;
    }

    await supabase
      .from('sessions')
      .update({ recap, duration_seconds: duration, status: 'done', updated_at: new Date().toISOString() })
      .eq('id', sessionId);

    return NextResponse.json({ clips: savedClips, recap });
  } catch (err: any) {
    console.error('process-clip error:', err);
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
