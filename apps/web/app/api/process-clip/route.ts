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

const CLIP_DETECTION_SYSTEM = `You are an expert music production assistant embedded in a studio session recording app. Artists use this to capture ideas while making music — rap, R&B, pop, trap, afrobeats, drill, and more.

Your job: analyze the Whisper transcript of a recording and extract distinct musical moments as "clips."

MUSIC PRODUCTION CONTEXT:
- "hook" — the catchiest section of the song. Melodic, often repeated, meant to anchor the record. Usually 4–16 bars. Even if the artist just hums or sings placeholder lyrics, it counts.
- "bars" — rap bars, freestyled or written. Look for rhyme schemes, punchlines, multisyllabic rhymes, wordplay. Count-ins like "1, 2, 3" or "from the top" signal a new take.
- "verse" — a sung or rapped verse section that is clearly not the hook or chorus.
- "melody" — any melodic idea: humming, singing a topline, wordless vocals ("la la la", "na na"). Even rough sketches count.
- "beat" — the artist talking about or reacting to the instrumental: "put a darker 808 on the 2," "make the hi-hats faster," "I need a sample here."
- "idea" — a concept, topic, or direction: "I want to write something about loyalty," "this should feel like a night drive."
- "convo" — producer/artist communication, direction-giving, playback feedback, decisions about the session.
- "adlib" — short hype phrases within a take: "ayy," "uh," "skrr," "that's it." Only log as a clip if they're intentional and distinct from a larger moment.

WHAT TO LOOK FOR:
- Multiple takes: "again," "let me try that," "from the top," or a clear restart after a pause — these separate distinct takes, each can be its own clip.
- User stamps: the artist manually marked these times as important — treat them as high-confidence clip candidates even if the transcript is unclear.
- Energy level: when the delivery sounds locked in vs. exploratory — reflect this in ai_label (e.g., "controlled delivery" vs. "loose exploratory take").
- Incomplete ideas: if the artist trails off, says "wait," "hold on," or "nah forget it" mid-idea, mark complete=false.
- Strong moments: lines with clear wordplay, emotional weight, or that sound finished — mark quality="strong".

WHAT TO SKIP:
- Pure technical setup: "is the mic clipping?", "can you turn up the headphones?", "is this recording?"
- Ambient silence or noise with no speech or musical content.
- Coughing, sneezing, generic throat-clearing with no musical context.

FOR EACH CLIP return these exact fields:
- type: one of "hook" | "bars" | "verse" | "melody" | "beat" | "idea" | "convo" | "adlib"
- start_time_seconds: float
- end_time_seconds: float
- transcript: the exact words spoken/sung, or your best description if non-verbal
- ai_label: 5–10 word description an artist would find useful, e.g. "double-time hook with money references", "rough melodic idea for bridge, incomplete", "producer directing beat change at drop"
- quality: "strong" | "developing" | "rough" — how execution-ready this moment is
- complete: boolean — true if the idea was fully expressed, false if cut off or abandoned mid-thought

Return JSON: { "clips": [...] }`;

const SESSION_RECAP_SYSTEM = `You write session debriefs for music artists and producers. You speak plainly — like a studio engineer who's worked hundreds of sessions and tells it straight. No hype, no hollow encouragement.

Write a 3-paragraph session debrief:

Paragraph 1 — WHAT GOT MADE: Be specific. Name the types of moments that came up (hooks, bars, melodies, ideas), and describe standout moments using actual words from the transcript when they're worth quoting. How many distinct ideas? Was there a clear musical direction?

Paragraph 2 — SESSION ENERGY: How was the vibe? Was the artist focused and dialed in, or loose and exploratory? Any clear breakthroughs? Any spots where energy dropped or ideas stalled? Multiple recordings in a session can show momentum — call it out if you see it.

Paragraph 3 — NEXT STEPS: Based on what's incomplete or has potential, what should get locked in next session? Be specific — not "keep going," but "the hook at 2:15 needs a second verse" or "that melody idea was the best thing here — build the whole song around it." If the session was rough overall, say so directly and give a clear redirect.

Rules:
- Under 250 words total
- No emojis, no bullet points inside the recap
- Reference actual lines or moments from the transcript when they stand out
- If nothing strong came out, say that honestly — don't pad it`;

export async function POST(req: NextRequest) {
  try {
    const { sessionId, recordingId, audioUrl, stamps, duration } = await req.json();

    if (!sessionId || !recordingId || !audioUrl) {
      return NextResponse.json({ error: 'Missing required fields' }, { status: 400 });
    }

    const supabase = getSupabase();

    // Download audio from Supabase signed URL
    const audioResponse = await fetch(audioUrl);
    if (!audioResponse.ok) {
      return NextResponse.json({ error: 'Failed to download audio' }, { status: 500 });
    }
    const audioBuffer = await audioResponse.arrayBuffer();
    const bytes = new Uint8Array(audioBuffer.slice(0, 16));

    const isWav = bytes[0] === 0x52 && bytes[1] === 0x49 && bytes[2] === 0x46 && bytes[3] === 0x46;
    const isMp3 = (bytes[0] === 0xFF && (bytes[1] & 0xE0) === 0xE0) || (bytes[0] === 0x49 && bytes[1] === 0x44 && bytes[2] === 0x33);
    const isCaf = bytes[0] === 0x63 && bytes[1] === 0x61 && bytes[2] === 0x66 && bytes[3] === 0x66;

    console.error(`AUDIO_DEBUG size=${audioBuffer.byteLength} wav=${isWav} mp3=${isMp3} caf=${isCaf}`);

    if (isCaf) {
      return NextResponse.json({
        error: 'iOS recorded in CAF format. Use a development build instead of Expo Go, or we can add server-side conversion.',
      }, { status: 422 });
    }

    // Whisper transcription — manually constructed multipart body using Node.js Buffers.
    // Web FormData+Blob silently corrupts binary in Next.js serverless; Buffer.concat is the only safe path.
    const boundary = `AudioBoundary${Date.now()}`;
    const CRLF = '\r\n';

    const textPart = (name: string, value: string) =>
      Buffer.from(
        `--${boundary}${CRLF}Content-Disposition: form-data; name="${name}"${CRLF}${CRLF}${value}${CRLF}`,
        'utf8'
      );

    const filename = isWav ? 'audio.wav' : isMp3 ? 'audio.mp3' : 'audio.m4a';
    const contentType = isWav ? 'audio/wav' : isMp3 ? 'audio/mpeg' : 'audio/mp4';

    const audioBytes = Buffer.from(audioBuffer);
    const fileHeader = Buffer.from(
      `--${boundary}${CRLF}Content-Disposition: form-data; name="file"; filename="${filename}"${CRLF}Content-Type: ${contentType}${CRLF}${CRLF}`,
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

    // Save transcript to recording immediately so recap can use it
    await supabase
      .from('recordings')
      .update({ transcript: transcription.text, duration_seconds: duration, status: 'processing' })
      .eq('id', recordingId);

    const stampContext = stamps?.length
      ? `\nThe artist manually stamped these moments as important (timestamps in seconds from recording start): ${JSON.stringify(stamps)}`
      : '';

    // GPT-4o clip detection
    const clipAnalysis = await openai.chat.completions.create({
      model: 'gpt-4o',
      response_format: { type: 'json_object' },
      messages: [
        { role: 'system', content: CLIP_DETECTION_SYSTEM },
        {
          role: 'user',
          content: `Recording duration: ${duration} seconds${stampContext}

Transcript segments with timestamps:
${JSON.stringify(transcription.segments)}

Full transcript:
${transcription.text}`,
        },
      ],
    });

    const clips: any[] = JSON.parse(clipAnalysis.choices[0].message.content!).clips ?? [];

    // Save clips with both session_id and recording_id
    let savedClips: any[] = [];
    if (clips.length > 0) {
      const { data } = await supabase
        .from('clips')
        .insert(clips.map((c) => ({ ...c, session_id: sessionId, recording_id: recordingId })))
        .select();
      if (data) savedClips = data;
    }

    // Mark this recording done
    await supabase
      .from('recordings')
      .update({ status: 'done' })
      .eq('id', recordingId);

    // Fetch ALL done recordings for this session to build a session-wide recap
    const { data: allRecordings } = await supabase
      .from('recordings')
      .select('transcript, duration_seconds, created_at')
      .eq('session_id', sessionId)
      .eq('status', 'done')
      .not('transcript', 'is', null)
      .order('created_at', { ascending: true });

    const recordingsSummary = (allRecordings ?? [])
      .map((r, i) => `Recording ${i + 1} (${r.duration_seconds}s):\n${r.transcript}`)
      .join('\n\n---\n\n');

    const { data: allClips } = await supabase
      .from('clips')
      .select('type, ai_label, quality, complete')
      .eq('session_id', sessionId);

    const recapResponse = await openai.chat.completions.create({
      model: 'gpt-4o',
      messages: [
        { role: 'system', content: SESSION_RECAP_SYSTEM },
        {
          role: 'user',
          content: `Session has ${allRecordings?.length ?? 1} recording(s).

Transcripts:
${recordingsSummary}

Detected clips across the full session:
${JSON.stringify(allClips ?? [])}`,
        },
      ],
    });

    const recap = recapResponse.choices[0].message.content ?? '';

    // Update session with latest recap
    await supabase
      .from('sessions')
      .update({ recap, status: 'active', updated_at: new Date().toISOString() })
      .eq('id', sessionId);

    return NextResponse.json({ clips: savedClips, recap });
  } catch (err: any) {
    console.error('process-clip error:', err);
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
