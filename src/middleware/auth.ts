import { Request, Response, NextFunction } from 'express';
import jwt from 'jsonwebtoken';
import { User } from '../models/User.js';

const JWT_SECRET = process.env.JWT_SECRET ?? 'bizhub-dev-secret-change-in-production';

export interface JwtPayload {
  userId: string;
  email: string;
}

export type AuthReq = Request & { user: { _id: string; email: string } };

export async function authMiddleware(req: Request, res: Response, next: NextFunction): Promise<void> {
  const authHeader = req.headers.authorization;
  const token = authHeader?.startsWith('Bearer ') ? authHeader.slice(7) : null;
  // #region agent log
  fetch('http://127.0.0.1:7727/ingest/0e857ef2-7b55-4cae-bc3c-ddc8e8541315',{method:'POST',headers:{'Content-Type':'application/json','X-Debug-Session-Id':'0c1830'},body:JSON.stringify({sessionId:'0c1830',runId:'initial',hypothesisId:'H5',location:'middleware/auth.ts:authMiddleware:entry',message:'authMiddleware invoked',data:{path:req.path,hasBearer:!!token,tokenPrefix:token?token.slice(0,8):null},timestamp:Date.now()})}).catch(()=>{});
  // #endregion
  if (!token) {
    res.status(401).json({ error: 'Authentication required' });
    return;
  }
  try {
    const decoded = jwt.verify(token, JWT_SECRET) as JwtPayload;
    const user = await User.findById(decoded.userId);
    if (!user) {
      res.status(401).json({ error: 'User not found' });
      return;
    }
    (req as AuthReq).user = {
      _id: user._id.toString(),
      email: user.email,
    };
    next();
  } catch (err) {
    // #region agent log
    fetch('http://127.0.0.1:7727/ingest/0e857ef2-7b55-4cae-bc3c-ddc8e8541315',{method:'POST',headers:{'Content-Type':'application/json','X-Debug-Session-Id':'0c1830'},body:JSON.stringify({sessionId:'0c1830',runId:'initial',hypothesisId:'H5',location:'middleware/auth.ts:authMiddleware:verify_failed',message:'JWT verification failed',data:{path:req.path,errorName:err instanceof Error?err.name:'unknown',errorMessage:err instanceof Error?err.message:'unknown'},timestamp:Date.now()})}).catch(()=>{});
    // #endregion
    res.status(401).json({ error: 'Invalid or expired token' });
  }
}

/** When DB is connected, requires valid auth; when DB is not connected, proceeds without user (legacy). */
export function authOptionalWhenNoDb(isDbConnected: () => boolean) {
  return async (req: Request, res: Response, next: NextFunction): Promise<void> => {
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
      const decoded = jwt.verify(token, JWT_SECRET) as JwtPayload;
      const user = await User.findById(decoded.userId);
      if (!user) {
        res.status(401).json({ error: 'User not found' });
        return;
      }
      (req as AuthReq).user = { _id: user._id.toString(), email: user.email };
      next();
    } catch {
      res.status(401).json({ error: 'Invalid or expired token' });
    }
  };
}

export function signToken(payload: JwtPayload): string {
  return jwt.sign(payload, JWT_SECRET, { expiresIn: '7d' });
}
