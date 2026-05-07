"use client";

import { useEffect, useMemo, useRef, useState } from "react";

import type { FidelityScanType } from "@/lib/fidelity-data";

type SupportedBarcodeDetector = {
  detect: (source: HTMLVideoElement) => Promise<Array<{ rawValue?: string; format?: string }>>;
};

type WindowWithBarcodeDetector = Window & {
  BarcodeDetector?: new (options?: { formats?: string[] }) => SupportedBarcodeDetector;
};

type CodeScannerModalProps = {
  isOpen: boolean;
  title: string;
  description?: string;
  defaultType?: FidelityScanType | "auto";
  onClose: () => void;
  onDetected: (value: string, scanType: FidelityScanType) => void;
};

const supportedFormats = [
  "qr_code",
  "code_128",
  "ean_13",
  "ean_8",
  "upc_a",
  "upc_e",
];

function inferScanType(rawFormat?: string, fallbackType: FidelityScanType | "auto" = "auto"): FidelityScanType {
  if (rawFormat?.toLowerCase().includes("qr")) {
    return "qr";
  }

  if (fallbackType === "auto") {
    return "barcode";
  }

  return fallbackType;
}

export function CodeScannerModal({
  isOpen,
  title,
  description,
  defaultType = "auto",
  onClose,
  onDetected,
}: CodeScannerModalProps) {
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const [manualValue, setManualValue] = useState("");
  const [statusMessage, setStatusMessage] = useState("");
  const [cameraReady, setCameraReady] = useState(false);
  const [cameraAllowed, setCameraAllowed] = useState(true);
  const [scannerSupported, setScannerSupported] = useState(false);

  const manualTypeLabel = useMemo(() => {
    if (defaultType === "qr") {
      return "QR code";
    }

    if (defaultType === "barcode") {
      return "barcode";
    }

    return "codice tessera / QR";
  }, [defaultType]);

  useEffect(() => {
    if (!isOpen) {
      return;
    }

    let isActive = true;
    let frameHandle = 0;
    let detector: SupportedBarcodeDetector | null = null;

    const stopStream = () => {
      if (streamRef.current) {
        streamRef.current.getTracks().forEach((track) => track.stop());
        streamRef.current = null;
      }
    };

    const handleDetection = (value: string, rawFormat?: string) => {
      if (!value.trim()) {
        return;
      }

      stopStream();
      onDetected(value.trim(), inferScanType(rawFormat, defaultType));
      onClose();
    };

    const scanFrame = async () => {
      if (!isActive || !videoRef.current || !detector) {
        return;
      }

      const videoElement = videoRef.current;

      if (videoElement.readyState < 2) {
        frameHandle = window.requestAnimationFrame(scanFrame);
        return;
      }

      try {
        const detectedCodes = await detector.detect(videoElement);

        if (detectedCodes.length > 0) {
          const detectedCode = detectedCodes.find((code) => code.rawValue?.trim());

          if (detectedCode?.rawValue) {
            handleDetection(detectedCode.rawValue, detectedCode.format);
            return;
          }
        }
      } catch {
        setStatusMessage("Nessun codice rilevato");
      }

      frameHandle = window.requestAnimationFrame(scanFrame);
    };

    const startCamera = async () => {
      try {
        const stream = await navigator.mediaDevices.getUserMedia({
          video: {
            facingMode: { ideal: "environment" },
          },
          audio: false,
        });

        if (!isActive) {
          stream.getTracks().forEach((track) => track.stop());
          return;
        }

        streamRef.current = stream;
        setCameraAllowed(true);

        if (videoRef.current) {
          videoRef.current.srcObject = stream;
          await videoRef.current.play();
        }

        setCameraReady(true);

        const DetectorClass = (window as WindowWithBarcodeDetector).BarcodeDetector;

        if (!DetectorClass) {
          setScannerSupported(false);
          setStatusMessage("Scanner nativo non disponibile: usa l'inserimento manuale se necessario");
          return;
        }

        detector = new DetectorClass({ formats: supportedFormats });
        setScannerSupported(true);
        setStatusMessage("Inquadra barcode o QR code");
        frameHandle = window.requestAnimationFrame(scanFrame);
      } catch {
        setCameraAllowed(false);
        setCameraReady(false);
        setStatusMessage("Autorizza la fotocamera per continuare");
      }
    };

    setManualValue("");
    setStatusMessage("");
    setCameraReady(false);
    startCamera();

    return () => {
      isActive = false;
      if (frameHandle) {
        window.cancelAnimationFrame(frameHandle);
      }
      stopStream();
    };
  }, [defaultType, isOpen, onClose, onDetected]);

  if (!isOpen) {
    return null;
  }

  return (
    <div className="fixed inset-0 z-[120] flex items-center justify-center bg-black/25 px-4">
      <div className="w-full max-w-[420px] rounded-[6px] border border-[#d8d5cc] bg-[#ffffff] p-4 shadow-[0_14px_30px_rgba(46,42,37,0.18)]">
        <div className="flex items-start justify-between gap-3">
          <div>
            <div className="text-sm font-bold text-[#2e2a25]">{title}</div>
            <div className="mt-1 text-xs text-[#6c645b]">
              {description ?? "Inquadra la tessera oppure usa l'inserimento manuale."}
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="flex h-8 w-8 items-center justify-center rounded-[4px] border border-[#d8d5cc] bg-white text-sm font-semibold text-[#2e2a25]"
            aria-label="Chiudi scanner"
          >
            ×
          </button>
        </div>

        <div className="mt-4 overflow-hidden rounded-[6px] border border-[#d8d5cc] bg-[#111111]">
          <video ref={videoRef} muted playsInline className="h-[220px] w-full object-cover" />
        </div>

        <div className="mt-3 rounded-[4px] border border-[#d8d5cc] bg-white px-3 py-2 text-xs text-[#5d564e]">
          {statusMessage ||
            (cameraReady
              ? "Fotocamera pronta"
              : cameraAllowed
                ? "Avvio fotocamera in corso"
                : "Accesso fotocamera non disponibile")}
        </div>

        {!scannerSupported || !cameraAllowed ? (
          <div className="mt-2 rounded-[4px] border border-dashed border-[#d8d5cc] bg-[#fffdf8] px-3 py-2 text-xs text-[#6d665e]">
            Se la scansione automatica non parte, inserisci il codice manualmente qui sotto.
          </div>
        ) : null}

        <div className="mt-4">
          <label className="block">
            <div className="mb-1 text-xs font-semibold uppercase text-[#5d564e]">
              Inserimento manuale {manualTypeLabel}
            </div>
            <input
              value={manualValue}
              onChange={(event) => setManualValue(event.target.value)}
              placeholder="Inserisci o incolla il codice"
              className="h-10 w-full rounded-[4px] border border-[#d8d5cc] bg-white px-3 text-sm outline-none placeholder:text-[#9b9489]"
            />
          </label>
        </div>

        <div className="mt-4 grid grid-cols-2 gap-2">
          <button
            type="button"
            onClick={onClose}
            className="h-10 rounded-[4px] border border-[#c7c1b6] bg-[#ffffff] px-3 text-sm font-semibold text-[#2e2a25]"
          >
            Annulla
          </button>
          <button
            type="button"
            onClick={() => {
              const normalizedValue = manualValue.trim();

              if (!normalizedValue) {
                setStatusMessage("Nessun codice rilevato");
                return;
              }

              onDetected(
                normalizedValue,
                defaultType === "auto" ? "barcode" : defaultType
              );
              onClose();
            }}
            className="h-10 rounded-[4px] border border-[#a9c9e6] bg-[#cfe8ff] px-3 text-sm font-semibold text-[#0b3c5d]"
          >
            Conferma
          </button>
        </div>
      </div>
    </div>
  );
}
