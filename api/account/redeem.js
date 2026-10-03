import apiApp from '../index.js';

export default function handler(req, res) {
  req.url = '/api/account/redeem';
  return apiApp(req, res);
}
