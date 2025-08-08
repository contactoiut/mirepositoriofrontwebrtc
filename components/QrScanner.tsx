import React, { useEffect, useRef } from 'react';
import { Html5Qrcode, Html5QrcodeScannerState } from 'html5-qrcode';

interface QrScannerComponentProps {
  onScanSuccess: (decodedText: string) => void;
  onScanFailure: (error: string) => void;
}

const QR_READER_ID = "qr-reader";

const QrScannerComponent: React.FC<QrScannerComponentProps> = ({ onScanSuccess, onScanFailure }) => {
  const html5QrCodeRef = useRef<Html5Qrcode | null>(null);

  useEffect(() => {
    // Ensure this runs only once
    if (!html5QrCodeRef.current) {
        html5QrCodeRef.current = new Html5Qrcode(QR_READER_ID);
    }
    const qrCodeScanner = html5QrCodeRef.current;
    
    // Check if scanner is already running before starting
    if (qrCodeScanner.getState() === Html5QrcodeScannerState.SCANNING) {
      console.log("Scanner is already running.");
      return;
    }

    const config = { fps: 10, qrbox: { width: 250, height: 250 } };

    qrCodeScanner.start(
      { facingMode: "environment" },
      config,
      (decodedText, decodedResult) => {
        // Stop scanning on success
        if (qrCodeScanner.getState() === Html5QrcodeScannerState.SCANNING) {
            qrCodeScanner.stop().then(() => {
                console.log("QR Code scanning stopped on success.");
                onScanSuccess(decodedText);
            }).catch(err => {
                console.error("Failed to stop QR scanner on success.", err);
                onScanSuccess(decodedText); // Proceed anyway
            });
        }
      },
      (errorMessage) => {
        // onScanFailure is called for every frame that doesn't contain a QR code.
        // We can choose to ignore these "errors" or log them for debugging.
        // For this app, we'll ignore them to keep the log clean.
      }
    ).catch((err) => {
      onScanFailure(err);
    });

    return () => {
      if (qrCodeScanner && qrCodeScanner.getState() === Html5QrcodeScannerState.SCANNING) {
        qrCodeScanner.stop()
          .then(() => console.log("QR Code scanning stopped on cleanup."))
          .catch(err => console.error("Failed to stop QR scanner on cleanup.", err));
      }
    };
  }, [onScanSuccess, onScanFailure]);

  return <div id={QR_READER_ID} className="w-full max-w-sm h-64 border-2 border-dashed border-gray-600 rounded-lg"></div>;
};

export default QrScannerComponent;