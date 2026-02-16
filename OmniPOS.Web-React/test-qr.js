import QRCode from 'qrcode';

console.log('Testing QRCode generation...');

try {
    const text = 'https://example.com';
    QRCode.toString(text, { type: 'terminal' }, function (err, url) {
        if (err) {
            console.error('Error generating QR:', err);
        } else {
            console.log('QR Code generated successfully:');
            console.log(url);
        }
    });
} catch (error) {
    console.error('Critical crash:', error);
}
