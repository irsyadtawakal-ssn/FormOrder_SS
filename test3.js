
const fs = require('fs');
fetch('https://cdnjs.cloudflare.com/ajax/libs/qrcodejs/1.0.0/qrcode.min.js')
  .then(res => res.text())
  .then(text => console.log('Length:', text.length, 'Status:', text.substring(0, 100)))
  .catch(err => console.log(err));

