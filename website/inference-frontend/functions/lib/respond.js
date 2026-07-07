export function json(body, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: {
      'Content-Type': 'application/json',
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
      'Access-Control-Allow-Headers': 'Content-Type',
    },
  });
}

export function ok(body) {
  return json({ success: true, ...body });
}

export function badRequest(error) {
  return json({ success: false, error }, 400);
}

export function serverError(error) {
  return json({ success: false, error }, 500);
}

export async function parseBody(request) {
  try {
    return await request.json();
  } catch {
    return {};
  }
}
