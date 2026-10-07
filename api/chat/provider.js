import apiApp from '../index.js';

export default function handler(req, res) {
  req.url = '/api/chat/provider';
  return apiApp(req, res);
}
