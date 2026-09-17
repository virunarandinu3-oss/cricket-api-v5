import { handleApiRequest, handleOptions } from '../../lib/handler';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export const maxDuration = 30;

export async function GET(request, context) {
  const params = context ? await context.params : null;
  return handleApiRequest(request, params);
}

export async function OPTIONS() {
  return handleOptions();
}
