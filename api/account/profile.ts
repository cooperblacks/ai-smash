import apiApp from '../index';

export default function handler(req: any, res: any) {
  req.url = '/api/account/profile';
  return apiApp(req, res);
}
