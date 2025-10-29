// src/components/ImageUploader.tsx

import React, { useState, useCallback, useMemo } from 'react';
import { FaUpload, FaTimes, FaSpinner, FaCheckCircle, FaExclamationTriangle, FaImage } from 'react-icons/fa';

interface ImageUploaderProps {
  label: string;
  currentImageUrl: string | null | undefined;
  onImageChange: (base64Image: string | null) => void;
  maxFileSizeMB?: number;
}

const MAX_SIZE_MB_DEFAULT = 0.5; // 500 KB limit for Base64 storage

const ImageUploader: React.FC<ImageUploaderProps> = ({
  label,
  currentImageUrl,
  onImageChange,
  maxFileSizeMB = MAX_SIZE_MB_DEFAULT,
}) => {
  const [isDragging, setIsDragging] = useState(false);
  const [progress, setProgress] = useState(0);
  const [error, setError] = useState<string | null>(null);

  const maxSizeBytes = maxFileSizeMB * 1024 * 1024;

  const handleFileChange = useCallback((file: File | null) => {
    setError(null);
    setProgress(0);

    if (!file) {
      onImageChange(null);
      return;
    }

    if (!file.type.startsWith('image/')) {
      setError("Only image files are allowed.");
      return;
    }

    if (file.size > maxSizeBytes) {
      setError(`File size exceeds the limit of ${maxFileSizeMB} MB.`);
      return;
    }

    const reader = new FileReader();

    // Track progress (although readAsDataURL is fast, this gives a better UX)
    reader.onprogress = (event) => {
      if (event.lengthComputable) {
        const percent = Math.round((event.loaded / event.total) * 100);
        setProgress(percent);
      }
    };

    reader.onloadstart = () => {
        setProgress(1); // Start visible progress
    };
    
    reader.onload = () => {
      const base64String = reader.result as string;
      onImageChange(base64String);
      setProgress(100);
    };

    reader.onerror = () => {
      setError("Failed to read the file.");
      onImageChange(null);
    };

    reader.readAsDataURL(file);

  }, [onImageChange, maxSizeBytes, maxFileSizeMB]);

  // --- Drag and Drop Handlers ---

  const handleDragOver = useCallback((e: React.DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    setIsDragging(true);
  }, []);

  const handleDragLeave = useCallback((e: React.DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    setIsDragging(false);
  }, []);

  const handleDrop = useCallback((e: React.DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    setIsDragging(false);
    
    const files = e.dataTransfer.files;
    if (files.length) {
      handleFileChange(files[0]);
    }
  }, [handleFileChange]);

  const handleManualSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files?.length) {
      handleFileChange(e.target.files[0]);
    }
  };

  const clearImage = () => {
    handleFileChange(null);
  };
  
  // --- UI Logic ---
  
  const uploadButtonLabel = useMemo(() => {
    if (progress > 0 && progress < 100) return <><FaSpinner className="spinner-border spinner-border-sm" /> Uploading...</>;
    if (progress === 100) return <><FaCheckCircle /> Uploaded!</>;
    if (currentImageUrl) return "Replace Image";
    return "Browse or Drop File";
  }, [progress, currentImageUrl]);
  
  const previewStyles = {
    backgroundImage: currentImageUrl ? `url(${currentImageUrl})` : 'none',
    backgroundColor: currentImageUrl ? 'transparent' : 'var(--bs-light)',
  };

  return (
    <div className="mb-3">
      <label className="form-label">{label}</label>
      
      {/* Upload Area */}
      <div 
        className={`border border-2 rounded p-3 text-center transition ${isDragging ? 'border-primary bg-light' : 'border-dashed'}`}
        onDragOver={handleDragOver}
        onDragLeave={handleDragLeave}
        onDrop={handleDrop}
        style={{ position: 'relative', overflow: 'hidden' }}
      >
        
        {/* Progress Bar Overlay */}
        {progress > 0 && progress < 100 && (
            <div 
                className="position-absolute top-0 start-0 h-100 bg-primary opacity-50 transition" 
                style={{ width: `${progress}%`, transition: 'width 0.3s ease-out' }}
            ></div>
        )}
        
        <div className="d-flex align-items-center justify-content-between">
            {/* Image Preview */}
            <div 
                className="me-3 rounded-circle shadow-sm d-flex justify-content-center align-items-center"
                style={{ width: '60px', height: '60px', overflow: 'hidden', border: '1px solid var(--bs-border-color)', ...previewStyles }}
            >
                {!currentImageUrl && <FaImage size={24} className="text-muted" />}
            </div>

            {/* Upload Button */}
            <div className="flex-grow-1 text-start">
                <input
                    type="file"
                    id="file-upload"
                    accept="image/*"
                    onChange={handleManualSelect}
                    style={{ display: 'none' }}
                />
                <label 
                    htmlFor="file-upload" 
                    className={`btn btn-sm w-100 ${progress === 100 ? 'btn-success' : (currentImageUrl ? 'btn-outline-secondary' : 'btn-primary')}`}
                    style={{ cursor: 'pointer', position: 'relative', zIndex: 1 }}
                    title={`Max size: ${maxFileSizeMB} MB`}
                >
                    <FaUpload className="me-2" />
                    {uploadButtonLabel}
                </label>
            </div>
            
            {/* Clear Button */}
            {currentImageUrl && progress === 100 && (
                <button 
                    type="button" 
                    className="btn btn-sm btn-outline-danger ms-3"
                    onClick={clearImage}
                    title="Remove Image"
                >
                    <FaTimes />
                </button>
            )}
        </div>
      </div>
      
      {/* Error Feedback */}
      {error && (
        <div className="text-danger small mt-2 d-flex align-items-center gap-1">
          <FaExclamationTriangle /> {error}
        </div>
      )}
      <div className="form-text">Accepted formats: JPEG, PNG, GIF. Max file size: **{maxFileSizeMB} MB** (Recommended for Base64).</div>
    </div>
  );
};

export default ImageUploader;