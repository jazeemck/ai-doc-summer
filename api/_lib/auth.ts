import jwt from 'jsonwebtoken';
import bcrypt from 'bcrypt';

const JWT_SECRET = process.env.JWT_SECRET || 'supersecretkey_change_in_production';

export const auth = {
    /**
     * Signs a new neural token
     */
    signToken(user: { id: string; email: string }) {
        return jwt.sign({ id: user.id, email: user.email }, JWT_SECRET, { expiresIn: '7d' });
    },

    /**
     * Verifies an existing token
     */
    verifyToken(token: string) {
        try {
            return jwt.verify(token, JWT_SECRET) as { id: string; email: string };
        } catch (e) {
            return null;
        }
    },

    /**
     * Hashes a password for secure storage
     */
    async hashPassword(password: string) {
        return bcrypt.hash(password, 10);
    },

    /**
     * Compares a password with its hash
     */
    async comparePassword(password: string, hash: string) {
        return bcrypt.compare(password, hash);
    }
};
