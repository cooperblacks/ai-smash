import apiApp from '../index';

export default function handler(req: any, res: any) {
  if (!req.url || !req.url.includes('/sync')) {
    req.url = '/api/account/sync';
  } else if (!req.url.startsWith('/api')) {
    req.url = `/api${req.url}`;
  }
  return apiApp(req, res);
}
