import apiApp from '../index';

export default function handler(req: any, res: any) {
  req.url = '/api/auth/signin';
  return apiApp(req, res);
}
