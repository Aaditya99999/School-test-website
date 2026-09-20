/**
 * Radha Krishna Memorial Education Centre — chatbot proxy (Vercel Serverless Function)
 * -------------------------------------------------------------------
 * Deployed automatically at  /api/chat  by Vercel.
 *
 * The browser talks ONLY to this function. This function holds the API key
 * and calls the AI provider. The key is never sent to the browser.
 *
 * SETUP
 *   Vercel dashboard → your project → Settings → Environment Variables:
 *       AICREDITS_API_KEY  = sk-xxxxxxxx      (all environments)
 *       AICREDITS_API_BASE = https://api.aicredits.in/v1   (optional)
 *       AICREDITS_MODEL    = gpt-4o-mini                   (optional)
 *   Redeploy after adding them — env vars are read at request time, but a
 *   running deployment will not pick up new ones until it is rebuilt.
 *
 * NEVER put the key in any file under version control.
 */

const API_BASE = process.env.AICREDITS_API_BASE || 'https://api.aicredits.in/v1';
const MODEL    = process.env.AICREDITS_MODEL    || 'gpt-4o-mini';

const MAX_MESSAGES = 20;    // conversation turns accepted per request
const MAX_CHARS    = 1500;  // per user message

// Rate limit. Serverless instances are recycled, so this is a speed bump
// against casual abuse, not a hard guarantee. For a strict limit across all
// instances use Vercel KV / Upstash Redis.
const RATE_LIMIT_HITS = 20;
const RATE_LIMIT_MS   = 5 * 60 * 1000;
const hits = new Map();

const SYSTEM_PROMPT = `
You are the admissions and information assistant for Radha Krishna
Memorial Education Centre, an ICSE, English-medium, co-educational
school in Kanpur, Uttar Pradesh. Its motto is "Knowledge is Power".

Facts you may rely on:
- Board: ICSE. English-medium, co-educational.
- Classes 1 to 12, with a kindergarten section (Nursery, LKG and UKG)
  before that.
- Experienced faculty, mentorship for students, regular tests, and an
  emphasis on discipline and values.
- Facilities: library, playground, computer access, and Physics,
  Chemistry and Biology laboratories. First aid is available on
  campus.
- The school does NOT offer IIT-JEE, NEET or NDA coaching, foundation
  courses, or a hostel or mess. If asked, say so politely.
- Registrations for the new session are open.
- Three branches, all in Kanpur:
    Main branch, Ratanlal Nagar: 540-A, Ratanlal Nagar Main Road,
      Neemeshwar MahaMandir Society, Near Petrol Pump, Ratan Lal Nagar,
      Kanpur, UP 208022. Phone +91 91513 15203.
    Govind Nagar: 98/4, Block-10, Near Nandlal Chauraha, Govind Nagar,
      Kanpur, UP 208006. Phone 0512-3271365.
    Meharban Singh Purva: C7GM+9C, Meharavan Singh Purva, Meharban Singh
      Ka Purva, Durjanpur, Uttar Pradesh 209305. Phone +91 91513 15203.
- Phone: +91 87388 85544, +91 79053 84057, +91 91513 15203.
- WhatsApp: +91 95823 05719.
- Email: rkmec_knp@rediffmail.com.

How to answer:
- Be warm, brief and practical. Two to four sentences is usually right.
- You are talking mostly to parents and students. Avoid jargon.
- You do not know which classes or programmes each individual branch
  offers, student or teacher counts, founding years, office hours, exam
  results, transport availability, or fees. If asked, say you do not
  have that detail and give the phone numbers or WhatsApp.
- Never invent fees, dates, marks, staff names or policies. If you are
  not sure, say so and point to the phone numbers or WhatsApp.
- Answer in the language the parent writes in (English or Hindi).
- You only discuss this school and its admissions. Politely decline
  anything unrelated.
`.trim();

function rateLimited(ip) {
  const now = Date.now();
  const recent = (hits.get(ip) || []).filter((t) => now - t < RATE_LIMIT_MS);

  if (recent.length >= RATE_LIMIT_HITS) {
    hits.set(ip, recent);
    return true;
  }

  recent.push(now);
  hits.set(ip, recent);

  // Keep the map from growing without bound on a long-lived instance.
  if (hits.size > 5000) hits.clear();

  return false;
}

export default async function handler(req, res) {
  res.setHeader('Content-Type', 'application/json; charset=utf-8');
  res.setHeader('X-Content-Type-Options', 'nosniff');
  // Same-origin only: the page and this function share a domain on Vercel,
  // so no CORS header is needed and none is granted.

  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Use POST.' });
  }

  if (!process.env.AICREDITS_API_KEY) {
    console.error('[rkg-chat] AICREDITS_API_KEY is not set');
    return res.status(500).json({ error: 'The chat service is not configured yet.' });
  }

  const ip =
    (req.headers['x-forwarded-for'] || '').split(',')[0].trim() ||
    req.socket?.remoteAddress ||
    'unknown';

  if (rateLimited(ip)) {
    return res
      .status(429)
      .json({ error: 'Too many messages just now. Please try again in a few minutes.' });
  }

  // Vercel parses JSON bodies, but be tolerant of a raw string.
  let body = req.body;
  if (typeof body === 'string') {
    try { body = JSON.parse(body); } catch { body = null; }
  }

  if (!body || !Array.isArray(body.messages)) {
    return res.status(400).json({ error: 'Malformed request.' });
  }

  // Rebuild the conversation ourselves. We never trust a system prompt, a
  // model name or any other field sent by the browser.
  const messages = [{ role: 'system', content: SYSTEM_PROMPT }];

  for (const m of body.messages.slice(-MAX_MESSAGES)) {
    if (!m || typeof m.content !== 'string') continue;
    const content = m.content.trim();
    if (!content) continue;
    messages.push({
      role: m.role === 'assistant' ? 'assistant' : 'user',
      content: content.slice(0, MAX_CHARS),
    });
  }

  if (messages.length < 2) {
    return res.status(400).json({ error: 'No message to answer.' });
  }

  // Give up rather than hold the function open until the platform timeout.
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 40000);

  try {
    const upstream = await fetch(`${API_BASE}/chat/completions`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${process.env.AICREDITS_API_KEY}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model: MODEL,
        messages,
        temperature: 0.3,
        max_tokens: 500,
        stream: false,
      }),
      signal: controller.signal,
    });

    const text = await upstream.text();

    if (!upstream.ok) {
      // Log the provider's message for us; never show it to the visitor,
      // since upstream errors can echo back key or account details.
      console.error(`[rkg-chat] provider ${upstream.status}: ${text.slice(0, 500)}`);
      return res.status(502).json({
        error: 'The assistant is unavailable right now. Please call +91 87388 85544.',
      });
    }

    let reply = '';
    try {
      reply = JSON.parse(text)?.choices?.[0]?.message?.content ?? '';
    } catch {
      console.error('[rkg-chat] unparseable provider response');
    }

    if (!reply.trim()) {
      return res.status(502).json({ error: 'Empty reply from the assistant. Please try again.' });
    }

    return res.status(200).json({ reply });
  } catch (err) {
    const timedOut = err?.name === 'AbortError';
    console.error('[rkg-chat]', timedOut ? 'upstream timeout' : err);
    return res.status(502).json({
      error: timedOut
        ? 'That took too long. Please try again, or call +91 87388 85544.'
        : 'Could not reach the assistant. Please try again.',
    });
  } finally {
    clearTimeout(timer);
  }
}
