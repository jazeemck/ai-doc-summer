const pdfParse = require('pdf-parse');
console.log('pdfParse type:', typeof pdfParse);
console.log('pdfParse keys:', Object.keys(pdfParse || {}));

if (typeof pdfParse === 'function') {
  console.log('pdfParse is a function!');
} else {
  console.log('pdfParse is NOT a function - check if you need pdfParse.default or something');
}
