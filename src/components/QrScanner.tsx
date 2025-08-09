import React, { useEffect } from 'react';
import { Html5QrcodeScanner, QrcodeSuccessCallback } from 'html5-qrcode';

interface QrScannerProps {
  onScanSuccess: QrcodeSuccessCallback;
  onCancel: () => void;
}

const QrScanner: React.FC<QrScannerProps> = ({ onScanSuccess, onCancel }) => {
  useEffect(() => {
    // This function sets up and renders the scanner
    const setupScanner = () => {
      const scanner = new Html5QrcodeScanner(
        'qr-reader-container',
        {
          fps: 10,
          qrbox: { width: 250, height: 250 },
          rememberLastUsedCamera: true,
        },
        false // verbose
      );

      const handleSuccess: QrcodeSuccessCallback = (decodedText, decodedResult) => {
        // Stop scanning after a successful scan
        if (scanner.getState()) {
          scanner.clear().catch(error => {
            console.error("Failed to clear html5-qrcode-scanner on success.", error);
          });
        }
        onScanSuccess(decodedText, decodedResult);
      };

      const handleError = (errorMessage: string) => {
        // We can ignore errors, as they happen constantly (e.g., no QR code in view)
      };

      scanner.render(handleSuccess, handleError);
      
      // Return a cleanup function
      return () => {
        if (scanner.getState()) {
          scanner.clear().catch(error => {
            console.error("Failed to clear html5-qrcode-scanner on cleanup.", error);
          });
        }
      };
    };

    const cleanup = setupScanner();
    return cleanup;

  }, [onScanSuccess]);

  return (
    <div className="fixed inset-0 bg-black bg-opacity-75 flex flex-col items-center justify-center z-50 p-4">
      <div className="bg-white p-6 rounded-lg shadow-xl w-full max-w-md">
        <div id="qr-reader-container"></div>
      </div>
      <button
        onClick={onCancel}
        className="mt-4 bg-red-600 hover:bg-red-700 text-white font-bold py-2 px-6 rounded-lg transition-colors"
      >
        Cancel
      </button>
    </div>
  );
};

export default QrScanner;
