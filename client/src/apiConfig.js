const envUrl = process.env.REACT_APP_API_URL;

export const API_BASE = (envUrl && envUrl.trim()) 
  ? envUrl.trim().replace(/\/+$/, '') 
  : 'http://localhost:5000';

export const getWsUrl = () => {
  const base = API_BASE;
  if (base.startsWith('https://')) {
    return base.replace(/^https:\/\//, 'wss://') + '/ws';
  }
  return base.replace(/^http:\/\//, 'ws://') + '/ws';
};
