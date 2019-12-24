const fullTokenString = window.location.hash;
const token = fullTokenString.slice(fullTokenString.indexOf('=')+1, fullTokenString.indexOf('&'));
window.location.replace('http://localhost:1420/authed?token=' + token);