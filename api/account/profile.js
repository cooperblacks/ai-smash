import apiApp from '../index.js';

export default function handler(req, res) {
  req.url = '/api/account/profile';
  return apiApp(req, res);
}
