import '@testing-library/jest-dom';
global.fetch = () => { throw new Error('Offline tests forbid transport'); };
XMLHttpRequest.prototype.open = () => { throw new Error('Offline tests forbid XHR'); };
global.WebSocket = function () { throw new Error('Offline tests forbid sockets'); };
global.EventSource = function () { throw new Error('Offline tests forbid SSE'); };
