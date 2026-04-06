import { VercelRequest, VercelResponse } from '@vercel/node';
import { prisma } from '../_lib/db';
import { withCORS } from '../_lib/middleware';
import { auth } from '../_lib/auth';

export default async function handler(req: VercelRequest, res: VercelResponse) {
    return withCORS(req, res, async (req: VercelRequest, res: VercelResponse) => {
        if (req.method !== 'POST') return res.status(405).end();
        const { email, name, supabaseId } = req.body;

        if (!email) return res.status(400).json({ error: 'Incomplete neural identity from provider.' });

        try {
            // Find or Upsert user
            let user = await prisma.user.findUnique({ where: { email } });

            if (!user) {
                user = await prisma.user.create({
                    data: {
                        email,
                        name: name || email.split('@')[0],
                        authProvider: 'google',
                        // Store supabaseId if relevant, though we primarily use email
                    }
                });
                console.log(`[NeuralAuth] Registered new sync node: ${email}`);
            } else if (user.authProvider !== 'google') {
                // If user exists as local, we could link them or refuse
                // For simplicity, we just mark as google and remove password to enforce OAuth
                user = await prisma.user.update({
                    where: { id: user.id },
                    data: { authProvider: 'google', password: null }
                });
                console.log(`[NeuralAuth] Upgraded local node to social sync: ${email}`);
            }

            const token = auth.signToken(user);
            res.setHeader('Set-Cookie', `token=${token}; HttpOnly; Secure; SameSite=Lax; Path=/; Max-Age=604800`);
            res.status(200).json({ user, token });
        } catch (err) {
            console.error('[Google Sync Error]', err);
            res.status(500).json({ error: 'Sync failure in Google gateway.' });
        }
    });
}
