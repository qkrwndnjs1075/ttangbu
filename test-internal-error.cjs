const http = require('http');

// Make request that will trigger internal server error
const options = {
  hostname: 'localhost',
  port: 3000,
  path: '/trigger-internal-error',
  method: 'GET',
  headers: { 'Content-Type': 'application/json' }
};

const req = http.request(options, (res) => {
  let data = '';
  res.on('data', (chunk) => { data += chunk; });
  res.on('end', () => {
    try {
      const json = JSON.parse(data);
      // Check that only the 4 keys exist and no stack field
      const keys = Object.keys(json).sort();
      console.log(JSON.stringify({
        test: 'Internal Error - No Stack Leakage',
        endpoint: options.path,
        status: res.statusCode,
        response_keys: keys,
        has_stack: 'stack' in json,
        has_details: 'details' in json,
        response: json
      }, null, 2));
    } catch (e) {
      console.error('Failed to parse response:', data);
    }
  });
});

req.on('error', (e) => {
  console.error('Request failed:', e.message);
});

req.end();
