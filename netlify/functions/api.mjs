import { getStore } from '@netlify/blobs';
import { createHandler } from './lib/handler.mjs';

export default async (req) => createHandler(getStore, process.env)(req);

export const config = { path: '/api/*' };
