"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { Camera, CircleStop, FolderOpen, Trash2, Video } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
    isManufacturingEvidenceVideo,
    MANUFACTURING_EVIDENCE_VIDEO_MAX_BYTES,
    normalizedMediaMimeType,
    validateManufacturingEvidence
} from "../services/production-yield-image";

interface EvidenceMediaInputProps {
    id: string;
    label: string;
    file: File | null;
    error: string | null;
    required?: boolean;
    disabled?: boolean;
    active?: boolean;
    onChange: (file: File | null, error: string | null) => void;
}

const IMAGE_ACCEPT = "image/jpeg,image/jpg,image/png,image/webp";
const VIDEO_ACCEPT = "video/mp4,video/webm,video/quicktime";
const ACCEPT = `${IMAGE_ACCEPT},${VIDEO_ACCEPT}`;

function mediaExtension(mimeType: string): string {
    switch (normalizedMediaMimeType(mimeType)) {
        case "video/mp4": return "mp4";
        case "video/quicktime": return "mov";
        default: return "webm";
    }
}

function cameraErrorMessage(error: unknown): string {
    if (error instanceof DOMException) {
        if (error.name === "NotAllowedError" || error.name === "PermissionDeniedError") {
            return "Camera access was denied. You can still choose an image or video file.";
        }
        if (error.name === "NotFoundError" || error.name === "DevicesNotFoundError") {
            return "No camera was found. You can still choose an image or video file.";
        }
    }
    return "Camera access is unavailable. You can still choose an image or video file.";
}

export function EvidenceMediaInput({
    id,
    label,
    file,
    error,
    required = false,
    disabled = false,
    active = true,
    onChange
}: EvidenceMediaInputProps) {
    const [previewUrl, setPreviewUrl] = useState<string | null>(null);
    const [cameraStream, setCameraStream] = useState<MediaStream | null>(null);
    const [cameraStarting, setCameraStarting] = useState(false);
    const [cameraReady, setCameraReady] = useState(false);
    const [recording, setRecording] = useState(false);
    const [cameraError, setCameraError] = useState<string | null>(null);
    const [cameraNotice, setCameraNotice] = useState<string | null>(null);
    const fileInputRef = useRef<HTMLInputElement>(null);
    const cameraVideoRef = useRef<HTMLVideoElement>(null);
    const cameraStreamRef = useRef<MediaStream | null>(null);
    const recorderRef = useRef<MediaRecorder | null>(null);
    const recordingChunksRef = useRef<Blob[]>([]);
    const recordingBytesRef = useRef(0);
    const recordingLimitReachedRef = useRef(false);
    const cameraRequestIdRef = useRef(0);

    useEffect(() => {
        if (!file) {
            setPreviewUrl(null);
            return;
        }

        const objectUrl = URL.createObjectURL(file);
        setPreviewUrl(objectUrl);
        return () => URL.revokeObjectURL(objectUrl);
    }, [file]);

    const stopCamera = useCallback(() => {
        cameraRequestIdRef.current += 1;
        const recorder = recorderRef.current;
        if (recorder && recorder.state !== "inactive") {
            recorder.ondataavailable = null;
            recorder.onstop = null;
            recorder.onerror = null;
            try {
                recorder.stop();
            } catch {
                // The recorder may already have stopped as the dialog closes.
            }
        }
        recorderRef.current = null;
        cameraStreamRef.current?.getTracks().forEach((track) => track.stop());
        cameraStreamRef.current = null;
        setCameraStream(null);
        setCameraStarting(false);
        setCameraReady(false);
        setRecording(false);
    }, []);

    useEffect(() => {
        if (!active) {
            stopCamera();
            setCameraError(null);
            setCameraNotice(null);
        }
    }, [active, stopCamera]);

    useEffect(() => () => {
        cameraRequestIdRef.current += 1;
        const recorder = recorderRef.current;
        if (recorder && recorder.state !== "inactive") {
            recorder.ondataavailable = null;
            recorder.onstop = null;
            recorder.onerror = null;
            try {
                recorder.stop();
            } catch {
                // Ignore an already-stopped recorder during unmount.
            }
        }
        cameraStreamRef.current?.getTracks().forEach((track) => track.stop());
    }, []);

    useEffect(() => {
        const video = cameraVideoRef.current;
        if (!video || !cameraStream) return;
        video.srcObject = cameraStream;
        void video.play().catch(() => {
            if (cameraStreamRef.current === cameraStream) {
                setCameraError("The camera preview could not start. Check browser permissions or choose a file instead.");
            }
        });
        return () => {
            if (video.srcObject === cameraStream) video.srcObject = null;
        };
    }, [cameraStream]);

    const acceptFile = useCallback((nextFile: File | null) => {
        setCameraError(null);
        setCameraNotice(null);
        if (!nextFile) {
            onChange(null, null);
            return;
        }
        const validationError = validateManufacturingEvidence(nextFile, label);
        onChange(validationError ? null : nextFile, validationError);
    }, [label, onChange]);

    const startCamera = async () => {
        if (!active || disabled) return;
        setCameraError(null);
        setCameraNotice(null);
        setCameraReady(false);
        stopCamera();
        const requestId = ++cameraRequestIdRef.current;
        if (!navigator.mediaDevices?.getUserMedia) {
            setCameraError("Camera access is unavailable in this browser. You can still choose an image or video file.");
            return;
        }

        setCameraStarting(true);
        try {
            const stream = await navigator.mediaDevices.getUserMedia({
                audio: false,
                video: { facingMode: { ideal: "environment" } }
            });
            if (requestId !== cameraRequestIdRef.current || !active) {
                stream.getTracks().forEach((track) => track.stop());
                return;
            }
            cameraStreamRef.current = stream;
            setCameraStream(stream);
        } catch (cameraAccessError) {
            if (requestId === cameraRequestIdRef.current) {
                setCameraError(cameraErrorMessage(cameraAccessError));
            }
        } finally {
            if (requestId === cameraRequestIdRef.current) setCameraStarting(false);
        }
    };

    const capturePhoto = () => {
        const video = cameraVideoRef.current;
        if (!video || video.readyState < HTMLMediaElement.HAVE_CURRENT_DATA || !video.videoWidth || !video.videoHeight) {
            setCameraError("The camera preview is not ready yet. Wait a moment and try again.");
            return;
        }
        const canvas = document.createElement("canvas");
        const scale = Math.min(1, 2560 / Math.max(video.videoWidth, video.videoHeight));
        canvas.width = Math.round(video.videoWidth * scale);
        canvas.height = Math.round(video.videoHeight * scale);
        const context = canvas.getContext("2d");
        if (!context) {
            setCameraError("Could not capture the camera image. Please try again.");
            return;
        }
        context.drawImage(video, 0, 0, canvas.width, canvas.height);
        canvas.toBlob((blob) => {
            if (!blob) {
                setCameraError("Could not capture the camera image. Please try again.");
                return;
            }
            acceptFile(new File([blob], `evidence-${Date.now()}.jpg`, {
                type: "image/jpeg",
                lastModified: Date.now()
            }));
            stopCamera();
        }, "image/jpeg", 0.82);
    };

    const startRecording = () => {
        const stream = cameraStreamRef.current;
        if (!stream || !cameraReady) {
            setCameraError("The camera preview is not ready yet. Wait a moment and try again.");
            return;
        }
        if (typeof MediaRecorder === "undefined") {
            setCameraError("Video recording is not supported in this browser. You can still choose an image or video file.");
            return;
        }

        try {
            const supportedTypes = ["video/webm;codecs=vp9", "video/webm;codecs=vp8", "video/webm", "video/mp4"];
            const mimeType = supportedTypes.find((type) => MediaRecorder.isTypeSupported(type));
            const recorder = new MediaRecorder(stream, mimeType ? { mimeType } : undefined);
            recorderRef.current = recorder;
            recordingChunksRef.current = [];
            recordingBytesRef.current = 0;
            recordingLimitReachedRef.current = false;
            setCameraError(null);
            setCameraNotice(null);
            acceptFile(null);

            recorder.ondataavailable = (event) => {
                if (!event.data.size) return;
                if (recordingBytesRef.current + event.data.size > MANUFACTURING_EVIDENCE_VIDEO_MAX_BYTES) {
                    recordingLimitReachedRef.current = true;
                    setCameraNotice("Recording stopped at the 100 MB limit. The captured clip is ready to review.");
                    if (recorder.state === "recording") recorder.stop();
                    return;
                }
                recordingChunksRef.current.push(event.data);
                recordingBytesRef.current += event.data.size;
                if (recordingBytesRef.current >= MANUFACTURING_EVIDENCE_VIDEO_MAX_BYTES && recorder.state === "recording") {
                    recordingLimitReachedRef.current = true;
                    setCameraNotice("Recording stopped at the 100 MB limit. The captured clip is ready to review.");
                    recorder.stop();
                }
            };
            recorder.onerror = () => setCameraError("Video recording failed. Please try again or choose a video file.");
            recorder.onstop = () => {
                const chunks = recordingChunksRef.current;
                recorderRef.current = null;
                setRecording(false);
                if (chunks.length > 0) {
                    const recordedMimeType = recorder.mimeType || chunks[0].type || "video/webm";
                    const recordedFile = new File(
                        [new Blob(chunks, { type: recordedMimeType })],
                        `evidence-${Date.now()}.${mediaExtension(recordedMimeType)}`,
                        { type: recordedMimeType, lastModified: Date.now() }
                    );
                    acceptFile(recordedFile);
                    if (recordingLimitReachedRef.current) {
                        setCameraNotice("Recording stopped at the 100 MB limit. The captured clip is ready to review.");
                    }
                } else {
                    setCameraError("The recording was empty. Please record the video again.");
                }
                stopCamera();
            };
            recorder.start(1000);
            setRecording(true);
        } catch {
            setCameraError("Could not start video recording. Please try again or choose a video file.");
        }
    };

    const stopRecording = () => {
        const recorder = recorderRef.current;
        if (recorder && recorder.state === "recording") recorder.stop();
    };

    const removeFile = () => {
        acceptFile(null);
        if (fileInputRef.current) fileInputRef.current.value = "";
    };

    const isVideo = file ? isManufacturingEvidenceVideo(file.type) : false;

    return (
        <div className="space-y-2">
            <Label htmlFor={`${id}-file`}>
                {label} {required && <span className="text-destructive">*</span>}
            </Label>
            <Input
                ref={fileInputRef}
                id={`${id}-file`}
                type="file"
                accept={ACCEPT}
                onChange={(event) => {
                    const selectedFile = event.target.files?.[0] || null;
                    if (selectedFile) stopCamera();
                    acceptFile(selectedFile);
                    event.target.value = "";
                }}
                disabled={disabled}
                aria-required={required}
                aria-describedby={error ? `${id}-help ${id}-error` : `${id}-help`}
                className="sr-only"
                tabIndex={-1}
            />
            <p id={`${id}-help`} className="text-[11px] text-muted-foreground">
                Images: PNG, JPG, or WEBP up to 5 MB. Videos: MP4, WEBM, or MOV up to 100 MB.
            </p>
            <div className="flex flex-wrap gap-2">
                <Button type="button" variant="outline" size="sm" onClick={() => void startCamera()} disabled={disabled || cameraStarting || Boolean(cameraStream)}>
                    <Camera className="mr-1.5 h-4 w-4" /> {cameraStarting ? "Opening camera…" : "Open camera"}
                </Button>
                <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    onClick={() => {
                        stopCamera();
                        fileInputRef.current?.click();
                    }}
                    disabled={disabled || recording}
                >
                    <FolderOpen className="mr-1.5 h-4 w-4" /> Choose file
                </Button>
            </div>
            {cameraStream && (
                <div className="space-y-2 rounded-lg border bg-background/70 p-2">
                    <video
                        ref={cameraVideoRef}
                        autoPlay
                        muted
                        playsInline
                        onCanPlay={() => setCameraReady(true)}
                        aria-label={`Live ${label.toLowerCase()} camera preview`}
                        className="max-h-72 w-full rounded-md bg-black object-contain"
                    />
                    <div className="flex flex-wrap gap-2">
                        <Button type="button" size="sm" onClick={capturePhoto} disabled={disabled || !cameraReady || recording}>
                            <Camera className="mr-1.5 h-4 w-4" /> Take photo
                        </Button>
                        {recording ? (
                            <Button type="button" size="sm" variant="destructive" onClick={stopRecording} disabled={disabled}>
                                <CircleStop className="mr-1.5 h-4 w-4" /> Stop recording
                            </Button>
                        ) : (
                            <Button type="button" size="sm" variant="outline" onClick={startRecording} disabled={disabled || !cameraReady}>
                                <Video className="mr-1.5 h-4 w-4" /> Record video
                            </Button>
                        )}
                        <Button type="button" size="sm" variant="ghost" onClick={stopCamera} disabled={disabled || recording}>
                            Cancel camera
                        </Button>
                    </div>
                </div>
            )}
            {cameraError && <p className="text-[11px] font-semibold text-destructive" role="alert">{cameraError}</p>}
            {cameraNotice && <p className="text-[11px] text-muted-foreground" role="status">{cameraNotice}</p>}
            {error && <p id={`${id}-error`} className="text-[11px] font-semibold text-destructive" role="alert">{error}</p>}
            {!file && !error && <p className="text-[11px] text-muted-foreground" role="status">{required ? "One image or video is required." : "An image or video may be attached."}</p>}
            {file && previewUrl && (
                <div className="flex flex-col gap-3 rounded-lg border bg-background p-2 sm:flex-row sm:items-center">
                    {isVideo ? (
                        <video src={previewUrl} controls playsInline preload="metadata" className="max-h-40 w-full max-w-xs rounded-md border bg-black object-contain" aria-label={`${label} video preview`} />
                    ) : (
                        // eslint-disable-next-line @next/next/no-img-element
                        <img src={previewUrl} alt={`${label} preview`} className="h-20 w-20 rounded-md border object-cover" />
                    )}
                    <div className="min-w-0 flex-1">
                        <p className="truncate text-xs font-semibold" title={file.name}>{file.name}</p>
                        <p className="text-[11px] text-muted-foreground">
                            {file.type || "Unknown media type"} · {(file.size / 1024 / 1024).toFixed(2)} MB
                        </p>
                    </div>
                    <Button type="button" variant="ghost" size="icon-xs" onClick={removeFile} disabled={disabled} aria-label={`Remove ${label.toLowerCase()}`}>
                        <Trash2 className="h-3.5 w-3.5" />
                    </Button>
                </div>
            )}
        </div>
    );
}
