import jwt from 'jsonwebtoken';
import { User } from '../models/User.js';
const JWT_SECRET = process.env.JWT_SECRET ?? 'bizhub-dev-secret-change-in-production';
export async function authMiddleware(req, res, next) {
    const authHeader = req.headers.authorization;
    const token = authHeader?.startsWith('Bearer ') ? authHeader.slice(7) : null;
    if (!token) {
        res.status(401).json({ error: 'Authentication required' });
        return;
    }
    try {
        const decoded = jwt.verify(token, JWT_SECRET);
        const user = await User.findById(decoded.userId);
        if (!user) {
            res.status(401).json({ error: 'User not found' });
            return;
        }
        req.user = {
            _id: user._id.toString(),
            email: user.email,
        };
        next();
    }
    catch {
        res.status(401).json({ error: 'Invalid or expired token' });
    }
}
/** When DB is connected, requires valid auth; when DB is not connected, proceeds without user (legacy). */
export function authOptionalWhenNoDb(isDbConnected) {
    return async (req, res, next) => {
        if (!isDbConnected()) {
            next();
            return;
        }
        const authHeader = req.headers.authorization;
        const token = authHeader?.startsWith('Bearer ') ? authHeader.slice(7) : null;
        if (!token) {
            res.status(401).json({ error: 'Authentication required' });
            return;
        }
        try {
            const decoded = jwt.verify(token, JWT_SECRET);
            const user = await User.findById(decoded.userId);
            if (!user) {
                res.status(401).json({ error: 'User not found' });
                return;
            }
            req.user = { _id: user._id.toString(), email: user.email };
            next();
        }
        catch {
            res.status(401).json({ error: 'Invalid or expired token' });
        }
    };
}
export function signToken(payload) {
    return jwt.sign(payload, JWT_SECRET, { expiresIn: '7d' });
}
