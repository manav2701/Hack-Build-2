import { NextResponse } from 'next/server';

export async function GET() {
  const agentId = process.env.NEXT_PUBLIC_ELEVENLABS_AGENT_ID;
  const apiKey = process.env.ELEVENLABS_API_KEY;

  if (!agentId || !apiKey || apiKey.includes('demo')) {
    return NextResponse.json({
      signedUrl: null,
      message: 'Demo mode active — standard public agent connection used'
    });
  }

  try {
    const response = await fetch(
      `https://api.elevenlabs.io/v1/convai/conversation/get_signed_url?agent_id=${agentId}`,
      {
        headers: {
          'xi-api-key': apiKey,
        },
      }
    );

    if (!response.ok) {
      throw new Error(`Failed to fetch signed URL: ${response.statusText}`);
    }

    const data = await response.json();
    return NextResponse.json({ signedUrl: data.signed_url });
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
