import apiApp from '../index.js';

export default function handler(req, res) {
  if (!req.url || !req.url.includes('/sync')) {
    req.url = '/api/account/sync';
  } else if (!req.url.startsWith('/api')) {
    req.url = `/api${req.url}`;
  }
  return apiApp(req, res);
}
