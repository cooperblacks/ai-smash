import apiApp from '../index.js';

export default function handler(req, res) {
  req.url = '/api/auth/signup';
  return apiApp(req, res);
}
