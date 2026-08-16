import { createAuthClient } from 'better-auth/react';

/**
 * The browser talks to the auth routes on its own origin, which the Next
 * rewrite forwards to Fastify. Same-origin means no CORS preflight and no
 * third-party cookie problems when this is deployed.
 */
export const authClient = createAuthClient({
  basePath: '/api/auth',
});

// No client-side `useSession` export on purpose. The session is resolved on the
// server, where it can actually be verified, and passed down as a prop — a
// client hook would only ever be a hint the page could not act on.
