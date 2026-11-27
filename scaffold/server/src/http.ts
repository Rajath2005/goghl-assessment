import type { Request, RequestHandler, Response } from 'express';

export const route = (run: (req: Request, res: Response) => Promise<void>): RequestHandler =>
  (req, res, next) => { void run(req, res).catch(next); };
